import datetime
import io
from typing import Dict, Optional,List
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException
import uuid
from io import BytesIO
from gotrue import Any, BaseModel, List
from sqlalchemy.orm import Session
import supabase
import polars as pl
# Import your local modules
from database import SessionLocal, Dataset, engine, Base
from dataprofiler import DataProfiler
from engine import SupabaseDataEngine
from datacleaner import DataCleaner
from database import DatasetVersion, TransformLog, Anomaly
# At top of main.py, add:
from schema_analyzer import analyze_schema, ColumnType  # Your separate file
# from database import Dashboard, DashboardWidget  # Still need these models
import json
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Data Analytics Agent Ingestion")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class CleaningConfig(BaseModel):
    """Request body for cleaning operations"""
    deduplicate: Optional[Dict[str, Any]] = None
    missing_values: Optional[Dict[str, Dict[str, Any]]] = None
    type_casting: Optional[Dict[str, str]] = None
    normalize: Optional[Dict[str, Any]] = None
    detect_anomalies: Optional[Dict[str, Any]] = None

class CleanRequest(BaseModel):
    factors: List[str]
    
class VersionCreateRequest(BaseModel):
    """Request to create a new version"""
    version_name: str
    from_version_id: Optional[str] = None  # If None, uses default version
 
def create_dashboard(version_id: str, name: str, schema_analysis: Dict, db: Session):
    """Create dashboard record - FIXED JSON serialization"""
    dashboard = Dashboard(
        id=str(uuid.uuid4()),
        dataset_version_id=version_id,
        name=name,
        schema_analysis=json.dumps(schema_analysis),  # ✅ Convert dict → JSON string
        created_at=datetime.utcnow()
    )
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard

def create_widget(dashboard_id: str, chart_config: Dict, db: Session, position: int):
    """Create dashboard widget"""
    widget = DashboardWidget(
        id=str(uuid.uuid4()),
        dashboard_id=dashboard_id,
        type=chart_config["type"],
        title=chart_config["title"],
        sql_query=chart_config.get("sql", ""),
        chart_config=json.dumps(chart_config),
        position_x=position % 3,  # Grid layout
        position_y=position // 3
    )
    db.add(widget)
    db.commit()
   
# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- HELPER TASK ---
def background_processing(dataset_id: str, df_func, db: Session, *args):
    """Worker task to process data and update Supabase metadata"""
    try:
        # 1. Execute the source-specific handler (Excel, SQL, etc.)
        df = df_func(*args)
        
        # 2. Convert to Parquet and Upload to Supabase Storage
        s3_path, row_count, schema = SupabaseDataEngine.process_and_upload(df, dataset_id)
        print(s3_path)
        # 3. Update Metadata DB status to 'ready'
        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        ds.s3_path = s3_path
        ds.row_count = row_count
        ds.schema_json = schema
        ds.status = "ready"
        db.commit()
    except Exception as e:
        print(f"Error processing dataset {dataset_id}: {e}")
        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        ds.status = "failed"
        db.commit()

# --- ENDPOINTS ---

