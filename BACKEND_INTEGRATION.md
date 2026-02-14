# Python Backend Integration Guide

This frontend now connects directly to your Python/FastAPI backend for data analysis, bypassing the Next.js `route.ts` wrapper.

## Architecture

### Before (Using route.ts wrapper)
```
Frontend Dashboard → Next.js /api/analyze route.ts → Python Backend
```

### After (Direct connection)
```
Frontend Dashboard → Python Backend
```

## Setup Instructions

### 1. Environment Variables

Add the following to your `.env.local` file (frontend):

```env
# Python FastAPI backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

For production, use your deployed backend URL:
```env
NEXT_PUBLIC_BACKEND_URL=https://your-api.example.com
```

### 2. Start Your Backend

Run your Python FastAPI server:

```bash
cd analytics_agent
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. CORS Configuration

Your Python backend already has CORS configured in `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Update for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

For production, update `allow_origins` to include your frontend domain:
```python
allow_origins=["https://your-frontend.example.com"]
```

## How It Works

### Frontend Integration

The dashboard now uses the `analyzeCleanedData` utility from `lib/analyze-data.ts`:

```typescript
import { analyzeCleanedData, formatAnalysisRequest } from "@/lib/analyze-data"

// Format cleaned data into analysis request
const analysisRequest = formatAnalysisRequest(parsed, datasetId)

// Call Python backend directly
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const result = await analyzeCleanedData(analysisRequest, backendUrl)
```

### Backend Endpoint

Your backend provides the `/data/analyze` endpoint:

```python
@app.post("/data/analyze")
async def analyze_cleaned_data(request: AnalyzeRequest):
    """
    Analyze cleaned data and return KPIs, charts, description, trends, and recommendations.
    Accepts the cleaned data payload from the frontend.
    """
```

## Request/Response Format

### Request
```typescript
{
  columns: Array<{
    key: string
    label: string
    dtype?: string
  }>
  rows: Array<Record<string, unknown>>
  dataset_id: string
}
```

### Response
```typescript
{
  kpis: Array<{
    label: string
    value: string
    change: number | null
    positive: boolean
    color: string
  }>
  charts: Array<{
    type: "line" | "bar" | "pie"
    title: string
    description: string
    data: Array<Record<string, unknown>>
    xKey: string
    yKey: string
    color: string
  }>
  description: string
  trends: string[]
  recommendations: string[]
  meta: {
    total_records: number
    numeric_columns: string[]
    categorical_columns: string[]
    date_columns: string[]
    total_columns: number
  }
}
```

## Removed Files

The following Next.js route file is no longer needed but can be kept for backward compatibility:

- `data-explorer-frontend/app/api/analyze/route.ts`

You can delete this file when ready, as all analysis now flows directly to the Python backend.

## Troubleshooting

### "Failed to fetch from backend"
- Ensure Python backend is running on the configured port
- Check CORS configuration in `main.py`
- Verify `NEXT_PUBLIC_BACKEND_URL` is correct

### CORS Errors
- Update `allow_origins` in `main.py` to include your frontend URL
- Ensure backend is accessible from frontend domain

### Analysis Takes Too Long
- Check backend logs for processing issues
- Consider optimizing data analysis logic in Python backend
- Monitor network requests in browser DevTools

## Future Enhancements

1. **Streaming Results**: Update backend to stream large analysis results
2. **Caching**: Add Redis caching for repeated analyses
3. **Authentication**: Implement JWT tokens for secure backend access
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Error Handling**: Enhance error messages and retry logic

## See Also

- [Python Backend Main](analytics_agent/main.py)
- [Analysis Utility](lib/analyze-data.ts)
- [Dashboard Page](app/dashboard/page.tsx)
