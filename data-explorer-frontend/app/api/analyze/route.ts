import { NextRequest, NextResponse } from "next/server"

interface ColumnMeta {
  key: string
  label: string
  dtype?: string
}

interface CleanedRow {
  [key: string]: unknown
}

interface AnalysisRequest {
  columns: ColumnMeta[]
  rows: CleanedRow[]
  dataset_id: string
}

interface KPI {
  label: string
  value: string
  change: number | null
  positive: boolean
  color: string
}

interface ChartData {
  type: "line" | "bar" | "pie"
  title: string
  description: string
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  color: string
}

function detectNumericColumns(columns: ColumnMeta[], rows: CleanedRow[]): string[] {
  return columns
    .filter((col) => {
      if (col.dtype && (col.dtype.includes("Int") || col.dtype.includes("Float"))) return true
      // Sample first 20 rows to check if values are numeric
      const sample = rows.slice(0, 20)
      return sample.every((row) => {
        const val = row[col.key]
        if (val === null || val === undefined || val === "") return true
        return !isNaN(Number(val))
      })
    })
    .map((col) => col.key)
}

function detectCategoricalColumns(
  columns: ColumnMeta[],
  rows: CleanedRow[],
  numericCols: string[]
): string[] {
  return columns
    .filter((col) => {
      if (numericCols.includes(col.key)) return false
      const uniqueValues = new Set(rows.map((r) => String(r[col.key] ?? "")))
      return uniqueValues.size > 1 && uniqueValues.size <= 50
    })
    .map((col) => col.key)
}

function detectDateColumns(columns: ColumnMeta[], rows: CleanedRow[]): string[] {
  const dateKeywords = ["date", "time", "timestamp", "created", "updated", "year", "month", "day"]
  return columns
    .filter((col) => {
      const name = col.key.toLowerCase()
      if (dateKeywords.some((kw) => name.includes(kw))) return true
      if (col.dtype && (col.dtype.includes("Date") || col.dtype.includes("Datetime"))) return true
      return false
    })
    .map((col) => col.key)
}

function computeKPIs(
  numericCols: string[],
  rows: CleanedRow[]
): KPI[] {
  const colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff"]
  const kpis: KPI[] = []

  // Total records KPI
  kpis.push({
    label: "TOTAL RECORDS",
    value: rows.length.toLocaleString(),
    change: null,
    positive: true,
    color: colors[0],
  })

  // Numeric column KPIs (sum, avg for top columns)
  const topNumeric = numericCols.slice(0, 3)
  topNumeric.forEach((col, idx) => {
    const values = rows
      .map((r) => Number(r[col]))
      .filter((v) => !isNaN(v))
    
    if (values.length === 0) return

    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const max = Math.max(...values)
    const min = Math.min(...values)

    // Format value
    let displayValue: string
    if (sum > 1_000_000) {
      displayValue = `${(sum / 1_000_000).toFixed(2)}M`
    } else if (sum > 1_000) {
      displayValue = `${(sum / 1_000).toFixed(2)}K`
    } else {
      displayValue = sum.toFixed(2)
    }

    kpis.push({
      label: col.toUpperCase().replace(/_/g, " "),
      value: displayValue,
      change: null,
      positive: true,
      color: colors[(idx + 1) % colors.length],
    })

    // Add avg as a separate KPI if we have room
    if (kpis.length < 5) {
      kpis.push({
        label: `AVG ${col.toUpperCase().replace(/_/g, " ")}`,
        value: avg > 1000 ? `${(avg / 1000).toFixed(2)}K` : avg.toFixed(2),
        change: null,
        positive: true,
        color: colors[(idx + 2) % colors.length],
      })
    }
  })

  return kpis.slice(0, 4) // Max 4 KPIs
}

