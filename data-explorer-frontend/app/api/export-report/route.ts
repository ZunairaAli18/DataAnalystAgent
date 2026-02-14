// src/app/api/export-report/route.ts
// Generates a detailed textual PDF report from analysis data.
// Calls the Python reportlab generator as a subprocess.

import { NextRequest, NextResponse } from "next/server"
import { spawn, execSync } from "child_process"
import path from "path"

export const maxDuration = 60 // seconds

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    if (!data || !data.meta) {
      return NextResponse.json({ error: "Invalid analysis data" }, { status: 400 })
    }

    const pdfBuffer = await runPythonReporter(data)
    const pdfBytes = new Uint8Array(pdfBuffer)

    return new NextResponse(pdfBytes, {
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

/** Detect the correct Python executable on Windows, Mac, and Linux */
function getPythonExecutable(): string {
  // On Windows, "python3" is often a Microsoft Store stub — try "python" then "py"
  if (process.platform === "win32") {
    try {
      execSync("python --version", { stdio: "ignore" })
      return "python"
    } catch { /* not found, try next */ }
    try {
      execSync("py --version", { stdio: "ignore" })
      return "py"
    } catch { /* not found */ }
    throw new Error(
      "Python not found. Install it from https://python.org and check " +
      "'Add Python to PATH' during setup."
    )
  }
  // macOS / Linux
  return "python3"
}

function runPythonReporter(data: unknown): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "generate_report.py")

    let pythonExec: string
    try {
      pythonExec = getPythonExecutable()
    } catch (err) {
      return reject(err)
    }

    const python = spawn(pythonExec, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    python.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    python.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk))

    python.on("close", (code) => {
      if (code !== 0) {
        const errMsg = Buffer.concat(errChunks).toString()
        reject(new Error(`Python exited with code ${code}: ${errMsg}`))
      } else {
        resolve(Buffer.concat(chunks))
      }
    })

    python.on("error", (err) => {
      reject(new Error(
        `Failed to start Python ("${pythonExec}"): ${err.message}. ` +
        `Ensure Python is installed and on your system PATH.`
      ))
    })

    python.stdin.write(JSON.stringify(data))
    python.stdin.end()
  })
}