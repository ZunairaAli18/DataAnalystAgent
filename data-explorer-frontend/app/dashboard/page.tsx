"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { Info, TrendingUp, TrendingDown, Loader2, AlertCircle } from "lucide-react"
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
import { fetchDashboardData } from "@/lib/dashboard-api"

const viewTabs = ["OVERVIEW", "REGIONAL", "PRODUCT", "FORECAST"]

interface KPICard {
  label: string
  currentValue: string
  previousValue: string
  change: number
  positive: boolean
  sparkColor: string
}

interface DashboardState {
  kpiCards: KPICard[]
  revenueData: Array<{ month: string; value: number }>
  salesData: Array<{ year: string; value: number }>
  insights: string
  recommendations: string[]
  confidenceFactor: number
  loading: boolean
  error: string | null
}

const defaultState: DashboardState = {
  kpiCards: [],
  revenueData: [],
  salesData: [],
  insights: "Loading dashboard data...",
  recommendations: [],
  confidenceFactor: 0,
  loading: true,
  error: null,
}

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const datasetId = searchParams.get("dataset_id")
  const [activeTab, setActiveTab] = useState("OVERVIEW")
  const [dashboardData, setDashboardData] = useState<DashboardState>(defaultState)

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!datasetId) {
        setDashboardData((prev) => ({
          ...prev,
          loading: false,
          error: "No dataset selected. Please select a dataset first.",
        }))
        return
      }

      try {
        setDashboardData((prev) => ({ ...prev, loading: true, error: null }))
        const data = await fetchDashboardData(datasetId)
        setDashboardData({
          kpiCards: data.kpiCards,
          revenueData: data.revenueData,
          salesData: data.salesData,
          insights: data.insights,
          recommendations: data.recommendations,
          confidenceFactor: data.confidenceFactor,
          loading: false,
          error: null,
        })
      } catch (error) {
        console.error("[v0] Error loading dashboard:", error)
        setDashboardData((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load dashboard data",
        }))
      }
    }

    loadDashboardData()
  }, [datasetId])

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">North America Retail Supply Chain Analysis</h1>
              <span className="px-3 py-1 text-xs font-medium bg-primary/20 text-primary rounded">SALES DOMAIN</span>
            </div>
            <p className="text-xs text-muted-foreground tracking-wider">
              &quot;AUTOMATED INTELLIGENCE GENERATED FROM SALES DATA CLUSTER&quot;
            </p>
          </div>
          
          {/* View Tabs */}
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            {viewTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-xs font-medium rounded transition-all",
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {dashboardData.error && (
          <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/50 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-red-400">Error Loading Dashboard</h3>
              <p className="text-sm text-red-300/80 mt-1">{dashboardData.error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {dashboardData.loading && (
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-muted-foreground">Loading dashboard data...</p>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {!dashboardData.loading && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {dashboardData.kpiCards.map((kpi) => (
            <div key={kpi.label} className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground tracking-wider">{kpi.label}</span>
                <Info className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold" style={{ color: kpi.sparkColor }}>
                  CY {kpi.currentValue}
                </span>
                <span className="text-xs text-muted-foreground">{kpi.previousValue}</span>
              </div>
              <div className={cn(
                "flex items-center gap-1 text-xs",
                kpi.positive ? "text-green-400" : "text-red-400"
              )}>
                {kpi.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {kpi.change}%
              </div>
              <div className="mt-3 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData.slice(0, 5)}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={kpi.sparkColor}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* Analyst Narration */}
        {!dashboardData.loading && (
        <div className="p-4 rounded-xl bg-card border border-border mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 bg-primary rounded" />
            <span className="text-xs font-semibold tracking-wider">SENIOR ANALYST NARRATION</span>
          </div>
          <p className="text-muted-foreground italic">
            &quot;{dashboardData.insights}&quot;
          </p>
        </div>
        )}

        {/* Charts Row */}
        {!dashboardData.loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Revenue Trend */}
          <div className="p-4 rounded-xl bg-card border border-border">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground mb-4">REVENUE TREND</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboardData.revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 8 }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#00d4ff"
                    strokeWidth={2}
                    dot={{ fill: "#00d4ff", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sales Trend */}
          <div className="p-4 rounded-xl bg-card border border-border">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground mb-4">SALES TREND</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData.salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2744" />
                  <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 8 }}
                    labelStyle={{ color: "#94a3b8" }}
                    cursor={{ fill: "transparent" }}
                  />
                  <Bar dataKey="value" fill="#ff3d71" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recommendations */}
          <div className="p-4 rounded-xl bg-card border border-border">
            <h3 className="text-xs font-semibold tracking-wider text-primary mb-4">RECOMMENDATIONS</h3>
            <ul className="space-y-3">
              {dashboardData.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 p-3 rounded-lg bg-secondary">
              <h4 className="text-xs font-semibold tracking-wider text-primary mb-2">STRATEGIC FORECAST</h4>
              <p className="text-xs text-muted-foreground">
                CONFIDENCE FACTOR: {(dashboardData.confidenceFactor * 100).toFixed(1)}% ACCURACY
              </p>
            </div>
          </div>
        </div>
        )}
      </div>
    </AppLayout>
  )
}
