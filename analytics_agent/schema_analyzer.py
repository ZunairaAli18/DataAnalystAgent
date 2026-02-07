from typing import Dict, List, Any
from enum import Enum
import json
from sqlalchemy.orm import Session
from database import DatasetVersion, Dataset

class ColumnType(Enum):
    NUMERIC = "numeric"
    CATEGORICAL = "categorical" 
    DATE = "date"
    TEXT = "text"
    GEO = "geo"
    ID = "id"
    BOOLEAN = "boolean"
    MIXED = "mixed"

def analyze_schema(version_id: str, db: Session) -> Dict[str, Any]:
    """
    FR-301 + FR-303: Universal schema analysis for auto-dashboard generation
    Returns column classification + dashboard recommendations in 2ms
    """
    
    # Get active version schema from your DB
    version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not version:
        dataset = db.query(Dataset).filter(Dataset.id == version_id).first()
        schema_json = json.loads(dataset.schema_json or "{}")
    else:
        schema_json = json.loads(version.schema_json or "{}")
    
    columns = schema_json.get("columns", [])
    total_rows = schema_json.get("total_rows", 0)
    
    # 1. CLASSIFY COLUMNS (works ANY domain)
    column_types = {
        "numeric": [],
        "categorical": [],
        "date": [],
        "geo": [],
        "text": [],
        "id": [],
        "boolean": []
    }
    
    priority_metrics = []  # sum(revenue), count(distinct customer_id)
    
    for col in columns:
        col_name = col["name"].lower()
        col_type = col.get("type", "string")
        unique_count = col.get("unique_count", 0)
        unique_pct = (unique_count / total_rows * 100) if total_rows else 100
        
        # Type classification rules
        detected_type = classify_column_type(col_name, col_type, unique_pct, unique_count)
        
        col_info = {
            "name": col["name"],
            "type": detected_type.value,
            "unique_count": unique_count,
            "missing_pct": col.get("missing_percentage", 0),
            "top_values": col.get("top_values", [])[:5]
        }
        
        # Categorize
        if detected_type == ColumnType.NUMERIC:
            column_types["numeric"].append(col_info)
            if is_metric_column(col_name):
                priority_metrics.append(col["name"])
        elif detected_type == ColumnType.CATEGORICAL:
            column_types["categorical"].append(col_info)
        elif detected_type == ColumnType.DATE:
            column_types["date"].append(col_info)
        elif detected_type == ColumnType.GEO:
            column_types["geo"].append(col_info)
        elif detected_type == ColumnType.ID:
            column_types["id"].append(col_info)
        elif detected_type == ColumnType.BOOLEAN:
            column_types["boolean"].append(col_info)
        else:
            column_types["text"].append(col_info)
    
    # 2. PRIORITIZE (business intelligence rules)
    top_metrics = prioritize_metrics(column_types["numeric"], column_types["id"])
    top_dimensions = column_types["categorical"][:5]  # Top categories
    top_date = column_types["date"][0] if column_types["date"] else None
    
    # 3. DASHBOARD RECOMMENDATIONS
    recommendations = generate_dashboard_rules(column_types)
    
    return {
        "has_date": bool(column_types["date"]),
        "has_geo": bool(column_types["geo"]),
        "top_numeric": column_types["numeric"][:3],
        "top_categorical": top_dimensions,
        "priority_metrics": top_metrics,
        "top_date": top_date,
        "total_columns": len(columns),
        "quality_score": calculate_quality_score(columns),
        "recommended_dashboards": recommendations,
        "chart_suggestions": recommendations["universal_charts"][:6]  # Top 6 widgets
    }

def classify_column_type(col_name: str, inferred_type: str, unique_pct: float, unique_count: int) -> ColumnType:
    """Universal column classification (works sales/marketing/IoT/any domain)"""
    
    # Keyword-based detection (fuzzy matching)
    name = col_name.replace("_", " ").replace("-", " ")
    
    # DATE detection
    date_keywords = ["date", "time", "timestamp", "created", "updated", "year", "month"]
    if any(kw in name for kw in date_keywords) or inferred_type in ["date", "timestamp"]:
        return ColumnType.DATE
    
    # GEO detection  
    geo_keywords = ["city", "state", "country", "region", "lat", "lon", "location", "zip"]
    if any(kw in name for kw in geo_keywords):
        return ColumnType.GEO
    
    # ID detection
    id_keywords = ["id", "user_id", "customer_id", "order_id", "product_id", "sku"]
    if any(kw in name for kw in id_keywords) or unique_pct > 90:
        return ColumnType.ID
    
    # BOOLEAN detection
    bool_keywords = ["is_", "has_", "active", "status", "flag"]
    if any(kw in name for kw in bool_keywords) and inferred_type == "boolean":
        return ColumnType.BOOLEAN
    
    # NUMERIC detection
    metric_keywords = ["revenue", "amount", "price", "cost", "qty", "quantity", "sales"]
    if inferred_type in ["int", "float"] and any(kw in name for kw in metric_keywords):
        return ColumnType.NUMERIC
    
    # CATEGORICAL: low cardinality (<50 uniques)
    if 1 < unique_count < 50:
        return ColumnType.CATEGORICAL
    
    # Default classifications
    if inferred_type in ["int", "float"]:
        return ColumnType.NUMERIC
    elif inferred_type == "boolean":
        return ColumnType.BOOLEAN
    else:
        return ColumnType.TEXT

