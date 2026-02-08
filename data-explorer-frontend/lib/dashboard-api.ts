const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface KPIData {
  label: string
  currentValue: string
  previousValue: string
  change: number
  positive: boolean
  sparkColor: string
  trend?: Array<{ month: string; value: number }>
}

export interface ChartData {
  label: string
  data: Array<{ [key: string]: string | number }>
}

export interface DashboardData {
  kpiCards: KPIData[]
  revenueData: Array<{ month: string; value: number }>
  salesData: Array<{ year: string; value: number }>
  insights: string
  recommendations: string[]
  confidenceFactor: number
}

export interface ColumnAnalysis {
  column_name: string
  data_type: string
  description: string
  insights: string[]
  recommendations: string[]
  statistics: {
    total_count: number
    missing_count: number
    missing_percentage: number
    unique_count: number
    mean?: number
    median?: number
    std_dev?: number
    min?: number
    max?: number
    mode?: string | number
    cardinality?: number
    skewness?: number
    kurtosis?: number
  }
  graph_type: string
  graph_data: any
}

/**
 * Fetch KPI data from backend
 */
export async function fetchKPIData(datasetId: string): Promise<KPIData[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/kpi-summary`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch KPI data: ${response.statusText}`)
    }

    const data = await response.json()
    return data.kpi_cards || []
  } catch (error) {
    console.error("[v0] Error fetching KPI data:", error)
    throw error
  }
}

/**
 * Fetch revenue trend data from backend
 */
export async function fetchRevenueData(datasetId: string): Promise<Array<{ month: string; value: number }>> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/revenue-trend`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch revenue data: ${response.statusText}`)
    }

    const data = await response.json()
    return data.revenue_data || []
  } catch (error) {
    console.error("[v0] Error fetching revenue data:", error)
    throw error
  }
}

/**
 * Fetch sales trend data from backend
 */
export async function fetchSalesData(datasetId: string): Promise<Array<{ year: string; value: number }>> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/sales-trend`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch sales data: ${response.statusText}`)
    }

    const data = await response.json()
    return data.sales_data || []
  } catch (error) {
    console.error("[v0] Error fetching sales data:", error)
    throw error
  }
}

/**
 * Fetch insights and recommendations from backend
 */
export async function fetchInsights(datasetId: string): Promise<{
  insights: string
  recommendations: string[]
  confidenceFactor: number
}> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/insights`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch insights: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      insights: data.insights || "",
      recommendations: data.recommendations || [],
      confidenceFactor: data.confidence_factor || 0,
    }
  } catch (error) {
    console.error("[v0] Error fetching insights:", error)
    throw error
  }
}

/**
 * Fetch full dashboard data from backend
 */
export async function fetchDashboardData(datasetId: string): Promise<DashboardData> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/dashboard`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard data: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      kpiCards: data.kpi_cards || [],
      revenueData: data.revenue_data || [],
      salesData: data.sales_data || [],
      insights: data.insights || "",
      recommendations: data.recommendations || [],
      confidenceFactor: data.confidence_factor || 0,
    }
  } catch (error) {
    console.error("[v0] Error fetching dashboard data:", error)
    throw error
  }
}

/**
 * Fetch column analysis data
 */
export async function fetchColumnAnalysis(
  datasetId: string,
  columnName: string
): Promise<ColumnAnalysis> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/column/${columnName}/analysis`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(
        `Failed to fetch column analysis: ${response.statusText}`
      )
    }

    return await response.json()
  } catch (error) {
    console.error(`[v0] Error fetching column analysis for ${columnName}:`, error)
    throw error
  }
}

/**
 * Fetch all column analyses
 */
export async function fetchAllColumnAnalyses(
  datasetId: string
): Promise<ColumnAnalysis[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/data/${datasetId}/columns/analysis`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )

    if (!response.ok) {
      throw new Error(
        `Failed to fetch column analyses: ${response.statusText}`
      )
    }

    const data = await response.json()
    return data.columns || []
  } catch (error) {
    console.error("[v0] Error fetching column analyses:", error)
    throw error
  }
}
