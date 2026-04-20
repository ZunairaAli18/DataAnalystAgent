import datetime
import io
from typing import Dict, Optional,List
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException
import uuid
from io import BytesIO
from pydantic import BaseModel as PydanticBaseModel
from typing import Any
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
class CleaningConfig(PydanticBaseModel):
    """Request body for cleaning operations"""
    deduplicate: Optional[Dict[str, Any]] = None
    missing_values: Optional[Dict[str, Dict[str, Any]]] = None
    type_casting: Optional[Dict[str, str]] = None
    normalize: Optional[Dict[str, Any]] = None
    detect_anomalies: Optional[Dict[str, Any]] = None

class CleanRequest(PydanticBaseModel):
    factors: List[str]
    
class VersionCreateRequest(PydanticBaseModel):
    """Request to create a new version"""
    version_name: str
    from_version_id: Optional[str] = None  # If None, uses default version

class AnalyzeRequest(PydanticBaseModel):
    columns: List[Dict[str, Any]]
    rows: List[Dict[str, Any]]
    dataset_id: str
 
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
@app.get("/data/{dataset_id}/status")
async def get_dataset_status(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {
        "dataset_id": dataset_id,
        "status": dataset.status,
        "name": dataset.name,
    }
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

    filename_lower = file.filename.lower()

    if filename_lower.endswith('.csv'):
        import polars as pl
        reader = lambda: pl.read_csv(
            BytesIO(content),
            truncate_ragged_lines=True,
            infer_schema_length=10000,
            ignore_errors=True,
            encoding="utf8-lossy"
        )

    elif filename_lower.endswith('.pdf'):
        import pdfplumber
        import polars as pl
        import re

        def parse_pdf():
            all_table_rows = []
            all_text_chunks = []

            with pdfplumber.open(BytesIO(content)) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    tables = page.extract_tables()
                    full_text = page.extract_text() or ""

                    if tables:
                        for table in tables:
                            if not table or len(table) < 2:
                                continue
                            raw_headers = table[0]
                            headers = [
                                str(h).strip().replace(" ", "_").lower() if h else f"col_{i}"
                                for i, h in enumerate(raw_headers)
                            ]
                            seen = {}
                            deduped = []
                            for h in headers:
                                if h in seen:
                                    seen[h] += 1
                                    deduped.append(f"{h}_{seen[h]}")
                                else:
                                    seen[h] = 0
                                    deduped.append(h)
                            headers = deduped

                            for row in table[1:]:
                                if not any(cell for cell in row if cell):
                                    continue
                                row_dict = {
                                    headers[i]: (str(v).strip() if v else "")
                                    for i, v in enumerate(row)
                                    if i < len(headers)
                                }
                                row_dict["_page"] = page_num
                                row_dict["_source"] = "table"
                                all_table_rows.append(row_dict)

                    if full_text:
                        current_section = "general"
                        paragraph_buffer = []

                        for line in full_text.splitlines():
                            line = line.strip()
                            if not line:
                                if paragraph_buffer:
                                    paragraph_text = " ".join(paragraph_buffer)
                                    all_text_chunks.append({
                                        "section": current_section,
                                        "type": "paragraph",
                                        "content": paragraph_text,
                                        "_page": page_num,
                                        "_source": "text",
                                        "_char_count": len(paragraph_text),
                                    })
                                    paragraph_buffer = []
                                continue

                            is_heading = (
                                re.match(r'^[A-Z][A-Z\s]{4,}$', line) or
                                (len(line) < 60 and re.match(r'^[A-Z][a-z]', line) and line.endswith(':')) or
                                re.match(r'^\d+\.\s+[A-Z]', line)
                            )

                            if is_heading and not paragraph_buffer:
                                current_section = re.sub(r'^\d+\.\s+', '', line).lower().strip().replace(" ", "_")
                                all_text_chunks.append({
                                    "section": current_section,
                                    "type": "heading",
                                    "content": line,
                                    "_page": page_num,
                                    "_source": "text",
                                    "_char_count": len(line),
                                })
                            else:
                                paragraph_buffer.append(line)

                        if paragraph_buffer:
                            paragraph_text = " ".join(paragraph_buffer)
                            all_text_chunks.append({
                                "section": current_section,
                                "type": "paragraph",
                                "content": paragraph_text,
                                "_page": page_num,
                                "_source": "text",
                                "_char_count": len(paragraph_text),
                            })

            if len(all_table_rows) > len(all_text_chunks):
                rows = all_table_rows
            elif all_text_chunks and not all_table_rows:
                rows = all_text_chunks
            else:
                rows = all_table_rows if all_table_rows else all_text_chunks

            if not rows:
                raise ValueError(f"No extractable content in: {file.filename}")

            all_keys = list(dict.fromkeys(k for row in rows for k in row))
            normalized = [{k: row.get(k, "") for k in all_keys} for row in rows]

            return pl.DataFrame(normalized)

        reader = parse_pdf

    else:
        reader = lambda: SupabaseDataEngine.handle_excel(content)

    print(reader, "this is ")
    background_tasks.add_task(background_processing, dataset_id, reader, db)
    return {"dataset_id": dataset_id, "message": "File upload started"}


@app.post("/ingest/quickbooks")
async def ingest_quickbooks(
    background_tasks: BackgroundTasks,
    client_id: str = Form(...),
    client_secret: str = Form(...),
    realm_id: str = Form(...),
    db: Session = Depends(get_db)
):
    dataset_id = str(uuid.uuid4())

    new_ds = Dataset(
        id=dataset_id,
        name=f"QuickBooks {realm_id}",
        source_type="quickbooks",
        status="processing"
    )
    db.add(new_ds)
    db.commit()

    # Pass db as the second argument to your existing background_processing
    background_tasks.add_task(
        background_processing,
        dataset_id,
        SupabaseDataEngine.handle_quickbooks,
        db,
        client_id,
        client_secret,
        realm_id
    )

    return {"dataset_id": dataset_id, "message": "QuickBooks ingestion started"}

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

# @app.post("/ingest/shopify")
# async def ingest_shopify(
#     background_tasks: BackgroundTasks,
#     shop_url: str = Form(...),
#     token: str = Form(...),
#     resource: str = Form("orders"),
#     db: Session = Depends(get_db)
# ):
#     """Handles Shopify API data"""
#     dataset_id = str(uuid.uuid4())
    
#     new_ds = Dataset(id=dataset_id, name=f"Shopify {resource}", source_type="shopify", status="processing")
#     db.add(new_ds)
#     db.commit()

#     background_tasks.add_task(
#         background_processing, 
#         dataset_id, 
#         SupabaseDataEngine.handle_shopify, 
#         db, 
#         shop_url, 
#         token, 
#         resource
#     )
#     return {"dataset_id": dataset_id, "message": "Shopify sync started"}
@app.post("/ingest/shopify")
async def ingest_shopify(
    background_tasks: BackgroundTasks,
    shop_url: str = Form(...),
    token: str = Form(...),
    resource: str = Form("orders"),
    db: Session = Depends(get_db)
):
    dataset_id = str(uuid.uuid4())

    new_ds = Dataset(
        id=dataset_id,
        name=f"Shopify {resource.title()}",
        source_type="shopify",
        status="processing"
    )
    db.add(new_ds)
    db.commit()

    background_tasks.add_task(
        background_processing,
        dataset_id,
        SupabaseDataEngine.handle_shopify,
        shop_url,
        token,
        resource
    )
    return {"dataset_id": dataset_id, "message": "Shopify ingestion started"}
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

@app.post("/ingest/sheets")
async def ingest_google_sheets(
    background_tasks: BackgroundTasks,
    spreadsheet_id: str = Form(...),
    sheet_name: str = Form("Sheet1"),
    service_account_json: str = Form(...),
    db: Session = Depends(get_db)
):
    dataset_id = str(uuid.uuid4())

    new_ds = Dataset(
        id=dataset_id,
        name=f"Google Sheets - {sheet_name}",
        source_type="google_sheets",
        status="processing"
    )
    db.add(new_ds)
    db.commit()

    background_tasks.add_task(
        background_processing,
        dataset_id,
        SupabaseDataEngine.handle_google_sheets,
        spreadsheet_id,
        sheet_name,
        service_account_json
    )
    return {"dataset_id": dataset_id, "message": "Google Sheets ingestion started"}
 
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
            "cleaning_summary": result["summary"],
            "cleaned_dataset_id": result.get("cleaned_dataset_id", dataset_id)
        }
    except Exception as e:
      import traceback
      traceback.print_exc()
      raise HTTPException(
        status_code=500,
        detail=str(e)
      )


