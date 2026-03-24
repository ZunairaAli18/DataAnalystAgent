"use client"

import React from "react"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { Zap, Upload, CheckCircle, AlertCircle, Loader2, X, ArrowRight, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const PERSISTED_DATASET_KEY = "activeDatasetId"

const tabs = ["Direct Connectors", "File Upload"]

const connectors = [
  { id: "sap", name: "SAP ERP", letter: "S", color: "bg-cyan-500" },
  { id: "shopify", name: "SHOPIFY", letter: "S", color: "bg-cyan-500" },
  { id: "excel", name: "EXCEL / CSV", letter: "E", color: "bg-yellow-500" },
  { id: "sheets", name: "GOOGLE SHEETS", letter: "G", color: "bg-green-500" },
  { id: "pdf", name: "PDF READER", letter: "P", color: "bg-pink-500" },
  { id: "quickbooks", name: "QUICKBOOKS", letter: "Q", color: "bg-green-400" },
]

const SAP_ENTITIES = [
  "SalesOrders",
  "PurchaseOrders",
  "Invoices",
  "Customers",
  "Products",
  "Inventory",
  "FinancialTransactions",
]

const SHOPIFY_RESOURCES = ["orders", "products", "customers", "inventory_items", "transactions"]

type UploadStatus = "idle" | "uploading" | "success" | "error"

interface UploadState {
  file: File | null
  status: UploadStatus
  message: string
  datasetId: string | null
}

interface SAPFormState {
  hostUrl: string
  clientId: string
  username: string
  password: string
  entity: string
}

interface ShopifyFormState {
  shopUrl: string
  token: string
  resource: string
}

interface SheetsFormState {
  spreadsheetId: string
  sheetName: string
  serviceAccountJson: string
}

interface ConnectorStatus {
  status: UploadStatus
  message: string
  datasetId: string | null
}

export default function IngestionPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("Direct Connectors")
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null)

  // SAP state
  const [showSAPModal, setShowSAPModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [sapForm, setSAPForm] = useState<SAPFormState>({
    hostUrl: "",
    clientId: "",
    username: "",
    password: "",
    entity: "SalesOrders",
  })
  const [connectorStatus, setConnectorStatus] = useState<ConnectorStatus>({
    status: "idle",
    message: "",
    datasetId: null,
  })
  // QuickBooks state
const [showQuickBooksModal, setShowQuickBooksModal] = useState(false)
const [showQuickBooksPassword, setShowQuickBooksPassword] = useState(false)

interface QuickBooksFormState {
  clientId: string
  clientSecret: string
  realmId: string
}

const [quickBooksForm, setQuickBooksForm] = useState<QuickBooksFormState>({
  clientId: "",
  clientSecret: "",
  realmId: "",
})

const [quickBooksStatus, setQuickBooksStatus] = useState<ConnectorStatus>({
  status: "idle",
  message: "",
  datasetId: null,
})
  // Shopify state
  const [showShopifyModal, setShowShopifyModal] = useState(false)
  const [shopifyForm, setShopifyForm] = useState<ShopifyFormState>({
    shopUrl: "",
    token: "",
    resource: "orders",
  })
  const [shopifyStatus, setShopifyStatus] = useState<ConnectorStatus>({
    status: "idle",
    message: "",
    datasetId: null,
  })

  // Google Sheets state
  const [showSheetsModal, setShowSheetsModal] = useState(false)
  const [showSheetsPassword, setShowSheetsPassword] = useState(false)
  const [sheetsForm, setSheetsForm] = useState<SheetsFormState>({
    spreadsheetId: "",
    sheetName: "Sheet1",
    serviceAccountJson: "",
  })
  const [sheetsStatus, setSheetsStatus] = useState<ConnectorStatus>({
    status: "idle",
    message: "",
    datasetId: null,
  })

  // File upload state
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    status: "idle",
    message: "",
    datasetId: null,
  })
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Connector click handler ──────────────────────────────────────────────
  const handleConnectorClick = (connectorId: string) => {
    setSelectedConnector(connectorId)
    if (connectorId === "pdf" || connectorId === "excel") {
    setActiveTab("File Upload")
    setSelectedConnector(connectorId) // optional if you want to highlight it
    return
  }
    if (connectorId === "sap") {
      setShowSAPModal(true)
      setConnectorStatus({ status: "idle", message: "", datasetId: null })
    }
    if (connectorId === "quickbooks") {
  setShowQuickBooksModal(true)
  setQuickBooksStatus({ status: "idle", message: "", datasetId: null })
}
    if (connectorId === "shopify") {
      setShowShopifyModal(true)
      setShopifyStatus({ status: "idle", message: "", datasetId: null })
    }
    if (connectorId === "sheets") {
      setShowSheetsModal(true)
      setSheetsStatus({ status: "idle", message: "", datasetId: null })
    }
  }

  // ── SAP handlers ─────────────────────────────────────────────────────────
  const handleSAPSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sapForm.hostUrl || !sapForm.clientId || !sapForm.username || !sapForm.password) {
      setConnectorStatus({ status: "error", message: "All fields are required.", datasetId: null })
      return
    }
    setConnectorStatus({ status: "uploading", message: "Connecting to SAP...", datasetId: null })
    try {
      const formData = new FormData()
      formData.append("host_url", sapForm.hostUrl)
      formData.append("client_id", sapForm.clientId)
      formData.append("username", sapForm.username)
      formData.append("password", sapForm.password)
      formData.append("entity", sapForm.entity)
      const response = await fetch(`${API_BASE_URL}/ingest/sap`, { method: "POST", body: formData })
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.detail || `Connection failed: ${response.statusText}`)
      }
      const data = await response.json()
      if (data.dataset_id) localStorage.setItem(PERSISTED_DATASET_KEY, data.dataset_id)
      setConnectorStatus({ status: "success", message: data.message || "SAP connected successfully!", datasetId: data.dataset_id })
    } catch (error) {
      setConnectorStatus({ status: "error", message: error instanceof Error ? error.message : "Connection failed. Please try again.", datasetId: null })
    }
  }

  const resetSAPModal = () => {
    setShowSAPModal(false)
    setSelectedConnector(null)
    setSAPForm({ hostUrl: "", clientId: "", username: "", password: "", entity: "SalesOrders" })
    setConnectorStatus({ status: "idle", message: "", datasetId: null })
    setShowPassword(false)
  }
  const handleQuickBooksSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  if (!quickBooksForm.clientId || !quickBooksForm.clientSecret || !quickBooksForm.realmId) {
    setQuickBooksStatus({ status: "error", message: "All fields are required.", datasetId: null })
    return
  }

  setQuickBooksStatus({ status: "uploading", message: "Connecting to QuickBooks...", datasetId: null })

  try {
    const formData = new FormData()
    formData.append("client_id", quickBooksForm.clientId)
    formData.append("client_secret", quickBooksForm.clientSecret)
    formData.append("realm_id", quickBooksForm.realmId)

    const response = await fetch(`${API_BASE_URL}/ingest/quickbooks`, { method: "POST", body: formData })
    if (!response.ok) {
      const err = await response.json().catch(() => null)
      throw new Error(err?.detail || `Connection failed: ${response.statusText}`)
    }

    const data = await response.json()
    if (data.dataset_id) localStorage.setItem(PERSISTED_DATASET_KEY, data.dataset_id)
    setQuickBooksStatus({ status: "success", message: data.message || "QuickBooks connected successfully!", datasetId: data.dataset_id })
  } catch (error) {
    setQuickBooksStatus({ status: "error", message: error instanceof Error ? error.message : "Connection failed. Please try again.", datasetId: null })
  }
}
  // ── Shopify handlers ──────────────────────────────────────────────────────
  const handleShopifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shopifyForm.shopUrl || !shopifyForm.token) {
      setShopifyStatus({ status: "error", message: "Shop URL and Access Token are required.", datasetId: null })
      return
    }
    setShopifyStatus({ status: "uploading", message: "Connecting to Shopify...", datasetId: null })
    try {
      const formData = new FormData()
      formData.append("shop_url", shopifyForm.shopUrl)
      formData.append("token", shopifyForm.token)
      formData.append("resource", shopifyForm.resource)
      const response = await fetch(`${API_BASE_URL}/ingest/shopify`, { method: "POST", body: formData })
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.detail || `Connection failed: ${response.statusText}`)
      }
      const data = await response.json()
      if (data.dataset_id) localStorage.setItem(PERSISTED_DATASET_KEY, data.dataset_id)
      setShopifyStatus({ status: "success", message: data.message || "Shopify connected successfully!", datasetId: data.dataset_id })
    } catch (error) {
      setShopifyStatus({ status: "error", message: error instanceof Error ? error.message : "Connection failed. Please try again.", datasetId: null })
    }
  }

  const resetShopifyModal = () => {
    setShowShopifyModal(false)
    setSelectedConnector(null)
    setShopifyForm({ shopUrl: "", token: "", resource: "orders" })
    setShopifyStatus({ status: "idle", message: "", datasetId: null })
  }

  // ── Google Sheets handlers ────────────────────────────────────────────────
  const handleSheetsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sheetsForm.spreadsheetId || !sheetsForm.serviceAccountJson) {
      setSheetsStatus({ status: "error", message: "Spreadsheet ID and Service Account JSON are required.", datasetId: null })
      return
    }

    // Validate JSON before sending
    try {
      JSON.parse(sheetsForm.serviceAccountJson)
    } catch {
      setSheetsStatus({ status: "error", message: "Service Account JSON is not valid JSON. Please check the format.", datasetId: null })
      return
    }

    setSheetsStatus({ status: "uploading", message: "Connecting to Google Sheets...", datasetId: null })
    try {
      const formData = new FormData()
      formData.append("spreadsheet_id", sheetsForm.spreadsheetId)
      formData.append("sheet_name", sheetsForm.sheetName || "Sheet1")
      formData.append("service_account_json", sheetsForm.serviceAccountJson)

      const response = await fetch(`${API_BASE_URL}/ingest/sheets`, { method: "POST", body: formData })
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.detail || `Connection failed: ${response.statusText}`)
      }
      const data = await response.json()
      if (data.dataset_id) localStorage.setItem(PERSISTED_DATASET_KEY, data.dataset_id)
      setSheetsStatus({ status: "success", message: data.message || "Google Sheets connected successfully!", datasetId: data.dataset_id })
    } catch (error) {
      setSheetsStatus({ status: "error", message: error instanceof Error ? error.message : "Connection failed. Please try again.", datasetId: null })
    }
  }

  const resetSheetsModal = () => {
    setShowSheetsModal(false)
    setSelectedConnector(null)
    setSheetsForm({ spreadsheetId: "", sheetName: "Sheet1", serviceAccountJson: "" })
    setSheetsStatus({ status: "idle", message: "", datasetId: null })
    setShowSheetsPassword(false)
  }
  const resetQuickBooksModal = () => {
  setShowQuickBooksModal(false)
  setSelectedConnector(null)
  setQuickBooksForm({ clientId: "", clientSecret: "", realmId: "" })
  setQuickBooksStatus({ status: "idle", message: "", datasetId: null })
  setShowQuickBooksPassword(false)
}
  // ── File upload handlers ──────────────────────────────────────────────────
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const validTypes = [".csv", ".xlsx", ".xls", ".pdf"]
    const isValid = validTypes.some(type => file.name.toLowerCase().endsWith(type))
    if (!isValid) {
      setUploadState({ file: null, status: "error", message: "Invalid file type. Please upload CSV, Excel, or PDF files.", datasetId: null })
      return
    }
    setUploadState({ file, status: "idle", message: "", datasetId: null })
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files) }

  const handleUpload = async () => {
    if (!uploadState.file) return
    setUploadState(prev => ({ ...prev, status: "uploading", message: "Uploading file..." }))
    try {
      const formData = new FormData()
      formData.append("file", uploadState.file)
      const response = await fetch(`${API_BASE_URL}/ingest/upload`, { method: "POST", body: formData })
      if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`)
      const data = await response.json()
      if (data.dataset_id) localStorage.setItem(PERSISTED_DATASET_KEY, data.dataset_id)
      setUploadState(prev => ({ ...prev, status: "success", message: data.message || "File uploaded successfully!", datasetId: data.dataset_id }))
    } catch (error) {
      setUploadState(prev => ({ ...prev, status: "error", message: error instanceof Error ? error.message : "Upload failed. Please try again." }))
    }
  }

  const resetUpload = () => {
    setUploadState({ file: null, status: "idle", message: "", datasetId: null })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Data Ingestion Pipeline</h1>
          <p className="text-muted-foreground">Connect directly to SAP, Shopify, Excel, QuickBooks and more.</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all",
                activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
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
                onClick={() => handleConnectorClick(connector.id)}
                className={cn(
                  "flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-card hover:border-primary/50 transition-all",
                  selectedConnector === connector.id && "border-primary ring-1 ring-primary"
                )}
              >
                <div className={cn("w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-bold text-foreground mb-4", connector.color)}>
                  {connector.letter}
                </div>
                <span className="text-sm font-medium text-foreground tracking-wide">{connector.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* File Upload Tab */}
        {activeTab === "File Upload" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={(e) => handleFileSelect(e.target.files)} className="hidden" />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer",
                isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                uploadState.status === "error" && "border-destructive"
              )}
            >
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium mb-2">{isDragging ? "Drop your file here" : "Drop files here or click to upload"}</p>
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
                      <p className="text-sm text-muted-foreground">{(uploadState.file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); resetUpload() }} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                {uploadState.status === "idle" && (
                  <button onClick={handleUpload} className="w-full mt-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors">Upload File</button>
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
                        <p className="text-sm text-muted-foreground">Dataset ID: <code className="bg-secondary px-2 py-1 rounded">{uploadState.datasetId}</code></p>
                        <button onClick={() => router.push(`/view-data?dataset_id=${uploadState.datasetId}`)} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                          View Data <ArrowRight className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                    <button onClick={resetUpload} className="w-full py-3 bg-secondary text-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-colors">Upload Another File</button>
                  </div>
                )}
                {uploadState.status === "error" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-destructive"><AlertCircle className="w-5 h-5" /><span>{uploadState.message}</span></div>
                    <button onClick={resetUpload} className="w-full py-3 bg-secondary text-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-colors">Try Again</button>
                  </div>
                )}
              </div>
            )}
            {!uploadState.file && uploadState.status === "error" && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-4 rounded-xl">
                <AlertCircle className="w-5 h-5" /><span>{uploadState.message}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center mt-12">
          <button className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors">
            INITIATE AI AUDIT <Zap className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── SAP ERP Modal ───────────────────────────────────────────────────── */}
      {showSAPModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetSAPModal} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500 flex items-center justify-center text-xl font-bold text-white">S</div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Connect SAP ERP</h2>
                  <p className="text-xs text-muted-foreground">Enter your SAP system credentials</p>
                </div>
              </div>
              <button onClick={resetSAPModal} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSAPSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">SAP Host URL</label>
                <input type="url" placeholder="https://your-sap-system.example.com" value={sapForm.hostUrl}
                  onChange={(e) => setSAPForm(prev => ({ ...prev, hostUrl: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={connectorStatus.status === "uploading" || connectorStatus.status === "success"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Service / Client ID</label>
                <input type="text" placeholder="e.g. API_SALES_ORDER_SRV" value={sapForm.clientId}
                  onChange={(e) => setSAPForm(prev => ({ ...prev, clientId: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={connectorStatus.status === "uploading" || connectorStatus.status === "success"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Username</label>
                <input type="text" placeholder="SAP username" value={sapForm.username}
                  onChange={(e) => setSAPForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={connectorStatus.status === "uploading" || connectorStatus.status === "success"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} placeholder="SAP password" value={sapForm.password}
                    onChange={(e) => setSAPForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-4 py-2.5 pr-10 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    disabled={connectorStatus.status === "uploading" || connectorStatus.status === "success"} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Data Entity</label>
                <select value={sapForm.entity} onChange={(e) => setSAPForm(prev => ({ ...prev, entity: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={connectorStatus.status === "uploading" || connectorStatus.status === "success"}>
                  {SAP_ENTITIES.map((entity) => <option key={entity} value={entity}>{entity}</option>)}
                </select>
              </div>
              {connectorStatus.status === "error" && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{connectorStatus.message}</span>
                </div>
              )}
              {connectorStatus.status === "success" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-3 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{connectorStatus.message}</span>
                  </div>
                  {connectorStatus.datasetId && (
                    <p className="text-xs text-muted-foreground">Dataset ID: <code className="bg-secondary px-1.5 py-0.5 rounded">{connectorStatus.datasetId}</code></p>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                {connectorStatus.status === "success" ? (
                  <>
                    <button type="button" onClick={resetSAPModal} className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors text-sm">Close</button>
                    <button type="button" onClick={() => router.push(`/view-data?dataset_id=${connectorStatus.datasetId}`)}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm flex items-center justify-center gap-2">
                      View Data <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={resetSAPModal} className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors text-sm">Cancel</button>
                    <button type="submit" disabled={connectorStatus.status === "uploading"}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2">
                      {connectorStatus.status === "uploading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : "Connect SAP"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Shopify Modal ───────────────────────────────────────────────────── */}
      {showShopifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetShopifyModal} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500 flex items-center justify-center text-xl font-bold text-white">S</div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Connect Shopify</h2>
                  <p className="text-xs text-muted-foreground">Enter your Shopify store credentials</p>
                </div>
              </div>
              <button onClick={resetShopifyModal} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleShopifySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Shop URL</label>
                <div className="flex items-center rounded-lg bg-secondary border border-border overflow-hidden focus-within:ring-1 focus-within:ring-primary">
                  <span className="px-3 text-sm text-muted-foreground border-r border-border py-2.5 bg-secondary/80 flex-shrink-0">https://</span>
                  <input type="text" placeholder="your-store.myshopify.com" value={shopifyForm.shopUrl}
                    onChange={(e) => setShopifyForm(prev => ({ ...prev, shopUrl: e.target.value }))}
                    className="flex-1 px-3 py-2.5 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-sm"
                    disabled={shopifyStatus.status === "uploading" || shopifyStatus.status === "success"} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">e.g. my-store.myshopify.com</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Admin API Access Token</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} placeholder="shpat_xxxxxxxxxxxxxxxxxxxx" value={shopifyForm.token}
                    onChange={(e) => setShopifyForm(prev => ({ ...prev, token: e.target.value }))}
                    className="w-full px-4 py-2.5 pr-10 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                    disabled={shopifyStatus.status === "uploading" || shopifyStatus.status === "success"} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Found in Shopify Admin → Settings → Apps → Develop apps</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Data Resource</label>
                <select value={shopifyForm.resource} onChange={(e) => setShopifyForm(prev => ({ ...prev, resource: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={shopifyStatus.status === "uploading" || shopifyStatus.status === "success"}>
                  {SHOPIFY_RESOURCES.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1).replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How to get your Access Token:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Go to Shopify Admin → Settings → Apps</li>
                  <li>Click "Develop apps" → Create an app</li>
                  <li>Configure Admin API scopes</li>
                  <li>Install the app and copy the token</li>
                </ol>
              </div>
              {shopifyStatus.status === "error" && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{shopifyStatus.message}</span>
                </div>
              )}
              {shopifyStatus.status === "success" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-3 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{shopifyStatus.message}</span>
                  </div>
                  {shopifyStatus.datasetId && (
                    <p className="text-xs text-muted-foreground">Dataset ID: <code className="bg-secondary px-1.5 py-0.5 rounded">{shopifyStatus.datasetId}</code></p>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                {shopifyStatus.status === "success" ? (
                  <>
                    <button type="button" onClick={resetShopifyModal} className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors text-sm">Close</button>
                    <button type="button" onClick={() => router.push(`/view-data?dataset_id=${shopifyStatus.datasetId}`)}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm flex items-center justify-center gap-2">
                      View Data <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={resetShopifyModal} className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors text-sm">Cancel</button>
                    <button type="submit" disabled={shopifyStatus.status === "uploading"}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2">
                      {shopifyStatus.status === "uploading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : "Connect Shopify"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Google Sheets Modal ─────────────────────────────────────────────── */}
      {showSheetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetSheetsModal} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center text-xl font-bold text-white">G</div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Connect Google Sheets</h2>
                  <p className="text-xs text-muted-foreground">Enter your spreadsheet details</p>
                </div>
              </div>
              <button onClick={resetSheetsModal} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSheetsSubmit} className="p-6 space-y-4">

              {/* Spreadsheet ID */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Spreadsheet ID</label>
                <input
                  type="text"
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  value={sheetsForm.spreadsheetId}
                  onChange={(e) => setSheetsForm(prev => ({ ...prev, spreadsheetId: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={sheetsStatus.status === "uploading" || sheetsStatus.status === "success"}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Found in the URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
                </p>
              </div>

              {/* Sheet Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Sheet Name</label>
                <input
                  type="text"
                  placeholder="Sheet1"
                  value={sheetsForm.sheetName}
                  onChange={(e) => setSheetsForm(prev => ({ ...prev, sheetName: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  disabled={sheetsStatus.status === "uploading" || sheetsStatus.status === "success"}
                />
                <p className="text-xs text-muted-foreground mt-1">The tab name at the bottom of your spreadsheet (default: Sheet1)</p>
              </div>

              {/* Service Account JSON */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Service Account JSON</label>
                <div className="relative">
                  <textarea
                    placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                    value={sheetsForm.serviceAccountJson}
                    onChange={(e) => setSheetsForm(prev => ({ ...prev, serviceAccountJson: e.target.value }))}
                    rows={showSheetsPassword ? 8 : 4}
                    className="w-full px-4 py-2.5 pr-10 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs font-mono resize-none"
                    disabled={sheetsStatus.status === "uploading" || sheetsStatus.status === "success"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSheetsPassword(!showSheetsPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    title={showSheetsPassword ? "Collapse" : "Expand"}
                  >
                    {showSheetsPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Info box */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How to get your Service Account JSON:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Go to Google Cloud Console → IAM &amp; Admin → Service Accounts</li>
                  <li>Create a service account and add a JSON key</li>
                  <li>Share your spreadsheet with the service account email</li>
                  <li>Paste the downloaded JSON here</li>
                </ol>
              </div>

              {/* Status messages */}
              {sheetsStatus.status === "error" && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{sheetsStatus.message}</span>
                </div>
              )}
              {sheetsStatus.status === "success" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-3 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{sheetsStatus.message}</span>
                  </div>
                  {sheetsStatus.datasetId && (
                    <p className="text-xs text-muted-foreground">
                      Dataset ID: <code className="bg-secondary px-1.5 py-0.5 rounded">{sheetsStatus.datasetId}</code>
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                {sheetsStatus.status === "success" ? (
                  <>
                    <button type="button" onClick={resetSheetsModal}
                      className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors text-sm">
                      Close
                    </button>
                    <button type="button" onClick={() => router.push(`/view-data?dataset_id=${sheetsStatus.datasetId}`)}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm flex items-center justify-center gap-2">
                      View Data <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={resetSheetsModal}
                      className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors text-sm">
                      Cancel
                    </button>
                    <button type="submit" disabled={sheetsStatus.status === "uploading"}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2">
                      {sheetsStatus.status === "uploading"
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                        : "Connect Sheets"
                      }
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {showQuickBooksModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetQuickBooksModal} />
    <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl">
      
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-400 flex items-center justify-center text-xl font-bold text-white">Q</div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Connect QuickBooks</h2>
            <p className="text-xs text-muted-foreground">Enter your QuickBooks credentials</p>
          </div>
        </div>
        <button onClick={resetQuickBooksModal} className="p-2 hover:bg-secondary rounded-lg transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <form onSubmit={handleQuickBooksSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Client ID</label>
          <input type="text" placeholder="Your QuickBooks Client ID" value={quickBooksForm.clientId}
            onChange={(e) => setQuickBooksForm(prev => ({ ...prev, clientId: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm"
            disabled={quickBooksStatus.status === "uploading" || quickBooksStatus.status === "success"} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Client Secret</label>
          <div className="relative">
            <input type={showQuickBooksPassword ? "text" : "password"} placeholder="Your QuickBooks Client Secret" value={quickBooksForm.clientSecret}
              onChange={(e) => setQuickBooksForm(prev => ({ ...prev, clientSecret: e.target.value }))}
              className="w-full px-4 py-2.5 pr-10 rounded-lg bg-secondary border border-border text-foreground text-sm"
              disabled={quickBooksStatus.status === "uploading" || quickBooksStatus.status === "success"} />
            <button type="button" onClick={() => setShowQuickBooksPassword(!showQuickBooksPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showQuickBooksPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Realm ID</label>
          <input type="text" placeholder="Your QuickBooks Realm ID" value={quickBooksForm.realmId}
            onChange={(e) => setQuickBooksForm(prev => ({ ...prev, realmId: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-sm"
            disabled={quickBooksStatus.status === "uploading" || quickBooksStatus.status === "success"} />
        </div>

        {quickBooksStatus.status === "error" && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{quickBooksStatus.message}</span>
          </div>
        )}
        {quickBooksStatus.status === "success" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-3 rounded-lg text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{quickBooksStatus.message}</span>
            </div>
            {quickBooksStatus.datasetId && (
              <p className="text-xs text-muted-foreground">Dataset ID: <code className="bg-secondary px-1.5 py-0.5 rounded">{quickBooksStatus.datasetId}</code></p>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {quickBooksStatus.status === "success" ? (
            <>
              <button type="button" onClick={resetQuickBooksModal} className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 text-sm">Close</button>
              <button type="button" onClick={() => router.push(`/view-data?dataset_id=${quickBooksStatus.datasetId}`)}
                className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 text-sm flex items-center justify-center gap-2">
                View Data <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={resetQuickBooksModal} className="flex-1 py-2.5 bg-secondary text-foreground font-medium rounded-lg hover:bg-secondary/80 text-sm">Cancel</button>
              <button type="submit" disabled={quickBooksStatus.status === "uploading"}
                className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2">
                {quickBooksStatus.status === "uploading" ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : "Connect QuickBooks"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  </div>
)}
    </AppLayout>
  )
}