// "use client"

// import { useEffect, useState, useCallback, useMemo } from "react"
// import { useSearchParams } from "next/navigation"
// import { AppLayout } from "@/components/app-layout"
// import {
//   Info,
//   TrendingUp,
//   TrendingDown,
//   Loader2,
//   AlertCircle,
//   ArrowLeft,
//   Lightbulb,
//   BarChart3,
//   SlidersHorizontal,
//   Download,
//   Columns3,
//   Hash,
//   Type,
//   Calendar,
//   ToggleLeft,
//   FileText,
//   ChevronDown,
//   ChevronRight,
//   Plus,
//   X,
// } from "lucide-react"
// import { exportDashboardToPDF } from "@/lib/export-pdf"
// import { cn } from "@/lib/utils"
// import {
//   LineChart,
//   Line,
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   ResponsiveContainer,
//   PieChart,
//   Pie,
//   Cell,
//   ScatterChart,
//   Scatter,
//   Funnel,
//   FunnelChart,
// } from "recharts"
// import Link from "next/link"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"

// /* ──────── Types ──────── */

// interface KPI {
//   label: string
//   value: string
//   change: number | null
//   positive: boolean
//   color: string
// }

// interface ChartConfig {
//   type: "line" | "bar" | "pie"
//   title: string
//   description?: string
//   data: Record<string, unknown>[]
//   xKey: string
//   yKey: string
//   color: string
// }

// interface ColumnProfile {
//   key: string
//   label: string
//   dtype: "numeric" | "categorical" | "date" | "boolean" | "text"
//   distinct_count: number
//   null_count: number
//   total_count: number
//   distinct_values: (string | number | boolean | null)[]
//   top_values: { value: string; count: number; percentage: number }[]
//   stats?: {
//     min: number
//     max: number
//     mean: number
//     median: number
//     sum: number
//   }
//   suggested_chart_types: string[]
// }

// interface AnalysisResult {
//   kpis: KPI[]
//   charts: ChartConfig[]
//   description: string
//   trends: string[]
//   recommendations: string[]
//   column_profiles: ColumnProfile[]
//   meta: {
//     total_records: number
//     numeric_columns: string[]
//     categorical_columns: string[]
//     date_columns: string[]
//     boolean_columns?: string[]
//     total_columns: number
//   }
// }

// type AnalysisState =
//   | { status: "idle" }
//   | { status: "loading" }
//   | { status: "error"; error: string }
//   | { status: "success"; data: AnalysisResult }

// /* ──────── Helpers ──────── */

// const PIE_COLORS = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676", "#f472b6", "#38bdf8", "#fbbf24"]

// function generateSparkline(seed: number): { value: number }[] {
//   const points = []
//   let val = seed
//   for (let i = 0; i < 7; i++) {
//     val = val + (Math.random() - 0.4) * val * 0.15
//     points.push({ value: Math.max(0, Math.round(val)) })
//   }
//   return points
// }

// function recomputeChartData(
//   rows: Record<string, unknown>[],
//   xCol: string,
//   yCol: string,
//   chartType: "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap" | "count"
// ): Record<string, unknown>[] {
//   if (chartType === "count") {
//     // Count frequency of xCol values (no Y aggregation)
//     const counts: Record<string, number> = {}
//     for (const row of rows) {
//       const xVal = String(row[xCol] ?? "Unknown")
//       counts[xVal] = (counts[xVal] || 0) + 1
//     }
//     return Object.entries(counts)
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 15)
//       .map(([key, val]) => ({ name: key, value: val }))
//   }

//   const grouped: Record<string, number> = {}
//   for (const row of rows) {
//     const xVal = String(row[xCol] ?? "Unknown")
//     const key = chartType === "line" ? xVal.substring(0, 7) || xVal : xVal
//     grouped[key] = (grouped[key] || 0) + (Number(row[yCol]) || 0)
//   }

//   const entries = Object.entries(grouped)
//   const sorted =
//     chartType === "line"
//       ? entries.sort((a, b) => a[0].localeCompare(b[0]))
//       : entries.sort((a, b) => b[1] - a[1])

//   return sorted.slice(0, chartType === "pie" || chartType === "donut" ? 8 : 15).map(([key, val]) => ({
//     name: key,
//     value: Math.round(val * 100) / 100,
//   }))
// }

// function generateChartDescription(
//   data: Record<string, unknown>[],
//   xCol: string,
//   yCol: string,
//   chartType: string
// ): string {
//   if (data.length === 0) return "No data available for the selected columns."

//   const values = data.map((d) => Number(d.value) || 0)
//   const total = values.reduce((a, b) => a + b, 0)
//   const max = Math.max(...values)
//   const min = Math.min(...values)
//   const peakItem = data.find((d) => Number(d.value) === max)
//   const lowItem = data.find((d) => Number(d.value) === min)
//   const peakLabel = String(peakItem?.name ?? "N/A")
//   const lowLabel = String(lowItem?.name ?? "N/A")

//   if (chartType === "line") {
//     return `Tracks ${yCol.replace(/_/g, " ")} over ${data.length} periods of ${xCol.replace(/_/g, " ")}. Peak of ${max.toLocaleString()} at "${peakLabel}", lowest of ${min.toLocaleString()} at "${lowLabel}". Total: ${total.toLocaleString()}.`
//   }
//   if (chartType === "pie" || chartType === "donut") {
//     const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
//     return `Shows proportional breakdown across ${data.length} segments. "${peakLabel}" holds the largest share at ${topPct}% (${max.toLocaleString()}).`
//   }
//   if (chartType === "count") {
//     return `Shows frequency distribution of ${xCol.replace(/_/g, " ")} across ${data.length} categories. "${peakLabel}" is the most common with ${max.toLocaleString()} occurrences.`
//   }
//   const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
//   return `Compares ${yCol.replace(/_/g, " ")} across ${data.length} ${xCol.replace(/_/g, " ")} categories. "${peakLabel}" leads with ${max.toLocaleString()} (${topPct}% of shown total). Combined total: ${total.toLocaleString()}.`
// }

// const DTYPE_ICON_MAP: Record<string, React.ElementType> = {
//   numeric: Hash,
//   categorical: Type,
//   date: Calendar,
//   boolean: ToggleLeft,
//   text: FileText,
// }

// const DTYPE_COLOR_MAP: Record<string, string> = {
//   numeric: "text-[#00d4ff]",
//   categorical: "text-[#ff3d71]",
//   date: "text-[#ffaa00]",
//   boolean: "text-[#7c5cff]",
//   text: "text-muted-foreground",
// }

// /* ──────── ChartCard Component ──────── */

// function ChartCard({
//   initialChart,
//   rows,
//   numericCols,
//   categoricalCols,
//   dateCols,
//   boolCols,
//   chartIndex,
//   onRemove,
// }: {
//   initialChart: ChartConfig
//   rows: Record<string, unknown>[]
//   numericCols: string[]
//   categoricalCols: string[]
//   dateCols: string[]
//   boolCols: string[]
//   chartIndex: number
//   onRemove?: () => void
// }) {
//   type ChartType = "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap" | "count"
//   const [chartType, setChartType] = useState<ChartType>(initialChart.type as ChartType)
//   const [xCol, setXCol] = useState(initialChart.xKey)
//   const [yCol, setYCol] = useState(initialChart.yKey)
//   const [showFilters, setShowFilters] = useState(false)

