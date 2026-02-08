# Column Analysis & Insights Setup Guide

## Overview

This feature provides automated analysis of individual columns with:
- Distribution graphs (histograms for numeric, bar charts for categorical)
- Detailed descriptions
- Key insights with data quality issues
- Actionable recommendations
- Statistical summaries

## Backend Setup

### 1. New Module: `column_analyzer.py`

The backend includes a new `ColumnAnalyzer` class that:
- Analyzes numeric, categorical, and temporal columns
- Generates statistical summaries
- Creates human-readable descriptions
- Identifies data quality issues
- Generates actionable recommendations
- Produces graph data for visualization

### 2. New API Endpoints

#### Analyze Single Column
```
GET /data/{dataset_id}/column/{column_name}/analysis
```

Returns:
```json
{
  "column_name": "Sales",
  "data_type": "numeric",
  "description": "Column description...",
  "insights": ["Insight 1", "Insight 2", ...],
  "recommendations": ["Recommendation 1", ...],
  "graph_type": "histogram",
  "graph_data": { ... },
  "statistics": {
    "total_count": 1000,
    "null_percentage": 5.2,
    "unique_count": 856,
    "mean": 5234.56,
    "min": 100.0,
    "max": 50000.0,
    ...
  }
}
```

#### Analyze All Columns
```
GET /data/{dataset_id}/columns/analysis
```

Returns analysis for all columns in a dataset.

## Frontend Setup

### 1. New Component: `ColumnAnalysis`

Location: `components/column-analysis.tsx`

Props:
- `datasetId`: Dataset ID (required)
- `columnName`: Column name to analyze (required)
- `apiUrl`: Backend API URL (default: http://localhost:8000)

Features:
- Renders histograms/bar charts using Recharts
- Displays statistics cards
- Shows insights with icons
- Lists recommendations
- Auto-loads analysis on mount

### 2. New Page: `column-analysis`

Location: `app/column-analysis/page.tsx`

Features:
- Column navigator with arrow buttons
- Tab-based column selection
- Full-page analysis view
- Uses AppLayout for consistent styling
- Loads columns from localStorage

### 3. Updated Components

**cleaned-data page:**
- Added "Column Analysis" button
- Links to `/column-analysis?dataset_id={dataset_id}`

**sidebar.tsx:**
- Added "Column Analysis" navigation item
- Uses TrendingUp icon

## Data Flow

1. User cleans data on `/cleaned-data` page
   - Columns are stored in localStorage
   - Dataset ID is passed via URL parameter

2. User clicks "Column Analysis" button
   - Navigates to `/column-analysis?dataset_id=...`
   - Component loads columns from localStorage

3. User selects a column
   - Frontend calls `GET /data/{dataset_id}/column/{column_name}/analysis`
   - Backend analyzes the column and returns results

4. Results are displayed
   - Graph renders based on column type
   - Statistics cards show key metrics
   - Insights and recommendations are displayed

## Column Type Detection

The analyzer automatically detects:

### Numeric
- Generates histogram distribution
- Shows: min, max, mean, median, std_dev
- Checks for outliers and skewness
- Recommends normalization if needed

### Categorical
- Generates bar chart of top values
- Shows: unique count, cardinality
- Detects imbalanced categories
- Recommends encoding strategy

### Temporal
- Shows date range
- Timeline visualization
- Checks for temporal gaps

## Configuration

### Environment Variables

Frontend:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Backend:
```env
# Already configured in CORS settings
CORS allow_origins=["http://localhost:3000"]
```

## Usage Example

### 1. Start Backend
```bash
cd analytics_agent
python -m uvicorn main:app --reload
```

### 2. Start Frontend
```bash
cd data-explorer-frontend
npm run dev
```

### 3. Access the Feature
1. Go to Ingestion page
2. Upload/ingest data
3. Go to View Data page
4. Clean your data
5. Click "Column Analysis" button
6. Navigate through columns and review insights

## Customization

### Adding New Insight Rules

Edit `column_analyzer.py` `_generate_insights()` method:

```python
@staticmethod
def _generate_insights(series, col_type, stats):
    insights = []
    # Add your custom logic here
    if your_condition:
        insights.append("Your insight message")
    return insights
```

### Adding New Recommendation Rules

Edit `_generate_recommendations()` method:

```python
@staticmethod
def _generate_recommendations(series, col_type, stats):
    recommendations = []
    # Add your custom logic here
    if your_condition:
        recommendations.append("Your recommendation")
    return recommendations
```

### Changing Graph Types

Edit `_generate_graph_data()` method to add new graph types or modify existing ones.

## Performance Considerations

- API calls are cached by component state
- Large datasets (>100MB) may take time to analyze
- Consider implementing pagination for column lists

## Troubleshooting

### Column Analysis returns 404
- Ensure dataset ID is correct
- Verify column name exists in dataset
- Check dataset has been successfully ingested

### No data appears
- Verify backend is running on correct port
- Check CORS configuration allows frontend URL
- Ensure localStorage contains cleaned data

### Graphs don't render
- Check browser console for errors
- Verify graph_data format in API response
- Ensure Recharts components are properly imported

## Future Enhancements

- Correlation matrix between columns
- Time series decomposition for temporal data
- Advanced statistical tests
- Predictive modeling recommendations
- Export analysis as PDF report
- Comparison analysis between columns
