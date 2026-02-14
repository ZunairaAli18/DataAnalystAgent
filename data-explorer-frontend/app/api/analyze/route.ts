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

interface ColumnProfile {
  key: string
  label: string
  dtype: "numeric" | "categorical" | "date" | "boolean" | "text"
  distinct_count: number
  null_count: number
  total_count: number
  distinct_values: (string | number | boolean | null)[]
  top_values: { value: string; count: number; percentage: number }[]
  stats?: {
    min: number
    max: number
    mean: number
    median: number
    sum: number
  }
  suggested_chart_types: string[]
}

/* ── Column Detection ── */

function detectNumericColumns(columns: ColumnMeta[], rows: CleanedRow[]): string[] {
  return columns
    .filter((col) => {
      if (col.dtype && (col.dtype.includes("Int") || col.dtype.includes("Float"))) return true
      const sample = rows.slice(0, 50)
      const nonEmpty = sample.filter((row) => {
        const val = row[col.key]
        return val !== null && val !== undefined && val !== ""
      })
      if (nonEmpty.length === 0) return false
      const numericCount = nonEmpty.filter((row) => !isNaN(Number(row[col.key]))).length
      return numericCount / nonEmpty.length >= 0.9
    })
    .map((col) => col.key)
}

function detectBooleanColumns(columns: ColumnMeta[], rows: CleanedRow[], numericCols: string[]): string[] {
  const boolValues = new Set(["true", "false", "yes", "no", "1", "0", "y", "n"])
  return columns
    .filter((col) => {
      if (numericCols.includes(col.key)) return false
      const uniqueValues = new Set(
        rows.map((r) => String(r[col.key] ?? "").toLowerCase().trim()).filter((v) => v !== "")
      )
      return uniqueValues.size <= 3 && [...uniqueValues].every((v) => boolValues.has(v))
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
      // Try parsing a sample
      const sample = rows.slice(0, 10).filter((r) => r[col.key] != null && r[col.key] !== "")
      if (sample.length === 0) return false
      const parseable = sample.filter((r) => !isNaN(Date.parse(String(r[col.key]))))
      return parseable.length / sample.length >= 0.8
    })
    .map((col) => col.key)
}

function detectCategoricalColumns(
  columns: ColumnMeta[],
  rows: CleanedRow[],
  numericCols: string[],
  dateCols: string[],
  boolCols: string[]
): string[] {
  return columns
    .filter((col) => {
      if (numericCols.includes(col.key)) return false
      if (dateCols.includes(col.key)) return false
      if (boolCols.includes(col.key)) return false
      const uniqueValues = new Set(rows.map((r) => String(r[col.key] ?? "")))
      return uniqueValues.size > 1 && uniqueValues.size <= 100
    })
    .map((col) => col.key)
}

/* ── Column Profiling ── */

function buildColumnProfiles(
  columns: ColumnMeta[],
  rows: CleanedRow[],
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  boolCols: string[]
): ColumnProfile[] {
  return columns.map((col) => {
    const key = col.key
    const allValues = rows.map((r) => r[key])
    const nonNullValues = allValues.filter((v) => v !== null && v !== undefined && v !== "")
    const nullCount = allValues.length - nonNullValues.length

    // Determine dtype
    let dtype: ColumnProfile["dtype"] = "text"
    if (numericCols.includes(key)) dtype = "numeric"
    else if (dateCols.includes(key)) dtype = "date"
    else if (boolCols.includes(key)) dtype = "boolean"
    else if (categoricalCols.includes(key)) dtype = "categorical"

    // Count distinct values
    const valueStrings = nonNullValues.map((v) => String(v))
    const valueCounts: Record<string, number> = {}
    valueStrings.forEach((v) => {
      valueCounts[v] = (valueCounts[v] || 0) + 1
    })

    const distinctCount = Object.keys(valueCounts).length

    // Top values sorted by frequency
    const topValues = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({
        value,
        count,
        percentage: rows.length > 0 ? Math.round((count / rows.length) * 10000) / 100 : 0,
      }))

    // Distinct values (limited to 200 for performance)
    const distinctValues = Object.keys(valueCounts).slice(0, 200) as (string | number | boolean | null)[]

    // Stats for numeric columns
    let stats: ColumnProfile["stats"] = undefined
    if (dtype === "numeric") {
      const numValues = nonNullValues.map((v) => Number(v)).filter((v) => !isNaN(v))
      if (numValues.length > 0) {
        const sum = numValues.reduce((a, b) => a + b, 0)
        const sorted = [...numValues].sort((a, b) => a - b)
        const median =
          sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)]
        stats = {
          min: Math.min(...numValues),
          max: Math.max(...numValues),
          mean: sum / numValues.length,
          median,
          sum,
        }
      }
    }

    // Suggest chart types based on column characteristics
    const suggestedChartTypes = suggestChartTypes(dtype, distinctCount, rows.length)

    return {
      key,
      label: col.label || key.toUpperCase().replace(/_/g, " "),
      dtype,
      distinct_count: distinctCount,
      null_count: nullCount,
      total_count: rows.length,
      distinct_values: distinctValues,
      top_values: topValues,
      stats,
      suggested_chart_types: suggestedChartTypes,
    }
  })
}