//   const xOptions = useMemo(() => {
//     // Include all recognized columns plus any column from initialChart that might be text-based
//     const base = [...new Set([...categoricalCols, ...dateCols, ...numericCols, ...boolCols])]
//     // Also include the initial chart's xKey if not already present
//     if (initialChart.xKey && !base.includes(initialChart.xKey) && initialChart.xKey !== "name" && initialChart.xKey !== "range") {
//       base.push(initialChart.xKey)
//     }
//     return base
//   }, [categoricalCols, dateCols, numericCols, boolCols, initialChart.xKey])

//   const yOptions = useMemo(() => {
//     // For count chart type, no Y needed
//     if (chartType === "count") return []
//     return numericCols
//   }, [numericCols, chartType])

//   const chartData = useMemo(() => {
//     if (xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type) {
//       return initialChart.data
//     }
//     return recomputeChartData(rows, xCol, yCol, chartType)
//   }, [rows, xCol, yCol, chartType, initialChart])

//   const color = initialChart.color
//   const title =
//     xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type
//       ? initialChart.title
//       : chartType === "count"
//         ? `${xCol.replace(/_/g, " ")} Frequency`
//         : `${yCol.replace(/_/g, " ")} by ${xCol.replace(/_/g, " ")}`

//   const xDataKey = xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type ? initialChart.xKey : "name"
//   const yDataKey = xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type ? initialChart.yKey : "value"

//   const chartDescription = useMemo(() => {
//     if (xCol === initialChart.xKey && yCol === initialChart.yKey && chartType === initialChart.type) {
//       return initialChart.description || ""
//     }
//     return generateChartDescription(chartData, xCol, yCol, chartType)
//   }, [xCol, yCol, chartType, initialChart, chartData])

//   return (
//     <div className="p-4 rounded-xl bg-card border border-border flex flex-col">
//       <div className="flex items-center justify-between mb-3">
//         <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
//           {title}
//         </h3>
//         <div className="flex items-center gap-1">
//           <button
//             onClick={() => setShowFilters(!showFilters)}
//             className={cn(
//               "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
//               showFilters
//                 ? "bg-primary/20 text-primary"
//                 : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
//             )}
//           >
//             <SlidersHorizontal className="w-3 h-3" />
//             Filters
//           </button>
//           {onRemove && (
//             <button
//               onClick={onRemove}
//               className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
//               aria-label="Remove chart"
//             >
//               <X className="w-3.5 h-3.5" />
//             </button>
//           )}
//         </div>
//       </div>

//       {showFilters && (
//         <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-secondary/50 border border-border/50">
//           <div className="flex flex-col gap-1">
//             <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Type</label>
//             <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
//               <SelectTrigger className="w-[120px] h-8 text-xs bg-card">
//                 <SelectValue />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="bar">Bar</SelectItem>
//                 <SelectItem value="column">Column</SelectItem>
//                 <SelectItem value="line">Line</SelectItem>
//                 <SelectItem value="pie">Pie</SelectItem>
//                 <SelectItem value="donut">Donut</SelectItem>
//                 <SelectItem value="funnel">Funnel</SelectItem>
//                 <SelectItem value="heatmap">Heatmap</SelectItem>
//                 <SelectItem value="count">Count</SelectItem>
//               </SelectContent>
//             </Select>
//           </div>

//           <div className="flex flex-col gap-1">
//             <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">X Axis</label>
//             <Select value={xCol} onValueChange={setXCol}>
//               <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
//                 <SelectValue />
//               </SelectTrigger>
//               <SelectContent>
//                 {xOptions.map((col) => (
//                   <SelectItem key={col} value={col}>
//                     {col.replace(/_/g, " ")}
//                   </SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>
//           </div>

//           {chartType !== "count" && (
//             <div className="flex flex-col gap-1">
//               <label className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Y Axis</label>
//               <Select value={yCol} onValueChange={setYCol}>
//                 <SelectTrigger className="w-[140px] h-8 text-xs bg-card">
//                   <SelectValue />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {yOptions.map((col) => (
//                     <SelectItem key={col} value={col}>
//                       {col.replace(/_/g, " ")}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           )}

//           <div className="flex flex-col gap-1 ml-auto">
//             <label className="text-[10px] font-medium text-transparent tracking-wider uppercase select-none">_</label>
//             <button
//               onClick={() => {
//                 setChartType(initialChart.type as ChartType)
//                 setXCol(initialChart.xKey)
//                 setYCol(initialChart.yKey)
//               }}
//               className="h-8 px-3 text-xs font-medium rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
//             >
//               Reset
//             </button>
//           </div>
//         </div>
//       )}

//       {chartDescription && (
//         <p className="text-xs text-muted-foreground italic mb-3 leading-relaxed">{chartDescription}</p>
//       )}

//       <div className="h-52 flex-1 min-h-0 flex items-center justify-center">
//         <ResponsiveContainer width="100%" height={220} debounce={300}>
//           {chartType === "line" ? (
//             <LineChart data={chartData}>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
//               <XAxis dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
//               <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
//               <Line type="monotone" dataKey={yDataKey} stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
//             </LineChart>
//           ) : chartType === "column" ? (
//             <BarChart data={chartData} layout="vertical">
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
//               <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
//               <YAxis type="category" dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} cursor={{ fill: "transparent" }} />
//               <Bar dataKey={yDataKey} fill={color} radius={[0, 4, 4, 0]} />
//             </BarChart>
//           ) : chartType === "pie" ? (
//             <PieChart>
//               <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey={yDataKey} nameKey={xDataKey} label={({ name, percent }) => `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
//                 {chartData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
//               </Pie>
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
//             </PieChart>
//           ) : chartType === "donut" ? (
//             <PieChart>
//               <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey={yDataKey} nameKey={xDataKey} label={({ name, percent }) => `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
//                 {chartData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
//               </Pie>
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
//             </PieChart>
//           ) : chartType === "funnel" ? (
//             <FunnelChart>
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
//               <Funnel data={[...chartData].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))} dataKey={yDataKey} nameKey={xDataKey}>
//                 {chartData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
//               </Funnel>
//             </FunnelChart>
//           ) : chartType === "heatmap" ? (
//             <ScatterChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 80 }}>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
//               <XAxis type="category" dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
//               <YAxis type="number" dataKey={yDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
//               <Scatter dataKey={yDataKey} fill={color} />
//             </ScatterChart>
//           ) : (
//             // Default bar + "count" mode
//             <BarChart data={chartData}>
//               <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
//               <XAxis dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
//               <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
//               <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} cursor={{ fill: "transparent" }} />
//               <Bar dataKey={yDataKey} fill={color} radius={[4, 4, 0, 0]} />
//             </BarChart>
//           )}
//         </ResponsiveContainer>
//       </div>
//     </div>
//   )
// }

// /* ──────── Column Explorer Panel ──────── */

// function ColumnExplorer({
//   profiles,
//   rows,
//   numericCols,
//   categoricalCols,
//   dateCols,
//   boolCols,
//   onAddChart,
// }: {
//   profiles: ColumnProfile[]
//   rows: Record<string, unknown>[]
//   numericCols: string[]
//   categoricalCols: string[]
//   dateCols: string[]
//   boolCols: string[]
//   onAddChart: (chart: ChartConfig) => void
// }) {
//   const [expandedCol, setExpandedCol] = useState<string | null>(null)
//   const [filterType, setFilterType] = useState<string>("all")