function generateCharts(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  rows: CleanedRow[]
): ChartData[] {
  const charts: ChartData[] = []
  const chartColors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]

  // 1. Time-series line chart if date column exists
  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateCol = dateCols[0]
    const metricCol = numericCols[0]

    // Group by date and sum
    const grouped: Record<string, number> = {}
    rows.forEach((row) => {
      const dateVal = String(row[dateCol] ?? "")
      // Simplify date to month/year for grouping
      const key = dateVal.substring(0, 7) || dateVal // YYYY-MM or full value
      if (!grouped[key]) grouped[key] = 0
      grouped[key] += Number(row[metricCol]) || 0
    })

    const sortedKeys = Object.keys(grouped).sort()
    const lineData = sortedKeys.slice(0, 24).map((key) => ({
      label: key,
      value: Math.round(grouped[key] * 100) / 100,
    }))

    if (lineData.length > 1) {
      const lineValues = lineData.map((d) => d.value)
      const lineMax = Math.max(...lineValues)
      const lineMin = Math.min(...lineValues)
      const lineTotal = lineValues.reduce((a, b) => a + b, 0)
      const peakPeriod = lineData.find((d) => d.value === lineMax)?.label ?? ""
      const lowPeriod = lineData.find((d) => d.value === lineMin)?.label ?? ""
      charts.push({
        type: "line",
        title: `${metricCol.replace(/_/g, " ")} Over Time`,
        description: `Tracks ${metricCol.replace(/_/g, " ")} across ${lineData.length} time periods. Peak of ${lineMax.toLocaleString()} at ${peakPeriod}, lowest of ${lineMin.toLocaleString()} at ${lowPeriod}. Total: ${lineTotal.toLocaleString()}.`,
        data: lineData,
        xKey: "label",
        yKey: "value",
        color: chartColors[0],
      })
    }
  }

  // 2. Bar chart for categorical breakdowns (with numeric metric)
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    const catCol = categoricalCols[0]
    const metricCol = numericCols[0]

    const grouped: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown")
      if (!grouped[key]) grouped[key] = 0
      grouped[key] += Number(row[metricCol]) || 0
    })

    const barData = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))

    const barTotal = barData.reduce((a, b) => a + b.value, 0)
    const topCategory = barData[0]
    const topPct = barTotal > 0 ? ((topCategory.value / barTotal) * 100).toFixed(1) : "0"

    charts.push({
      type: "bar",
      title: `${metricCol.replace(/_/g, " ")} by ${catCol.replace(/_/g, " ")}`,
      description: `Compares ${metricCol.replace(/_/g, " ")} across ${barData.length} ${catCol.replace(/_/g, " ")} categories. "${topCategory.name}" leads with ${topCategory.value.toLocaleString()} (${topPct}% of shown total). Total across top ${barData.length}: ${barTotal.toLocaleString()}.`,
      data: barData,
      xKey: "name",
      yKey: "value",
      color: chartColors[1],
    })
  }

  // 2b. Categorical frequency chart (count-based for categorical-only data)
  if (categoricalCols.length > 0 && numericCols.length === 0) {
    const catCol = categoricalCols[0]
    
    // Count occurrences
    const counts: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown")
      counts[key] = (counts[key] || 0) + 1
    })

    const pieData = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({
        name,
        value: count,
      }))

    const total = pieData.reduce((a, b) => a + b.value, 0)
    const topItem = pieData[0]
    const topPct = total > 0 ? ((topItem.value / total) * 100).toFixed(1) : "0"

    charts.push({
      type: "pie",
      title: `${catCol.replace(/_/g, " ")} Distribution`,
      description: `Shows proportional breakdown of ${catCol.replace(/_/g, " ")} across ${pieData.length} categories. "${topItem.name}" holds the largest share at ${topPct}% (${topItem.value.toLocaleString()} records).`,
      data: pieData,
      xKey: "name",
      yKey: "value",
      color: chartColors[0],
    })
  }

  // 3. Second bar chart with a different categorical + numeric combo
  if (categoricalCols.length > 1 && numericCols.length > 0) {
    const catCol = categoricalCols[1]
    const metricCol = numericCols.length > 1 ? numericCols[1] : numericCols[0]

    const grouped: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown")
      if (!grouped[key]) grouped[key] = 0
      grouped[key] += Number(row[metricCol]) || 0
    })

    const barData2 = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))

    const barTotal2 = barData2.reduce((a, b) => a + b.value, 0)
    const topCat2 = barData2[0]
    const topPct2 = barTotal2 > 0 ? ((topCat2.value / barTotal2) * 100).toFixed(1) : "0"

    charts.push({
      type: "bar",
      title: `${metricCol.replace(/_/g, " ")} by ${catCol.replace(/_/g, " ")}`,
      description: `Breaks down ${metricCol.replace(/_/g, " ")} by ${barData2.length} ${catCol.replace(/_/g, " ")} segments. "${topCat2.name}" is the top contributor at ${topCat2.value.toLocaleString()} (${topPct2}%). Combined total: ${barTotal2.toLocaleString()}.`,
      data: barData2,
      xKey: "name",
      yKey: "value",
      color: chartColors[2],
    })
  }

  // 3b. Second categorical frequency chart (for multi-categorical data)
  if (categoricalCols.length > 1 && numericCols.length === 0) {
    const catCol = categoricalCols[1]
    
    const counts: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown")
      counts[key] = (counts[key] || 0) + 1
    })

    const barData = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({
        name,
        value: count,
      }))

    const total = barData.reduce((a, b) => a + b.value, 0)
    const topItem = barData[0]
    const topPct = total > 0 ? ((topItem.value / total) * 100).toFixed(1) : "0"

    charts.push({
      type: "bar",
      title: `${catCol.replace(/_/g, " ")} Frequency`,
      description: `Shows frequency distribution of ${catCol.replace(/_/g, " ")} across ${barData.length} categories. "${topItem.name}" appears most frequently at ${topPct}% (${topItem.value.toLocaleString()} occurrences).`,
      data: barData,
      xKey: "name",
      yKey: "value",
      color: chartColors[1],
    })
  }

  // 4. Distribution chart for numeric columns
  if (numericCols.length > 0) {
    const col = numericCols[0]
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))

    if (values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      const bucketCount = Math.min(10, Math.ceil(Math.sqrt(values.length)))
      const bucketSize = (max - min) / bucketCount || 1

      const buckets: Record<string, number> = {}
      values.forEach((v) => {
        const bucketIdx = Math.min(
          Math.floor((v - min) / bucketSize),
          bucketCount - 1
        )
        const bucketLabel = `${Math.round(min + bucketIdx * bucketSize)}-${Math.round(min + (bucketIdx + 1) * bucketSize)}`
        buckets[bucketLabel] = (buckets[bucketLabel] || 0) + 1
      })

      const distData = Object.entries(buckets).map(([range, count]) => ({
        range,
        count,
      }))

      const distMax = Math.max(...distData.map((d) => d.count))
      const peakBucket = distData.find((d) => d.count === distMax)
      const distTotal = distData.reduce((a, b) => a + b.count, 0)

      charts.push({
        type: "bar",
        title: `${col.replace(/_/g, " ")} Distribution`,
        description: `Shows how ${col.replace(/_/g, " ")} values are distributed across ${distData.length} buckets. The most common range is ${peakBucket?.range ?? "N/A"} with ${distMax.toLocaleString()} records (${distTotal > 0 ? ((distMax / distTotal) * 100).toFixed(1) : 0}%). Values range from ${Math.round(min).toLocaleString()} to ${Math.round(max).toLocaleString()}.`,
        data: distData,
        xKey: "range",
        yKey: "count",
        color: chartColors[3],
      })
    }
  }

  return charts
}