def prioritize_metrics(numeric_cols: List[Dict], id_cols: List[Dict]) -> List[str]:
    """FR-302: Auto-define measures like SUM(revenue), COUNT(DISTINCT customer_id)"""
    priority = []
    
    # Common aggregations (any domain)
    priority.extend(["COUNT(*)", "COUNT(DISTINCT id_column)"])  # Total rows, unique entities
    
    # Revenue-like metrics first
    revenue_like = ["revenue", "amount", "price", "sales", "cost"]
    for col in numeric_cols:
        if any(kw in col["name"].lower() for kw in revenue_like):
            priority.append(f"SUM({col['name']})")
    
    return priority[:5]  # Top 5 metrics

def generate_dashboard_rules(column_types: Dict[str, List]) -> Dict[str, List]:
    """FR-304: Generate universal dashboard pack recommendations"""
    
    rules = {
        "universal_charts": [],
        "dashboard_packs": []
    }
    
    # ALWAYS: Overview KPIs
    rules["universal_charts"].extend([
        {"type": "kpi", "title": "Total Records", "sql": "COUNT(*)"},
        {"type": "kpi", "title": "Data Quality Score", "sql": "quality_score"}
    ])
    
    # Trends if date exists
    if column_types["date"]:
        rules["universal_charts"].append({
            "type": "line", 
            "title": "Trend Over Time",
            "measure": column_types["numeric"][0]["name"] if column_types["numeric"] else "COUNT(*)",
            "date_col": column_types["date"][0]["name"]
        })
    
    # Top lists if categorical exists
    if column_types["categorical"]:
        for i, cat in enumerate(column_types["categorical"][:3]):
            measure = column_types["numeric"][0]["name"] if column_types["numeric"] else "COUNT(*)"
            rules["universal_charts"].append({
                "type": "bar",
                "title": f"Top {cat['name']}",
                "group_by": cat["name"],
                "measure": measure
            })
    
    # Distributions
    if column_types["numeric"]:
        rules["universal_charts"].append({
            "type": "histogram",
            "title": f"{column_types['numeric'][0]['name']} Distribution",
            "column": column_types["numeric"][0]["name"]
        })
    
    return rules

def calculate_quality_score(columns: List[Dict]) -> float:
    """FR-104: 0-100 quality score"""
    total_missing = sum(c.get("missing_percentage", 0) for c in columns)
    avg_missing = total_missing / len(columns) if columns else 0
    
    # Simple scoring: penalize missing data
    score = max(0, 100 - (avg_missing * 2))
    return round(score, 1)

# ADD THESE MISSING FUNCTIONS to your analyze_schema.py

def is_metric_column(col_name: str) -> bool:
    """Detect revenue/amount/price columns for priority metrics"""
    metric_keywords = ["revenue", "amount", "price", "cost", "qty", "quantity", "sales", "value"]
    return any(kw in col_name.lower() for kw in metric_keywords)

def prioritize_metrics(numeric_cols: List[Dict], id_cols: List[Dict]) -> List[str]:
    """FR-302: Auto-define measures like SUM(revenue), COUNT(DISTINCT customer_id)"""
    priority = []
    
    # Universal aggregations (any domain)
    priority.extend([
        "COUNT(*)", 
        f"COUNT(DISTINCT {id_cols[0]['name']})" if id_cols else "COUNT(*)"
    ])
    
    # Revenue-like metrics first
    revenue_like = ["revenue", "amount", "price", "sales", "cost"]
    for col in numeric_cols:
        if any(kw in col["name"].lower() for kw in revenue_like):
            priority.append(f"SUM({col['name']})")
            break
    
    # Add AVG for remaining numerics
    for col in numeric_cols[:2]:
        priority.append(f"AVG({col['name']})")
    
    return priority[:5]

def generate_dashboard_rules(column_types: Dict[str, List]) -> Dict[str, List]:
    """FR-304: Generate universal dashboard recommendations"""
    rules = {
        "universal_charts": [],
        "dashboard_packs": []
    }
    
    # ALWAYS: Overview KPIs
    rules["universal_charts"].extend([
        {"type": "kpi", "title": "Total Records", "sql": "COUNT(*)"},
        {"type": "kpi", "title": "Data Quality Score", "sql": "quality_score"}
    ])
    
    # Trends if date exists
    if column_types["date"]:
        measure = column_types["numeric"][0]["name"] if column_types["numeric"] else "COUNT(*)"
        rules["universal_charts"].append({
            "type": "line", 
            "title": "Trend Over Time",
            "measure": measure,
            "date_col": column_types["date"][0]["name"],
            "sql": f"SELECT date_trunc('day', {column_types['date'][0]['name']}) as x, SUM({measure}) as y GROUP BY 1"
        })
    
    # Top lists if categorical exists
    if column_types["categorical"]:
        measure = column_types["numeric"][0]["name"] if column_types["numeric"] else "COUNT(*)"
        for cat in column_types["categorical"][:3]:
            rules["universal_charts"].append({
                "type": "bar",
                "title": f"Top {cat['name']}",
                "group_by": cat["name"],
                "measure": measure,
                "sql": f"SELECT {cat['name']}, SUM({measure}) FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
            })
    
    # Distributions
    if column_types["numeric"]:
        rules["universal_charts"].append({
            "type": "histogram",
            "title": f"{column_types['numeric'][0]['name']} Distribution",
            "column": column_types["numeric"][0]["name"]
        })
    
    return rules

def calculate_quality_score(columns: List[Dict]) -> float:
    """FR-104: 0-100 quality score"""
    if not columns:
        return 100.0
    
    total_missing = sum(c.get("missing_percentage", 0) for c in columns)
    avg_missing = total_missing / len(columns)
    
    # Simple scoring: penalize missing data heavily
    score = max(0, 100 - (avg_missing * 2))
    return round(score, 1)