//   const filtered = useMemo(() => {
//     if (filterType === "all") return profiles
//     return profiles.filter((p) => p.dtype === filterType)
//   }, [profiles, filterType])

//   const typeCounts = useMemo(() => {
//     const counts: Record<string, number> = { all: profiles.length }
//     profiles.forEach((p) => {
//       counts[p.dtype] = (counts[p.dtype] || 0) + 1
//     })
//     return counts
//   }, [profiles])

//   function handleQuickChart(profile: ColumnProfile, chartType: string) {
//     const colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]
//     const color = colors[Math.floor(Math.random() * colors.length)]

//     let data: Record<string, unknown>[]
//     let xKey = "name"
//     let yKey = "value"
//     let title: string

//     if (chartType === "count" || (profile.dtype !== "numeric" && numericCols.length === 0)) {
//       // Frequency count chart
//       data = profile.top_values.slice(0, 10).map((tv) => ({
//         name: tv.value,
//         value: tv.count,
//       }))
//       title = `${profile.key.replace(/_/g, " ")} Frequency`
//     } else if (profile.dtype === "numeric") {
//       // Distribution for numeric
//       const values = rows.map((r) => Number(r[profile.key])).filter((v) => !isNaN(v))
//       const min = Math.min(...values)
//       const max = Math.max(...values)
//       const bucketCount = Math.min(10, Math.ceil(Math.sqrt(values.length)))
//       const bucketSize = (max - min) / bucketCount || 1
//       const buckets: Record<string, number> = {}
//       values.forEach((v) => {
//         const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1)
//         const label = `${Math.round(min + idx * bucketSize)}-${Math.round(min + (idx + 1) * bucketSize)}`
//         buckets[label] = (buckets[label] || 0) + 1
//       })
//       data = Object.entries(buckets).map(([range, count]) => ({ name: range, value: count }))
//       title = `${profile.key.replace(/_/g, " ")} Distribution`
//     } else {
//       // Categorical + first numeric col
//       const metricCol = numericCols[0]
//       const grouped: Record<string, number> = {}
//       rows.forEach((row) => {
//         const key = String(row[profile.key] ?? "Unknown")
//         grouped[key] = (grouped[key] || 0) + (Number(row[metricCol]) || 0)
//       })
//       data = Object.entries(grouped)
//         .sort((a, b) => b[1] - a[1])
//         .slice(0, 10)
//         .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
//       title = `${metricCol.replace(/_/g, " ")} by ${profile.key.replace(/_/g, " ")}`
//     }

//     const mappedType = chartType === "count" ? "bar" : chartType === "donut" ? "pie" : chartType
//     onAddChart({
//       type: mappedType as "bar" | "line" | "pie",
//       title,
//       description: "",
//       data,
//       xKey,
//       yKey,
//       color,
//     })
//   }

//   return (
//     <div className="p-4 rounded-xl bg-card border border-border">
//       <div className="flex items-center gap-2 mb-4">
//         <Columns3 className="w-4 h-4 text-primary" />
//         <h3 className="text-xs font-semibold tracking-wider uppercase">Column Explorer</h3>
//         <span className="ml-auto text-xs text-muted-foreground">{profiles.length} columns</span>
//       </div>

//       {/* Type Filters */}
//       <div className="flex flex-wrap gap-1.5 mb-4">
//         {["all", "numeric", "categorical", "date", "boolean", "text"].map((t) => {
//           const count = typeCounts[t] || 0
//           if (t !== "all" && count === 0) return null
//           return (
//             <button
//               key={t}
//               onClick={() => setFilterType(t)}
//               className={cn(
//                 "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
//                 filterType === t
//                   ? "bg-primary/20 text-primary"
//                   : "bg-secondary text-muted-foreground hover:text-foreground"
//               )}
//             >
//               {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)} ({count})
//             </button>
//           )
//         })}
//       </div>

//       {/* Column List */}
//       <div className="space-y-1 max-h-[500px] overflow-y-auto">
//         {filtered.map((profile) => {
//           const Icon = DTYPE_ICON_MAP[profile.dtype] || FileText
//           const colorClass = DTYPE_COLOR_MAP[profile.dtype] || "text-muted-foreground"
//           const isExpanded = expandedCol === profile.key

//           return (
//             <div key={profile.key} className="rounded-lg border border-border/50 overflow-hidden">
//               {/* Column Header */}
//               <button
//                 onClick={() => setExpandedCol(isExpanded ? null : profile.key)}
//                 className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
//               >
//                 <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", colorClass)} />
//                 <span className="text-sm font-medium text-foreground truncate">{profile.key.replace(/_/g, " ")}</span>
//                 <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", colorClass, "bg-secondary")}>
//                   {profile.dtype}
//                 </span>
//                 <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
//                   {profile.distinct_count} unique
//                 </span>
//                 {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
//               </button>

//               {/* Expanded Details */}
//               {isExpanded && (
//                 <div className="px-3 pb-3 space-y-3 border-t border-border/50 bg-secondary/20">
//                   {/* Stats row */}
//                   <div className="flex flex-wrap gap-3 pt-3">
//                     <div className="text-xs">
//                       <span className="text-muted-foreground">Distinct: </span>
//                       <span className="text-foreground font-medium">{profile.distinct_count.toLocaleString()}</span>
//                     </div>
//                     <div className="text-xs">
//                       <span className="text-muted-foreground">Nulls: </span>
//                       <span className="text-foreground font-medium">
//                         {profile.null_count.toLocaleString()} ({((profile.null_count / profile.total_count) * 100).toFixed(1)}%)
//                       </span>
//                     </div>
//                     {profile.stats && (
//                       <>
//                         <div className="text-xs">
//                           <span className="text-muted-foreground">Min: </span>
//                           <span className="text-foreground font-medium">{profile.stats.min.toLocaleString()}</span>
//                         </div>
//                         <div className="text-xs">
//                           <span className="text-muted-foreground">Max: </span>
//                           <span className="text-foreground font-medium">{profile.stats.max.toLocaleString()}</span>
//                         </div>
//                         <div className="text-xs">
//                           <span className="text-muted-foreground">Mean: </span>
//                           <span className="text-foreground font-medium">{profile.stats.mean.toFixed(2)}</span>
//                         </div>
//                         <div className="text-xs">
//                           <span className="text-muted-foreground">Median: </span>
//                           <span className="text-foreground font-medium">{profile.stats.median.toLocaleString()}</span>
//                         </div>
//                       </>
//                     )}
//                   </div>

//                   {/* Top Values */}
//                   {profile.top_values.length > 0 && (
//                     <div>
//                       <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Top Values</span>
//                       <div className="mt-1.5 space-y-1">
//                         {profile.top_values.slice(0, 8).map((tv, i) => (
//                           <div key={i} className="flex items-center gap-2">
//                             <div className="flex-1 min-w-0">
//                               <div className="flex items-center justify-between mb-0.5">
//                                 <span className="text-xs text-foreground truncate max-w-[180px]">{tv.value}</span>
//                                 <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
//                                   {tv.count.toLocaleString()} ({tv.percentage}%)
//                                 </span>
//                               </div>
//                               <div className="h-1 rounded-full bg-secondary overflow-hidden">
//                                 <div
//                                   className="h-full rounded-full bg-primary/60"
//                                   style={{ width: `${Math.min(tv.percentage * 2, 100)}%` }}
//                                 />
//                               </div>
//                             </div>
//                           </div>
//                         ))}
//                       </div>
//                     </div>
//                   )}

