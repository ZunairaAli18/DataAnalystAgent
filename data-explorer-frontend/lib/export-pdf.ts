'use client'

export async function exportDashboardToPDF(elementId: string, fileName: string = "dashboard-report.pdf") {
  try {
    const element = document.getElementById(elementId)
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`)
    }

    // Get the HTML content of the dashboard
    const html = element.outerHTML

    // Call the API endpoint to generate PDF
    const response = await fetch('/api/export-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html,
        fileName,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate PDF')
    }

    // Get the PDF blob
    const blob = await response.blob()

    // Create a download link and trigger download
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error("Error exporting PDF:", error)
    throw error
  }
}