@app.post("/ingest/upload")
async def upload_file(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    dataset_id = str(uuid.uuid4())
    content = await file.read()
    
    new_ds = Dataset(id=dataset_id, name=file.filename, source_type="file", status="processing")
    db.add(new_ds)
    db.commit()

    if file.filename.endswith('.csv'):
        import polars as pl
       
        # ADD THESE PARAMETERS:
        reader = lambda: pl.read_csv(
            BytesIO(content),
            truncate_ragged_lines=True,  # Ignores extra columns in "dirty" rows
            infer_schema_length=10000,   # Checks more rows to guess types accurately
            ignore_errors=True           # Skips lines that are totally broken
        )
    else:
        reader = lambda: SupabaseDataEngine.handle_excel(content)
    print(reader, "this is ")
    background_tasks.add_task(background_processing, dataset_id, reader, db)
    return {"dataset_id": dataset_id, "message": "File upload started"}

@app.post("/ingest/sql")
async def ingest_sql(
    background_tasks: BackgroundTasks,
    connection_uri: str = Form(...),
    query: str = Form(...),
    dataset_name: str = Form("SQL Dataset"),
    db: Session = Depends(get_db)
):
    """Handles External Database connections (Postgres/MySQL)"""
    dataset_id = str(uuid.uuid4())
    
    new_ds = Dataset(id=dataset_id, name=dataset_name, source_type="sql", status="processing")
    db.add(new_ds)
    db.commit()

    background_tasks.add_task(
        background_processing, 
        dataset_id, 
        SupabaseDataEngine.handle_database, 
        db, 
        connection_uri, 
        query
    )
    return {"dataset_id": dataset_id, "message": "SQL ingestion started"}

@app.post("/ingest/shopify")
async def ingest_shopify(
    background_tasks: BackgroundTasks,
    shop_url: str = Form(...),
    token: str = Form(...),
    resource: str = Form("orders"),
    db: Session = Depends(get_db)
):
    """Handles Shopify API data"""
    dataset_id = str(uuid.uuid4())
    
    new_ds = Dataset(id=dataset_id, name=f"Shopify {resource}", source_type="shopify", status="processing")
    db.add(new_ds)
    db.commit()

    background_tasks.add_task(
        background_processing, 
        dataset_id, 
        SupabaseDataEngine.handle_shopify, 
        db, 
        shop_url, 
        token, 
        resource
    )
    return {"dataset_id": dataset_id, "message": "Shopify sync started"}

from fastapi import HTTPException, Query

@app.get("/data/{dataset_id}")
async def get_dataset_data(
    dataset_id: str,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0)
):
    """Fetch paginated data from a dataset stored in Supabase Storage."""
    try:
        return SupabaseDataEngine.get_dataset_data(dataset_id, limit, offset)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Dataset not found: {str(e)}")
    
@app.get("/datasets")
async def list_datasets():
    """
    FR-005: Dataset Catalog
    Returns: name, source_type, created_at, row_count, status, id
    """
    try:
        # We select specific columns to keep the response lightweight
        response = SupabaseDataEngine.supabase.table("datasets") \
            .select("id, name, source_type, created_at, row_count, status") \
            .order("created_at", desc=True) \
            .execute()
        
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/datasets/{dataset_id}")
async def get_status(dataset_id: str, db: Session = Depends(get_db)):
    """Check the processing status of a dataset"""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds

@app.get("/datasets/{dataset_id}/profile")
async def get_dataset_profile(dataset_id: str):
    """
    FR-101 to FR-104: Data Profiling Endpoint
    """
    # 1. Use the BUCKET and S3_OPTIONS from your engine
    bucket = SupabaseDataEngine.BUCKET
    s3_path = f"s3://{bucket}/datasets/{dataset_id}/data.parquet"
    
    try:
        # 2. Read from S3 using the storage options defined in your engine
        df = pl.read_parquet(
            s3_path, 
            storage_options=SupabaseDataEngine.S3_OPTIONS
        )
        
        # 3. Generate the profile
        profile_report = DataProfiler.get_profile(df)
        
        # 4. Update the Supabase Table using the existing engine client
        SupabaseDataEngine.supabase.table("datasets").update({
            "status": "ready",
            "row_count": profile_report["total_rows"],
            "schema_json": profile_report 
        }).eq("id", dataset_id).execute()

        return profile_report

    except Exception as e:
        print(f"Profiling Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to profile: {str(e)}")

# 1. Detect anomalies endpoint
@app.get("/data/{dataset_id}/detect-anomalies")
async def detect_anomalies(dataset_id: str):
    """Detect anomalies in the dataset."""
    try:
        anomalies = SupabaseDataEngine.detect_anomalies(dataset_id)
        return {"anomalies": anomalies}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed to detect anomalies: {str(e)}")