function suggestChartTypes(dtype: string, distinctCount: number, totalRows: number): string[] {
  const suggestions: string[] = []

  if (dtype === "numeric") {
    suggestions.push("bar", "line", "heatmap")
    if (distinctCount <= 15) suggestions.push("pie", "donut")
    suggestions.push("column")
  } else if (dtype === "categorical") {
    if (distinctCount <= 8) suggestions.push("pie", "donut")
    suggestions.push("bar", "column")
    if (distinctCount <= 20) suggestions.push("funnel")
  } else if (dtype === "date") {
    suggestions.push("line", "bar")
  } else if (dtype === "boolean") {
    suggestions.push("pie", "donut", "bar")
  } else {
    // text with reasonable cardinality
    if (distinctCount <= 20) suggestions.push("bar", "pie", "column")
    else suggestions.push("bar", "column")
  }

  return [...new Set(suggestions)]
}

/* ── KPI Computation ── */

function computeKPIs(
  numericCols: string[],
  categoricalCols: string[],
  rows: CleanedRow[],
  columnProfiles: ColumnProfile[]
): KPI[] {
  const colors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff"]
  const kpis: KPI[] = []

  kpis.push({
    label: "TOTAL RECORDS",
    value: rows.length.toLocaleString(),
    change: null,
    positive: true,
    color: colors[0],
  })

  // Numeric column KPIs
  const topNumeric = numericCols.slice(0, 3)
  topNumeric.forEach((col, idx) => {
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    if (values.length === 0) return

    const sum = values.reduce((a, b) => a + b, 0)

    let displayValue: string
    if (sum > 1_000_000) displayValue = `${(sum / 1_000_000).toFixed(2)}M`
    else if (sum > 1_000) displayValue = `${(sum / 1_000).toFixed(2)}K`
    else displayValue = sum.toFixed(2)

    kpis.push({
      label: col.toUpperCase().replace(/_/g, " "),
      value: displayValue,
      change: null,
      positive: true,
      color: colors[(idx + 1) % colors.length],
    })
  })

  // Fill remaining KPI slots with categorical/text column unique counts
  const allChartable = columnProfiles.filter(
    (p) =>
      (p.dtype === "categorical" || p.dtype === "boolean" || (p.dtype === "text" && p.distinct_count >= 2 && p.distinct_count <= 50)) &&
      !numericCols.includes(p.key)
  )

  for (const profile of allChartable) {
    if (kpis.length >= 4) break
    kpis.push({
      label: `UNIQUE ${profile.key.toUpperCase().replace(/_/g, " ")}`,
      value: profile.distinct_count.toLocaleString(),
      change: null,
      positive: true,
      color: colors[kpis.length % colors.length],
    })
  }

  // If still under 4 KPIs, add total columns
  if (kpis.length < 4) {
    kpis.push({
      label: "TOTAL COLUMNS",
      value: columnProfiles.length.toLocaleString(),
      change: null,
      positive: true,
      color: colors[kpis.length % colors.length],
    })
  }

  return kpis.slice(0, 4)
}

