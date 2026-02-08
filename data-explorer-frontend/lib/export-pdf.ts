'use client'

export async function exportDashboardToPDF(elementId: string, fileName: string = "dashboard-report.pdf") {
  try {
    const element = document.getElementById(elementId)
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`)
    }

    // Dynamically import html2canvas and jsPDF (client-side only)
    const html2canvas = (await import("html2canvas")).default
    const { jsPDF } = await import("jspdf")

    // Capture the element as a canvas with proper styling
    const canvas = await html2canvas(element, {
      allowTaint: true,
      useCORS: true,
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
    })

    const imgData = canvas.toDataURL("image/png")
    const imgWidth = 210 // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    })

    let heightLeft = imgHeight
    let position = 0

    // Add images to PDF, creating new pages as needed
    while (heightLeft >= 0) {
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
      heightLeft -= 297 // A4 height in mm
      if (heightLeft >= 0) {
        pdf.addPage()
        position = heightLeft - imgHeight
      }
    }

    // Save the PDF with the provided filename
    pdf.save(fileName)
  } catch (error) {
    console.error("Error exporting PDF:", error)
    throw error
  }
}
