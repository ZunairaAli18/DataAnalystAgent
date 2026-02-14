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
  Columns3,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  FileText,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
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
  ScatterChart,
  Scatter,
  Funnel,
  FunnelChart,
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

interface ColumnProfile {
  key: string
  label: string
  dtype: "numeric" | "categorical" | "date" | "boolean" | "text"
  distinct_count: number
  null_count: number
  total_count: number
  distinct_values: (string | number | boolean | null)[]
  top_values: { value: string; count: number; percentage: number }[]
  stats?: {
    min: number
    max: number
    mean: number
    median: number
    sum: number
  }
  suggested_chart_types: string[]
}

interface AnalysisResult {
  kpis: KPI[]
  charts: ChartConfig[]
  description: string
  trends: string[]
  recommendations: string[]
  column_profiles: ColumnProfile[]
  meta: {
    total_records: number
    numeric_columns: string[]
    categorical_columns: string[]
    date_columns: string[]
    boolean_columns?: string[]
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
  chartType: "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap" | "count"
): Record<string, unknown>[] {
  if (chartType === "count") {
    // Count frequency of xCol values (no Y aggregation)
    const counts: Record<string, number> = {}
    for (const row of rows) {
      const xVal = String(row[xCol] ?? "Unknown")
      counts[xVal] = (counts[xVal] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([key, val]) => ({ name: key, value: val }))
  }

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

  return sorted.slice(0, chartType === "pie" || chartType === "donut" ? 8 : 15).map(([key, val]) => ({
    name: key,
    value: Math.round(val * 100) / 100,
  }))
}

function generateChartDescription(
  data: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  chartType: string
): string {
  if (data.length === 0) return "No data available for the selected columns."

  const values = data.map((d) => Number(d.value) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const peakItem = data.find((d) => Number(d.value) === max)
  const lowItem = data.find((d) => Number(d.value) === min)
  const peakLabel = String(peakItem?.name ?? "N/A")
  const lowLabel = String(lowItem?.name ?? "N/A")

  if (chartType === "line") {
    return `Tracks ${yCol.replace(/_/g, " ")} over ${data.length} periods of ${xCol.replace(/_/g, " ")}. Peak of ${max.toLocaleString()} at "${peakLabel}", lowest of ${min.toLocaleString()} at "${lowLabel}". Total: ${total.toLocaleString()}.`
  }
  if (chartType === "pie" || chartType === "donut") {
    const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
    return `Shows proportional breakdown across ${data.length} segments. "${peakLabel}" holds the largest share at ${topPct}% (${max.toLocaleString()}).`
  }
  if (chartType === "count") {
    return `Shows frequency distribution of ${xCol.replace(/_/g, " ")} across ${data.length} categories. "${peakLabel}" is the most common with ${max.toLocaleString()} occurrences.`
  }
  const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
  return `Compares ${yCol.replace(/_/g, " ")} across ${data.length} ${xCol.replace(/_/g, " ")} categories. "${peakLabel}" leads with ${max.toLocaleString()} (${topPct}% of shown total). Combined total: ${total.toLocaleString()}.`
}

const DTYPE_ICON_MAP: Record<string, React.ElementType> = {
  numeric: Hash,
  categorical: Type,
  date: Calendar,
  boolean: ToggleLeft,
  text: FileText,
}

const DTYPE_COLOR_MAP: Record<string, string> = {
  numeric: "text-[#00d4ff]",
  categorical: "text-[#ff3d71]",
  date: "text-[#ffaa00]",
  boolean: "text-[#7c5cff]",
  text: "text-muted-foreground",
}

/* ──────── ChartCard Component ──────── */

function ChartCard({
  initialChart,
  rows,
  numericCols,
  categoricalCols,
  dateCols,
  boolCols,
  chartIndex,
  onRemove,
}: {
  initialChart: ChartConfig
  rows: Record<string, unknown>[]
  numericCols: string[]
  categoricalCols: string[]
  dateCols: string[]
  boolCols: string[]
  chartIndex: number
  onRemove?: () => void
}) {
  type ChartType = "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap" | "count"
  const [chartType, setChartType] = useState<ChartType>(initialChart.type as ChartType)
  const [xCol, setXCol] = useState(initialChart.xKey)
  const [yCol, setYCol] = useState(initialChart.yKey)
  const [showFilters, setShowFilters] = useState(false)

  const xOptions = useMemo(() => {
    // Include all recognized columns plus any column from initialChart that might be text-based
    const base = [...new Set([...categoricalCols, ...dateCols, ...numericCols, ...boolCols])]
    // Also include the initial chart's xKey if not already present
    if (initialChart.xKey && !base.includes(initialChart.xKey) && initialChart.xKey !== "name" && initialChart.xKey !== "range") {
      base.push(initialChart.xKey)
    }
    return base
  }, [categoricalCols, dateCols, numericCols, boolCols, initialChart.xKey])

  const yOptions = useMemo(() => {
    // For count chart type, no Y needed
    if (chartType === "count") return []
    return numericCols
  }, [numericCols, chartType])

  const chartData = useMemo(() => {
    if (xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type) {
      return initialChart.data
    }
    return recomputeChartData(rows, xCol, yCol, chartType)
  }, [rows, xCol, yCol, chartType, initialChart])

  const color = initialChart.color
  const title =
    xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type
      ? initialChart.title
      : chartType === "count"
        ? `${xCol.replace(/_/g, " ")} Frequency`
        : `${yCol.replace(/_/g, " ")} by ${xCol.replace(/_/g, " ")}`

  const xDataKey = xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type ? initialChart.xKey : "name"
  const yDataKey = xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type ? initialChart.yKey : "value"

  const chartDescription = useMemo(() => {
    if (xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type) {
      return initialChart.description || ""
    }
    return generateChartDescription(chartData, xCol, yCol, chartType)
  }, [xCol, yCol, chartType, initialChart, chartData])

  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        <div className="flex items-center gap-1">
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
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Remove chart"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-secondary/50 border border-border/50">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Type</label>
            <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
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
                <SelectItem value="count">Count</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">X Axis</label>
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

          {chartType !== "count" && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Y Axis</label>
              <Select value={yCol} onValueChange={setYCol}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yOptions.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1 ml-auto">
            <label className="text-[10px] font-medium text-transparent tracking-wider uppercase select-none">_</label>
            <button
              onClick={() => {
                setChartType(initialChart.type as ChartType)
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

      {chartDescription && (
        <p className="text-xs text-muted-foreground italic mb-3 leading-relaxed">{chartDescription}</p>
      )}

      <div className="h-52 flex-1 min-h-0 flex items-center justify-center">
        <ResponsiveContainer width="100%" height={220} debounce={300}>
          {chartType === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
              <Line type="monotone" dataKey={yDataKey} stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
            </LineChart>
          ) : chartType === "column" ? (
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} cursor={{ fill: "transparent" }} />
              <Bar dataKey={yDataKey} fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          ) : chartType === "pie" ? (
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey={yDataKey} nameKey={xDataKey} label={({ name, percent }) => `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {chartData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
            </PieChart>
          ) : chartType === "donut" ? (
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey={yDataKey} nameKey={xDataKey} label={({ name, percent }) => `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {chartData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
            </PieChart>
          ) : chartType === "funnel" ? (
            <FunnelChart>
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
              <Funnel data={[...chartData].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))} dataKey={yDataKey} nameKey={xDataKey}>
                {chartData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
              </Funnel>
            </FunnelChart>
          ) : chartType === "heatmap" ? (
            <ScatterChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis type="category" dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey={yDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
              <Scatter dataKey={yDataKey} fill={color} />
            </ScatterChart>
          ) : (
            // Default bar + "count" mode
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} cursor={{ fill: "transparent" }} />
              <Bar dataKey={yDataKey} fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ──────── Column Explorer Panel ──────── */

function ColumnExplorer({
  profiles,
  rows,
  numericCols,
  categoricalCols,
  dateCols,
  boolCols,
  onAddChart,
}: {
  profiles: ColumnProfile[]
  rows: Record<string, unknown>[]
  numericCols: string[]
  categoricalCols: string[]
  dateCols: string[]
  boolCols: string[]
  onAddChart: (chart: ChartConfig) => void
}) {
  const [expandedCol, setExpandedCol] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>("all")

  const filtered = useMemo(() => {
    if (filterType === "all") return profiles
    return profiles.filter((p) => p.dtype === filterType)
  }, [profiles, filterType])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: profiles.length }
    profiles.forEach((p) => {
      counts[p.dtype] = (counts[p.dtype] || 0) + 1
    })
    return counts
  }, [profiles])

  function handleQuickChart(profile: ColumnProfile, chartType: string) {
    const colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]
    const color = colors[Math.floor(Math.random() * colors.length)]

    let data: Record<string, unknown>[]
    let xKey = "name"
    let yKey = "value"
    let title: string

    if (chartType === "count" || (profile.dtype !== "numeric" && numericCols.length === 0)) {
      // Frequency count chart
      data = profile.top_values.slice(0, 10).map((tv) => ({
        name: tv.value,
        value: tv.count,
      }))
      title = `${profile.key.replace(/_/g, " ")} Frequency`
    } else if (profile.dtype === "numeric") {
      // Distribution for numeric
      const values = rows.map((r) => Number(r[profile.key])).filter((v) => !isNaN(v))
      const min = Math.min(...values)
      const max = Math.max(...values)
      const bucketCount = Math.min(10, Math.ceil(Math.sqrt(values.length)))
      const bucketSize = (max - min) / bucketCount || 1
      const buckets: Record<string, number> = {}
      values.forEach((v) => {
        const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1)
        const label = `${Math.round(min + idx * bucketSize)}-${Math.round(min + (idx + 1) * bucketSize)}`
        buckets[label] = (buckets[label] || 0) + 1
      })
      data = Object.entries(buckets).map(([range, count]) => ({ name: range, value: count }))
      title = `${profile.key.replace(/_/g, " ")} Distribution`
    } else {
      // Categorical + first numeric col
      const metricCol = numericCols[0]
      const grouped: Record<string, number> = {}
      rows.forEach((row) => {
        const key = String(row[profile.key] ?? "Unknown")
        grouped[key] = (grouped[key] || 0) + (Number(row[metricCol]) || 0)
      })
      data = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      title = `${metricCol.replace(/_/g, " ")} by ${profile.key.replace(/_/g, " ")}`
    }

    const mappedType = chartType === "count" ? "bar" : chartType === "donut" ? "pie" : chartType
    onAddChart({
      type: mappedType as "bar" | "line" | "pie",
      title,
      description: "",
      data,
      xKey,
      yKey,
      color,
    })
  }

  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Columns3 className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-semibold tracking-wider uppercase">Column Explorer</h3>
        <span className="ml-auto text-xs text-muted-foreground">{profiles.length} columns</span>
      </div>

      {/* Type Filters */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["all", "numeric", "categorical", "date", "boolean", "text"].map((t) => {
          const count = typeCounts[t] || 0
          if (t !== "all" && count === 0) return null
          return (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                filterType === t
                  ? "bg-primary/20 text-primary"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)} ({count})
            </button>
          )
        })}
      </div>

      {/* Column List */}
      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {filtered.map((profile) => {
          const Icon = DTYPE_ICON_MAP[profile.dtype] || FileText
          const colorClass = DTYPE_COLOR_MAP[profile.dtype] || "text-muted-foreground"
          const isExpanded = expandedCol === profile.key

          return (
            <div key={profile.key} className="rounded-lg border border-border/50 overflow-hidden">
              {/* Column Header */}
              <button
                onClick={() => setExpandedCol(isExpanded ? null : profile.key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
              >
                <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", colorClass)} />
                <span className="text-sm font-medium text-foreground truncate">{profile.key.replace(/_/g, " ")}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", colorClass, "bg-secondary")}>
                  {profile.dtype}
                </span>
                <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                  {profile.distinct_count} unique
                </span>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-border/50 bg-secondary/20">
                  {/* Stats row */}
                  <div className="flex flex-wrap gap-3 pt-3">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Distinct: </span>
                      <span className="text-foreground font-medium">{profile.distinct_count.toLocaleString()}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Nulls: </span>
                      <span className="text-foreground font-medium">
                        {profile.null_count.toLocaleString()} ({((profile.null_count / profile.total_count) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    {profile.stats && (
                      <>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Min: </span>
                          <span className="text-foreground font-medium">{profile.stats.min.toLocaleString()}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Max: </span>
                          <span className="text-foreground font-medium">{profile.stats.max.toLocaleString()}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Mean: </span>
                          <span className="text-foreground font-medium">{profile.stats.mean.toFixed(2)}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Median: </span>
                          <span className="text-foreground font-medium">{profile.stats.median.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Top Values */}
                  {profile.top_values.length > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Top Values</span>
                      <div className="mt-1.5 space-y-1">
                        {profile.top_values.slice(0, 8).map((tv, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs text-foreground truncate max-w-[180px]">{tv.value}</span>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                                  {tv.count.toLocaleString()} ({tv.percentage}%)
                                </span>
                              </div>
                              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/60"
                                  style={{ width: `${Math.min(tv.percentage * 2, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Chart Buttons */}
                  {profile.suggested_chart_types.length > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Quick Chart</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {profile.suggested_chart_types.slice(0, 4).map((ct) => (
                          <button
                            key={ct}
                            onClick={() => handleQuickChart(profile, ct)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            {ct.charAt(0).toUpperCase() + ct.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
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
  const [extraCharts, setExtraCharts] = useState<ChartConfig[]>([])

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
  if (analysis.status !== "success") return
  setIsExporting(true)
  try {
    const response = await fetch("/api/export-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis.data),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => null)
      throw new Error(err?.error || "Export failed")
    }

    // Trigger browser download
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `data-analysis-report-${new Date().toISOString().split("T")[0]}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error("Failed to export PDF:", error)
    alert(`Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error"}`)
  } finally {
    setIsExporting(false)
  }
}, [analysis])

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
  const { kpis, charts, description, trends, recommendations, meta, column_profiles } = analysis.data
  const boolCols = meta.boolean_columns || []

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
              {boolCols.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  <span>{boolCols.length} boolean</span>
                </>
              )}
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
                  <div className={cn("flex items-center gap-1 text-xs", kpi.positive ? "text-green-400" : "text-red-400")}>
                    {kpi.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {kpi.change}%
                  </div>
                )}
                <div className="mt-3 h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={generateSparkline(idx * 100 + 50)}>
                      <Line type="monotone" dataKey="value" stroke={kpi.color} strokeWidth={2} dot={false} />
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
                boolCols={boolCols}
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

          {/* Charts Row 2: remaining server charts */}
          {charts.length > 2 && (
            <div className={cn("grid gap-4 mb-6", charts.length - 2 === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {charts.slice(2).map((chart, idx) => (
                <ChartCard
                  key={`chart-extra-${idx}`}
                  initialChart={chart}
                  rows={rawRows}
                  numericCols={meta.numeric_columns}
                  categoricalCols={meta.categorical_columns}
                  dateCols={meta.date_columns}
                  boolCols={boolCols}
                  chartIndex={idx + 2}
                />
              ))}
            </div>
          )}

          {/* User-added charts */}
          {extraCharts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-primary rounded" />
                <span className="text-xs font-semibold tracking-wider">CUSTOM CHARTS</span>
                <span className="text-xs text-muted-foreground">({extraCharts.length})</span>
              </div>
              <div className={cn("grid gap-4", extraCharts.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                {extraCharts.map((chart, idx) => (
                  <ChartCard
                    key={`custom-chart-${idx}`}
                    initialChart={chart}
                    rows={rawRows}
                    numericCols={meta.numeric_columns}
                    categoricalCols={meta.categorical_columns}
                    dateCols={meta.date_columns}
                    boolCols={boolCols}
                    chartIndex={100 + idx}
                    onRemove={() => setExtraCharts((prev) => prev.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>
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

        {/* Column Explorer (outside exportable area) */}
        {column_profiles && column_profiles.length > 0 && (
          <div className="mt-6">
            <ColumnExplorer
              profiles={column_profiles}
              rows={rawRows}
              numericCols={meta.numeric_columns}
              categoricalCols={meta.categorical_columns}
              dateCols={meta.date_columns}
              boolCols={boolCols}
              onAddChart={(chart) => setExtraCharts((prev) => [...prev, chart])}
            />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
