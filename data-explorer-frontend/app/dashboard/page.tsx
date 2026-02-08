"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import {
  Info,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Lightbulb,
  BarChart3,
  SlidersHorizontal,
  Download,
} from "lucide-react"
import { exportDashboardToPDF } from "@/lib/export-pdf"
import { cn } from "@/lib/utils"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  ScatterChart,
  Scatter,
  Funnel,
  FunnelChart,
  Rectangle,
} from "recharts"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* ──────── Types ──────── */

interface KPI {
  label: string
  value: string
  change: number | null
  positive: boolean
  color: string
}

interface ChartConfig {
  type: "line" | "bar" | "pie"
  title: string
  description?: string
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  color: string
}

interface AnalysisResult {
  kpis: KPI[]
  charts: ChartConfig[]
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

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: AnalysisResult }

/* ──────── Helpers ──────── */

const PIE_COLORS = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676", "#f472b6", "#38bdf8", "#fbbf24"]

function generateSparkline(seed: number): { value: number }[] {
  const points = []
  let val = seed
  for (let i = 0; i < 7; i++) {
    val = val + (Math.random() - 0.4) * val * 0.15
    points.push({ value: Math.max(0, Math.round(val)) })
  }
  return points
}

function recomputeChartData(
  rows: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  chartType: "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap"
): Record<string, unknown>[] {
  // Group by X, aggregate Y via SUM
  const grouped: Record<string, number> = {}
  for (const row of rows) {
    const xVal = String(row[xCol] ?? "Unknown")
    const key = chartType === "line" ? xVal.substring(0, 7) || xVal : xVal
    grouped[key] = (grouped[key] || 0) + (Number(row[yCol]) || 0)
  }

  const entries = Object.entries(grouped)
  const sorted =
    chartType === "line"
      ? entries.sort((a, b) => a[0].localeCompare(b[0]))
      : entries.sort((a, b) => b[1] - a[1])

  return sorted.slice(0, chartType === "pie" ? 8 : 15).map(([key, val]) => ({
    name: key,
    value: Math.round(val * 100) / 100,
  }))
}