# 3. Export endpoint (optional)
@app.get("/data/{dataset_id}/export")
async def export_data(dataset_id: str):
    # Return CSV file download
    pass
    
@app.post("/ingest/sap")
async def ingest_sap(
    background_tasks: BackgroundTasks,
    host_url: str = Form(...),
    client_id: str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
    entity: str = Form("SalesOrders"),  # SAP OData entity
    db: Session = Depends(get_db)
):
    dataset_id = str(uuid.uuid4())
    
    new_ds = Dataset(
        id=dataset_id,
        name=f"SAP {entity}",
        source_type="sap",
        status="processing"
    )
    db.add(new_ds)
    db.commit()

    background_tasks.add_task(
        background_processing,
        dataset_id,
        SupabaseDataEngine.handle_sap,
        host_url,
        client_id,
        username,
        password,
        entity
    )
    return {"dataset_id": dataset_id, "message": "SAP ingestion started"}

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


@app.post("/data/analyze")
async def analyze_cleaned_data(request: AnalyzeRequest):
    """
    Analyze cleaned data and return KPIs, charts, description, trends, recommendations,
    and full column profiles with distinct values and suggested chart types.
    """
    try:
        columns = request.columns
        rows = request.rows

        if not columns or not rows:
            raise HTTPException(status_code=400, detail="No data provided for analysis")

        df = pl.DataFrame(rows)
        col_keys = [c["key"] for c in columns]

        # ── Detect column types ──
        numeric_cols = [c for c in col_keys if df[c].dtype in (
            pl.Int8, pl.Int16, pl.Int32, pl.Int64,
            pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
            pl.Float32, pl.Float64
        )]

        # Boolean detection
        bool_values = {"true", "false", "yes", "no", "1", "0", "y", "n"}
        boolean_cols = []
        for c in col_keys:
            if c in numeric_cols:
                continue
            unique_vals = set(str(v).lower().strip() for v in df[c].drop_nulls().to_list() if v is not None and str(v).strip())
            if 0 < len(unique_vals) <= 3 and unique_vals.issubset(bool_values):
                boolean_cols.append(c)

        date_keywords = ["date", "time", "timestamp", "created", "updated", "year", "month"]
        date_cols = [c for c in col_keys if any(kw in c.lower() for kw in date_keywords)]

        categorical_cols = [
            c for c in col_keys
            if c not in numeric_cols and c not in date_cols and c not in boolean_cols
            and df[c].n_unique() > 1
        ]

        # ── Build Column Profiles ──
        column_profiles = []
        for c in col_keys:
            series = df[c]
            non_null = series.drop_nulls()
            null_count = series.null_count()

            # Determine dtype category
            if c in numeric_cols:
                dtype_cat = "numeric"
            elif c in date_cols:
                dtype_cat = "date"
            elif c in boolean_cols:
                dtype_cat = "boolean"
            elif c in categorical_cols:
                dtype_cat = "categorical"
            else:
                dtype_cat = "text"

            # Value counts
            value_counts = {}
            for val in non_null.to_list():
                key = str(val)
                value_counts[key] = value_counts.get(key, 0) + 1

            distinct_count = len(value_counts)
            sorted_values = sorted(value_counts.items(), key=lambda x: x[1], reverse=True)

            top_values = [
                {"value": v, "count": cnt, "percentage": round(cnt / len(df) * 100, 2)}
                for v, cnt in sorted_values[:20]
            ]
            distinct_values = [v for v, _ in sorted_values[:200]]

            # Stats for numeric
            stats = None
            if dtype_cat == "numeric" and len(non_null) > 0:
                sorted_nums = sorted(non_null.to_list())
                n = len(sorted_nums)
                median = sorted_nums[n // 2] if n % 2 == 1 else (sorted_nums[n // 2 - 1] + sorted_nums[n // 2]) / 2
                stats = {
                    "min": float(non_null.min()),
                    "max": float(non_null.max()),
                    "mean": float(non_null.mean()),
                    "median": float(median),
                    "sum": float(non_null.sum()),
                }

            # Suggest chart types
            suggested = []
            if dtype_cat == "numeric":
                suggested = ["bar", "line", "heatmap", "column"]
                if distinct_count <= 15:
                    suggested.extend(["pie", "donut"])
            elif dtype_cat == "categorical":
                if distinct_count <= 8:
                    suggested = ["pie", "donut", "bar", "column", "funnel"]
                else:
                    suggested = ["bar", "column"]
            elif dtype_cat == "date":
                suggested = ["line", "bar"]
            elif dtype_cat == "boolean":
                suggested = ["pie", "donut", "bar"]
            else:
                suggested = ["bar", "column"] if distinct_count <= 20 else ["bar"]

            column_profiles.append({
                "key": c,
                "label": c.upper().replace("_", " "),
                "dtype": dtype_cat,
                "distinct_count": distinct_count,
                "null_count": int(null_count),
                "total_count": len(df),
                "distinct_values": distinct_values,
                "top_values": top_values,
                "stats": stats,
                "suggested_chart_types": list(dict.fromkeys(suggested)),
            })

        # ── KPIs ──
        kpis = []
        kpis.append({
            "label": "TOTAL RECORDS",
            "value": f"{len(df):,}",
            "change": None,
            "positive": True,
            "color": "#00d4ff",
        })

        colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff"]
        for i, col in enumerate(numeric_cols[:3]):
            values = df[col].drop_nulls()
            if len(values) == 0:
                continue
            total = values.sum()
            if total > 1_000_000:
                display = f"{total / 1_000_000:.2f}M"
            elif total > 1_000:
                display = f"{total / 1_000:.2f}K"
            else:
                display = f"{total:.2f}"
            kpis.append({
                "label": col.upper().replace("_", " "),
                "value": display,
                "change": None,
                "positive": True,
                "color": colors[(i + 1) % len(colors)],
            })

        # All chartable columns: categorical + boolean + text with sensible cardinality
        all_chartable = [
            p for p in column_profiles
            if p["dtype"] in ("categorical", "boolean")
            or (p["dtype"] == "text" and p["distinct_count"] >= 2)
        ]

        # Fill remaining KPI slots with unique counts from chartable columns
        for profile in all_chartable:
            if len(kpis) >= 4:
                break
            if profile["key"] in numeric_cols:
                continue
            kpis.append({
                "label": f"UNIQUE {profile['key'].upper().replace('_', ' ')}",
                "value": f"{profile['distinct_count']:,}",
                "change": None,
                "positive": True,
                "color": colors[len(kpis) % len(colors)],
            })

        if len(kpis) < 4:
            kpis.append({
                "label": "TOTAL COLUMNS",
                "value": f"{len(col_keys):,}",
                "change": None,
                "positive": True,
                "color": colors[len(kpis) % len(colors)],
            })

        # ── Charts ──
        charts = []
        chart_colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]

        # Time-series
        if date_cols and numeric_cols:
            date_col = date_cols[0]
            metric_col = numeric_cols[0]
            grouped = {}
            for row in rows:
                key = str(row.get(date_col, ""))[:7]
                grouped[key] = grouped.get(key, 0) + (float(row.get(metric_col, 0) or 0))
            sorted_keys = sorted(grouped.keys())
            line_data = [{"label": k, "value": round(grouped[k], 2)} for k in sorted_keys[:24]]
            if len(line_data) > 1:
                line_vals = [d["value"] for d in line_data]
                line_max = max(line_vals)
                line_min = min(line_vals)
                line_total = sum(line_vals)
                peak_period = next((d["label"] for d in line_data if d["value"] == line_max), "")
                low_period = next((d["label"] for d in line_data if d["value"] == line_min), "")
                charts.append({
                    "type": "line",
                    "title": f"{metric_col.replace('_', ' ')} Over Time",
                    "description": f"Tracks {metric_col.replace('_', ' ')} across {len(line_data)} time periods. Peak of {line_max:,.2f} at {peak_period}, lowest of {line_min:,.2f} at {low_period}. Total: {line_total:,.2f}.",
                    "data": line_data,
                    "xKey": "label",
                    "yKey": "value",
                    "color": chart_colors[0],
                })

        # Categorical/chartable columns -- generate up to 5 charts when no numeric, 3 otherwise
        chartable_keys = [p["key"] for p in all_chartable]
        cat_limit = min(len(chartable_keys), 5 if not numeric_cols else 3)
        for ci in range(cat_limit):
            cat_col = chartable_keys[ci]
            profile = next((p for p in column_profiles if p["key"] == cat_col), None)
            distinct_count = profile["distinct_count"] if profile else 999
            metric_col = numeric_cols[ci % len(numeric_cols)] if numeric_cols else None

            if metric_col:
                grouped = {}
                for row in rows:
                    key = str(row.get(cat_col, "Unknown"))
                    grouped[key] = grouped.get(key, 0) + (float(row.get(metric_col, 0) or 0))
                bar_data = sorted(grouped.items(), key=lambda x: x[1], reverse=True)[:10]
                bar_total = sum(v for _, v in bar_data)
                top_name, top_val = bar_data[0] if bar_data else ("N/A", 0)
                top_pct = (top_val / bar_total * 100) if bar_total > 0 else 0

                use_type = "pie" if distinct_count <= 8 and ci > 0 else "bar"

                charts.append({
                    "type": use_type,
                    "title": f"{metric_col.replace('_', ' ')} by {cat_col.replace('_', ' ')}",
                    "description": f"Compares {metric_col.replace('_', ' ')} across {len(bar_data)} {cat_col.replace('_', ' ')} categories. \"{top_name}\" leads with {top_val:,.2f} ({top_pct:.1f}% of shown total). Combined total: {bar_total:,.2f}.",
                    "data": [{"name": k, "value": round(v, 2)} for k, v in bar_data],
                    "xKey": "name",
                    "yKey": "value",
                    "color": chart_colors[(ci + 1) % len(chart_colors)],
                })
            else:
                # Count-based chart
                counts = {}
                for row in rows:
                    key = str(row.get(cat_col, "Unknown"))
                    counts[key] = counts.get(key, 0) + 1
                bar_data = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:10]
                if not bar_data:
                    continue
                bar_total = sum(v for _, v in bar_data)
                top_name, top_val = bar_data[0]
                top_pct = (top_val / bar_total * 100) if bar_total > 0 else 0

                # Use pie for low cardinality
                use_type = "pie" if distinct_count <= 8 else "bar"

                charts.append({
                    "type": use_type,
                    "title": f"{cat_col.replace('_', ' ')} Distribution",
                    "description": f"Shows frequency of {cat_col.replace('_', ' ')} values. \"{top_name}\" is the most common with {top_val:,} records ({top_pct:.1f}%). Total shown: {bar_total:,}.",
                    "data": [{"name": k, "value": v} for k, v in bar_data],
                    "xKey": "name",
                    "yKey": "value",
                    "color": chart_colors[(ci + 1) % len(chart_colors)],
                })

        # Boolean pie charts (if not already charted)
        already_charted = set(chartable_keys[:cat_limit])
        for bi, bool_col in enumerate(boolean_cols[:1]):
            if bool_col in already_charted:
                continue
            counts = {}
            for row in rows:
                key = str(row.get(bool_col, "Unknown")).lower()
                counts[key] = counts.get(key, 0) + 1
            pie_data = sorted(counts.items(), key=lambda x: x[1], reverse=True)
            charts.append({
                "type": "pie",
                "title": f"{bool_col.replace('_', ' ')} Breakdown",
                "description": f"Shows the distribution of {bool_col.replace('_', ' ')} values across {len(df):,} records.",
                "data": [{"name": k, "value": v} for k, v in pie_data],
                "xKey": "name",
                "yKey": "value",
                "color": chart_colors[(cat_limit + bi + 1) % len(chart_colors)],
            })

        # Distribution histogram
        if numeric_cols:
            col = numeric_cols[0]
            values = [float(r.get(col, 0) or 0) for r in rows if r.get(col) is not None]
            if values:
                min_v, max_v = min(values), max(values)
                bucket_count = min(10, max(3, int(len(values) ** 0.5)))
                bucket_size = (max_v - min_v) / bucket_count if max_v != min_v else 1
                buckets = {}
                for v in values:
                    idx = min(int((v - min_v) / bucket_size), bucket_count - 1)
                    label = f"{round(min_v + idx * bucket_size)}-{round(min_v + (idx + 1) * bucket_size)}"
                    buckets[label] = buckets.get(label, 0) + 1
                dist_data = [{"range": k, "count": v} for k, v in buckets.items()]
                dist_max_count = max(d["count"] for d in dist_data)
                peak_bucket = next((d["range"] for d in dist_data if d["count"] == dist_max_count), "N/A")
                dist_total = sum(d["count"] for d in dist_data)
                charts.append({
                    "type": "bar",
                    "title": f"{col.replace('_', ' ')} Distribution",
                    "description": f"Shows how {col.replace('_', ' ')} values are distributed across {len(dist_data)} buckets. The most common range is {peak_bucket} with {dist_max_count:,} records ({(dist_max_count / dist_total * 100):.1f}%). Values range from {round(min_v):,} to {round(max_v):,}.",
                    "data": dist_data,
                    "xKey": "range",
                    "yKey": "count",
                    "color": chart_colors[4 % len(chart_colors)],
                })

        # Cross-tabulation chart for no-numeric datasets
        if not numeric_cols and len(chartable_keys) >= 2:
            col1, col2 = chartable_keys[0], chartable_keys[1]
            cross = {}
            for row in rows:
                k1 = str(row.get(col1, "Unknown"))
                k2 = str(row.get(col2, "Unknown"))
                combo = f"{k1} / {k2}"
                cross[combo] = cross.get(combo, 0) + 1
            top_combos = sorted(cross.items(), key=lambda x: x[1], reverse=True)[:12]
            if len(top_combos) > 1:
                combo_total = sum(v for _, v in top_combos)
                top_combo_name, top_combo_val = top_combos[0]
                top_combo_pct = (top_combo_val / combo_total * 100) if combo_total > 0 else 0
                charts.append({
                    "type": "bar",
                    "title": f"{col1.replace('_', ' ')} vs {col2.replace('_', ' ')}",
                    "description": f"Cross-tabulation of {col1.replace('_', ' ')} and {col2.replace('_', ' ')}. Top combination \"{top_combo_name}\" appears {top_combo_val} times ({top_combo_pct:.1f}% of shown).",
                    "data": [{"name": k, "value": v} for k, v in top_combos],
                    "xKey": "name",
                    "yKey": "value",
                    "color": chart_colors[3 % len(chart_colors)],
                })

        # ── Description ──
        desc_parts = [f"This dataset contains {len(df):,} records across {len(col_keys)} columns."]
        if numeric_cols:
            col = numeric_cols[0]
            values = df[col].drop_nulls()
            if len(values) > 0:
                desc_parts.append(
                    f'The primary metric "{col.replace("_", " ")}" ranges from {values.min():,.2f} to {values.max():,.2f}, '
                    f'with an average of {values.mean():,.2f} and a total of {values.sum():,.2f}.'
                )
        if all_chartable:
            descs = [f'"{p["key"].replace("_", " ")}" ({p["distinct_count"]} unique)' for p in all_chartable[:3]]
            desc_parts.append(f'Key dimensions: {", ".join(descs)}.')
        if boolean_cols:
            desc_parts.append(f'{len(boolean_cols)} boolean column(s) detected: {", ".join(c.replace("_", " ") for c in boolean_cols)}.')
        text_cols = [p for p in column_profiles if p["dtype"] == "text" and p["distinct_count"] > 50]
        if text_cols and not numeric_cols:
            desc_parts.append(f'This is a text-heavy dataset with {len(text_cols)} free-form text column(s).')
        description = " ".join(desc_parts)

        # ── Trends ──
        trends = []
        if categorical_cols and numeric_cols:
            cat_col = categorical_cols[0]
            metric_col = numeric_cols[0]
            grouped = {}
            for row in rows:
                key = str(row.get(cat_col, "Unknown"))
                grouped[key] = grouped.get(key, 0) + (float(row.get(metric_col, 0) or 0))
            sorted_items = sorted(grouped.items(), key=lambda x: x[1], reverse=True)
            total = sum(v for _, v in sorted_items)
            if sorted_items and total > 0:
                top_pct = (sorted_items[0][1] / total) * 100
                trends.append(f'"{sorted_items[0][0]}" leads {cat_col.replace("_", " ")} contributing {top_pct:.1f}% of total.')
            if len(sorted_items) > 1:
                bot_pct = (sorted_items[-1][1] / total) * 100
                trends.append(f'"{sorted_items[-1][0]}" is the lowest contributor at {bot_pct:.1f}%.')

        if numeric_cols:
            col = numeric_cols[0]
            values = [float(r.get(col, 0) or 0) for r in rows]
            avg = sum(values) / len(values) if values else 0
            above = sum(1 for v in values if v > avg)
            pct = (above / len(values)) * 100 if values else 0
            trends.append(f"{pct:.1f}% of records have {col.replace('_', ' ')} above the average value.")

        # Per-chartable-column frequency trends
        for profile in all_chartable[:3]:
            if len(trends) >= 5:
                break
            top_val = profile["top_values"][0] if profile["top_values"] else None
            if top_val:
                trends.append(
                    f'"{top_val["value"]}" is the most frequent {profile["key"].replace("_", " ")} value at {top_val["percentage"]}% of records ({top_val["count"]:,} out of {len(rows):,}).'
                )

        # High null rate trend
        high_null = [p for p in column_profiles if p["null_count"] / p["total_count"] > 0.1]
        if high_null:
            worst = max(high_null, key=lambda p: p["null_count"])
            null_pct = (worst["null_count"] / worst["total_count"]) * 100
            trends.append(f'"{worst["key"].replace("_", " ")}" has the highest null rate at {null_pct:.1f}%.')

        if not numeric_cols and len(trends) < 5:
            text_heavy = [p for p in column_profiles if p["dtype"] == "text" and p["distinct_count"] > 50]
            if text_heavy:
                trends.append(f'{len(text_heavy)} column(s) contain mostly unique text (e.g., "{text_heavy[0]["key"].replace("_", " ")}"), suggesting free-form entries.')

        # ── Recommendations ──
        recommendations = []
        if categorical_cols and numeric_cols:
            cat_col = categorical_cols[0]
            metric_col = numeric_cols[0]
            grouped = {}
            for row in rows:
                key = str(row.get(cat_col, "Unknown"))
                grouped[key] = grouped.get(key, 0) + (float(row.get(metric_col, 0) or 0))
            sorted_items = sorted(grouped.items(), key=lambda x: x[1], reverse=True)
            if sorted_items:
                recommendations.append(
                    f'Focus on "{sorted_items[0][0]}" in {cat_col.replace("_", " ")} as it drives the highest {metric_col.replace("_", " ")}.'
                )
            if len(sorted_items) > 2:
                recommendations.append(
                    f'Investigate underperforming categories like "{sorted_items[-1][0]}" for growth opportunities.'
                )

        if not numeric_cols and all_chartable:
            top_cat = all_chartable[0]
            top_val = top_cat["top_values"][0] if top_cat["top_values"] else None
            if top_val:
                recommendations.append(
                    f'The "{top_cat["key"].replace("_", " ")}" column is dominated by "{top_val["value"]}" ({top_val["percentage"]}%) -- consider whether this concentration is expected.'
                )
            recommendations.append(
                "This dataset is primarily text/categorical. Consider augmenting with numeric metrics for richer quantitative analysis."
            )

        if date_cols:
            recommendations.append(
                f'Consider deeper time-series analysis on "{date_cols[0].replace("_", " ")}" to identify seasonal patterns.'
            )
        if len(all_chartable) >= 2:
            recommendations.append(
                f'Cross-tabulate "{all_chartable[0]["key"].replace("_", " ")}" and "{all_chartable[1]["key"].replace("_", " ")}" to discover interaction patterns.'
            )

        high_null_recs = [p for p in column_profiles if p["null_count"] / p["total_count"] > 0.2]
        if high_null_recs:
            recommendations.append(
                f'{len(high_null_recs)} column(s) have >20% null values -- consider data quality improvements for "{high_null_recs[0]["key"].replace("_", " ")}".'
            )

        recommendations.append("Export this analysis and share with stakeholders for data-driven decision making.")

        return {
            "kpis": kpis[:4],
            "charts": charts,
            "description": description,
            "trends": trends[:5],
            "recommendations": recommendations[:4],
            "column_profiles": column_profiles,
            "meta": {
                "total_records": len(df),
                "numeric_columns": numeric_cols,
                "categorical_columns": categorical_cols,
                "date_columns": date_cols,
                "boolean_columns": boolean_cols,
                "total_columns": len(col_keys),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/ingest/upload-pdfs")
async def upload_multiple_pdfs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Ingest multiple PDFs. Validates that all PDFs are related (share overlapping
    columns/categories) before merging them into a single dataset.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    # Validate all files are PDFs
    for f in files:
        if not f.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f'"{f.filename}" is not a PDF. This endpoint only accepts PDF files.'
            )

    # ── Read all file contents upfront (before async context closes) ──
    file_contents = []
    for f in files:
        content = await f.read()
        file_contents.append((f.filename, content))

    # ── Parse each PDF into a DataFrame using your existing logic ──
    import pdfplumber
    import re

    def parse_single_pdf(filename: str, content: bytes) -> pl.DataFrame:
        all_table_rows = []
        all_text_chunks = []

        with pdfplumber.open(BytesIO(content)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                full_text = page.extract_text() or ""

                if tables:
                    for table in tables:
                        if not table or len(table) < 2:
                            continue
                        raw_headers = table[0]
                        headers = [
                            str(h).strip().replace(" ", "_").lower() if h else f"col_{i}"
                            for i, h in enumerate(raw_headers)
                        ]
                        seen = {}
                        deduped = []
                        for h in headers:
                            if h in seen:
                                seen[h] += 1
                                deduped.append(f"{h}_{seen[h]}")
                            else:
                                seen[h] = 0
                                deduped.append(h)
                        headers = deduped

                        for row in table[1:]:
                            if not any(cell for cell in row if cell):
                                continue
                            row_dict = {
                                headers[i]: (str(v).strip() if v else "")
                                for i, v in enumerate(row)
                                if i < len(headers)
                            }
                            row_dict["_page"] = page_num
                            row_dict["_source"] = "table"
                            row_dict["_filename"] = filename
                            all_table_rows.append(row_dict)

                if full_text:
                    current_section = "general"
                    paragraph_buffer = []

                    for line in full_text.splitlines():
                        line = line.strip()
                        if not line:
                            if paragraph_buffer:
                                paragraph_text = " ".join(paragraph_buffer)
                                all_text_chunks.append({
                                    "section": current_section,
                                    "type": "paragraph",
                                    "content": paragraph_text,
                                    "_page": page_num,
                                    "_source": "text",
                                    "_filename": filename,
                                    "_char_count": len(paragraph_text),
                                })
                                paragraph_buffer = []
                            continue

                        is_heading = (
                            re.match(r'^[A-Z][A-Z\s]{4,}$', line) or
                            (len(line) < 60 and re.match(r'^[A-Z][a-z]', line) and line.endswith(':')) or
                            re.match(r'^\d+\.\s+[A-Z]', line)
                        )

                        if is_heading and not paragraph_buffer:
                            current_section = re.sub(r'^\d+\.\s+', '', line).lower().strip().replace(" ", "_")
                            all_text_chunks.append({
                                "section": current_section,
                                "type": "heading",
                                "content": line,
                                "_page": page_num,
                                "_source": "text",
                                "_filename": filename,
                                "_char_count": len(line),
                            })
                        else:
                            paragraph_buffer.append(line)

                    if paragraph_buffer:
                        paragraph_text = " ".join(paragraph_buffer)
                        all_text_chunks.append({
                            "section": current_section,
                            "type": "paragraph",
                            "content": paragraph_text,
                            "_page": page_num,
                            "_source": "text",
                            "_filename": filename,
                            "_char_count": len(paragraph_text),
                        })

        if len(all_table_rows) > len(all_text_chunks):
            rows = all_table_rows
        elif all_text_chunks and not all_table_rows:
            rows = all_text_chunks
        else:
            rows = all_table_rows if all_table_rows else all_text_chunks

        if not rows:
            raise ValueError(f"No extractable content found in: {filename}")

        all_keys = list(dict.fromkeys(k for row in rows for k in row))
        normalized = [{k: row.get(k, "") for k in all_keys} for row in rows]
        return pl.DataFrame(normalized)

    # ── Parse all PDFs and collect their column sets ──
    parsed_frames: List[tuple[str, pl.DataFrame]] = []
    parse_errors = []

    for filename, content in file_contents:
        try:
            df = parse_single_pdf(filename, content)
            parsed_frames.append((filename, df))
        except Exception as e:
            parse_errors.append(f'"{filename}": {str(e)}')

    if parse_errors:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse some PDFs: {'; '.join(parse_errors)}"
        )

    # ── Relatedness check ──
    # Strip internal meta columns before comparing
    META_COLS = {"_page", "_source", "_filename", "_char_count", "section", "type"}

    def get_content_cols(df: pl.DataFrame) -> set:
        return {c for c in df.columns if c not in META_COLS}

    col_sets = [(fname, get_content_cols(df)) for fname, df in parsed_frames]

    if len(col_sets) > 1:
        # Calculate pairwise Jaccard similarity between all PDFs
        # A pair is "unrelated" if their overlap is below the threshold
        SIMILARITY_THRESHOLD = 0.3  # 30% column overlap required

        unrelated_pairs = []
        for i in range(len(col_sets)):
            for j in range(i + 1, len(col_sets)):
                fname_a, cols_a = col_sets[i]
                fname_b, cols_b = col_sets[j]

                if not cols_a or not cols_b:
                    continue

                intersection = cols_a & cols_b
                union = cols_a | cols_b
                jaccard = len(intersection) / len(union) if union else 0

                if jaccard < SIMILARITY_THRESHOLD:
                    unrelated_pairs.append({
                        "file_a": fname_a,
                        "file_b": fname_b,
                        "overlap_columns": sorted(intersection),
                        "similarity_score": round(jaccard, 2),
                        "columns_a": sorted(cols_a),
                        "columns_b": sorted(cols_b),
                    })

        if unrelated_pairs:
            # Build a clear error message
            pair_descriptions = []
            for p in unrelated_pairs[:3]:  # Show up to 3 problem pairs
                pair_descriptions.append(
                    f'"{p["file_a"]}" and "{p["file_b"]}" share only '
                    f'{len(p["overlap_columns"])} column(s) '
                    f'(similarity: {p["similarity_score"] * 100:.0f}%)'
                )

            raise HTTPException(
                status_code=422,
                detail={
                    "error": "unrelated_files",
                    "message": (
                        "The uploaded PDFs do not appear to be related. "
                        "Please upload PDFs of the same type (e.g., all invoices, all reports)."
                    ),
                    "problematic_pairs": unrelated_pairs,
                    "hint": f"Problems found: {'; '.join(pair_descriptions)}",
                }
            )

    # ── Merge all DataFrames ──
    def merge_pdfs() -> pl.DataFrame:
        # Collect all unique columns across all frames
        all_columns = list(dict.fromkeys(
            col for _, df in parsed_frames for col in df.columns
        ))

        aligned_frames = []
        for _, df in parsed_frames:
            missing = [c for c in all_columns if c not in df.columns]
            if missing:
                # Add missing columns as empty strings
                df = df.with_columns([
                    pl.lit("").alias(c) for c in missing
                ])
            aligned_frames.append(df.select(all_columns))

        return pl.concat(aligned_frames)

    # ── Create dataset record and kick off background processing ──
    dataset_id = str(uuid.uuid4())
    filenames_str = ", ".join(fname for fname, _ in file_contents)
    display_name = (
        filenames_str if len(filenames_str) <= 80
        else f"{len(file_contents)} PDFs"
    )

    new_ds = Dataset(
        id=dataset_id,
        name=display_name,
        source_type="multi_pdf",
        status="processing"
    )
    db.add(new_ds)
    db.commit()

    background_tasks.add_task(background_processing, dataset_id, merge_pdfs, db)

    return {
        "dataset_id": dataset_id,
        "message": f"{len(file_contents)} PDF(s) validated and upload started.",
        "files_accepted": [fname for fname, _ in file_contents],
    }