//                   {/* Quick Chart Buttons */}
//                   {profile.suggested_chart_types.length > 0 && (
//                     <div>
//                       <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Quick Chart</span>
//                       <div className="flex flex-wrap gap-1.5 mt-1.5">
//                         {profile.suggested_chart_types.slice(0, 4).map((ct) => (
//                           <button
//                             key={ct}
//                             onClick={() => handleQuickChart(profile, ct)}
//                             className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
//                           >
//                             <Plus className="w-3 h-3" />
//                             {ct.charAt(0).toUpperCase() + ct.slice(1)}
//                           </button>
//                         ))}
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               )}
//             </div>
//           )
//         })}
//       </div>
//     </div>
//   )
// }

// /* ──────── Dashboard Page ──────── */

// export default function DashboardPage() {
//   const searchParams = useSearchParams()
//   const datasetId = searchParams.get("dataset_id")

//   const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" })
//   const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
//   const [isExporting, setIsExporting] = useState(false)
//   const [extraCharts, setExtraCharts] = useState<ChartConfig[]>([])

//   const runAnalysis = useCallback(async () => {
//     const storedData = localStorage.getItem("cleanedDataResult")
//     if (!storedData) {
//       setAnalysis({
//         status: "error",
//         error: "No cleaned data found. Please clean your data first from the Data Explorer.",
//       })
//       return
//     }

//     let parsed: {
//       cleaned_data: Record<string, unknown>[]
//       columns: string[]
//       cleaning_summary: unknown
//       factors_applied: string[]
//     }
//     try {
//       parsed = JSON.parse(storedData)
//     } catch {
//       setAnalysis({ status: "error", error: "Failed to parse cleaned data from storage." })
//       return
//     }

//     if (!parsed.cleaned_data || parsed.cleaned_data.length === 0) {
//       setAnalysis({ status: "error", error: "Cleaned data is empty." })
//       return
//     }

//     setRawRows(parsed.cleaned_data)

//     const columns = parsed.columns.map((col: string) => ({
//       key: col,
//       label: col.toUpperCase(),
//     }))

//     setAnalysis({ status: "loading" })

//     try {
//       const response = await fetch("/api/analyze", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           columns,
//           rows: parsed.cleaned_data,
//           dataset_id: datasetId || "unknown",
//         }),
//       })

//       if (!response.ok) {
//         const errorData = await response.json().catch(() => null)
//         throw new Error(errorData?.error || `Analysis failed: ${response.statusText}`)
//       }

//       const result: AnalysisResult = await response.json()
//       setAnalysis({ status: "success", data: result })
//     } catch (error) {
//       setAnalysis({
//         status: "error",
//         error: error instanceof Error ? error.message : "Analysis failed. Please try again.",
//       })
//     }
//   }, [datasetId])

// const handleExportPDF = useCallback(async () => {
//   if (analysis.status !== "success") return
//   setIsExporting(true)
//   try {
//     const response = await fetch("/api/export-report", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(analysis.data),
//     })

//     if (!response.ok) {
//       const err = await response.json().catch(() => null)
//       throw new Error(err?.error || "Export failed")
//     }

//     // Trigger browser download
//     const blob = await response.blob()
//     const url = URL.createObjectURL(blob)
//     const a = document.createElement("a")
//     a.href = url
//     a.download = `data-analysis-report-${new Date().toISOString().split("T")[0]}.pdf`
//     document.body.appendChild(a)
//     a.click()
//     a.remove()
//     URL.revokeObjectURL(url)
//   } catch (error) {
//     console.error("Failed to export PDF:", error)
//     alert(`Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error"}`)
//   } finally {
//     setIsExporting(false)
//   }
// }, [analysis])

//   useEffect(() => {
//     runAnalysis()
//   }, [runAnalysis])

//   // Loading
//   if (analysis.status === "loading" || analysis.status === "idle") {
//     return (
//       <AppLayout>
//         <div className="flex flex-col items-center justify-center min-h-screen gap-4">
//           <Loader2 className="w-12 h-12 text-primary animate-spin" />
//           <h2 className="text-xl font-semibold text-foreground">Analyzing Your Data</h2>
//           <p className="text-muted-foreground text-sm">
//             Generating KPIs, charts, trends, and recommendations...
//           </p>
//         </div>
//       </AppLayout>
//     )
//   }

//   // Error
//   if (analysis.status === "error") {
//     return (
//       <AppLayout>
//         <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-8">
//           <AlertCircle className="w-12 h-12 text-destructive" />
//           <h2 className="text-xl font-semibold text-foreground">Analysis Failed</h2>
//           <p className="text-muted-foreground max-w-md">{analysis.error}</p>
//           <div className="flex items-center gap-3 mt-4">
//             <Link
//               href={datasetId ? `/cleaned-data?dataset_id=${datasetId}` : "/view-data"}
//               className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors"
//             >
//               <ArrowLeft className="w-4 h-4" />
//               Back to Data
//             </Link>
//             <button
//               onClick={runAnalysis}
//               className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
//             >
//               Retry Analysis
//             </button>
//           </div>
//         </div>
//       </AppLayout>
//     )
//   }

//   // Success
//   const { kpis, charts, description, trends, recommendations, meta, column_profiles } = analysis.data
//   const boolCols = meta.boolean_columns || []

//   return (
//     <AppLayout>
//       <div className="p-6">
//         {/* Header */}
//         <div className="flex items-start justify-between mb-6">
//           <div>
//             <Link
//               href={datasetId ? `/cleaned-data?dataset_id=${datasetId}` : "/view-data"}
//               className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-3 text-sm"
//             >
//               <ArrowLeft className="w-4 h-4" />
//               Back to Cleaned Data
//             </Link>
//             <div className="flex items-center gap-3 mb-1">
//               <h1 className="text-2xl font-bold text-foreground text-balance">
//                 Data Analysis Dashboard
//               </h1>
//               <span className="px-3 py-1 text-xs font-medium bg-primary/20 text-primary rounded">
//                 {meta.total_records.toLocaleString()} RECORDS
//               </span>
//             </div>
//             <p className="text-xs text-muted-foreground tracking-wider">
//               AUTOMATED INTELLIGENCE GENERATED FROM CLEANED DATA
//             </p>
//           </div>

//           <div className="flex flex-col items-end gap-4">
//             <div className="flex items-center gap-2 text-xs text-muted-foreground">
//               <span>{meta.numeric_columns.length} numeric</span>
//               <span className="text-border">|</span>
//               <span>{meta.categorical_columns.length} categorical</span>
//               <span className="text-border">|</span>
//               <span>{meta.date_columns.length} date</span>
//               {boolCols.length > 0 && (
//                 <>
//                   <span className="text-border">|</span>
//                   <span>{boolCols.length} boolean</span>
//                 </>
//               )}
//             </div>
//             <button
//               onClick={handleExportPDF}
//               disabled={isExporting}
//               className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
//             >
//               <Download className="w-4 h-4" />
//               {isExporting ? "Exporting..." : "Export as PDF"}
//             </button>
//           </div>
//         </div>

