'use client'

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export async function exportDashboardToPDF(elementId: string, fileName: string = "dashboard-report.pdf") {
  try {
    const element = document.getElementById(elementId)
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`)
    }

    // Capture the element as a canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const imgData = canvas.toDataURL('image/png')
    const imgWidth = 210 // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const pageHeight = 297 // A4 height in mm
    const margin = 5 // 5mm margin

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    let heightLeft = imgHeight
    let position = 0

    // Add image to PDF with pagination
    while (heightLeft > 0) {
      const pageHeightAvailable = pageHeight - 2 * margin
      
      if (heightLeft >= pageHeightAvailable) {
        // We have more content than fits on one page
        const cropHeight = (pageHeightAvailable * canvas.width) / imgWidth
        const sourceY = (canvas.height - heightLeft * (canvas.width / imgWidth)) / canvas.height
        
        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = canvas.width
        croppedCanvas.height = cropHeight
        const ctx = croppedCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            sourceY * canvas.height,
            canvas.width,
            cropHeight,
            0,
            0,
            canvas.width,
            cropHeight
          )
        }

        const croppedImgData = croppedCanvas.toDataURL('image/png')
        pdf.addImage(croppedImgData, 'PNG', margin, margin, imgWidth - 2 * margin, pageHeightAvailable)
        
        heightLeft -= pageHeightAvailable
        if (heightLeft > 0) {
          pdf.addPage()
        }
      } else {
        // Remaining content fits on current page
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth - 2 * margin, imgHeight)
        heightLeft = 0
      }
    }

    // Save the PDF
    pdf.save(fileName)
  } catch (error) {
    console.error("Error exporting PDF:", error)
    throw error
  }
}
