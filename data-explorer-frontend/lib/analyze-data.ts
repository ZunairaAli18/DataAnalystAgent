/**
 * Direct Python Backend Integration
 * This utility connects to your FastAPI /data/analyze endpoint
 * instead of using the Next.js route.ts wrapper
 */

export interface ColumnMeta {
  key: string
  label: string
  dtype?: string
}

export interface KPI {
  label: string
  value: string
  change: number | null
  positive: boolean
  color: string
}

export interface ChartData {
  type: "line" | "bar" | "pie"
  title: string
  description?: string
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  color: string
}

export interface AnalysisResult {
  kpis: KPI[]
  charts: ChartData[]
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

export interface AnalysisRequest {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  dataset_id: string
}

/**
 * Analyze cleaned data by calling the Python backend directly
 * @param request - Analysis request with cleaned data
 * @param backendUrl - Python FastAPI backend URL (defaults to localhost:8000)
 * @returns Analysis result with KPIs, charts, trends, and recommendations
 */
export async function analyzeCleanedData(
  request: AnalysisRequest,
  backendUrl: string = "http://localhost:8000"
): Promise<AnalysisResult> {
  try {
    const response = await fetch(`${backendUrl}/data/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(
        errorData?.detail || `Analysis failed: ${response.statusText}`
      )
    }

    const result: AnalysisResult = await response.json()
    return result
  } catch (error) {
    console.error("[v0] Analysis error:", error)
    throw error
  }
}

/**
 * Format cleaned data for analysis
 * @param cleanedData - Raw cleaned data from the data explorer
 * @param datasetId - Dataset identifier
 * @returns Formatted analysis request
 */
export function formatAnalysisRequest(
  cleanedData: {
    cleaned_data: Record<string, unknown>[]
    columns: string[]
    cleaning_summary: unknown
    factors_applied: string[]
  },
  datasetId: string
): AnalysisRequest {
  const columns = cleanedData.columns.map((col: string) => ({
    key: col,
    label: col.toUpperCase(),
  }))

  return {
    columns,
    rows: cleanedData.cleaned_data,
    dataset_id: datasetId || "unknown",
  }
}
