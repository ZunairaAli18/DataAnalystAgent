# Column Analysis - Quick Start Guide

## What This Feature Does

Analyzes each column in your dataset automatically to:
- Generate visualizations (histograms, bar charts)
- Calculate statistics (mean, median, min, max, std dev)
- Identify data quality issues
- Provide actionable recommendations

## Files Added/Modified

### New Files (3)
1. `analytics_agent/column_analyzer.py` - Backend analysis engine
2. `data-explorer-frontend/components/column-analysis.tsx` - Display component
3. `data-explorer-frontend/app/column-analysis/page.tsx` - Analysis page

### Modified Files (3)
1. `analytics_agent/main.py` - Added 2 API endpoints
2. `data-explorer-frontend/app/cleaned-data/page.tsx` - Added button
3. `data-explorer-frontend/components/sidebar.tsx` - Added nav item

## How to Use

### 1. Backend Setup
```bash
cd analytics_agent

# Install/update dependencies (column_analyzer.py uses existing packages)
pip install -r requirements.txt

# Start the server
python -m uvicorn main:app --reload
# Runs on http://localhost:8000
```

### 2. Frontend Setup
```bash
cd data-explorer-frontend

# Install dependencies (uses existing packages)
npm install

# Start development server
npm run dev
# Runs on http://localhost:3000
```

### 3. Using the Feature

1. **Upload Data**
   - Go to Ingestion page
   - Upload a CSV or Excel file

2. **View & Clean**
   - Go to View Data page
   - Clean your data using available options

3. **Analyze Columns**
   - Click "Column Analysis" button
   - Select columns to analyze
   - Review graphs, insights, and recommendations

## API Endpoints

### Analyze Single Column
```
GET http://localhost:8000/data/{dataset_id}/column/{column_name}/analysis

Example:
GET http://localhost:8000/data/abc123/column/Sales/analysis
```

### Analyze All Columns
```
GET http://localhost:8000/data/{dataset_id}/columns/analysis

Example:
GET http://localhost:8000/data/abc123/columns/analysis
```

## Response Example

```json
{
  "column_name": "Sales",
  "data_type": "numeric",
  "description": "'Sales' is a numeric column with 1000 total values...",
  "insights": [
    "📊 Contains 5.2% missing values that should be handled",
    "📈 Right-skewed distribution detected"
  ],
  "recommendations": [
    "Apply log transformation to handle right-skew",
    "Consider imputing missing values"
  ],
  "graph_type": "histogram",
  "graph_data": {
    "bins": [{"range": "100", "count": 45}, ...]
  },
  "statistics": {
    "total_count": 1000,
    "null_percentage": 5.2,
    "mean": 5234.56,
    "min": 100,
    "max": 50000,
    ...
  }
}
```

## Column Types Supported

### Numeric
- Histograms
- Statistics: min, max, mean, median, std dev
- Outlier detection
- Skewness analysis

### Categorical
- Bar charts
- Top values list
- Cardinality analysis
- Imbalance detection

### Temporal
- Date ranges
- Timeline views
- Gap detection

## Key Features

✅ **Automatic Detection** - Identifies column types automatically
✅ **Rich Visualizations** - Histograms, bar charts, statistics
✅ **Quality Checks** - Missing data, outliers, cardinality
✅ **Smart Recommendations** - Data preprocessing suggestions
✅ **Easy Navigation** - Arrow buttons, tab selection
✅ **Responsive Design** - Works on all screen sizes

## Common Insights Generated

### Numeric Columns
- "⚠️ High missing data: 35% of values are null"
- "🔴 Potential outliers detected"
- "📈 Right-skewed distribution detected"
- "⚠️ All values are identical"

### Categorical Columns
- "🔹 Very high cardinality - nearly all values unique"
- "🔹 Low cardinality - values heavily concentrated"
- "Column is heavily imbalanced"

### All Types
- Missing value percentage
- Data completeness score
- Uniqueness metrics

## Common Recommendations

- "Consider imputing missing values using mean/median"
- "Apply log transformation to handle skew"
- "Consider one-hot encoding for modeling"
- "Column is well-suited for analysis"
- "High variability - consider normalization"

## File Sizes

- `column_analyzer.py`: 316 lines
- `column-analysis.tsx`: 301 lines
- `column-analysis/page.tsx`: 195 lines
- **Total Backend**: ~75 lines added to main.py
- **Total Frontend**: ~18 lines added to sidebar/cleaned-data

## Dependencies

No new packages needed! Uses:
- **Backend**: polars, fastapi (existing)
- **Frontend**: recharts, shadcn/ui (existing)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 Column Not Found | Verify column exists in dataset |
| Analysis Loads Forever | Check backend is running on port 8000 |
| Empty Insights | Data is likely high quality - good sign! |
| Graph Not Showing | Check browser console, verify API response |

## Next Steps

1. Test with your data
2. Review insights and recommendations
3. Apply suggested transformations
4. Export cleaned data
5. Use for analysis/modeling

## Integration Points

The feature integrates with:
- ✅ Cleaned Data page (new button)
- ✅ Sidebar navigation (new menu item)
- ✅ Existing backend structure (FastAPI)
- ✅ Storage system (Supabase S3)
- ✅ UI components (shadcn/ui)

## Environment Variables

Frontend (optional):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Backend (already configured):
```python
# CORS allows http://localhost:3000
```

## Rate Limiting

No rate limiting - use responsibly!
For large datasets (>100MB), analysis may take a few seconds.

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Full support (responsive)

## Questions?

Check these files for more details:
- `COLUMN_ANALYSIS_SETUP.md` - Detailed setup guide
- `COLUMN_ANALYSIS_IMPLEMENTATION.md` - Technical details
- Source code comments in component files