function generateChartDescription(
  data: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  chartType: "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap"
): string {
  if (data.length === 0) return "No data available for the selected columns."

  const nameKey = "name"
  const valueKey = "value"
  const values = data.map((d) => Number(d[valueKey]) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const peakItem = data.find((d) => Number(d[valueKey]) === max)
  const lowItem = data.find((d) => Number(d[valueKey]) === min)
  const peakLabel = String(peakItem?.[nameKey] ?? "N/A")
  const lowLabel = String(lowItem?.[nameKey] ?? "N/A")

  if (chartType === "line") {
    return `Tracks ${yCol.replace(/_/g, " ")} over ${data.length} periods of ${xCol.replace(/_/g, " ")}. Peak of ${max.toLocaleString()} at "${peakLabel}", lowest of ${min.toLocaleString()} at "${lowLabel}". Total: ${total.toLocaleString()}.`
  }
  if (chartType === "pie") {
    const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
    return `Shows proportional breakdown of ${yCol.replace(/_/g, " ")} across ${data.length} ${xCol.replace(/_/g, " ")} segments. "${peakLabel}" holds the largest share at ${topPct}% (${max.toLocaleString()}).`
  }
  // bar
  const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
  return `Compares ${yCol.replace(/_/g, " ")} across ${data.length} ${xCol.replace(/_/g, " ")} categories. "${peakLabel}" leads with ${max.toLocaleString()} (${topPct}% of shown total). Combined total: ${total.toLocaleString()}.`
}

/* ──────── ChartCard Component ──────── */

function ChartCard({
  initialChart,
  rows,
  numericCols,
  categoricalCols,
  dateCols,
  chartIndex,
}: {
  initialChart: ChartConfig
  rows: Record<string, unknown>[]
  numericCols: string[]
  categoricalCols: string[]
  dateCols: string[]
  chartIndex: number
}) {
  const [chartType, setChartType] = useState<"line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap">(initialChart.type as "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap")
  const [xCol, setXCol] = useState(initialChart.xKey)
  const [yCol, setYCol] = useState(initialChart.yKey)
  const [showFilters, setShowFilters] = useState(false)

  // All available columns for X axis (categorical + date + numeric)
  const xOptions = useMemo(() => {
    const all = [...new Set([...categoricalCols, ...dateCols, ...numericCols])]
    return all
  }, [categoricalCols, dateCols, numericCols])

  // Compute chart data whenever axes change
  const chartData = useMemo(() => {
    // If axes match the initial chart, use the original pre-computed data
    if (xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type) {
      return initialChart.data
    }
    return recomputeChartData(rows, xCol, yCol, chartType)
  }, [rows, xCol, yCol, chartType, initialChart])

  const color = initialChart.color
  const title =
    xCol === initialChart.xKey && yCol === initialChart.yKey
      ? initialChart.title
      : `${yCol.replace(/_/g, " ")} by ${xCol.replace(/_/g, " ")}`

  const xDataKey = xCol === initialChart.xKey && yCol === initialChart.yKey ? initialChart.xKey : "name"
  const yDataKey = xCol === initialChart.xKey && yCol === initialChart.yKey ? initialChart.yKey : "value"

  // Chart description: use server-provided one if axes unchanged, else generate dynamically
  const chartDescription = useMemo(() => {
    if (xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type) {
      return initialChart.description || ""
    }
    return generateChartDescription(chartData, xCol, yCol, chartType)
  }, [xCol, yCol, chartType, initialChart, chartData])

  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-col">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
            showFilters
              ? "bg-primary/20 text-primary"
              : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
          )}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filters
        </button>
      </div>

      {/* Filter Controls */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-secondary/50 border border-border/50">
          {/* Chart Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
              Type
            </label>
            <Select value={chartType} onValueChange={(v) => setChartType(v as "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap")}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="column">Column</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="pie">Pie</SelectItem>
                <SelectItem value="donut">Donut</SelectItem>
                <SelectItem value="funnel">Funnel</SelectItem>
                <SelectItem value="heatmap">Heatmap</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* X Axis */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
              X Axis
            </label>
            <Select value={xCol} onValueChange={setXCol}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {xOptions.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Y Axis */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
              Y Axis
            </label>
            <Select value={yCol} onValueChange={setYCol}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numericCols.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset */}
          <div className="flex flex-col gap-1 ml-auto">
            <label className="text-[10px] font-medium text-transparent tracking-wider uppercase select-none">
              _
            </label>
            <button
              onClick={() => {
                setChartType(initialChart.type)
                setXCol(initialChart.xKey)
                setYCol(initialChart.yKey)
              }}
              className="h-8 px-3 text-xs font-medium rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Chart Description */}
      {chartDescription && (
        <p className="text-xs text-muted-foreground italic mb-3 leading-relaxed">
          {chartDescription}
        </p>
      )}

      {/* Chart Visualization */}
      <div className="h-52 flex-1 min-h-0 flex items-center justify-center">
        <ResponsiveContainer width="100%" height={220} debounce={300}>
          {chartType === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis
                dataKey={xDataKey}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Line
                type="monotone"
                dataKey={yDataKey}
                stroke={color}
                strokeWidth={2}
                dot={{ fill: color, r: 3 }}
              />
            </LineChart>
          ) : chartType === "column" ? (
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis 
                type="category"
                dataKey={xDataKey}
                tick={{ fill: "#6b7280", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#94a3b8" }}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey={yDataKey} fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          ) : chartType === "pie" ? (
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={75}
                dataKey={yDataKey}
                nameKey={xDataKey}
                label={({ name, percent }) =>
                  `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
              />
            </PieChart>
          ) : chartType === "donut" ? (
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                dataKey={yDataKey}
                nameKey={xDataKey}
                label={({ name, percent }) =>
                  `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
              />
            </PieChart>
          ) : chartType === "funnel" ? (
            <FunnelChart>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
              />
              <Funnel
                data={chartData.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))}
                dataKey={yDataKey}
                nameKey={xDataKey}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Funnel>
            </FunnelChart>
          ) : chartType === "heatmap" ? (
            <ScatterChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis
                type="category"
                dataKey={xDataKey}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey={yDataKey}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Scatter dataKey={yDataKey} fill={color} />
            </ScatterChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis
                dataKey={xDataKey}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(210 45% 10%)",
                  border: "1px solid hsl(210 30% 20%)",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
                labelStyle={{ color: "#94a3b8" }}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey={yDataKey} fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ──────── Dashboard Page ──────── */

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const datasetId = searchParams.get("dataset_id")

  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" })
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [isExporting, setIsExporting] = useState(false)

  const runAnalysis = useCallback(async () => {
    const storedData = localStorage.getItem("cleanedDataResult")
    if (!storedData) {
      setAnalysis({
        status: "error",
        error: "No cleaned data found. Please clean your data first from the Data Explorer.",
      })
      return
    }

    let parsed: {
      cleaned_data: Record<string, unknown>[]
      columns: string[]
      cleaning_summary: unknown
      factors_applied: string[]
    }
    try {
      parsed = JSON.parse(storedData)
    } catch {
      setAnalysis({ status: "error", error: "Failed to parse cleaned data from storage." })
      return
    }

    if (!parsed.cleaned_data || parsed.cleaned_data.length === 0) {
      setAnalysis({ status: "error", error: "Cleaned data is empty." })
      return
    }

    // Store raw rows for client-side recomputation
    setRawRows(parsed.cleaned_data)

    const columns = parsed.columns.map((col: string) => ({
      key: col,
      label: col.toUpperCase(),
    }))

    setAnalysis({ status: "loading" })

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns,
          rows: parsed.cleaned_data,
          dataset_id: datasetId || "unknown",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || `Analysis failed: ${response.statusText}`)
      }

      const result: AnalysisResult = await response.json()
      setAnalysis({ status: "success", data: result })
    } catch (error) {
      setAnalysis({
        status: "error",
        error: error instanceof Error ? error.message : "Analysis failed. Please try again.",
      })
    }
  }, [datasetId])

  const handleExportPDF = useCallback(async () => {
    setIsExporting(true)
    try {
      const timestamp = new Date().toISOString().split("T")[0]
      await exportDashboardToPDF("dashboard-content", `data-analysis-report-${timestamp}.pdf`)
    } catch (error) {
      console.error("Failed to export PDF:", error)
      alert("Failed to export PDF. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }, [])

  useEffect(() => {
    runAnalysis()
  }, [runAnalysis])

  // Loading
  if (analysis.status === "loading" || analysis.status === "idle") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <h2 className="text-xl font-semibold text-foreground">Analyzing Your Data</h2>
          <p className="text-muted-foreground text-sm">
            Generating KPIs, charts, trends, and recommendations...
          </p>
        </div>
      </AppLayout>
    )
  }

  // Error
  if (analysis.status === "error") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-8">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-semibold text-foreground">Analysis Failed</h2>
          <p className="text-muted-foreground max-w-md">{analysis.error}</p>
          <div className="flex items-center gap-3 mt-4">
            <Link
              href={datasetId ? `/cleaned-data?dataset_id=${datasetId}` : "/view-data"}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Data
            </Link>
            <button
              onClick={runAnalysis}
              className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Retry Analysis
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // Success
  const { kpis, charts, description, trends, recommendations, meta } = analysis.data

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <Link
              href={datasetId ? `/cleaned-data?dataset_id=${datasetId}` : "/view-data"}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-3 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Cleaned Data
            </Link>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground text-balance">
                Data Analysis Dashboard
              </h1>
              <span className="px-3 py-1 text-xs font-medium bg-primary/20 text-primary rounded">
                {meta.total_records.toLocaleString()} RECORDS
              </span>
            </div>
            <p className="text-xs text-muted-foreground tracking-wider">
              AUTOMATED INTELLIGENCE GENERATED FROM CLEANED DATA
            </p>
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{meta.numeric_columns.length} numeric</span>
              <span className="text-border">|</span>
              <span>{meta.categorical_columns.length} categorical</span>
              <span className="text-border">|</span>
              <span>{meta.date_columns.length} date</span>
            </div>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {isExporting ? "Exporting..." : "Export as PDF"}
            </button>
          </div>
        </div>

        {/* Dashboard Content - Exportable */}
        <div id="dashboard-content">
          {/* KPI Cards */}
          <div className={cn("grid gap-4 mb-6", kpis.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
          {kpis.map((kpi, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground tracking-wider">{kpi.label}</span>
                <Info className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold" style={{ color: kpi.color }}>
                  {kpi.value}
                </span>
              </div>
              {kpi.change !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    kpi.positive ? "text-green-400" : "text-red-400"
                  )}
                >
                  {kpi.positive ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {kpi.change}%
                </div>
              )}
              <div className="mt-3 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={generateSparkline(idx * 100 + 50)}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={kpi.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>

          {/* Description */}
          <div className="p-4 rounded-xl bg-card border border-border mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-primary rounded" />
              <span className="text-xs font-semibold tracking-wider">DATA SUMMARY</span>
            </div>
            <p className="text-muted-foreground italic">{description}</p>
          </div>

          {/* Charts Row 1: first 2 charts + Recommendations */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {charts.slice(0, 2).map((chart, idx) => (
              <ChartCard
                key={`chart-${idx}`}
                initialChart={chart}
                rows={rawRows}
                numericCols={meta.numeric_columns}
                categoricalCols={meta.categorical_columns}
                dateCols={meta.date_columns}
                chartIndex={idx}
              />
            ))}

            {/* Recommendations */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-xs font-semibold tracking-wider text-primary mb-4 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                RECOMMENDATIONS
              </h3>
              <ul className="space-y-3">
                {recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Charts Row 2: remaining charts */}
          {charts.length > 2 && (
            <div
              className={cn(
                "grid gap-4 mb-6",
                charts.length - 2 === 1 ? "grid-cols-1" : "grid-cols-2"
              )}
            >
              {charts.slice(2).map((chart, idx) => (
                <ChartCard
                  key={`chart-extra-${idx}`}
                  initialChart={chart}
                  rows={rawRows}
                  numericCols={meta.numeric_columns}
                  categoricalCols={meta.categorical_columns}
                  dateCols={meta.date_columns}
                  chartIndex={idx + 2}
                />
              ))}
            </div>
          )}

          {/* Trends */}
          {trends.length > 0 && (
            <div className="p-4 rounded-xl bg-card border border-border mb-6">
              <h3 className="text-xs font-semibold tracking-wider text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                KEY TRENDS
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {trends.map((trend, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{trend}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* End Dashboard Content */}
      </div>
    </AppLayout>
  )
}