/* ── Chart Generation ── */

function generateCharts(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  boolCols: string[],
  rows: CleanedRow[],
  columnProfiles: ColumnProfile[]
): ChartData[] {
  const charts: ChartData[] = []
  const chartColors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]

  // Helper: build count-based frequency data for a column
  function buildCountData(colKey: string, limit = 10): { name: string; value: number }[] {
    const counts: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[colKey] ?? "Unknown")
      counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, value]) => ({ name, value }))
  }

  // Helper: get all chartable columns (categorical + any column with <= 50 unique values)
  const allChartableColumns = columnProfiles.filter(
    (p) => p.dtype === "categorical" || p.dtype === "boolean" || (p.dtype === "text" && p.distinct_count >= 2 && p.distinct_count <= 50)
  )

  // 1. Time-series line chart
  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateCol = dateCols[0]
    const metricCol = numericCols[0]

    const grouped: Record<string, number> = {}
    rows.forEach((row) => {
      const dateVal = String(row[dateCol] ?? "")
      const key = dateVal.substring(0, 7) || dateVal
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

  // 2. Categorical charts -- use allChartableColumns which includes text cols with sensible cardinality
  const chartableCols = allChartableColumns.map((p) => p.key)
  const catLimit = Math.min(chartableCols.length, numericCols.length > 0 ? 3 : 5)

  for (let ci = 0; ci < catLimit; ci++) {
    const catCol = chartableCols[ci]
    const profile = columnProfiles.find((p) => p.key === catCol)
    const distinctCount = profile?.distinct_count ?? 999
    const metricCol = numericCols.length > 0 ? numericCols[ci % numericCols.length] : null

    if (metricCol) {
      // Aggregated bar: sum of metric by category
      const grouped: Record<string, number> = {}
      rows.forEach((row) => {
        const key = String(row[catCol] ?? "Unknown")
        if (!grouped[key]) grouped[key] = 0
        grouped[key] += Number(row[metricCol]) || 0
      })

      const barData = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))

      const barTotal = barData.reduce((a, b) => a + b.value, 0)
      const topCategory = barData[0]
      const topPct = barTotal > 0 ? ((topCategory.value / barTotal) * 100).toFixed(1) : "0"

      // Choose pie for low cardinality on non-first charts
      const useType = distinctCount <= 8 && ci > 0 ? "pie" : "bar"

      charts.push({
        type: useType as "bar" | "pie",
        title: `${metricCol.replace(/_/g, " ")} by ${catCol.replace(/_/g, " ")}`,
        description: `Compares ${metricCol.replace(/_/g, " ")} across ${barData.length} ${catCol.replace(/_/g, " ")} categories. "${topCategory.name}" leads with ${topCategory.value.toLocaleString()} (${topPct}% of shown total). Total: ${barTotal.toLocaleString()}.`,
        data: barData,
        xKey: "name",
        yKey: "value",
        color: chartColors[(ci + 1) % chartColors.length],
      })
    } else {
      // Count-based chart: frequency of each category value
      const barData = buildCountData(catCol, 10)
      const barTotal = barData.reduce((a, b) => a + b.value, 0)
      const topCategory = barData[0]
      if (!topCategory) continue
      const topPct = barTotal > 0 ? ((topCategory.value / barTotal) * 100).toFixed(1) : "0"

      // Use pie for low cardinality columns, bar for others
      const useType = distinctCount <= 8 ? "pie" : "bar"

      charts.push({
        type: useType,
        title: `${catCol.replace(/_/g, " ")} Distribution`,
        description: `Shows frequency of ${catCol.replace(/_/g, " ")} values. "${topCategory.name}" is the most common with ${topCategory.value.toLocaleString()} records (${topPct}%). Total shown: ${barTotal.toLocaleString()}.`,
        data: barData,
        xKey: "name",
        yKey: "value",
        color: chartColors[(ci + 1) % chartColors.length],
      })
    }
  }

  // 3. Boolean columns as pie charts (if not already charted above)
  const alreadyCharted = new Set(chartableCols.slice(0, catLimit))
  boolCols
    .filter((bc) => !alreadyCharted.has(bc))
    .slice(0, 1)
    .forEach((boolCol, idx) => {
      const counts: Record<string, number> = {}
      rows.forEach((row) => {
        const key = String(row[boolCol] ?? "Unknown").toLowerCase()
        counts[key] = (counts[key] || 0) + 1
      })

      const pieData = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }))

      charts.push({
        type: "pie",
        title: `${boolCol.replace(/_/g, " ")} Breakdown`,
        description: `Shows the distribution of ${boolCol.replace(/_/g, " ")} values across ${rows.length.toLocaleString()} records.`,
        data: pieData,
        xKey: "name",
        yKey: "value",
        color: chartColors[(catLimit + idx + 1) % chartColors.length],
      })
    })

  // 4. Numeric distribution histogram
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
        const bucketIdx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1)
        const bucketLabel = `${Math.round(min + bucketIdx * bucketSize)}-${Math.round(min + (bucketIdx + 1) * bucketSize)}`
        buckets[bucketLabel] = (buckets[bucketLabel] || 0) + 1
      })

      const distData = Object.entries(buckets).map(([range, count]) => ({ range, count }))
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
        color: chartColors[4 % chartColors.length],
      })
    }
  }

  // 5. Cross-tabulation chart: if 2+ chartable columns exist and no numeric, show stacked frequency
  if (numericCols.length === 0 && chartableCols.length >= 2) {
    const col1 = chartableCols[0]
    const col2 = chartableCols[1]
    const cross: Record<string, Record<string, number>> = {}
    rows.forEach((row) => {
      const k1 = String(row[col1] ?? "Unknown")
      const k2 = String(row[col2] ?? "Unknown")
      if (!cross[k1]) cross[k1] = {}
      cross[k1][k2] = (cross[k1][k2] || 0) + 1
    })
    // Flatten to show top combos
    const combos: { name: string; value: number }[] = []
    for (const [k1, inner] of Object.entries(cross)) {
      for (const [k2, count] of Object.entries(inner)) {
        combos.push({ name: `${k1} / ${k2}`, value: count })
      }
    }
    combos.sort((a, b) => b.value - a.value)
    const topCombos = combos.slice(0, 12)
    if (topCombos.length > 1) {
      const total = topCombos.reduce((a, b) => a + b.value, 0)
      const topCombo = topCombos[0]
      const topPct = total > 0 ? ((topCombo.value / total) * 100).toFixed(1) : "0"
      charts.push({
        type: "bar",
        title: `${col1.replace(/_/g, " ")} vs ${col2.replace(/_/g, " ")}`,
        description: `Cross-tabulation of ${col1.replace(/_/g, " ")} and ${col2.replace(/_/g, " ")}. Top combination "${topCombo.name}" appears ${topCombo.value} times (${topPct}% of shown).`,
        data: topCombos,
        xKey: "name",
        yKey: "value",
        color: chartColors[3 % chartColors.length],
      })
    }
  }

  return charts
}

