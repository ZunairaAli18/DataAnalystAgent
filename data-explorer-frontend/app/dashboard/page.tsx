"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { Info, TrendingUp, TrendingDown, Loader2, AlertCircle, ArrowLeft, Lightbulb, BarChart3 } from "lucide-react"
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
} from "recharts"
import Link from "next/link"

interface KPI {
  label: string
  value: string
  change: number | null
  positive: boolean
  color: string
}

interface ChartData {
  type: "line" | "bar" | "pie"
  title: string
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  color: string
}

interface AnalysisResult {
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

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: AnalysisResult }

// Mini sparkline data generator from KPI value
function generateSparkline(seed: number): { value: number }[] {
  const points = []
  let val = seed
  for (let i = 0; i < 7; i++) {
    val = val + (Math.random() - 0.4) * val * 0.15
    points.push({ value: Math.max(0, Math.round(val)) })
  }
  return points
}

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const datasetId = searchParams.get("dataset_id")

  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" })

  const runAnalysis = useCallback(async () => {
    // Load cleaned data from localStorage
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

    // Build column metadata
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

  useEffect(() => {
    runAnalysis()
  }, [runAnalysis])

  // Loading state
  if (analysis.status === "loading" || analysis.status === "idle") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <h2 className="text-xl font-semibold text-foreground">Analyzing Your Data</h2>
          <p className="text-muted-foreground text-sm">Generating KPIs, charts, trends, and recommendations...</p>
        </div>
      </AppLayout>
    )
  }

  // Error state
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

  // Success state
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
              <h1 className="text-2xl font-bold text-foreground">Data Analysis Dashboard</h1>
              <span className="px-3 py-1 text-xs font-medium bg-primary/20 text-primary rounded">
                {meta.total_records.toLocaleString()} RECORDS
              </span>
            </div>
            <p className="text-xs text-muted-foreground tracking-wider">
              AUTOMATED INTELLIGENCE GENERATED FROM CLEANED DATA
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{meta.numeric_columns.length} numeric</span>
            <span className="text-border">|</span>
            <span>{meta.categorical_columns.length} categorical</span>
            <span className="text-border">|</span>
            <span>{meta.date_columns.length} date</span>
          </div>
        </div>

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

        {/* Description (Analyst Narration) */}
        <div className="p-4 rounded-xl bg-card border border-border mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 bg-primary rounded" />
            <span className="text-xs font-semibold tracking-wider">DATA SUMMARY</span>
          </div>
          <p className="text-muted-foreground italic">{description}</p>
        </div>

        {/* Charts + Recommendations Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {charts.slice(0, 2).map((chart, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground mb-4">
                {chart.title.toUpperCase()}
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  {chart.type === "line" ? (
                    <LineChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
                      <XAxis
                        dataKey={chart.xKey}
                        tick={{ fill: "#6b7280", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8 }}
                        labelStyle={{ color: "#94a3b8" }}
                      />
                      <Line type="monotone" dataKey={chart.yKey} stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color, r: 3 }} />
                    </LineChart>
                  ) : (
                    <BarChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
                      <XAxis
                        dataKey={chart.xKey}
                        tick={{ fill: "#6b7280", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8 }}
                        labelStyle={{ color: "#94a3b8" }}
                        cursor={{ fill: "transparent" }}
                      />
                      <Bar dataKey={chart.yKey} fill={chart.color} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          ))}

          {/* Recommendations panel */}
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

        {/* Additional Charts Row */}
        {charts.length > 2 && (
          <div className={cn("grid gap-4 mb-6", charts.length - 2 === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {charts.slice(2).map((chart, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-card border border-border">
                <h3 className="text-xs font-semibold tracking-wider text-muted-foreground mb-4">
                  {chart.title.toUpperCase()}
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    {chart.type === "line" ? (
                      <LineChart data={chart.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
                        <XAxis dataKey={chart.xKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8 }}
                          labelStyle={{ color: "#94a3b8" }}
                        />
                        <Line type="monotone" dataKey={chart.yKey} stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color, r: 3 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={chart.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 30% 20%)" />
                        <XAxis dataKey={chart.xKey} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(210 45% 10%)", border: "1px solid hsl(210 30% 20%)", borderRadius: 8 }}
                          labelStyle={{ color: "#94a3b8" }}
                          cursor={{ fill: "transparent" }}
                        />
                        <Bar dataKey={chart.yKey} fill={chart.color} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trends Section */}
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
    </AppLayout>
  )
}