function generateDescription(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  rows: CleanedRow[]
): string {
  const parts: string[] = []

  parts.push(
    `This dataset contains ${rows.length.toLocaleString()} records across ${numericCols.length + categoricalCols.length + dateCols.length} key columns.`
  )

  if (numericCols.length > 0) {
    const col = numericCols[0]
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0)
      const avg = sum / values.length
      const max = Math.max(...values)
      const min = Math.min(...values)
      parts.push(
        `The primary metric "${col.replace(/_/g, " ")}" ranges from ${min.toLocaleString()} to ${max.toLocaleString()}, with an average of ${avg.toFixed(2)} and a total of ${sum.toLocaleString()}.`
      )
    }
  }

  if (categoricalCols.length > 0) {
    const col = categoricalCols[0]
    const uniqueValues = new Set(rows.map((r) => String(r[col] ?? "")))
    parts.push(
      `The "${col.replace(/_/g, " ")}" dimension has ${uniqueValues.size} unique values.`
    )
  }

  return parts.join(" ")
}

function generateTrends(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  rows: CleanedRow[]
): string[] {
  const trends: string[] = []

  // Trend: Top category contribution
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    const catCol = categoricalCols[0]
    const metricCol = numericCols[0]

    const grouped: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown")
      if (!grouped[key]) grouped[key] = 0
      grouped[key] += Number(row[metricCol]) || 0
    })

    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0) {
      const total = sorted.reduce((a, b) => a + b[1], 0)
      const topPct = ((sorted[0][1] / total) * 100).toFixed(1)
      trends.push(
        `"${sorted[0][0]}" leads ${catCol.replace(/_/g, " ")} contributing ${topPct}% of total ${metricCol.replace(/_/g, " ")}.`
      )
    }

    if (sorted.length > 1) {
      const bottomPct = ((sorted[sorted.length - 1][1] / sorted.reduce((a, b) => a + b[1], 0)) * 100).toFixed(1)
      trends.push(
        `"${sorted[sorted.length - 1][0]}" is the lowest contributor at ${bottomPct}%.`
      )
    }
  }

  // Trend: Numeric distribution insight
  if (numericCols.length > 0) {
    const col = numericCols[0]
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const aboveAvg = values.filter((v) => v > avg).length
      const pctAbove = ((aboveAvg / values.length) * 100).toFixed(1)
      trends.push(
        `${pctAbove}% of records have ${col.replace(/_/g, " ")} above the average value.`
      )
    }
  }

  // Trend: Data concentration
  if (categoricalCols.length > 0) {
    const col = categoricalCols[0]
    const counts: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[col] ?? "Unknown")
      counts[key] = (counts[key] || 0) + 1
    })

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const topThreeCount = sorted.slice(0, 3).reduce((a, b) => a + b[1], 0)
    const topThreePct = ((topThreeCount / rows.length) * 100).toFixed(1)
    trends.push(
      `Top 3 categories in "${col.replace(/_/g, " ")}" account for ${topThreePct}% of all records.`
    )
  }

  return trends.slice(0, 5)
}