/* ── Description, Trends, Recommendations ── */

function generateDescription(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  boolCols: string[],
  rows: CleanedRow[],
  columnProfiles: ColumnProfile[]
): string {
  const parts: string[] = []
  const totalCols = numericCols.length + categoricalCols.length + dateCols.length + boolCols.length

  const allColCount = columnProfiles.length
  parts.push(`This dataset contains ${rows.length.toLocaleString()} records across ${allColCount} analyzed columns.`)

  if (numericCols.length > 0) {
    const col = numericCols[0]
    const profile = columnProfiles.find((p) => p.key === col)
    if (profile?.stats) {
      parts.push(
        `The primary metric "${col.replace(/_/g, " ")}" ranges from ${profile.stats.min.toLocaleString()} to ${profile.stats.max.toLocaleString()}, with an average of ${profile.stats.mean.toFixed(2)} and a total of ${profile.stats.sum.toLocaleString()}.`
      )
    }
  }

  // List all categorical/chartable columns
  const chartable = columnProfiles.filter(
    (p) => p.dtype === "categorical" || p.dtype === "boolean" || (p.dtype === "text" && p.distinct_count >= 2 && p.distinct_count <= 50)
  )
  if (chartable.length > 0) {
    const descriptions = chartable.slice(0, 3).map((p) => `"${p.key.replace(/_/g, " ")}" (${p.distinct_count} unique)`)
    parts.push(`Key dimensions: ${descriptions.join(", ")}.`)
  }

  if (boolCols.length > 0) {
    parts.push(`${boolCols.length} boolean column(s) detected: ${boolCols.map((c) => c.replace(/_/g, " ")).join(", ")}.`)
  }

  // Text-heavy dataset insight
  const textCols = columnProfiles.filter((p) => p.dtype === "text" && p.distinct_count > 50)
  if (textCols.length > 0 && numericCols.length === 0) {
    parts.push(`This is a text-heavy dataset with ${textCols.length} free-form text column(s).`)
  }

  return parts.join(" ")
}

