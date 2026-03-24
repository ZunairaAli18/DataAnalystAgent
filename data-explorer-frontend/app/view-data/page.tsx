"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Sparkles, X, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const PERSISTED_DATASET_KEY = "activeDatasetId"

interface Column {
  key: string
  label: string
  dtype: string
}

interface DataState {
  columns: Column[]
  rows: Record<string, unknown>[]
  totalCount: number
  loading: boolean
  error: string | null
}

interface Anomaly {
  type: string
  column: string
  count: number
  description: string
}

interface AnomalyState {
  loading: boolean
  error: string | null
  anomalies: Anomaly[]
  selectedFactors: string[]
}

const CLEANING_FACTORS = [
  { id: "missing_values", label: "Missing Values", description: "Remove rows with null or empty values" },
  { id: "duplicate_rows", label: "Duplicate Rows", description: "Remove exact duplicate entries from the dataset" },
  { id: "numeric_outliers", label: "Numeric Outliers", description: "Remove statistical outliers using IQR method (values outside 1.5*IQR)" },
  { id: "skewed_distribution", label: "Skewed Distribution", description: "Flag columns where values cluster abnormally, distorting averages and trends" },
  { id: "whitespace", label: "Extra Whitespace", description: "Trim leading/trailing spaces in text fields" },
  { id: "case_inconsistency", label: "Case Inconsistency", description: "Standardize text case (e.g., 'USA' vs 'usa' vs 'Usa')" },
  { id: "currency_symbols", label: "Currency Symbols", description: "Remove currency symbols ($, €, £, ¥, ₹) from numeric values" },
  { id: "date_format", label: "Date Format", description: "Standardize dates to ISO format (YYYY-MM-DD)" },
  { id: "duplicate_values", label: "Duplicate Values", description: "Flag duplicate values in columns that should be unique (like IDs)" },
  { id: "mixed_types", label: "Mixed Types", description: "Handle columns with mixed data types (numbers stored as text)" },
]

export default function ViewDataPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Use URL param if present, otherwise fall back to persisted dataset
  const urlDatasetId = searchParams.get("dataset_id")
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null)

  // On mount: resolve which dataset ID to use and persist it
  useEffect(() => {
    if (urlDatasetId) {
      // New dataset from URL — save it and use it
      localStorage.setItem(PERSISTED_DATASET_KEY, urlDatasetId)
      setActiveDatasetId(urlDatasetId)
    } else {
      // No URL param — restore last used dataset
      const persisted = localStorage.getItem(PERSISTED_DATASET_KEY)
      if (persisted) {
        setActiveDatasetId(persisted)
        // Optionally sync URL without navigation
        router.replace(`/view-data?dataset_id=${persisted}`)
      }
    }
  }, [urlDatasetId])

  const datasetId = activeDatasetId

  const [data, setData] = useState<DataState>({
    columns: [],
    rows: [],
    totalCount: 0,
    loading: false,
    error: null,
  })
  const [pagination, setPagination] = useState({ limit: 50, offset: 0 })
  const [showCleanModal, setShowCleanModal] = useState(false)
  const [anomalyState, setAnomalyState] = useState<AnomalyState>({
    loading: false,
    error: null,
    anomalies: [],
    selectedFactors: [],
  })
  const [cleaningInProgress, setCleaningInProgress] = useState(false)

  // useEffect(() => {
  //   if (!datasetId) return

  //   const fetchData = async () => {
  //     setData(prev => ({ ...prev, loading: true, error: null }))
      
  //     try {
  //       const response = await fetch(`${API_BASE_URL}/data/${datasetId}`)
        
  //       if (!response.ok) {
  //         throw new Error(`Failed to fetch data: ${response.statusText}`)
  //       }
        
  //       const result = await response.json()
        
  //       setData({
  //         columns: result.columns,
  //         rows: result.rows,
  //         totalCount: result.total_count,
  //         loading: false,
  //         error: null,
  //       })
  //     } catch (error) {
  //       setData(prev => ({
  //         ...prev,
  //         loading: false,
  //         error: error instanceof Error ? error.message : "Failed to load data",
  //       }))
  //     }
  //   }

  //   fetchData()
  // }, [datasetId, pagination])