# 2. Clean data endpoint
@app.post("/data/{dataset_id}/clean")
async def clean_data(dataset_id: str, request: CleanRequest):
    """Clean the dataset based on selected factors."""
    try:
        result = SupabaseDataEngine.clean_data(dataset_id, request.factors)
        print(result)
        return {
            "cleaned_data": result["cleaned_data"],
            "columns": result["columns"],
            "cleaning_summary": result["summary"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clean data: {str(e)}")

# 3. Export endpoint (optional)
@app.get("/data/{dataset_id}/export")
async def export_data(dataset_id: str):
    # Return CSV file download
    pass
    
@app.post("/datasets/{dataset_id}/rollback")
async def rollback_to_version(
    dataset_id: str,
    target_version_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    FR-208: Rollback to a previous version or to RAW
    
    Args:
        dataset_id: The dataset to rollback
        target_version_id: Version to rollback to. If None, rollbacks to RAW/original
    
    Returns:
        Information about the rollback performed
    """
    # Verify dataset exists
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Get current default version
    current_default = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.is_default == True
    ).first()
    
    if target_version_id:
        # Rollback to specific version
        target_version = db.query(DatasetVersion).filter(
            DatasetVersion.id == target_version_id,
            DatasetVersion.dataset_id == dataset_id
        ).first()
        
        if not target_version:
            raise HTTPException(
                status_code=404, 
                detail="Target version not found or belongs to different dataset"
            )
        
        # Unset all defaults
        db.query(DatasetVersion).filter(
            DatasetVersion.dataset_id == dataset_id
        ).update({"is_default": False})
        
        # Set target as default
        target_version.is_default = True
        db.commit()
        
        return {
            "message": "Rollback successful",
            "rolled_back_from": {
                "version_id": current_default.id if current_default else None,
                "version_name": current_default.version_name if current_default else None
            },
            "rolled_back_to": {
                "version_id": target_version.id,
                "version_name": target_version.version_name,
                "row_count": target_version.row_count,
                "created_at": target_version.created_at
            }
        }
    
    else:
        # Rollback to RAW (original dataset)
        # Unset all version defaults
        db.query(DatasetVersion).filter(
            DatasetVersion.dataset_id == dataset_id
        ).update({"is_default": False})
        
        db.commit()
        
        # When no version is default, the system uses the original dataset.s3_path
        return {
            "message": "Rolled back to original RAW data",
            "rolled_back_from": {
                "version_id": current_default.id if current_default else None,
                "version_name": current_default.version_name if current_default else None
            },
            "rolled_back_to": {
                "version_id": None,
                "version_name": "RAW (original)",
                "row_count": dataset.row_count,
                "s3_path": dataset.s3_path
            }
        }

@app.get("/datasets/{dataset_id}/version-history")
async def get_version_history(
    dataset_id: str,
    db: Session = Depends(get_db)
):
    """
    FR-208: Get complete version history for rollback selection
    Shows all versions with their creation order
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Get all versions ordered by creation time
    versions = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id
    ).order_by(DatasetVersion.created_at.asc()).all()
    
    version_history = []
    
    # Add RAW as the first version
    version_history.append({
        "version_id": None,
        "version_name": "RAW (Original)",
        "is_default": not any(v.is_default for v in versions),  # True if no version is default
        "is_raw": True,
        "row_count": dataset.row_count,
        "created_at": dataset.created_at,
        "created_by": None,
        "can_rollback_to": True
    })
    
    # Add all cleaned versions
    for version in versions:
        version_history.append({
            "version_id": version.id,
            "version_name": version.version_name,
            "is_default": version.is_default,
            "is_raw": False,
            "row_count": version.row_count,
            "created_at": version.created_at,
            "created_by": version.created_by,
            "can_rollback_to": True
        })
    
    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset.name,
        "total_versions": len(version_history),
        "current_version": next(
            (v["version_name"] for v in version_history if v["is_default"]), 
            "RAW (Original)"
        ),
        "version_history": version_history
    }

@app.delete("/dataset_versions/{version_id}")
async def delete_version(
    version_id: str,
    db: Session = Depends(get_db)
):
    """
    FR-208: Delete a specific version (except RAW and default)
    Note: This is optional - you can keep all versions forever
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Prevent deletion of default version
    if version.is_default:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete default version. Switch default first."
        )
    
    # Delete associated transform logs and anomalies (cascade)
    from database import TransformLog, Anomaly
    db.query(TransformLog).filter(TransformLog.dataset_version_id == version_id).delete()
    db.query(Anomaly).filter(Anomaly.dataset_version_id == version_id).delete()
    
    # Delete the version
    version_name = version.version_name
    db.delete(version)
    db.commit()
    
    # Note: You should also delete the S3 file to save storage
    # from engine import SupabaseDataEngine
    # SupabaseDataEngine.supabase.storage.from_(bucket).remove([version.s3_path])
    
    return {
        "message": f"Version {version_name} deleted successfully",
        "deleted_version_id": version_id,
        "note": "This action cannot be undone"
    }

@app.get("/datasets/{dataset_id}/active-version")
async def get_active_version(
    dataset_id: str,
    db: Session = Depends(get_db)
):
    """
    FR-208: Get the currently active version (for dashboards/chat)
    Returns RAW if no version is set as default
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Check for default version
    default_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.is_default == True
    ).first()
    
    if default_version:
        return {
            "version_id": default_version.id,
            "version_name": default_version.version_name,
            "is_raw": False,
            "s3_path": default_version.s3_path,
            "row_count": default_version.row_count,
            "schema_json": default_version.schema_json
        }
    else:
        # No version is default, use RAW
        return {
            "version_id": None,
            "version_name": "RAW (Original)",
            "is_raw": True,
            "s3_path": dataset.s3_path,
            "row_count": dataset.row_count,
            "schema_json": dataset.schema_json
        }



