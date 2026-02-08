"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { AlertCircle, TrendingUp, Lightbulb, CheckCircle, Loader2 } from "lucide-react"

interface ColumnAnalysisData {
  column_name: string
  data_type: string
  description: string
  insights: string[]
  recommendations: string[]
  graph_type: string
  graph_data: Record<string, any>
  statistics: Record<string, any>
}

interface ColumnAnalysisProps {
  datasetId: string
  columnName: string
  apiUrl?: string
}

export function ColumnAnalysis({ datasetId, columnName, apiUrl = "http://localhost:8000" }: ColumnAnalysisProps) {
  const [analysis, setAnalysis] = useState<ColumnAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        setLoading(true)
        const response = await fetch(
          `${apiUrl}/data/${datasetId}/column/${columnName}/analysis`
        )
        
        if (!response.ok) {
          throw new Error(`Analysis failed: ${response.statusText}`)
        }
        
        const data = await response.json()
        setAnalysis(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to analyze column")
        setAnalysis(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalysis()
  }, [datasetId, columnName, apiUrl])

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full border-red-500/20 bg-red-500/5">
        <CardHeader>
          <CardTitle className="text-red-500">Analysis Error</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!analysis) {
    return null
  }

  const renderGraph = () => {
    switch (analysis.graph_type) {
      case "histogram": {
        const bins = analysis.graph_data.bins || []
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bins}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "#1e293b", 
                  border: "1px solid #334155",
                  borderRadius: "8px"
                }}
              />
              <Bar dataKey="count" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        )
      }

      case "bar": {
        const categories = analysis.graph_data.categories || []
        const counts = analysis.graph_data.counts || []
        
        const data = categories.map((cat: string, idx: number) => ({
          name: cat,
          count: counts[idx] || 0
        }))

        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "#1e293b", 
                  border: "1px solid #334155",
                  borderRadius: "8px"
                }}
              />
              <Bar dataKey="count" fill="#ec4899" />
            </BarChart>
          </ResponsiveContainer>
        )
      }

      case "timeline": {
        return (
          <div className="h-[300px] flex items-center justify-center rounded-lg bg-slate-900/50 p-4">
            <div className="text-center">
              <p className="text-sm text-slate-400">Timeline from</p>
              <p className="text-lg font-semibold text-cyan-400">{analysis.graph_data.min_date}</p>
              <p className="text-sm text-slate-400">to</p>
              <p className="text-lg font-semibold text-cyan-400">{analysis.graph_data.max_date}</p>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  const stats = analysis.statistics

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <Card className="border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-800">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl text-cyan-400">{analysis.column_name}</CardTitle>
              <CardDescription className="text-slate-400 mt-2">
                {analysis.description}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
              {analysis.data_type}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Card className="bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Total Values</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-cyan-400">{stats.total_count}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Missing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">{stats.null_percentage}%</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Unique Values</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-400">{stats.unique_count}</p>
          </CardContent>
        </Card>

        {stats.mean !== undefined && (
          <Card className="bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-slate-400">Mean</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-400">{stats.mean}</p>
            </CardContent>
          </Card>
        )}

        {stats.min !== undefined && (
          <Card className="bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-slate-400">Min</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-400">{stats.min}</p>
            </CardContent>
          </Card>
        )}

        {stats.max !== undefined && (
          <Card className="bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-slate-400">Max</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-400">{stats.max}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Graph */}
      <Card className="bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-cyan-400">Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {renderGraph()}
        </CardContent>
      </Card>

      {/* Insights */}
      {analysis.insights.length > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <TrendingUp className="h-5 w-5" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.insights.map((insight, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-slate-300">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <Lightbulb className="h-5 w-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-slate-300">
                  <div className="h-4 w-4 mt-0.5 flex-shrink-0 rounded-full bg-amber-400 flex items-center justify-center">
                    <span className="text-xs font-bold text-slate-900">{idx + 1}</span>
                  </div>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
