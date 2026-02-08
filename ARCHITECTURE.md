# Column Analysis Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 16)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Sidebar Navigation                                                   │
│  ├── Ingestion ──────────────────────────────────────────────┐      │
│  ├── View Data                                                │      │
│  ├── Cleaned Data                                             │      │
│  ├── Column Analysis ◄─── [NEW]                              │      │
│  ├── Dashboard                                                │      │
│  └── AI Analyst                                               │      │
│                                                                ▼      │
│  Workflow:                                                    │      │
│  1. Upload File (CSV/Excel)                                  │      │
│  2. View & Clean Data                                        │      │
│  3. CLICK: Column Analysis Button                            │      │
│  4. Navigate Columns with UI                                 │      │
│  5. Fetch Analysis from Backend ─────────────────┐          │      │
│                                                    ▼          │      │
│                                          HTTP GET Request     │      │
│                                                    │           │      │
└────────────────────────────────────────────────────┼───────────────┘
                                                      │
                                                      │
                ┌─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI + Python)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  API Endpoints [NEW]:                                                │
│  ├── GET /data/{dataset_id}/column/{column_name}/analysis           │
│  └── GET /data/{dataset_id}/columns/analysis                        │
│                                                                       │
│  Processing Pipeline:                                               │
│  1. Receive request with dataset_id + column_name                   │
│  2. Load dataset from S3 (Parquet)                                  │
│  3. ColumnAnalyzer.analyze_column()                                 │
│     ├── Type Detection (numeric/categorical/temporal)               │
│     ├── Statistics Generation                                       │
│     │   ├── Count, nulls, unique values                             │
│     │   ├── Min, max, mean, median, std_dev (numeric)               │
│     │   └── Top values (categorical)                                │
│     ├── Description Generation                                      │
│     │   └── Human-readable summary                                  │
│     ├── Insight Generation                                          │
│     │   ├── Missing data warnings                                   │
│     │   ├── Outlier detection (3-sigma)                             │
│     │   ├── Skewness analysis                                       │
│     │   ├── Cardinality analysis                                    │
│     │   └── Variance checks                                         │
│     ├── Recommendation Generation                                   │
│     │   ├── Imputation suggestions                                  │
│     │   ├── Normalization recommendations                           │
│     │   ├── Encoding strategies                                     │
│     │   └── Transformation advice                                   │
│     └── Graph Data Generation                                       │
│         ├── Histograms (numeric)                                    │
│         ├── Bar charts (categorical)                                │
│         └── Timeline (temporal)                                     │
│  4. Return JSON response                                            │
│                                                                       │
└────────────────────────────────────────────────────────────────────┘
```

## Data Flow Detailed

```
User Action: Click "Column Analysis"
    │
    ├─ Navigate to /column-analysis?dataset_id={id}
    │
    ├─ Page loads columns from localStorage
    │  (Stored during data cleaning)
    │
    ├─ User selects column
    │
    ├─ ColumnAnalysis component mounts
    │
    └─► GET /data/{dataset_id}/column/{column_name}/analysis
        │
        ├─ Load dataset from S3
        │  └─ s3://bucket/datasets/{dataset_id}/data.parquet
        │
        ├─ Polars reads Parquet efficiently
        │
        ├─ ColumnAnalyzer analyzes column
        │  │
        │  ├─► Numeric Type?
        │  │   ├─ Calculate: min, max, mean, median, std_dev
        │  │   ├─ Check outliers: max > mean + 3*std
        │  │   ├─ Check skewness: mean vs median
        │  │   └─ Generate histogram bins
        │  │
        │  ├─► Categorical Type?
        │  │   ├─ Count unique values
        │  │   ├─ Calculate cardinality ratio
        │  │   ├─ Get value counts
        │  │   └─ Generate bar chart data
        │  │
        │  └─► Temporal Type?
        │      ├─ Find min/max dates
        │      └─ Generate timeline view
        │
        └─ Return JSON with all analysis
           │
           ├─ column_name
           ├─ data_type
           ├─ description
           ├─ insights[]
           ├─ recommendations[]
           ├─ graph_type
           ├─ graph_data{}
           └─ statistics{}
```

## Component Architecture

```
Frontend Components:

App Layout
├── Sidebar (Updated)
│   ├── Logo
│   ├── Navigation Items
│   │   ├── Ingestion
│   │   ├── View Data
│   │   ├── Cleaned Data
│   │   ├── Column Analysis ◄─── [NEW]
│   │   ├── Dashboard
│   │   └── AI Analyst
│   └── Live Analysis Panel
│
├── Cleaned Data Page (Updated)
│   ├── Header
│   ├── Back Button
│   ├── Data Summary
│   ├── Buttons
│   │   ├── Column Analysis Button ◄─── [NEW]
│   │   └── Export CSV
│   ├── Cleaning Summary
│   └── Data Table
│
└── Column Analysis Page ◄─── [NEW]
    ├── Header
    ├── Column Navigator
    │   ├── Previous Button
    │   └── Next Button
    ├── Column Tabs
    │   └── List of all column names
    │
    └── ColumnAnalysis Component
        ├── Header Card
        │   ├── Column Name
        │   └── Data Type Badge
        ├── Statistics Cards (6 columns)
        │   ├── Total Values
        │   ├── Missing %
        │   ├── Unique Values
        │   ├── Mean/Median
        │   ├── Min
        │   └── Max
        ├── Distribution Graph
        │   ├── Histogram (numeric)
        │   ├── Bar Chart (categorical)
        │   └── Timeline (temporal)
        ├── Key Insights Card
        │   └── List of insights
        ├── Recommendations Card
        │   └── Numbered recommendations
        └── Info Card
            └── Navigation tips