useEffect(() => {
  if (!datasetId) return

  let pollInterval: NodeJS.Timeout

  const fetchData = async () => {
    setData(prev => ({ ...prev, loading: true, error: null }))
    try {
      const response = await fetch(`${API_BASE_URL}/data/${datasetId}`)
      if (!response.ok) throw new Error(`Failed to fetch data: ${response.statusText}`)
      const result = await response.json()
      setData({
        columns: result.columns,
        rows: result.rows,
        totalCount: result.total_count,
        loading: false,
        error: null,
      })
    } catch (error) {
      setData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load data",
      }))
    }
  }

  const pollStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/data/${datasetId}/status`)
      if (!res.ok) return
      const { status } = await res.json()

      if (status === "ready") {
        clearInterval(pollInterval)
        fetchData()
      } else if (status === "failed") {
        clearInterval(pollInterval)
        setData(prev => ({
          ...prev,
          loading: false,
          error: "Dataset processing failed. Please re-upload the file.",
        }))
      }
    } catch {
      // network error — keep polling
    }
  }

  setData(prev => ({ ...prev, loading: true, error: null }))
  pollStatus()
  pollInterval = setInterval(pollStatus, 2000)

  return () => clearInterval(pollInterval)
}, [datasetId]) 
  const handleNextPage = () => {
    if (pagination.offset + pagination.limit < data.totalCount) {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))
    }
  }

  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))
    }
  }

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1
  const totalPages = Math.ceil(data.totalCount / pagination.limit)

  const handleDetectAnomalies = async () => {
    if (!datasetId) return
    
    setShowCleanModal(true)
    setAnomalyState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const response = await fetch(`${API_BASE_URL}/data/${datasetId}/detect-anomalies`)
      
      if (!response.ok) {
        throw new Error(`Failed to detect anomalies: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      setAnomalyState({
        loading: false,
        error: null,
        anomalies: result.anomalies,
        selectedFactors: [],
      })
    } catch (error) {
      setAnomalyState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to detect anomalies",
      }))
    }
  }

  const toggleFactor = (factorId: string) => {
    setAnomalyState(prev => ({
      ...prev,
      selectedFactors: prev.selectedFactors.includes(factorId)
        ? prev.selectedFactors.filter(id => id !== factorId)
        : [...prev.selectedFactors, factorId]
    }))
  }

  const handleCleanData = async () => {
    if (!datasetId || anomalyState.selectedFactors.length === 0) return
    
    setCleaningInProgress(true)
    
    try {
      const response = await fetch(`${API_BASE_URL}/data/${datasetId}/clean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factors: anomalyState.selectedFactors }),
      })
      
      if (!response.ok) {
        throw new Error(`Failed to clean data: ${response.statusText}`)
      }
      
      const result = await response.json()

      const payload = JSON.stringify({
        cleaned_data: result.cleaned_data,
        columns: result.columns,
        cleaning_summary: result.cleaning_summary,
        factors_applied: anomalyState.selectedFactors,
      })

      const SIZE_LIMIT = 2 * 1024 * 1024 // 2MB

      if (payload.length < SIZE_LIMIT) {
        try {
          localStorage.setItem("cleanedDataResult", payload)
        } catch {
          localStorage.removeItem("cleanedDataResult")
        }
      } else {
        localStorage.removeItem("cleanedDataResult")
      }

      setShowCleanModal(false)
      router.push(`/cleaned-data?dataset_id=${datasetId}&cleaned_id=${result.cleaned_dataset_id}`)
    } catch (error) {
      setAnomalyState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to clean data",
      }))
      setCleaningInProgress(false)
    }
  }
  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return "-"
    if (typeof value === "number") return value.toLocaleString()
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  return (
    <AppLayout>
      {/* Clean Data Modal */}
      <Dialog open={showCleanModal} onOpenChange={setShowCleanModal}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Data Cleaning
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Select the anomalies you want to clean from your dataset.
            </DialogDescription>
          </DialogHeader>

          {anomalyState.loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Detecting anomalies...</p>
            </div>
          )}

          {anomalyState.error && (
            <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="w-5 h-5" />
              <span>{anomalyState.error}</span>
            </div>
          )}

          {!anomalyState.loading && !anomalyState.error && (
            <div className="space-y-4">
              {anomalyState.anomalies.length > 0 && (
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <h4 className="text-sm font-semibold text-foreground mb-2">Detected Issues</h4>
                  <div className="space-y-2">
                    {anomalyState.anomalies.map((anomaly, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {anomaly.description} in <code className="text-primary">{anomaly.column}</code>
                        </span>
                        <span className="text-foreground font-medium">{anomaly.count} issues</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Select Cleaning Actions</h4>
                <div className="space-y-2">
                  {CLEANING_FACTORS.map((factor) => {
                    const isSelected = anomalyState.selectedFactors.includes(factor.id)
                    const relatedAnomaly = anomalyState.anomalies.find(a => a.type === factor.id)
                    
                    return (
                      <button
                        key={factor.id}
                        onClick={() => toggleFactor(factor.id)}
                        className={`w-full p-4 rounded-lg border text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-secondary/30 hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{factor.label}</span>
                              {relatedAnomaly && (
                                <span className="px-2 py-0.5 text-xs bg-destructive/20 text-destructive rounded-full">
                                  {relatedAnomaly.count} found
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{factor.description}</p>
                          </div>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                            isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setShowCleanModal(false)}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCleanData}
                  disabled={anomalyState.selectedFactors.length === 0 || cleaningInProgress}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cleaningInProgress ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cleaning...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Clean Data ({anomalyState.selectedFactors.length} selected)
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="p-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Data Explorer</h1>
            <p className="text-muted-foreground">
              View complete structured data fields and switch between datasets.
            </p>
            {datasetId && (
              <p className="text-sm text-primary mt-2">
                Dataset: <code className="bg-secondary px-2 py-1 rounded">{datasetId}</code>
              </p>
            )}
          </div>
          {datasetId && !data.loading && data.rows.length > 0 && (
            <button
              onClick={handleDetectAnomalies}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Clean Data
            </button>
          )}
        </div>

        {!datasetId && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Dataset Selected</h2>
            <p className="text-muted-foreground max-w-md">
              Please upload a file from the Ingestion page to view its data here.
            </p>
          </div>
        )}

        {datasetId && data.loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading data...</p>
          </div>
        )}

        {datasetId && data.error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Failed to Load Data</h2>
            <p className="text-muted-foreground max-w-md">{data.error}</p>
          </div>
        )}

        {datasetId && !data.loading && !data.error && data.rows.length > 0 && (
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
                  {data.rows.map((row, idx) => (
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

            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/30">
              <span className="text-xs text-muted-foreground tracking-wide">
                SHOWING {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, data.totalCount)} OF {data.totalCount.toLocaleString()} RECORDS
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
                  disabled={pagination.offset + pagination.limit >= data.totalCount}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="mx-2 text-border">|</span>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Export Ledger
                </button>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Audit Sync
                </button>
              </div>
            </div>
          </div>
        )}

        {datasetId && !data.loading && !data.error && data.rows.length === 0 && data.columns.length > 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Data Found</h2>
            <p className="text-muted-foreground max-w-md">
              The dataset exists but contains no records.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}