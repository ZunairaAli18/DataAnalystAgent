import { jsPDF } from "jspdf"
import html2canvas from "html2canvas"

export async function exportDashboardToPDF(elementId: string, fileName: string = "dashboard-report.pdf") {
  try {
    const element = document.getElementById(elementId)
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`)
    }

    // Create a temporary container to clone the element
    const clonedContainer = document.createElement("div")
    clonedContainer.innerHTML = element.innerHTML
    clonedContainer.style.position = "absolute"
    clonedContainer.style.left = "-9999px"
    clonedContainer.style.top = "-9999px"
    clonedContainer.style.width = element.offsetWidth + "px"
    clonedContainer.style.backgroundColor = "white"
    clonedContainer.style.color = "black"

    // Copy styles from original element
    const styles = window.getComputedStyle(element)
    Array.from(styles).forEach((property) => {
      clonedContainer.style.setProperty(property, styles.getPropertyValue(property))
    })

    document.body.appendChild(clonedContainer)

    // Convert element to canvas
    const canvas = await html2canvas(clonedContainer, {
      allowTaint: true,
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: 2,
    })

    // Remove temporary container
    document.body.removeChild(clonedContainer)

    // Create PDF
    const imgData = canvas.toDataURL("image/png")
    const imgWidth = 210 // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const pdf = new jsPDF("p", "mm", "a4")

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

    // Save the PDF
    pdf.save(fileName)
  } catch (error) {
    console.error("Error exporting PDF:", error)
    throw error
  }
}