@app.post("/datasets/{dataset_id}/versions")
async def create_dataset_version(
    dataset_id: str,
    request: VersionCreateRequest,
    db: Session = Depends(get_db)
):
    """
    FR-201: Create a new dataset version
    Initially creates an empty version that will be populated by cleaning
    """
    # Check if dataset exists
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # If from_version_id not specified, use the default/original version
    if request.from_version_id:
        source_version = db.query(DatasetVersion).filter(
            DatasetVersion.id == request.from_version_id
        ).first()
        if not source_version:
            raise HTTPException(status_code=404, detail="Source version not found")
        source_s3_path = source_version.s3_path
    else:
        # Use original dataset's s3_path
        source_s3_path = dataset.s3_path
    
    # Create new version record
    new_version = DatasetVersion(
        id=str(uuid.uuid4()),
        dataset_id=dataset_id,
        version_name=request.version_name,
        s3_path=source_s3_path,  # Initially points to source
        is_default=False,
        row_count=dataset.row_count,
        schema_json=dataset.schema_json
    )
    
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    
    return {
        "version_id": new_version.id,
        "version_name": new_version.version_name,
        "created_at": new_version.created_at,
        "message": "Version created. Apply cleaning to populate it."
    }

@app.get("/datasets/{dataset_id}/versions")
async def list_dataset_versions(
    dataset_id: str,
    db: Session = Depends(get_db)
):
    """List all versions of a dataset"""
    versions = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id
    ).order_by(DatasetVersion.created_at.desc()).all()
    
    return [
        {
            "id": v.id,
            "version_name": v.version_name,
            "is_default": v.is_default,
            "row_count": v.row_count,
            "created_at": v.created_at
        }
        for v in versions
    ]