```

## Class Structure (Backend)

```python
ColumnAnalyzer
├── @staticmethod analyze_column(df, column_name) -> ColumnInsight
├── @staticmethod _determine_type(series, dtype) -> str
├── @staticmethod _get_statistics(series, col_type) -> Dict
├── @staticmethod _generate_description(name, type, stats) -> str
├── @staticmethod _generate_insights(series, col_type, stats) -> List[str]
├── @staticmethod _generate_recommendations(series, col_type, stats) -> List[str]
├── @staticmethod _generate_graph_data(series, col_type, stats) -> Tuple
└── @staticmethod analyze_all_columns(df) -> List[Dict]

ColumnInsight (dataclass)
├── column_name: str
├── data_type: str
├── description: str
├── insights: List[str]
├── recommendations: List[str]
├── graph_type: str
├── graph_data: Dict
└── statistics: Dict
```

## API Request/Response Format

### Request
```http
GET /data/abc123def456/column/Sales/analysis HTTP/1.1
Host: localhost:8000
Accept: application/json
```

### Response (200 OK)
```json
{
  "column_name": "Sales",
  "data_type": "numeric",
  "description": "Sales is a numeric column with 1,000 values...",
  "insights": [
    "📊 Contains 5.2% missing values",
    "📈 Right-skewed distribution"
  ],
  "recommendations": [
    "Apply log transformation",
    "Impute missing values"
  ],
  "graph_type": "histogram",
  "graph_data": {
    "bins": [
      {"range": "0-1000", "count": 45},
      {"range": "1000-2000", "count": 120}
    ]
  },
  "statistics": {
    "total_count": 1000,
    "null_count": 52,
    "null_percentage": 5.2,
    "unique_count": 856,
    "min": 100,
    "max": 50000,
    "mean": 5234.56,
    "median": 4500,
    "std_dev": 1234.5
  }
}
```

## Data Storage

```
Supabase Storage (S3-compatible):
├── bucket: your-bucket
└── datasets/
    ├── {dataset_id_1}/
    │   ├── data.parquet ◄─ Original data
    │   └── metadata.json
    │
    ├── {dataset_id_2}/
    │   └── data.parquet
    │
    └── {dataset_id_n}/
        └── data.parquet
```

## State Management

### Frontend (React State)
```
App State:
├── localStorage
│   ├── cleanedDataResult
│   │   ├── columns: [Column]
│   │   ├── cleaned_data: [Row]
│   │   ├── cleaning_summary: CleaningSummary
│   │   └── factors_applied: [string]
│   │
│   └── other_data...
│
└── Component State (ColumnAnalysis)
    ├── analysis: ColumnInsight | null
    ├── loading: boolean
    └── error: string | null
```

### Backend (Database)
```
SQLAlchemy Models:
├── Dataset
│   ├── id: UUID
│   ├── name: string
│   ├── status: enum (processing/ready/failed)
│   ├── row_count: int
│   ├── schema_json: JSON
│   └── s3_path: string
│
├── DatasetVersion
│   ├── id: UUID
│   ├── dataset_id: UUID (FK)
│   ├── version_name: string
│   ├── s3_path: string
│   ├── is_default: boolean
│   └── row_count: int
│
└── Anomaly/TransformLog (for tracking)
```

## Error Handling

```
Frontend Error Cases:
├── Loading Error
│   └── Show spinner with message
├── API Error (404)
│   └── Show alert: "Column not found"
├── API Error (500)
│   └── Show alert: "Analysis failed"
└── Network Error
    └── Show retry option

Backend Error Cases:
├── Column not found
│   └── HTTPException(404)
├── Dataset not found
│   └── HTTPException(404)
├── Processing error
│   └── HTTPException(500)
└── S3 access error
    └── HTTPException(500)
```

## Performance Characteristics

```
Operation          Time        Notes
─────────────────────────────────────────
S3 Read            0.5-2s      Depends on file size
Analyze Column     0.1-1s      Fast with Polars
Generate Graph     <50ms       In-memory
API Response       1-3s        Total roundtrip
Render UI          <100ms      React rendering
```

## Security Architecture

```
Security Layers:

Frontend:
├── API URL validation
├── CORS checking
└── Local storage encryption (optional)

Backend:
├── CORS middleware
│   └── Allow: http://localhost:3000
├── Input validation
│   ├── Dataset ID format
│   └── Column name validation
├── Data access control
│   └── User-specific data (future)
└── Error sanitization
    └── No sensitive data in errors
```

## Integration Points

```
With Existing System:

Ingestion ──► Storage (S3)
  ↑
  │
View Data ──► Load from S3
  │
  ├─► Data Cleaning ──► localStorage + S3
  │
  └─► Column Analysis ◄─── [NEW]
      ├─ Load from S3
      ├─ Analyze with Polars
      └─ Display with Recharts
```

## Future Architecture Extensions

```
Proposed Additions:

1. Correlation Analysis
   └─ API: GET /data/{id}/columns/correlation
   
2. Time Series Analysis
   └─ API: GET /data/{id}/column/{col}/timeseries
   
3. Predictive Analysis
   └─ API: POST /data/{id}/predictions
   
4. Report Generation
   └─ API: GET /data/{id}/analysis/report/pdf
   
5. Batch Analysis
   └─ API: POST /data/{id}/batch-analysis
   
6. Comparison
   └─ API: POST /data/{id}/columns/compare
```

This architecture is scalable, modular, and integrates seamlessly with the existing data explorer system.
