// src/app/api/export-report/route.ts
// Calls the Python PDF generator on the backend service

import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60 // seconds

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    if (!data || !data.meta) {
      return NextResponse.json({ error: "Invalid analysis data" }, { status: 400 })
    }

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
    const response = await fetch(`${backendUrl}/generate-pdf-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || "Backend PDF generation failed")
    }

    const result = await response.json()
    
    // Convert hex string back to bytes
    const pdfBuffer = Buffer.from(result.pdf_data, 'hex')

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="data-analysis-report-${
          new Date().toISOString().split("T")[0]
        }.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    })
  } catch (err) {
    console.error("[export-report] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Report generation failed" },
      { status: 500 }
    )
  }
}