//         {/* Dashboard Content - Exportable */}
//         <div id="dashboard-content">
//           {/* KPI Cards */}
//           <div className={cn("grid gap-4 mb-6", kpis.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
//             {kpis.map((kpi, idx) => (
//               <div key={idx} className="p-4 rounded-xl bg-card border border-border">
//                 <div className="flex items-center justify-between mb-2">
//                   <span className="text-xs text-muted-foreground tracking-wider">{kpi.label}</span>
//                   <Info className="w-4 h-4 text-muted-foreground" />
//                 </div>
//                 <div className="flex items-baseline gap-2 mb-1">
//                   <span className="text-2xl font-bold" style={{ color: kpi.color }}>
//                     {kpi.value}
//                   </span>
//                 </div>
//                 {kpi.change !== null && (
//                   <div className={cn("flex items-center gap-1 text-xs", kpi.positive ? "text-green-400" : "text-red-400")}>
//                     {kpi.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
//                     {kpi.change}%
//                   </div>
//                 )}
//                 <div className="mt-3 h-10">
//                   <ResponsiveContainer width="100%" height="100%">
//                     <LineChart data={generateSparkline(idx * 100 + 50)}>
//                       <Line type="monotone" dataKey="value" stroke={kpi.color} strokeWidth={2} dot={false} />
//                     </LineChart>
//                   </ResponsiveContainer>
//                 </div>
//               </div>
//             ))}
//           </div>

//           {/* Description */}
//           <div className="p-4 rounded-xl bg-card border border-border mb-6">
//             <div className="flex items-center gap-2 mb-2">
//               <div className="w-1 h-4 bg-primary rounded" />
//               <span className="text-xs font-semibold tracking-wider">DATA SUMMARY</span>
//             </div>
//             <p className="text-muted-foreground italic">{description}</p>
//           </div>

//           {/* Charts Row 1: first 2 charts + Recommendations */}
//           <div className="grid grid-cols-3 gap-4 mb-6">
//             {charts.slice(0, 2).map((chart, idx) => (
//               <ChartCard
//                 key={`chart-${idx}`}
//                 initialChart={chart}
//                 rows={rawRows}
//                 numericCols={meta.numeric_columns}
//                 categoricalCols={meta.categorical_columns}
//                 dateCols={meta.date_columns}
//                 boolCols={boolCols}
//                 chartIndex={idx}
//               />
//             ))}

//             {/* Recommendations */}
//             <div className="p-4 rounded-xl bg-card border border-border">
//               <h3 className="text-xs font-semibold tracking-wider text-primary mb-4 flex items-center gap-2">
//                 <Lightbulb className="w-4 h-4" />
//                 RECOMMENDATIONS
//               </h3>
//               <ul className="space-y-3">
//                 {recommendations.map((rec, idx) => (
//                   <li key={idx} className="flex items-start gap-2">
//                     <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
//                     <span className="text-sm text-muted-foreground">{rec}</span>
//                   </li>
//                 ))}
//               </ul>
//             </div>
//           </div>

//           {/* Charts Row 2: remaining server charts */}
//           {charts.length > 2 && (
//             <div className={cn("grid gap-4 mb-6", charts.length - 2 === 1 ? "grid-cols-1" : "grid-cols-2")}>
//               {charts.slice(2).map((chart, idx) => (
//                 <ChartCard
//                   key={`chart-extra-${idx}`}
//                   initialChart={chart}
//                   rows={rawRows}
//                   numericCols={meta.numeric_columns}
//                   categoricalCols={meta.categorical_columns}
//                   dateCols={meta.date_columns}
//                   boolCols={boolCols}
//                   chartIndex={idx + 2}
//                 />
//               ))}
//             </div>
//           )}

//           {/* User-added charts */}
//           {extraCharts.length > 0 && (
//             <div className="mb-6">
//               <div className="flex items-center gap-2 mb-4">
//                 <div className="w-1 h-4 bg-primary rounded" />
//                 <span className="text-xs font-semibold tracking-wider">CUSTOM CHARTS</span>
//                 <span className="text-xs text-muted-foreground">({extraCharts.length})</span>
//               </div>
//               <div className={cn("grid gap-4", extraCharts.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
//                 {extraCharts.map((chart, idx) => (
//                   <ChartCard
//                     key={`custom-chart-${idx}`}
//                     initialChart={chart}
//                     rows={rawRows}
//                     numericCols={meta.numeric_columns}
//                     categoricalCols={meta.categorical_columns}
//                     dateCols={meta.date_columns}
//                     boolCols={boolCols}
//                     chartIndex={100 + idx}
//                     onRemove={() => setExtraCharts((prev) => prev.filter((_, i) => i !== idx))}
//                   />
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* Trends */}
//           {trends.length > 0 && (
//             <div className="p-4 rounded-xl bg-card border border-border mb-6">
//               <h3 className="text-xs font-semibold tracking-wider text-foreground mb-4 flex items-center gap-2">
//                 <BarChart3 className="w-4 h-4 text-primary" />
//                 KEY TRENDS
//               </h3>
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
//                 {trends.map((trend, idx) => (
//                   <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
//                     <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
//                     <span className="text-sm text-muted-foreground">{trend}</span>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}
//         </div>
//         {/* End Dashboard Content */}

//         {/* Column Explorer (outside exportable area) */}
//         {column_profiles && column_profiles.length > 0 && (
//           <div className="mt-6">
//             <ColumnExplorer
//               profiles={column_profiles}
//               rows={rawRows}
//               numericCols={meta.numeric_columns}
//               categoricalCols={meta.categorical_columns}
//               dateCols={meta.date_columns}
//               boolCols={boolCols}
//               onAddChart={(chart) => setExtraCharts((prev) => [...prev, chart])}
//             />
//           </div>
//         )}
//       </div>
//     </AppLayout>
//   )
// }
"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
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
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  Zap,
  Brain,
  ShieldAlert,
  Target,
  Activity,
  DollarSign,
  Users,
  Database,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react"
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

