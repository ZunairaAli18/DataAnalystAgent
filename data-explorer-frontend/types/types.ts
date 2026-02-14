// types.ts
export interface KPI {
  label: string
  value: string | number
  positive: boolean
  change?: string | number
}

export interface ColumnStats {
  min?: number
  max?: number
  mean?: number
  median?: number
}

export interface TopValue {
  value: string | number
  count: number
  percentage: number
}

export interface ColumnProfile {
  key: string
  dtype: string
  distinct_count: number
  null_count: number
  total_count: number
  stats?: ColumnStats
  top_values: TopValue[]
}

export interface ChartInfo {
  title: string
  type: string
  description?: string
}

export interface AnalysisResult {
  kpis: KPI[]
  description: string
  column_profiles: ColumnProfile[]
  charts: ChartInfo[]
  recommendations: string[]
}