function generateTrends(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  rows: CleanedRow[],
  columnProfiles: ColumnProfile[]
): string[] {
  const trends: string[] = []

  // All chartable columns (including text with reasonable cardinality)
  const chartable = columnProfiles.filter(
    (p) => p.dtype === "categorical" || p.dtype === "boolean" || (p.dtype === "text" && p.distinct_count >= 2 && p.distinct_count <= 50)
  )

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
      trends.push(`"${sorted[0][0]}" leads ${catCol.replace(/_/g, " ")} contributing ${topPct}% of total ${metricCol.replace(/_/g, " ")}.`)
    }
    if (sorted.length > 1) {
      const total = sorted.reduce((a, b) => a + b[1], 0)
      const bottomPct = ((sorted[sorted.length - 1][1] / total) * 100).toFixed(1)
      trends.push(`"${sorted[sorted.length - 1][0]}" is the lowest contributor at ${bottomPct}%.`)
    }
  }

  if (numericCols.length > 0) {
    const col = numericCols[0]
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const aboveAvg = values.filter((v) => v > avg).length
      const pctAbove = ((aboveAvg / values.length) * 100).toFixed(1)
      trends.push(`${pctAbove}% of records have ${col.replace(/_/g, " ")} above the average value.`)
    }
  }

  // Categorical concentration for each chartable column
  for (const profile of chartable.slice(0, 3)) {
    if (trends.length >= 5) break
    const counts: Record<string, number> = {}
    rows.forEach((row) => {
      const key = String(row[profile.key] ?? "Unknown")
      counts[key] = (counts[key] || 0) + 1
    })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0) {
      const topPct = ((sorted[0][1] / rows.length) * 100).toFixed(1)
      trends.push(`"${sorted[0][0]}" is the most frequent ${profile.key.replace(/_/g, " ")} value at ${topPct}% of records (${sorted[0][1].toLocaleString()} out of ${rows.length.toLocaleString()}).`)
    }
  }

  // Null rate trend
  const highNullCols = columnProfiles.filter((p) => p.null_count / p.total_count > 0.1)
  if (highNullCols.length > 0) {
    const worstCol = highNullCols.sort((a, b) => b.null_count - a.null_count)[0]
    const pct = ((worstCol.null_count / worstCol.total_count) * 100).toFixed(1)
    trends.push(`"${worstCol.key.replace(/_/g, " ")}" has the highest null rate at ${pct}%.`)
  }

  // Column diversity insight
  if (numericCols.length === 0 && trends.length < 5) {
    const textCols = columnProfiles.filter((p) => p.dtype === "text" && p.distinct_count > 50)
    if (textCols.length > 0) {
      trends.push(`${textCols.length} column(s) contain mostly unique text (e.g., "${textCols[0].key.replace(/_/g, " ")}"), suggesting free-form entries.`)
    }
  }

  return trends.slice(0, 5)
}