interface Conclusion {
  category: "behavioral" | "operational" | "financial" | "risk" | "opportunity" | "data_quality"
  title: string
  finding: string
  evidence: string
  implication: string
  confidence: "high" | "medium" | "low"
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
  conclusions: Conclusion[]
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
  | { status: "loading"; stage: string }
  | { status: "error"; error: string }
  | { status: "success"; data: AnalysisResult }

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

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
  if (data.length === 0) return "No data available."
  const values = data.map((d) => Number(d.value) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const peakItem = data.find((d) => Number(d.value) === max)
  const peakLabel = String(peakItem?.name ?? "N/A")

  if (chartType === "count") {
    return `Frequency of ${xCol.replace(/_/g, " ")} across ${data.length} categories. "${peakLabel}" appears most with ${max.toLocaleString()} occurrences.`
  }
  const topPct = total > 0 ? ((max / total) * 100).toFixed(1) : "0"
  return `${yCol.replace(/_/g, " ")} across ${data.length} ${xCol.replace(/_/g, " ")} categories. "${peakLabel}" leads at ${max.toLocaleString()} (${topPct}% of total).`
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

/* ──────── Loading Stages ──────── */

const LOADING_STAGES = [
  "Profiling columns and detecting data types...",
  "Computing statistical distributions...",
  "Sending data to AI for analysis...",
  "Generating KPIs and key metrics...",
  "Crafting chart configurations...",
  "Identifying trends and patterns...",
  "Formulating recommendations...",
  "Finalizing your dashboard...",
]

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
  isNew = false,
}: {
  initialChart: ChartConfig
  rows: Record<string, unknown>[]
  numericCols: string[]
  categoricalCols: string[]
  dateCols: string[]
  boolCols: string[]
  chartIndex: number
  onRemove?: () => void
  isNew?: boolean
}) {
  type ChartType = "line" | "bar" | "pie" | "column" | "donut" | "funnel" | "heatmap" | "count"
  const [chartType, setChartType] = useState<ChartType>(initialChart.type as ChartType)
  const [xCol, setXCol] = useState(initialChart.xKey)
  const [yCol, setYCol] = useState(initialChart.yKey)
  const [showFilters, setShowFilters] = useState(false)
  const [animate, setAnimate] = useState(isNew)

  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setAnimate(false), 600)
      return () => clearTimeout(t)
    }
  }, [isNew])

  const xOptions = useMemo(() => {
    const base = [...new Set([...categoricalCols, ...dateCols, ...numericCols, ...boolCols])]
    if (initialChart.xKey && !base.includes(initialChart.xKey) && initialChart.xKey !== "name" && initialChart.xKey !== "range") {
      base.push(initialChart.xKey)
    }
    return base
  }, [categoricalCols, dateCols, numericCols, boolCols, initialChart.xKey])

  const yOptions = useMemo(() => {
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
    <div
      className={cn(
        "p-4 rounded-xl bg-card border border-border flex flex-col transition-all duration-500",
        animate && "ring-2 ring-primary/50 shadow-lg shadow-primary/10"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase line-clamp-1">
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
                  <SelectItem key={col} value={col}>{col.replace(/_/g, " ")}</SelectItem>
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
                    <SelectItem key={col} value={col}>{col.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1 ml-auto">
            <label className="text-[10px] font-medium text-transparent tracking-wider uppercase select-none">_</label>
            <button
              onClick={() => { setChartType(initialChart.type as ChartType); setXCol(initialChart.xKey); setYCol(initialChart.yKey) }}
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
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
              <Line type="monotone" dataKey={yDataKey} stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
            </LineChart>
          ) : chartType === "column" ? (
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} cursor={{ fill: "transparent" }} />
              <Bar dataKey={yDataKey} fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          ) : chartType === "pie" ? (
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey={yDataKey} nameKey={xDataKey} label={({ name, percent }) => `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
            </PieChart>
          ) : chartType === "donut" ? (
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey={yDataKey} nameKey={xDataKey} label={({ name, percent }) => `${String(name).substring(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
            </PieChart>
          ) : chartType === "funnel" ? (
            <FunnelChart>
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
              <Funnel data={[...chartData].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))} dataKey={yDataKey} nameKey={xDataKey}>
                {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Funnel>
            </FunnelChart>
          ) : chartType === "heatmap" ? (
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis type="category" dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey={yDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} />
              <Scatter data={chartData} dataKey={yDataKey} fill={color} />
            </ScatterChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
              <XAxis dataKey={xDataKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8, color: "#e2e8f0" }} cursor={{ fill: "transparent" }} />
              <Bar dataKey={yDataKey} fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ──────── AI Chat Panel ──────── */

function AIChatPanel({
  analysisData,
  rawRows,
}: {
  analysisData: AnalysisResult
  rawRows: Record<string, unknown>[]
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `I've analyzed your dataset of **${analysisData.meta.total_records.toLocaleString()} records** across **${analysisData.meta.total_columns} columns**.\n\nYou can ask me anything about the data — specific trends, comparisons, anomalies, or deeper insights. What would you like to explore?`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    const userMessage = input.trim()
    setInput("")

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, timestamp: new Date() },
    ])
    setIsLoading(true)

    try {
      // Build context for AI
      const context = `
You are a data analyst assistant. Here is the dataset context:
- Total records: ${analysisData.meta.total_records}
- Numeric columns: ${analysisData.meta.numeric_columns.join(", ")}
- Categorical columns: ${analysisData.meta.categorical_columns.join(", ")}
- Date columns: ${analysisData.meta.date_columns.join(", ")}

Key insights already identified:
${analysisData.trends.map((t) => `- ${t}`).join("\n")}

Column profiles:
${analysisData.column_profiles.map((p) => {
  const statsStr = p.stats ? ` [min:${p.stats.min}, max:${p.stats.max}, mean:${p.stats.mean.toFixed(2)}]` : ""
  const topStr = p.top_values.slice(0, 3).map((tv) => `${tv.value}(${tv.percentage}%)`).join(", ")
  return `- ${p.key} (${p.dtype})${statsStr}: top values: ${topStr}`
}).join("\n")}

Answer the user's question concisely and specifically based on this data. Be direct and cite numbers.
`

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns: analysisData.meta.numeric_columns.concat(analysisData.meta.categorical_columns).map((k) => ({ key: k, label: k })),
          rows: rawRows.slice(0, 100), // send sample
          dataset_id: "chat",
          chat_mode: true,
          chat_context: context,
          chat_question: userMessage,
        }),
      })

      // Actually call Claude directly for chat
      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          question: userMessage,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      }).catch(() => null)

      let assistantContent = ""
      if (chatResponse && chatResponse.ok) {
        const chatData = await chatResponse.json()
        assistantContent = chatData.answer || "I couldn't generate a response."
      } else {
        // Fallback: answer from analysis data
        assistantContent = generateFallbackAnswer(userMessage, analysisData)
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent, timestamp: new Date() },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try asking again.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[600px] rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">AI Data Assistant</h3>
          <p className="text-[10px] text-muted-foreground">Ask anything about your data</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => (
          <div key={idx} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3 h-3 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground"
              )}
            >
              {msg.content.split("\n").map((line, i) => (
                <span key={i}>
                  {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                    part.startsWith("**") && part.endsWith("**")
                      ? <strong key={j}>{part.slice(2, -2)}</strong>
                      : part
                  )}
                  {i < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot className="w-3 h-3 text-primary" />
            </div>
            <div className="bg-secondary rounded-xl px-3 py-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {[
            "What are the top trends?",
            "Show me outliers",
            "What's the distribution?",
            "Summarize key findings",
          ].map((q) => (
            <button
              key={q}
              onClick={() => { setInput(q); }}
              className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about your data..."
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function generateFallbackAnswer(question: string, data: AnalysisResult): string {
  const q = question.toLowerCase()
  if (q.includes("trend") || q.includes("pattern")) {
    return `Based on the analysis:\n\n${data.trends.map((t) => `• ${t}`).join("\n")}`
  }
  if (q.includes("recommend") || q.includes("suggest") || q.includes("should")) {
    return `Here are the key recommendations:\n\n${data.recommendations.map((r) => `• ${r}`).join("\n")}`
  }
  if (q.includes("summary") || q.includes("overview") || q.includes("tell me about")) {
    return data.description
  }
  if (q.includes("column") || q.includes("field")) {
    const cols = data.column_profiles.map((p) => `**${p.key}** (${p.dtype}): ${p.distinct_count} unique values`).join("\n")
    return `This dataset has ${data.meta.total_columns} columns:\n\n${cols}`
  }
  return `The dataset has ${data.meta.total_records.toLocaleString()} records. ${data.description}\n\nTop trends: ${data.trends[0] || "N/A"}`
}


/* ──────── Conclusions Panel ──────── */

const CONCLUSION_CONFIG: Record<string, {
  label: string
  icon: React.ElementType
  bg: string
  border: string
  badge: string
  iconColor: string
}> = {
  financial:    { label: "Financial",    icon: DollarSign,  bg: "bg-emerald-500/5",  border: "border-emerald-500/20", badge: "bg-emerald-500/15 text-emerald-400", iconColor: "text-emerald-400" },
  behavioral:   { label: "Behavioral",   icon: Users,       bg: "bg-blue-500/5",     border: "border-blue-500/20",    badge: "bg-blue-500/15 text-blue-400",    iconColor: "text-blue-400" },
  operational:  { label: "Operational",  icon: Activity,    bg: "bg-orange-500/5",   border: "border-orange-500/20",  badge: "bg-orange-500/15 text-orange-400", iconColor: "text-orange-400" },
  risk:         { label: "Risk",         icon: ShieldAlert, bg: "bg-red-500/5",      border: "border-red-500/20",     badge: "bg-red-500/15 text-red-400",      iconColor: "text-red-400" },
  opportunity:  { label: "Opportunity",  icon: Target,      bg: "bg-purple-500/5",   border: "border-purple-500/20",  badge: "bg-purple-500/15 text-purple-400", iconColor: "text-purple-400" },
  data_quality: { label: "Data Quality", icon: Database,    bg: "bg-yellow-500/5",   border: "border-yellow-500/20",  badge: "bg-yellow-500/15 text-yellow-400", iconColor: "text-yellow-400" },
}

const CONFIDENCE_CONFIG = {
  high:   { icon: CheckCircle2,  color: "text-green-400",  label: "High confidence" },
  medium: { icon: HelpCircle,    color: "text-yellow-400", label: "Medium confidence" },
  low:    { icon: AlertTriangle, color: "text-orange-400", label: "Low confidence" },
}

function ConclusionsPanel({ conclusions }: { conclusions: Conclusion[] }) {
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const categories = ["all", ...Array.from(new Set(conclusions.map((c) => c.category)))]
  const filtered = activeFilter === "all" ? conclusions : conclusions.filter((c) => c.category === activeFilter)

  const categoryCounts = conclusions.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-5 rounded-xl bg-card border border-border mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            AI GENERAL CONCLUSIONS
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {conclusions.length} insights
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cross-column synthesis — patterns, risks, and opportunities extracted by AI
          </p>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {categories.map((cat) => {
          const cfg = cat === "all" ? null : CONCLUSION_CONFIG[cat]
          const Icon = cfg?.icon
          const count = cat === "all" ? conclusions.length : (categoryCounts[cat] || 0)
          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                activeFilter === cat
                  ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              )}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {cat === "all" ? "All" : CONCLUSION_CONFIG[cat]?.label ?? cat} ({count})
            </button>
          )
        })}
      </div>

      {/* Conclusions grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((conclusion, idx) => {
          const cfg = CONCLUSION_CONFIG[conclusion.category] ?? CONCLUSION_CONFIG.operational
          const confCfg = CONFIDENCE_CONFIG[conclusion.confidence] ?? CONFIDENCE_CONFIG.medium
          const Icon = cfg.icon
          const ConfIcon = confCfg.icon
          const isExpanded = expandedIdx === idx

          return (
            <div
              key={idx}
              className={cn(
                "rounded-xl border transition-all duration-200 overflow-hidden",
                cfg.bg, cfg.border,
                isExpanded ? "ring-1 ring-primary/20" : "hover:ring-1 hover:ring-border"
              )}
            >
              {/* Card header — always visible */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full text-left p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", cfg.badge.replace("text-", "bg-").split(" ")[0] + "/20")}>
                    <Icon className={cn("w-3.5 h-3.5", cfg.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", cfg.badge)}>
                        {cfg.label}
                      </span>
                      <span className={cn("flex items-center gap-1 text-[10px] font-medium", confCfg.color)}>
                        <ConfIcon className="w-3 h-3" />
                        {confCfg.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-snug">{conclusion.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                      {conclusion.finding}
                    </p>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform", isExpanded && "rotate-180")} />
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/30">
                  <div className="pt-3 space-y-2.5">
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Evidence</span>
                      <p className="text-xs text-foreground mt-1 leading-relaxed font-mono bg-secondary/50 rounded-md p-2">{conclusion.evidence}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Implication</span>
                      <p className="text-xs text-foreground mt-1 leading-relaxed">{conclusion.implication}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No conclusions in this category.
        </div>
      )}
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
    profiles.forEach((p) => { counts[p.dtype] = (counts[p.dtype] || 0) + 1 })
    return counts
  }, [profiles])

  function handleQuickChart(profile: ColumnProfile, chartType: string) {
    const colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]
    const color = colors[Math.floor(Math.random() * colors.length)]
    let data: Record<string, unknown>[]
    let title: string

    if (chartType === "count" || (profile.dtype !== "numeric" && numericCols.length === 0)) {
      data = profile.top_values.slice(0, 10).map((tv) => ({ name: tv.value, value: tv.count }))
      title = `${profile.key.replace(/_/g, " ")} Frequency`
    } else if (profile.dtype === "numeric") {
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
      const metricCol = numericCols[0]
      const grouped: Record<string, number> = {}
      rows.forEach((row) => {
        const key = String(row[profile.key] ?? "Unknown")
        grouped[key] = (grouped[key] || 0) + (Number(row[metricCol]) || 0)
      })
      data = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      title = `${metricCol.replace(/_/g, " ")} by ${profile.key.replace(/_/g, " ")}`
    }

    const mappedType = chartType === "count" ? "bar" : chartType === "donut" ? "pie" : chartType
    onAddChart({ type: mappedType as "bar" | "line" | "pie", title, description: "", data, xKey: "name", yKey: "value", color })
  }

  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Columns3 className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-semibold tracking-wider uppercase">Column Explorer</h3>
        <span className="ml-auto text-xs text-muted-foreground">{profiles.length} columns</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {["all", "numeric", "categorical", "date", "boolean", "text"].map((t) => {
          const count = typeCounts[t] || 0
          if (t !== "all" && count === 0) return null
          return (
            <button key={t} onClick={() => setFilterType(t)}
              className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                filterType === t ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground")}>
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)} ({count})
            </button>
          )
        })}
      </div>

      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {filtered.map((profile) => {
          const Icon = DTYPE_ICON_MAP[profile.dtype] || FileText
          const colorClass = DTYPE_COLOR_MAP[profile.dtype] || "text-muted-foreground"
          const isExpanded = expandedCol === profile.key
          return (
            <div key={profile.key} className="rounded-lg border border-border/50 overflow-hidden">
              <button onClick={() => setExpandedCol(isExpanded ? null : profile.key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left">
                <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", colorClass)} />
                <span className="text-sm font-medium text-foreground truncate">{profile.key.replace(/_/g, " ")}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium bg-secondary", colorClass)}>{profile.dtype}</span>
                <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">{profile.distinct_count} unique</span>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-border/50 bg-secondary/20">
                  <div className="flex flex-wrap gap-3 pt-3">
                    <div className="text-xs"><span className="text-muted-foreground">Distinct: </span><span className="font-medium">{profile.distinct_count.toLocaleString()}</span></div>
                    <div className="text-xs"><span className="text-muted-foreground">Nulls: </span><span className="font-medium">{profile.null_count.toLocaleString()} ({((profile.null_count / profile.total_count) * 100).toFixed(1)}%)</span></div>
                    {profile.stats && (
                      <>
                        <div className="text-xs"><span className="text-muted-foreground">Min: </span><span className="font-medium">{profile.stats.min.toLocaleString()}</span></div>
                        <div className="text-xs"><span className="text-muted-foreground">Max: </span><span className="font-medium">{profile.stats.max.toLocaleString()}</span></div>
                        <div className="text-xs"><span className="text-muted-foreground">Mean: </span><span className="font-medium">{profile.stats.mean.toFixed(2)}</span></div>
                        <div className="text-xs"><span className="text-muted-foreground">Median: </span><span className="font-medium">{profile.stats.median.toLocaleString()}</span></div>
                      </>
                    )}
                  </div>
                  {profile.top_values.length > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Top Values</span>
                      <div className="mt-1.5 space-y-1">
                        {profile.top_values.slice(0, 8).map((tv, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs truncate max-w-[180px]">{tv.value}</span>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">{tv.count.toLocaleString()} ({tv.percentage}%)</span>
                              </div>
                              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                                <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(tv.percentage * 2, 100)}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.suggested_chart_types.length > 0 && (
                    <div>
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Quick Chart</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {profile.suggested_chart_types.slice(0, 4).map((ct) => (
                          <button key={ct} onClick={() => handleQuickChart(profile, ct)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
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
  const [loadingStageIdx, setLoadingStageIdx] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cycle through loading stages
  useEffect(() => {
    if (analysis.status === "loading") {
      setLoadingStageIdx(0)
      stageIntervalRef.current = setInterval(() => {
        setLoadingStageIdx((prev) => Math.min(prev + 1, LOADING_STAGES.length - 1))
      }, 1800)
    } else {
      if (stageIntervalRef.current) clearInterval(stageIntervalRef.current)
    }
    return () => { if (stageIntervalRef.current) clearInterval(stageIntervalRef.current) }
  }, [analysis.status])

  const runAnalysis = useCallback(async () => {
    const storedData = localStorage.getItem("cleanedDataResult")
    if (!storedData) {
      setAnalysis({ status: "error", error: "No cleaned data found. Please clean your data first from the Data Explorer." })
      return
    }

    let parsed: { cleaned_data: Record<string, unknown>[]; columns: string[]; cleaning_summary: unknown; factors_applied: string[] }
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
    const columns = parsed.columns.map((col: string) => ({ key: col, label: col.toUpperCase() }))
    setAnalysis({ status: "loading", stage: LOADING_STAGES[0] })

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns, rows: parsed.cleaned_data, dataset_id: datasetId || "unknown" }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || `Analysis failed: ${response.statusText}`)
      }

      const result: AnalysisResult = await response.json()
      setAnalysis({ status: "success", data: result })
    } catch (error) {
      setAnalysis({ status: "error", error: error instanceof Error ? error.message : "Analysis failed. Please try again." })
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

  /* ── Loading State ── */
  if (analysis.status === "loading" || analysis.status === "idle") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-8">
          {/* Animated orb */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-primary animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full border border-primary/30 animate-ping" />
            <div className="absolute -inset-2 rounded-full border border-primary/10 animate-ping [animation-delay:300ms]" />
          </div>

          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-foreground mb-2">AI is Analyzing Your Data</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Claude is reading your dataset, discovering patterns, and crafting meaningful insights just for you.
            </p>

            {/* Stage display */}
            <div className="relative h-8 overflow-hidden">
              <p
                key={loadingStageIdx}
                className="text-sm text-primary font-medium animate-in fade-in slide-in-from-bottom-2 duration-500"
              >
                {LOADING_STAGES[loadingStageIdx]}
              </p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {LOADING_STAGES.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-full transition-all duration-500",
                  i <= loadingStageIdx
                    ? "w-2 h-2 bg-primary"
                    : "w-1.5 h-1.5 bg-border"
                )}
              />
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  /* ── Error State ── */
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
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Analysis
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  /* ── Success ── */
  const { kpis, charts, description, trends, recommendations, conclusions, meta, column_profiles } = analysis.data
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
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h1 className="text-2xl font-bold text-foreground">AI Analysis Dashboard</h1>
              </div>
              <span className="px-3 py-1 text-xs font-medium bg-primary/20 text-primary rounded">
                {meta.total_records.toLocaleString()} RECORDS
              </span>
            </div>
            <p className="text-xs text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-primary" />
              INSIGHTS GENERATED BY AI · {meta.total_columns} COLUMNS ANALYZED
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff]">{meta.numeric_columns.length} numeric</span>
              <span className="px-2 py-0.5 rounded bg-[#ff3d71]/10 text-[#ff3d71]">{meta.categorical_columns.length} categorical</span>
              <span className="px-2 py-0.5 rounded bg-[#ffaa00]/10 text-[#ffaa00]">{meta.date_columns.length} date</span>
              {boolCols.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-[#7c5cff]/10 text-[#7c5cff]">{boolCols.length} boolean</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChat(!showChat)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors text-sm",
                  showChat
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                )}
              >
                <Bot className="w-4 h-4" />
                {showChat ? "Hide Chat" : "Ask AI"}
              </button>
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <Download className="w-4 h-4" />
                {isExporting ? "Exporting..." : "Export PDF"}
              </button>
            </div>
          </div>
        </div>

        {/* Main layout: dashboard + optional chat sidebar */}
        <div className={cn("flex gap-6", showChat ? "items-start" : "")}>
          <div className={cn("flex-1 min-w-0", showChat ? "max-w-[calc(100%-380px)]" : "")}>
            <div id="dashboard-content">
              {/* KPI Cards */}
              <div className={cn("grid gap-4 mb-6", kpis.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
                {kpis.map((kpi, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-300 group"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground tracking-wider">{kpi.label}</span>
                      <Info className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</span>
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

              {/* AI Summary */}
              <div className="p-4 rounded-xl bg-card border border-border mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold tracking-wider">AI EXECUTIVE SUMMARY</span>
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Generated by AI</span>
                </div>
                <p className="text-muted-foreground leading-relaxed relative z-10">{description}</p>
              </div>

              {/* Charts Row 1 + Recommendations */}
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
                    AI RECOMMENDATIONS
                  </h3>
                  <ul className="space-y-3">
                    {recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 group">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] + "22", color: PIE_COLORS[idx % PIE_COLORS.length] }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-sm text-muted-foreground leading-relaxed">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Charts Row 2 */}
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

              {/* Custom charts */}
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
                        isNew
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* AI Conclusions */}
              {conclusions && conclusions.length > 0 && (
                <ConclusionsPanel conclusions={conclusions} />
              )}

              {/* AI Trends */}
              {trends.length > 0 && (
                <div className="p-4 rounded-xl bg-card border border-border mb-6">
                  <h3 className="text-xs font-semibold tracking-wider text-foreground mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    AI-IDENTIFIED TRENDS
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {trends.map((trend, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <TrendingUp className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-sm text-muted-foreground">{trend}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column Explorer */}
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

          {/* AI Chat Sidebar */}
          {showChat && (
            <div className="w-[360px] flex-shrink-0 sticky top-6">
              <AIChatPanel analysisData={analysis.data} rawRows={rawRows} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}