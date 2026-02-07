"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, CheckCircle, ArrowLeft, Download } from "lucide-react"

interface Column {
  key: string
  label: string
  dtype?: string
}

interface CleaningSummary {
  original_count: number
  cleaned_count: number
  removed_count: number
  actions: string[]
}

interface CleanedDataState {
  columns: Column[]
  rows: Record<string, unknown>[]
  loading: boolean
  error: string | null
  summary: CleaningSummary | null
  factorsApplied: string[]
}

export default function CleanedDataPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const datasetId = searchParams.get("dataset_id")
  
  const [data, setData] = useState<CleanedDataState>({
    columns: [],
    rows: [],
    loading: true,
    error: null,
    summary: null,
    factorsApplied: [],
  })
  const [pagination, setPagination] = useState({ limit: 50, offset: 0 })

  useEffect(() => {
    // Load cleaned data from localStorage
    const loadCleanedData = () => {
      try {
        const storedData = localStorage.getItem("cleanedDataResult")
        
        if (!storedData) {
          setData(prev => ({
            ...prev,
            loading: false,
            error: "No cleaned data found. Please clean your data from the Data Explorer page.",
          }))
          return
        }
        
        const result = JSON.parse(storedData)
        
        // Convert column names to Column objects if they're just strings
        const columns: Column[] = result.columns.map((col: string | Column) => {
          if (typeof col === "string") {
            return { key: col, label: col }
          }
          return col
        })
        
        setData({
          columns,
          rows: result.cleaned_data,
          loading: false,
          error: null,
          summary: result.cleaning_summary,
          factorsApplied: result.factors_applied || [],
        })
      } catch (error) {
        setData(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load cleaned data",
        }))
      }
    }

    loadCleanedData()
  }, [])

  // Get paginated rows
  const paginatedRows = data.rows.slice(pagination.offset, pagination.offset + pagination.limit)
  const totalCount = data.rows.length

  const handleNextPage = () => {
    if (pagination.offset + pagination.limit < totalCount) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))
    }
  }

  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))
    }
  }

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1
  const totalPages = Math.ceil(totalCount / pagination.limit) || 1

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return "-"
    if (typeof value === "number") return value.toLocaleString()
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  const handleExport = () => {
    if (data.rows.length === 0) return
    
    // Convert to CSV
    const headers = data.columns.map(col => col.key).join(",")
    const rows = data.rows.map(row => 
      data.columns.map(col => {
        const value = row[col.key]
        if (value === null || value === undefined) return ""
        if (typeof value === "string" && value.includes(",")) {
          return `"${value}"`
        }
        return String(value)
      }).join(",")
    ).join("\n")
    
    const csv = `${headers}\n${rows}`
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cleaned-data-${datasetId || "export"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push(`/view-data?dataset_id=${datasetId}`)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Original Data
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                Cleaned Data
                <CheckCircle className="w-7 h-7 text-green-500" />
              </h1>
              <p className="text-muted-foreground">
                Your data has been cleaned and is ready for analysis.
              </p>
              {datasetId && (
                <p className="text-sm text-primary mt-2">
                  Original Dataset: <code className="bg-secondary px-2 py-1 rounded">{datasetId}</code>
                </p>
              )}
            </div>
            <button
              onClick={handleExport}
              disabled={data.rows.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Cleaning Summary */}
        {data.summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-card border border-border rounded-xl">
              <p className="text-sm text-muted-foreground mb-1">Original Records</p>
              <p className="text-2xl font-bold text-foreground">{data.summary.original_count.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-card border border-border rounded-xl">
              <p className="text-sm text-muted-foreground mb-1">Cleaned Records</p>
              <p className="text-2xl font-bold text-green-500">{data.summary.cleaned_count.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-card border border-border rounded-xl">
              <p className="text-sm text-muted-foreground mb-1">Removed/Fixed</p>
              <p className="text-2xl font-bold text-destructive">{data.summary.removed_count.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-card border border-border rounded-xl">
              <p className="text-sm text-muted-foreground mb-1">Actions Applied</p>
              <p className="text-2xl font-bold text-primary">{data.summary.actions?.length || data.factorsApplied.length}</p>
            </div>
          </div>
        )}

        {/* Cleaning Actions Applied */}
        {data.summary?.actions && data.summary.actions.length > 0 && (
          <div className="mb-8 p-4 bg-card border border-border rounded-xl">
            <h3 className="text-sm font-semibold text-foreground mb-3">Cleaning Actions Applied</h3>
            <ul className="space-y-1">
              {data.summary.actions.map((action, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Loading state */}
        {data.loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading cleaned data...</p>
          </div>
        )}

        {/* Error state */}
        {data.error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Failed to Load Data</h2>
            <p className="text-muted-foreground max-w-md">{data.error}</p>
            <button
              onClick={() => router.push("/view-data")}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Data Explorer
            </button>
          </div>
        )}

        {/* Data Table */}
        {!data.loading && !data.error && data.rows.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {data.columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-4 text-left text-xs font-semibold text-primary tracking-wider whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border hover:bg-secondary/50 transition-colors">
                      {data.columns.map((col) => (
                        <td key={col.key} className="px-4 py-4 text-sm text-foreground whitespace-nowrap">
                          {formatCellValue(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer with pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/30">
              <span className="text-xs text-muted-foreground tracking-wide">
                SHOWING {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, totalCount)} OF {totalCount.toLocaleString()} RECORDS
              </span>
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePrevPage}
                  disabled={pagination.offset === 0}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={pagination.offset + pagination.limit >= totalCount}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!data.loading && !data.error && data.rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Cleaned Data</h2>
            <p className="text-muted-foreground max-w-md">
              No cleaned data available. Please clean your data from the Data Explorer page.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