function generateRecommendations(
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  rows: CleanedRow[],
  columnProfiles: ColumnProfile[]
): string[] {
  const recs: string[] = []

  // All chartable columns (including text with reasonable cardinality)
  const chartable = columnProfiles.filter(
    (p) => p.dtype === "categorical" || p.dtype === "boolean" || (p.dtype === "text" && p.distinct_count >= 2 && p.distinct_count <= 50)
  )

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
      recs.push(`Focus on "${sorted[0][0]}" in ${catCol.replace(/_/g, " ")} as it drives the highest ${metricCol.replace(/_/g, " ")}.`)
    }
    if (sorted.length > 2) {
      recs.push(`Investigate underperforming categories like "${sorted[sorted.length - 1][0]}" for growth opportunities.`)
    }
  }

  if (numericCols.length > 0) {
    const col = numericCols[0]
    const values = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length)
      const outliers = values.filter((v) => Math.abs(v - avg) > 2 * std)
      if (outliers.length > 0) {
        recs.push(`${outliers.length} records show significant deviation in ${col.replace(/_/g, " ")} -- review for potential high-impact or erroneous entries.`)
      }
    }
  }

  // For no-numeric datasets, add category-specific recommendations
  if (numericCols.length === 0 && chartable.length > 0) {
    const topCat = chartable[0]
    const topValue = topCat.top_values[0]
    if (topValue) {
      recs.push(
        `The "${topCat.key.replace(/_/g, " ")}" column is dominated by "${topValue.value}" (${topValue.percentage}%) -- consider whether this concentration is expected or needs investigation.`
      )
    }
    // Recommend adding numeric data
    recs.push(
      `This dataset is primarily text/categorical. Consider augmenting with numeric metrics for richer quantitative analysis.`
    )
  }

  if (dateCols.length > 0) {
    recs.push(`Consider deeper time-series analysis on "${dateCols[0].replace(/_/g, " ")}" to identify seasonal patterns and forecast future trends.`)
  }

  // Recommend cross-tabulation for multiple chartable cols
  if (chartable.length >= 2) {
    recs.push(`Cross-tabulate "${chartable[0].key.replace(/_/g, " ")}" and "${chartable[1].key.replace(/_/g, " ")}" to discover interaction patterns.`)
  }

  // Null handling
  const highNullCols = columnProfiles.filter((p) => p.null_count / p.total_count > 0.2)
  if (highNullCols.length > 0) {
    recs.push(`${highNullCols.length} column(s) have >20% null values -- consider data quality improvements for "${highNullCols[0].key.replace(/_/g, " ")}".`)
  }

  recs.push(`Export this analysis and share with stakeholders for data-driven decision making.`)

  return recs.slice(0, 4)
}

/* ── Main Handler ── */

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json()
    const { columns, rows } = body

    if (!columns || !rows || rows.length === 0) {
      return NextResponse.json({ error: "No data provided for analysis" }, { status: 400 })
    }

    // Detect column types
    const numericCols = detectNumericColumns(columns, rows)
    const boolCols = detectBooleanColumns(columns, rows, numericCols)
    const dateCols = detectDateColumns(columns, rows)
    const categoricalCols = detectCategoricalColumns(columns, rows, numericCols, dateCols, boolCols)

    // Build full column profiles with distinct values
    const columnProfiles = buildColumnProfiles(columns, rows, numericCols, categoricalCols, dateCols, boolCols)

    // Generate analysis
    const kpis = computeKPIs(numericCols, categoricalCols, rows, columnProfiles)
    const charts = generateCharts(numericCols, categoricalCols, dateCols, boolCols, rows, columnProfiles)
    const description = generateDescription(numericCols, categoricalCols, dateCols, boolCols, rows, columnProfiles)
    const trends = generateTrends(numericCols, categoricalCols, dateCols, rows, columnProfiles)
    const recommendations = generateRecommendations(numericCols, categoricalCols, dateCols, rows, columnProfiles)

    return NextResponse.json({
      kpis,
      charts,
      description,
      trends,
      recommendations,
      column_profiles: columnProfiles,
      meta: {
        total_records: rows.length,
        numeric_columns: numericCols,
        categorical_columns: categoricalCols,
        date_columns: dateCols,
        boolean_columns: boolCols,
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
