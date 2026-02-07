"use client"

import { useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { Info, TrendingUp, TrendingDown } from "lucide-react"
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

const viewTabs = ["OVERVIEW", "REGIONAL", "PRODUCT", "FORECAST"]

const kpiCards = [
  {
    label: "SALES",
    currentValue: "733.22K",
    previousValue: "PY 609.21K",
    change: 20.36,
    positive: true,
    sparkColor: "#00d4ff",
  },
  {
    label: "PROFIT",
    currentValue: "93.44K",
    previousValue: "PY 81.80K",
    change: 14.24,
    positive: true,
    sparkColor: "#ff3d71",
  },
  {
    label: "ORDERS",
    currentValue: "3312",
    previousValue: "PY 2587",
    change: 28.02,
    positive: true,
    sparkColor: "#ff3d71",
  },
  {
    label: "RETURNS",
    currentValue: "289",
    previousValue: "PY 197",
    change: 46.70,
    positive: false,
    sparkColor: "#ffaa00",
  },
]

const revenueData = [
  { month: "Jan", value: 6500 },
  { month: "Feb", value: 8000 },
  { month: "Mar", value: 12000 },
  { month: "Apr", value: 15000 },
  { month: "May", value: 18000 },
  { month: "Jun", value: 22000 },
  { month: "Jul", value: 26000 },
]

const salesData = [
  { year: "2019", value: 400 },
  { year: "2020", value: 500 },
  { year: "2021", value: 550 },
  { year: "2022", value: 620 },
  { year: "2023", value: 800 },
  { year: "2024", value: 600 },
]

const recommendations = [
  "Maintain high stock of sub-category 'Phones' as growth remains consistent.",
  "Expand regional analysis to Central regions showing profit ratio improvements.",
]

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("OVERVIEW")

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

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {kpiCards.map((kpi) => (
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

        {/* Analyst Narration */}
        <div className="p-4 rounded-xl bg-card border border-border mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 bg-primary rounded" />
            <span className="text-xs font-semibold tracking-wider">SENIOR ANALYST NARRATION</span>
          </div>
          <p className="text-muted-foreground italic">
            &quot;Sales peaked in March mainly due to high demand in Karachi. Product A contributed 35% of total revenue.&quot;
          </p>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Revenue Trend */}
          <div className="p-4 rounded-xl bg-card border border-border">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground mb-4">REVENUE TREND</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
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
                <BarChart data={salesData}>
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
              {recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 p-3 rounded-lg bg-secondary">
              <h4 className="text-xs font-semibold tracking-wider text-primary mb-2">STRATEGIC FORECAST</h4>
              <p className="text-xs text-muted-foreground">CONFIDENCE FACTOR: 96.4% ACCURACY</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