@app.post("/dataset_versions/{version_id}/clean")
async def apply_cleaning(
    version_id: str,
    cleaning_config: CleaningConfig,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    FR-202 to FR-206: Apply cleaning transformations to a version
    This runs in background and updates the version's S3 path
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Add background task
    background_tasks.add_task(
        run_cleaning_job,
        version_id=version_id,
        cleaning_config=cleaning_config.dict(),
        db=db
    )
    
    return {
        "message": "Cleaning job started",
        "version_id": version_id
    }

def run_cleaning_job(version_id: str, cleaning_config: Dict, db: Session):
    """
    Background worker to apply cleaning operations
    """
    try:
        # 1. Load the current version's data
        version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
        
        bucket = SupabaseDataEngine.BUCKET
        # If version has its own s3_path, use it; else use parent dataset
        if version.s3_path:
            s3_path = f"s3://{bucket}/{version.s3_path}"
        else:
            dataset = db.query(Dataset).filter(Dataset.id == version.dataset_id).first()
            s3_path = f"s3://{bucket}/{dataset.s3_path}"
        
        df = pl.read_parquet(s3_path, storage_options=SupabaseDataEngine.S3_OPTIONS)
        
        # 2. Apply cleaning pipeline
        cleaned_df, transform_logs, anomalies = DataCleaner.apply_cleaning_pipeline(
            df, 
            cleaning_config
        )
        
        # 3. Upload cleaned data to new S3 path
        dataset_id = version.dataset_id
        new_s3_path, row_count, schema = SupabaseDataEngine.process_and_upload(
            cleaned_df, 
            f"{dataset_id}/{version_id}"
        )
        
        # 4. Update version metadata
        version.s3_path = new_s3_path
        version.row_count = row_count
        version.schema_json = schema
        db.commit()
        
        # 5. Save transform logs
        for log_data in transform_logs:
            log = TransformLog(
                id=str(uuid.uuid4()),
                dataset_version_id=version_id,
                operation=log_data["operation"],
                params_json=log_data["params"],
                rows_affected=log_data["rows_affected"]
            )
            db.add(log)
        
        # 6. Save anomalies
        for anom_data in anomalies:
            anomaly = Anomaly(
                id=anom_data["id"],
                dataset_version_id=version_id,
                row_data=anom_data["row_data"],
                column=anom_data["column"],
                reason=anom_data["reason"],
                score=anom_data["score"]
            )
            db.add(anomaly)
        
        db.commit()
        
        print(f"✓ Cleaning completed for version {version_id}")
        
    except Exception as e:
        print(f"✗ Cleaning failed for version {version_id}: {e}")
        import traceback
        traceback.print_exc()

@app.post("/dataset_versions/{version_id}/cleaning-preview")
async def preview_cleaning(
    version_id: str,
    cleaning_config: CleaningConfig,
    db: Session = Depends(get_db)
):
    """
    FR-202: Preview cleaning effects without applying
    Shows how many rows would be affected
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    try:
        # Load sample data (first 1000 rows for preview)
        bucket = SupabaseDataEngine.BUCKET
        if version.s3_path:
            s3_path = f"s3://{bucket}/{version.s3_path}"
        else:
            dataset = db.query(Dataset).filter(Dataset.id == version.dataset_id).first()
            s3_path = f"s3://{bucket}/{dataset.s3_path}"
        
        df_sample = pl.read_parquet(
            s3_path, 
            storage_options=SupabaseDataEngine.S3_OPTIONS
        ).head(1000)
        
        # Run cleaning on sample
        cleaned_df, transform_logs, anomalies = DataCleaner.apply_cleaning_pipeline(
            df_sample,
            cleaning_config.dict()
        )
        
        return {
            "original_rows": len(df_sample),
            "cleaned_rows": len(cleaned_df),
            "rows_that_would_be_removed": len(df_sample) - len(cleaned_df),
            "transform_summary": transform_logs,
            "anomalies_detected": len(anomalies),
            "sample_anomalies": anomalies[:5]  # First 5
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")

@app.get("/dataset_versions/{version_id}/transform-logs")
async def get_transform_logs(
    version_id: str,
    db: Session = Depends(get_db)
):
    """
    FR-207: Get transformation history for a version
    """
    logs = db.query(TransformLog).filter(
        TransformLog.dataset_version_id == version_id
    ).order_by(TransformLog.timestamp.desc()).all()
    
    return [
        {
            "id": log.id,
            "operation": log.operation,
            "params": log.params_json,
            "rows_affected": log.rows_affected,
            "timestamp": log.timestamp
        }
        for log in logs
    ]

@app.get("/dataset_versions/{version_id}/anomalies")
async def get_anomalies(
    version_id: str,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    FR-206: Get detected anomalies for a version
    """
    anomalies = db.query(Anomaly).filter(
        Anomaly.dataset_version_id == version_id
    ).order_by(Anomaly.score.desc()).limit(limit).all()
    
    return {
        "total_anomalies": db.query(Anomaly).filter(
            Anomaly.dataset_version_id == version_id
        ).count(),
        "anomalies": [
            {
                "id": a.id,
                "column": a.column,
                "reason": a.reason,
                "score": a.score,
                "row_data": a.row_data,
                "detected_at": a.detected_at
            }
            for a in anomalies
        ]
    }

@app.patch("/dataset_versions/{version_id}/set-default")
async def set_default_version(
    version_id: str,
    db: Session = Depends(get_db)
):
    """
    FR-208: Set a version as the default for dashboards/chat
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Unset all other versions for this dataset
    db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == version.dataset_id
    ).update({"is_default": False})
    
    # Set this one as default
    version.is_default = True
    db.commit()
    
    return {"message": f"Version {version.version_name} set as default"}

@app.post("/dataset_versions/{version_id}/dashboards/generate")
async def auto_generate_dashboards(
    version_id: str, 
    db: Session = Depends(get_db)
):
    """FR-301 to FR-305: Complete auto-dashboard generation"""
    
    try:
        # 1. Schema analysis (2ms)
        schema_analysis = analyze_schema(version_id, db)
        
        # 2. Create dashboard records
        dashboards_created = []
        
        # Always create Overview dashboard
        overview_db = create_dashboard(version_id, "Overview", schema_analysis, db)
        dashboards_created.append(overview_db.id)
        
        # Create widgets from schema recommendations
        charts = schema_analysis["chart_suggestions"]
        for i, chart_config in enumerate(charts[:6]):  # Max 6 widgets
            create_widget(overview_db.id, chart_config, db, i)
        
        # Trends dashboard if date exists (Free plan limit: 2 dashboards)
        if schema_analysis["has_date"]:
            trends_db = create_dashboard(version_id, "Trends", schema_analysis, db)
            dashboards_created.append(trends_db.id)
            
            # Add trend widget
            trend_chart = next((c for c in charts if c["type"] == "line"), charts[0])
            create_widget(trends_db.id, trend_chart, db, 0)
        
        return {
            "message": "Dashboards generated successfully",
            "schema_analysis": schema_analysis,
            "dashboards_created": dashboards_created,
            "total_widgets": len(dashboards_created) * 3  # ~3 widgets per dashboard
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard generation failed: {str(e)}")


# --- COLUMN ANALYSIS ENDPOINTS ---
from column_analyzer import ColumnAnalyzer

@app.get("/data/{dataset_id}/column/{column_name}/analysis")
async def analyze_column(dataset_id: str, column_name: str):
    """
    Analyze a specific column and return:
    - Description of the column
    - Key insights
    - Recommendations
    - Graph data for visualization
    """
    try:
        bucket = SupabaseDataEngine.BUCKET
        s3_path = f"s3://{bucket}/datasets/{dataset_id}/data.parquet"
        
        # Read dataset
        df = pl.read_parquet(
            s3_path, 
            storage_options=SupabaseDataEngine.S3_OPTIONS
        )
        
        # Check if column exists
        if column_name not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{column_name}' not found in dataset")
        
        # Analyze the column
        insight = ColumnAnalyzer.analyze_column(df, column_name)
        
        return {
            "column_name": insight.column_name,
            "data_type": insight.data_type,
            "description": insight.description,
            "insights": insight.insights,
            "recommendations": insight.recommendations,
            "graph_type": insight.graph_type,
            "graph_data": insight.graph_data,
            "statistics": insight.statistics
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze column: {str(e)}")


@app.get("/data/{dataset_id}/columns/analysis")
async def analyze_all_columns(dataset_id: str):
    """
    Analyze all columns in the dataset and return analysis for each.
    Returns a list of column analyses with graphs, descriptions, insights, and recommendations.
    """
    try:
        bucket = SupabaseDataEngine.BUCKET
        s3_path = f"s3://{bucket}/datasets/{dataset_id}/data.parquet"
        
        # Read dataset
        df = pl.read_parquet(
            s3_path, 
            storage_options=SupabaseDataEngine.S3_OPTIONS
        )
        
        # Analyze all columns
        analyses = ColumnAnalyzer.analyze_all_columns(df)
        
        return {
            "dataset_id": dataset_id,
            "total_columns": len(analyses),
            "columns": analyses
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze columns: {str(e)}")
