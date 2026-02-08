# Dashboard Backend Integration Guide

## Overview

The dashboard has been successfully connected to the FastAPI backend. The frontend now dynamically fetches real data from your datasets instead of using hardcoded values.

## What Was Added

### Backend (FastAPI - main.py)

#### New Endpoints

1. **`GET /data/{dataset_id}/kpi-summary`**
   - Returns KPI cards (Sales, Profit, Orders, Returns)
   - Generates from numeric columns in dataset
   - Response: `{ "kpi_cards": [...] }`

2. **`GET /data/{dataset_id}/revenue-trend`**
   - Returns monthly revenue trend data
   - Used for the Revenue Trend line chart
   - Response: `{ "revenue_data": [{ "month": "Jan", "value": 6500 }, ...] }`

3. **`GET /data/{dataset_id}/sales-trend`**
   - Returns yearly sales trend data
   - Used for the Sales Trend bar chart
   - Response: `{ "sales_data": [{ "year": "2019", "value": 400 }, ...] }`

4. **`GET /data/{dataset_id}/insights`**
   - Returns AI-generated insights and recommendations
   - Includes confidence factor for predictions
   - Response: `{ "insights": "...", "recommendations": [...], "confidence_factor": 0.96 }`

5. **`GET /data/{dataset_id}/dashboard`** (Complete Dashboard)
   - Combines all above data in single endpoint
   - Most efficient for full dashboard load
   - Response includes all KPIs, charts, insights, and recommendations

### Backend Helper Methods (column_analyzer.py)

Added to `ColumnAnalyzer` class:

```python
- generate_kpi_cards(df)          # Create KPI cards from numeric columns
- generate_revenue_trend(df)      # Create monthly trend data
- generate_sales_trend(df)        # Create yearly trend data
- generate_insights(df)           # AI-generated insights
- generate_recommendations(df)    # Actionable recommendations
- calculate_confidence(df)        # Confidence score for analytics
```

### Frontend Changes

#### New API Service (lib/dashboard-api.ts)

Centralized API calls with proper error handling:

```typescript
export async function fetchDashboardData(datasetId: string): Promise<DashboardData>
export async function fetchKPIData(datasetId: string): Promise<KPIData[]>
export async function fetchRevenueData(datasetId: string): Promise<ChartData[]>
export async function fetchSalesData(datasetId: string): Promise<ChartData[]>
export async function fetchInsights(datasetId: string): Promise<InsightData>
```

#### Updated Dashboard Page (app/dashboard/page.tsx)

- Now uses `useEffect` to fetch data on component mount
- Accepts `dataset_id` from URL search parameters
- Shows loading state with spinner
- Shows error state with detailed messages
- Updates all KPI cards, charts, insights dynamically
- Confidence factor displayed in Strategic Forecast

#### Updated Cleaned Data Page

Added navigation buttons:
- **Dashboard** button → `/dashboard?dataset_id={id}`
- **Column Analysis** button → `/column-analysis?dataset_id={id}`
- **Export CSV** button

## Data Flow

```
Cleaned Data Page
    ↓ (Click "Dashboard" button)
Dashboard Page
    ↓ (useEffect)
API Service (lib/dashboard-api.ts)
    ↓ (fetch)
Backend API
    ↓ (/data/{dataset_id}/dashboard)
Column Analyzer
    ↓
Return analyzed data
    ↓ (React state update)
Display on Dashboard
```

## API Response Format

### KPI Card Response
```json
{
  "label": "SALES",
  "currentValue": "733.22K",
  "previousValue": "PY 609.21K",
  "change": 20.36,
  "positive": true,
  "sparkColor": "#00d4ff"
}
```

### Revenue Trend Response
```json
{
  "month": "Jan",
  "value": 6500
}
```

### Full Dashboard Response
```json
{
  "dataset_id": "sales_2024",
  "kpi_cards": [...],
  "revenue_data": [...],
  "sales_data": [...],
  "insights": "Sales peaked in March...",
  "recommendations": ["Maintain high stock..."],
  "confidence_factor": 0.964
}
```

## Environment Configuration

Make sure your frontend has the correct API base URL:

```typescript
// In lib/dashboard-api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
```

Set environment variable in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For production:
```
NEXT_PUBLIC_API_URL=https://your-api-domain.com
```

## Testing the Integration

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

### 3. Test Flow
1. Go to **Ingestion** → Upload a dataset
2. Go to **View Data** → Clean the data
3. Click **Dashboard** button → See dynamic data
4. Check browser console for any errors
5. Verify KPI cards show real data from dataset
6. Verify charts display trend data

### 4. Test Individual Endpoints

Using curl or Postman:

```bash
# Get KPI summary
curl http://localhost:8000/data/my_dataset/kpi-summary

# Get dashboard (complete)
curl http://localhost:8000/data/my_dataset/dashboard

# Get insights
curl http://localhost:8000/data/my_dataset/insights
```

## Error Handling

The frontend handles errors gracefully:

- **Loading State**: Shows spinner while fetching
- **Error State**: Displays error message with retry option
- **Fallback**: Shows message if no dataset is selected
- **Network Errors**: Caught and displayed to user

## Performance Optimization

The `/data/{dataset_id}/dashboard` endpoint is optimized for single request:
- Fetches all data in one API call
- Reduces network round trips
- Faster page load
- Recommended for production use

## Troubleshooting

### Dashboard Shows "Loading..." Forever
- Check backend is running: `http://localhost:8000/docs`
- Check `NEXT_PUBLIC_API_URL` environment variable
- Check browser console for CORS errors

### KPI Cards Are Empty
- Ensure dataset has numeric columns
- Check backend logs for analysis errors
- Verify data is properly cleaned before dashboard

### Charts Not Displaying
- Check if revenue/sales data is generated
- Verify column names in dataset
- Check if data is numeric type

### Confidence Factor Shows 0%
- This indicates low data quality
- Check for missing values in dataset
- Run cleaning first

## Next Steps

1. **Customize KPI Cards**: Modify `generate_kpi_cards()` to use specific columns
2. **Add More Charts**: Extend dashboard with additional visualizations
3. **Real-time Updates**: Add WebSocket for live dashboard updates
4. **Export Reports**: Generate PDF/Excel from dashboard data
5. **Historical Tracking**: Store dashboard snapshots for comparison

## File Summary

| File | Changes |
|------|---------|
| `analytics_agent/main.py` | Added 5 new dashboard endpoints |
| `analytics_agent/column_analyzer.py` | Added 6 helper methods |
| `data-explorer-frontend/lib/dashboard-api.ts` | New API service layer |
| `data-explorer-frontend/app/dashboard/page.tsx` | Backend integration |
| `data-explorer-frontend/app/cleaned-data/page.tsx` | Added navigation buttons |

---

**Status**: ✅ Complete and Ready for Production

The dashboard is now fully connected to the backend and will display real, analyzed data from your datasets!
