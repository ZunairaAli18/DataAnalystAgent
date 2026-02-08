"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { ColumnAnalysis } from "@/components/column-analysis"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"

interface Column {
  key: string
  label: string
  dtype?: string
}

export default function ColumnAnalysisPage() {
  const searchParams = useSearchParams()
  const datasetId = searchParams.get("dataset_id")
  
  const [columns, setColumns] = useState<Column[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedColumnIdx, setSelectedColumnIdx] = useState(0)
  const [apiUrl] = useState(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")

  useEffect(() => {
    // Load columns from localStorage (set during cleaning)
    const loadColumns = () => {
      try {
        const storedData = localStorage.getItem("cleanedDataResult")
        
        if (!storedData) {
          setError("No cleaned data found. Please clean your data first.")
          setLoading(false)
          return
        }
        
        const result = JSON.parse(storedData)
        const cleanedColumns: Column[] = result.columns.map((col: string | Column) => {
          if (typeof col === "string") {
            return { key: col, label: col }
          }
          return col
        })
        
        setColumns(cleanedColumns)
        setError(null)
      } catch (err) {
        setError("Failed to load columns data")
      } finally {
        setLoading(false)
      }
    }

    loadColumns()
  }, [])

  if (loading) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !datasetId) {
    return (
      <AppLayout>
        <div className="p-8">
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || "Dataset ID is required"}
            </AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    )
  }

  if (columns.length === 0) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle>No Columns Found</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400">No columns available for analysis</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    )
  }

  const currentColumn = columns[selectedColumnIdx]
  const hasNextColumn = selectedColumnIdx < columns.length - 1
  const hasPrevColumn = selectedColumnIdx > 0

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-cyan-400">Column Analysis & Insights</h1>
          <p className="text-slate-400">
            Automated analysis with graphs, descriptions, insights, and recommendations
          </p>
        </div>

        {/* Column Navigator */}
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  Column {selectedColumnIdx + 1} of {columns.length}
                </CardTitle>
                <p className="text-sm text-slate-400 mt-1">{currentColumn.label}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedColumnIdx(idx => Math.max(0, idx - 1))}
                  disabled={!hasPrevColumn}
                  className="border-slate-600"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedColumnIdx(idx => Math.min(columns.length - 1, idx + 1))}
                  disabled={!hasNextColumn}
                  className="border-slate-600"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Tabs for quick column access */}
        {columns.length > 1 && (
          <div className="overflow-x-auto">
            <div className="flex gap-2 pb-2">
              {columns.map((col, idx) => (
                <Button
                  key={col.key}
                  variant={selectedColumnIdx === idx ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedColumnIdx(idx)}
                  className={selectedColumnIdx === idx ? "bg-cyan-500 hover:bg-cyan-600" : "border-slate-600"}
                >
                  {col.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Column Analysis */}
        <ColumnAnalysis
          datasetId={datasetId}
          columnName={currentColumn.key}
          apiUrl={apiUrl}
        />

        {/* Quick Navigation Info */}
        <Card className="bg-slate-900/30 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-300">Navigation Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-400">
            <p>• Use the arrow buttons to navigate between columns</p>
            <p>• Click on column names above for quick access</p>
            <p>• Review insights and recommendations for data quality improvements</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
