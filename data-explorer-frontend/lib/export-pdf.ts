'use client'

export async function exportDashboardToPDF(elementId: string, fileName: string = "dashboard-report.pdf") {
  try {
    const element = document.getElementById(elementId)
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`)
    }

    // Create a new window for printing
    const printWindow = window.open("", "", "width=1200,height=800")
    if (!printWindow) {
      throw new Error("Unable to open print window. Please check your browser's popup settings.")
    }

    // Clone the element for print
    const clonedElement = element.cloneNode(true) as HTMLElement

    // Get all stylesheets
    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n")
        } catch {
          return ""
        }
      })
      .join("\n")

    // Write HTML to print window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${fileName}</title>
          <style>
            ${styles}
            body {
              margin: 0;
              padding: 20px;
              font-family: system-ui, -apple-system, sans-serif;
              background: white;
              color: black;
            }
            @media print {
              body { margin: 0; padding: 10px; }
              @page { margin: 0.5in; }
            }
          </style>
        </head>
        <body>
          ${clonedElement.outerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()

    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print()
      // Note: In most browsers, you can't directly close the print dialog,
      // so users will need to close the print window themselves after saving
    }, 500)
  } catch (error) {
    console.error("Error exporting PDF:", error)
    throw error
  }
}