function generateRecommendations(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  rows: CleanedRow[]
): string[] {
  const recs: string[] = []

  // Check for high-value categories
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    const catCol = categoricalCols[0]
    const metricCol = numericCols[0]

    const grouped: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[catCol] ?? "Unknown")
      if (!grouped[key]) grouped[key] = 0
      grouped[key] += Number(row[metricCol]) || 0
    })

    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0) {
      recs.push(
        `Focus on "${sorted[0][0]}" in ${catCol.replace(/_/g, " ")} as it drives the highest ${metricCol.replace(/_/g, " ")}.`
      )
    }
    if (sorted.length > 2) {
      recs.push(
        `Investigate underperforming categories like "${sorted[sorted.length - 1][0]}" for growth opportunities.`
      )
    }
  }

  // Outlier recommendation
  if (numericCols.length > 0) {
    const col = numericCols[0]
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length)
      const outliers = values.filter((v) => Math.abs(v - avg) > 2 * std)
      if (outliers.length > 0) {
        recs.push(
          `${outliers.length} records show significant deviation in ${col.replace(/_/g, " ")} -- review for potential high-impact or erroneous entries.`
        )
      }
    }
  }

  // Time-based recommendation
  if (dateCols.length > 0) {
    recs.push(
      `Consider deeper time-series analysis on "${dateCols[0].replace(/_/g, " ")}" to identify seasonal patterns and forecast future trends.`
    )
  }

  // General recommendation
  recs.push(
    `Export this analysis and share with stakeholders for data-driven decision making.`
  )

  return recs.slice(0, 4)
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json()
    const { columns, rows } = body

    if (!columns || !rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No data provided for analysis" },
        { status: 400 }
      )
    }

    // Detect column types
    const numericCols = detectNumericColumns(columns, rows)
    const categoricalCols = detectCategoricalColumns(columns, rows, numericCols)
    const dateCols = detectDateColumns(columns, rows)

    // Generate analysis components
    const kpis = computeKPIs(numericCols, rows)
    const charts = generateCharts(numericCols, categoricalCols, dateCols, rows)
    const description = generateDescription(numericCols, categoricalCols, dateCols, rows)
    const trends = generateTrends(numericCols, categoricalCols, dateCols, rows)
    const recommendations = generateRecommendations(numericCols, categoricalCols, dateCols, rows)

    return NextResponse.json({
      kpis,
      charts,
      description,
      trends,
      recommendations,
      meta: {
        total_records: rows.length,
        numeric_columns: numericCols,
        categorical_columns: categoricalCols,
        date_columns: dateCols,
        total_columns: columns.length,
      },
    })
  } catch (error) {
    console.error("Analysis error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    )
  }
}
