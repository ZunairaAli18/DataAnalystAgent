"use client"

import React from "react"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { Zap, Upload, CheckCircle, AlertCircle, Loader2, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const PERSISTED_DATASET_KEY = "activeDatasetId"

const tabs = ["Direct Connectors", "File Upload", "Raw Data Paste"]

const connectors = [
  { id: "sap", name: "SAP ERP", letter: "S", color: "bg-cyan-500" },
  { id: "shopify", name: "SHOPIFY", letter: "S", color: "bg-cyan-500" },
  { id: "excel", name: "EXCEL / CSV", letter: "E", color: "bg-yellow-500" },
  { id: "sheets", name: "GOOGLE SHEETS", letter: "G", color: "bg-green-500" },
  { id: "pdf", name: "PDF READER", letter: "P", color: "bg-pink-500" },
  { id: "quickbooks", name: "QUICKBOOKS", letter: "Q", color: "bg-green-400" },
]

type UploadStatus = "idle" | "uploading" | "success" | "error"

interface UploadState {
  file: File | null
  status: UploadStatus
  message: string
  datasetId: string | null
}

export default function IngestionPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("Direct Connectors")
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    status: "idle",
    message: "",
    datasetId: null,
  })
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    
    const validTypes = [".csv", ".xlsx", ".xls", ".pdf"]
    const isValid = validTypes.some(type => file.name.toLowerCase().endsWith(type))
    
    if (!isValid) {
      setUploadState({
        file: null,
        status: "error",
        message: "Invalid file type. Please upload CSV, Excel, or PDF files.",
        datasetId: null,
      })
      return
    }

    setUploadState({
      file,
      status: "idle",
      message: "",
      datasetId: null,
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleUpload = async () => {
    if (!uploadState.file) return

    setUploadState(prev => ({ ...prev, status: "uploading", message: "Uploading file..." }))

    try {
      const formData = new FormData()
      formData.append("file", uploadState.file)

      const response = await fetch(`${API_BASE_URL}/ingest/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }

      const data = await response.json()

      // Replace the persisted dataset with the newly uploaded one
      if (data.dataset_id) {
        localStorage.setItem(PERSISTED_DATASET_KEY, data.dataset_id)
      }
      
      setUploadState(prev => ({
        ...prev,
        status: "success",
        message: data.message || "File uploaded successfully!",
        datasetId: data.dataset_id,
      }))
    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed. Please try again.",
      }))
    }
  }

  const resetUpload = () => {
    setUploadState({
      file: null,
      status: "idle",
      message: "",
      datasetId: null,
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Data Ingestion Pipeline</h1>
          <p className="text-muted-foreground">
            Connect directly to SAP, Shopify, Excel, QuickBooks and more.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Connectors Grid */}
        {activeTab === "Direct Connectors" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => setSelectedConnector(connector.id)}
                className={cn(
                  "flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-card hover:border-primary/50 transition-all",
                  selectedConnector === connector.id && "border-primary ring-1 ring-primary"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-bold text-foreground mb-4",
                  connector.color
                )}>
                  {connector.letter}
                </div>
                <span className="text-sm font-medium text-foreground tracking-wide">{connector.name}</span>
              </button>
            ))}
          </div>
        )}

        {activeTab === "File Upload" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50",
                uploadState.status === "error" && "border-destructive"
              )}
            >
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium mb-2">
                {isDragging ? "Drop your file here" : "Drop files here or click to upload"}
              </p>
              <p className="text-sm text-muted-foreground">Supports CSV, Excel, and PDF files</p>
            </div>

            {uploadState.file && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">{uploadState.file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(uploadState.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      resetUpload()
                    }}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {uploadState.status === "idle" && (
                  <button
                    onClick={handleUpload}
                    className="w-full mt-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Upload File
                  </button>
                )}

                {uploadState.status === "uploading" && (
                  <div className="mt-4 flex items-center justify-center gap-2 py-3 text-primary">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{uploadState.message}</span>
                  </div>
                )}

                {uploadState.status === "success" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-5 h-5" />
                      <span>{uploadState.message}</span>
                    </div>
                    {uploadState.datasetId && (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Dataset ID: <code className="bg-secondary px-2 py-1 rounded">{uploadState.datasetId}</code>
                        </p>
                        <button
                          onClick={() => router.push(`/view-data?dataset_id=${uploadState.datasetId}`)}
                          className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                          View Data
                          <ArrowRight className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                    <button
                      onClick={resetUpload}
                      className="w-full py-3 bg-secondary text-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-colors"
                    >
                      Upload Another File
                    </button>
                  </div>
                )}

                {uploadState.status === "error" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-5 h-5" />
                      <span>{uploadState.message}</span>
                    </div>
                    <button
                      onClick={resetUpload}
                      className="w-full py-3 bg-secondary text-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {!uploadState.file && uploadState.status === "error" && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-4 rounded-xl">
                <AlertCircle className="w-5 h-5" />
                <span>{uploadState.message}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === "Raw Data Paste" && (
          <div className="max-w-2xl mx-auto">
            <textarea
              placeholder="Paste your raw data here (CSV, JSON, or tab-separated values)..."
              className="w-full h-64 p-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
        )}

        <div className="flex justify-center mt-12">
          <button className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors">
            INITIATE AI AUDIT
            <Zap className="w-5 h-5" />
          </button>
        </div>
      </div>
    </AppLayout>
  )
}