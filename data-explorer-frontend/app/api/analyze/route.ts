import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

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

interface Conclusion {
  category: "behavioral" | "operational" | "financial" | "risk" | "opportunity" | "data_quality"
  title: string
  finding: string
  evidence: string
  implication: string
  confidence: "high" | "medium" | "low"
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

function suggestChartTypes(dtype: string, distinctCount: number): string[] {
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
    if (distinctCount <= 20) suggestions.push("bar", "pie", "column")
    else suggestions.push("bar", "column")
  }
  return [...new Set(suggestions)]
}

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

    let dtype: ColumnProfile["dtype"] = "text"
    if (numericCols.includes(key)) dtype = "numeric"
    else if (dateCols.includes(key)) dtype = "date"
    else if (boolCols.includes(key)) dtype = "boolean"
    else if (categoricalCols.includes(key)) dtype = "categorical"

    const valueStrings = nonNullValues.map((v) => String(v))
    const valueCounts: Record<string, number> = {}
    valueStrings.forEach((v) => {
      valueCounts[v] = (valueCounts[v] || 0) + 1
    })

    const distinctCount = Object.keys(valueCounts).length
    const topValues = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({
        value,
        count,
        percentage: rows.length > 0 ? Math.round((count / rows.length) * 10000) / 100 : 0,
      }))

    const distinctValues = Object.keys(valueCounts).slice(0, 200) as (string | number | boolean | null)[]

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
      suggested_chart_types: suggestChartTypes(dtype, distinctCount),
    }
  })
}

/* ── Build rich data summary for AI ── */

function buildDataSummary(
  columns: ColumnMeta[],
  rows: CleanedRow[],
  numericCols: string[],
  categoricalCols: string[],
  dateCols: string[],
  boolCols: string[],
  columnProfiles: ColumnProfile[]
): string {
  const lines: string[] = []
  const n = rows.length

  // 1. DATASET OVERVIEW
  lines.push("=== SECTION 1: DATASET OVERVIEW ===")
  lines.push(`Total records: ${n}`)
  lines.push(`Total columns: ${columns.length}`)
  lines.push(`Numeric columns (${numericCols.length}): ${numericCols.join(", ") || "none"}`)
  lines.push(`Categorical columns (${categoricalCols.length}): ${categoricalCols.join(", ") || "none"}`)
  lines.push(`Date columns (${dateCols.length}): ${dateCols.join(", ") || "none"}`)
  lines.push(`Boolean columns (${boolCols.length}): ${boolCols.join(", ") || "none"}`)
  const totalCells = n * columns.length
  const totalNulls = columnProfiles.reduce((s, p) => s + p.null_count, 0)
  lines.push(`Overall null rate: ${((totalNulls / totalCells) * 100).toFixed(2)}% (${totalNulls} of ${totalCells} cells)`)

  // 2. COLUMN PROFILES
  lines.push("\n=== SECTION 2: COLUMN PROFILES ===")
  for (const profile of columnProfiles) {
    lines.push(`\n[${profile.key}] dtype=${profile.dtype}`)
    lines.push(`  null_count=${profile.null_count} (${((profile.null_count / n) * 100).toFixed(1)}%)  distinct=${profile.distinct_count}  completeness=${(((n - profile.null_count) / n) * 100).toFixed(1)}%`)

    if (profile.stats) {
      const s = profile.stats
      lines.push(`  min=${s.min}  max=${s.max}  range=${Math.round((s.max - s.min) * 100) / 100}`)
      lines.push(`  mean=${s.mean.toFixed(4)}  median=${s.median}  sum=${s.sum.toLocaleString()}`)

      const numVals = rows.map((r) => Number(r[profile.key])).filter((v) => !isNaN(v))
      if (numVals.length > 1) {
        const variance = numVals.reduce((acc, v) => acc + (v - s.mean) ** 2, 0) / numVals.length
        const stddev = Math.sqrt(variance)
        const skewness = stddev > 0 ? (3 * (s.mean - s.median)) / stddev : 0
        const skewLabel = skewness > 1 ? "strongly right-skewed" : skewness > 0.5 ? "moderately right-skewed" : skewness < -1 ? "strongly left-skewed" : skewness < -0.5 ? "moderately left-skewed" : "roughly symmetric"
        lines.push(`  stddev=${stddev.toFixed(4)}  skewness=${skewness.toFixed(3)} (${skewLabel})  cv=${s.mean !== 0 ? ((stddev / Math.abs(s.mean)) * 100).toFixed(1) + "%" : "N/A"}`)

        const sorted = [...numVals].sort((a, b) => a - b)
        const q1 = sorted[Math.floor(sorted.length * 0.25)]
        const q3 = sorted[Math.floor(sorted.length * 0.75)]
        const iqr = q3 - q1
        const lowerFence = q1 - 1.5 * iqr
        const upperFence = q3 + 1.5 * iqr
        const outliers = numVals.filter((v) => v < lowerFence || v > upperFence)
        lines.push(`  Q1=${q1}  Q3=${q3}  IQR=${Math.round(iqr * 100) / 100}  outliers=${outliers.length} (${((outliers.length / numVals.length) * 100).toFixed(1)}%)`)
        if (outliers.length > 0) {
          const topOutliers = [...outliers].sort((a, b) => Math.abs(b - s.mean) - Math.abs(a - s.mean)).slice(0, 5)
          lines.push(`  top_outlier_values: ${topOutliers.join(", ")}`)
        }

        const p10 = sorted[Math.floor(sorted.length * 0.10)]
        const p90 = sorted[Math.floor(sorted.length * 0.90)]
        const p99 = sorted[Math.floor(sorted.length * 0.99)]
        lines.push(`  percentiles: p10=${p10}  p25=${q1}  p50=${sorted[Math.floor(sorted.length * 0.50)]}  p75=${q3}  p90=${p90}  p99=${p99}`)

        const aboveMean = numVals.filter((v) => v > s.mean).length
        lines.push(`  above_mean=${aboveMean} (${((aboveMean / numVals.length) * 100).toFixed(1)}%)  below_mean=${numVals.length - aboveMean} (${(((numVals.length - aboveMean) / numVals.length) * 100).toFixed(1)}%)`)

        const zeros = numVals.filter((v) => v === 0).length
        const negatives = numVals.filter((v) => v < 0).length
        if (zeros > 0 || negatives > 0) {
          lines.push(`  zeros=${zeros} (${((zeros / numVals.length) * 100).toFixed(1)}%)  negatives=${negatives} (${((negatives / numVals.length) * 100).toFixed(1)}%)`)
        }
      }
    }

    if (profile.top_values.length > 0) {
      lines.push(`  top_values:`)
      profile.top_values.slice(0, 5).forEach((tv) => {
        lines.push(`    "${tv.value}": ${tv.count} records (${tv.percentage}%)`)
      })
      const top1 = profile.top_values[0]?.percentage ?? 0
      const top3 = profile.top_values.slice(0, 3).reduce((s, v) => s + v.percentage, 0)
      const top5 = profile.top_values.slice(0, 5).reduce((s, v) => s + v.percentage, 0)
      lines.push(`  concentration: top1=${top1}%  top3=${top3.toFixed(1)}%  top5=${top5.toFixed(1)}%`)

      const totalNonNull = n - profile.null_count
      if (totalNonNull > 0) {
        const entropy = profile.top_values.reduce((e, tv) => {
          const p = tv.count / totalNonNull
          return e - (p > 0 ? p * Math.log2(p) : 0)
        }, 0)
        const maxEntropy = Math.log2(Math.min(profile.distinct_count, profile.top_values.length))
        const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0
        lines.push(`  diversity: entropy=${entropy.toFixed(3)}  normalized=${normalizedEntropy.toFixed(3)} (${normalizedEntropy > 0.8 ? "very diverse" : normalizedEntropy > 0.5 ? "moderately diverse" : "concentrated"})`)
      }
    }
  }

  // 3. CATEGORY x METRIC BREAKDOWNS
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    lines.push("\n=== SECTION 3: CATEGORY x METRIC BREAKDOWNS ===")
    for (const catCol of categoricalCols.slice(0, 2)) {
      for (const numCol of numericCols.slice(0, 2)) {
        const grouped: Record<string, number[]> = {}
        rows.forEach((row) => {
          const key = String(row[catCol] ?? "Unknown")
          if (!grouped[key]) grouped[key] = []
          const val = Number(row[numCol])
          if (!isNaN(val)) grouped[key].push(val)
        })

        const stats = Object.entries(grouped).map(([cat, vals]) => {
          const sum = vals.reduce((a, b) => a + b, 0)
          const mean = vals.length > 0 ? sum / vals.length : 0
          const sorted = [...vals].sort((a, b) => a - b)
          const median = sorted.length > 0
            ? sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
              : sorted[Math.floor(sorted.length / 2)]
            : 0
          return { cat, count: vals.length, sum, mean, median }
        }).sort((a, b) => b.sum - a.sum)

        const totalSum = stats.reduce((s, r) => s + r.sum, 0)
        lines.push(`\n${numCol} BY ${catCol} (sorted by sum):`)
        lines.push(`  total_sum=${Math.round(totalSum * 100) / 100}  categories=${stats.length}`)
        stats.slice(0, 6).forEach((s) => {
          const pct = totalSum > 0 ? ((s.sum / totalSum) * 100).toFixed(1) : "0"
          lines.push(`  "${s.cat}": sum=${Math.round(s.sum * 100) / 100}  pct=${pct}%  count=${s.count}  mean=${s.mean.toFixed(2)}  median=${s.median}`)
        })
        if (stats.length >= 2) {
          const top = stats[0], bottom = stats[stats.length - 1]
          const ratio = bottom.sum !== 0 ? (top.sum / bottom.sum).toFixed(1) : "inf"
          lines.push(`  TOP vs BOTTOM: "${top.cat}" (${Math.round(top.sum * 100) / 100}) is ${ratio}x "${bottom.cat}" (${Math.round(bottom.sum * 100) / 100})`)
        }
      }
    }
  }

  // 4. TIME SERIES ANALYSIS
  if (dateCols.length > 0 && numericCols.length > 0) {
    lines.push("\n=== SECTION 4: TIME SERIES ANALYSIS ===")
    for (const dateCol of dateCols.slice(0, 2)) {
      for (const numCol of numericCols.slice(0, 3)) {
        const monthly: Record<string, number[]> = {}
        rows.forEach((row) => {
          const dateVal = String(row[dateCol] ?? "")
          const key = dateVal.substring(0, 7)
          if (!key || key.length < 7) return
          if (!monthly[key]) monthly[key] = []
          const val = Number(row[numCol])
          if (!isNaN(val)) monthly[key].push(val)
        })

        const sortedMonths = Object.keys(monthly).sort()
        if (sortedMonths.length < 2) continue

        const monthlyStats = sortedMonths.map((m) => {
          const vals = monthly[m]
          const sum = vals.reduce((a, b) => a + b, 0)
          return { month: m, sum, count: vals.length, mean: sum / vals.length }
        })

        lines.push(`\n${numCol} OVER TIME (${dateCol}):`)
        lines.push(`  range: ${sortedMonths[0]} to ${sortedMonths[sortedMonths.length - 1]}  periods=${sortedMonths.length}`)
        monthlyStats.forEach((m) => {
          lines.push(`  ${m.month}: sum=${Math.round(m.sum * 100) / 100}  count=${m.count}  mean=${m.mean.toFixed(2)}`)
        })

        if (monthlyStats.length >= 2) {
          lines.push(`  MOM GROWTH RATES:`)
          const growthRates: number[] = []
          for (let i = 1; i < monthlyStats.length; i++) {
            const prev = monthlyStats[i - 1].sum
            const curr = monthlyStats[i].sum
            const growth = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0
            growthRates.push(growth)
            lines.push(`  ${monthlyStats[i].month}: ${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`)
          }
          const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length
          const positiveMonths = growthRates.filter((g) => g > 0).length
          lines.push(`  avg_mom_growth=${avgGrowth.toFixed(2)}%  positive_months=${positiveMonths}/${growthRates.length}  best=${Math.max(...growthRates).toFixed(1)}%  worst=${Math.min(...growthRates).toFixed(1)}%`)

          const half = Math.floor(monthlyStats.length / 2)
          const firstHalfAvg = monthlyStats.slice(0, half).reduce((s, m) => s + m.sum, 0) / half
          const secondHalfAvg = monthlyStats.slice(half).reduce((s, m) => s + m.sum, 0) / (monthlyStats.length - half)
          const overallTrend = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1) : "N/A"
          lines.push(`  overall_trend: first_half_avg=${firstHalfAvg.toFixed(2)} -> second_half_avg=${secondHalfAvg.toFixed(2)} (${overallTrend}% change)`)

          const peak = monthlyStats.reduce((a, b) => b.sum > a.sum ? b : a)
          const trough = monthlyStats.reduce((a, b) => b.sum < a.sum ? b : a)
          lines.push(`  peak=${peak.month} (${Math.round(peak.sum * 100) / 100})  trough=${trough.month} (${Math.round(trough.sum * 100) / 100})`)
        }

        const yearlyTotals: Record<string, number> = {}
        monthlyStats.forEach((m) => {
          const year = m.month.substring(0, 4)
          yearlyTotals[year] = (yearlyTotals[year] || 0) + m.sum
        })
        const years = Object.keys(yearlyTotals).sort()
        if (years.length >= 2) {
          lines.push(`  YEARLY: ${years.map((y) => `${y}=${Math.round(yearlyTotals[y] * 100) / 100}`).join("  ")}`)
          const yoy = ((yearlyTotals[years[years.length - 1]] - yearlyTotals[years[years.length - 2]]) / Math.abs(yearlyTotals[years[years.length - 2]]) * 100)
          lines.push(`  latest_yoy_growth=${yoy.toFixed(1)}%`)
        }
      }
    }
  }

  // 5. CORRELATIONS
  if (numericCols.length >= 2) {
    lines.push("\n=== SECTION 5: NUMERIC CORRELATIONS (Pearson r) ===")
    const pairs = []
    for (let i = 0; i < Math.min(numericCols.length, 6); i++) {
      for (let j = i + 1; j < Math.min(numericCols.length, 6); j++) {
        const colA = numericCols[i]
        const colB = numericCols[j]
        const valsA = rows.map((r) => Number(r[colA])).filter((v) => !isNaN(v))
        const valsB = rows.map((r) => Number(r[colB])).filter((v) => !isNaN(v))
        const len = Math.min(valsA.length, valsB.length)
        if (len < 5) continue
        const meanA = valsA.slice(0, len).reduce((a, b) => a + b, 0) / len
        const meanB = valsB.slice(0, len).reduce((a, b) => a + b, 0) / len
        let num = 0, denomA = 0, denomB = 0
        for (let k = 0; k < len; k++) {
          const da = valsA[k] - meanA, db = valsB[k] - meanB
          num += da * db; denomA += da * da; denomB += db * db
        }
        const r = denomA > 0 && denomB > 0 ? num / Math.sqrt(denomA * denomB) : 0
        const strength = Math.abs(r) > 0.7 ? "strong" : Math.abs(r) > 0.4 ? "moderate" : Math.abs(r) > 0.2 ? "weak" : "negligible"
        pairs.push({ colA, colB, r: Math.round(r * 1000) / 1000, strength, direction: r > 0 ? "positive" : "negative" })
      }
    }
    pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    pairs.forEach((p) => lines.push(`  ${p.colA} <-> ${p.colB}: r=${p.r} (${p.strength} ${p.direction})`))
    if (pairs.length === 0) lines.push("  Not enough numeric columns for correlation.")
  }

  // 6. BOOLEAN SEGMENT COMPARISONS
  if (boolCols.length > 0 && numericCols.length > 0) {
    lines.push("\n=== SECTION 6: BOOLEAN SEGMENT COMPARISONS ===")
    for (const boolCol of boolCols.slice(0, 3)) {
      for (const numCol of numericCols.slice(0, 3)) {
        const groups: Record<string, number[]> = {}
        rows.forEach((row) => {
          const key = String(row[boolCol] ?? "unknown").toLowerCase()
          if (!groups[key]) groups[key] = []
          const val = Number(row[numCol])
          if (!isNaN(val)) groups[key].push(val)
        })
        lines.push(`\n${numCol} BY ${boolCol}:`)
        Object.entries(groups).forEach(([seg, vals]) => {
          const sum = vals.reduce((a, b) => a + b, 0)
          lines.push(`  ${seg}: count=${vals.length} (${((vals.length / n) * 100).toFixed(1)}%)  sum=${Math.round(sum * 100) / 100}  mean=${(sum / vals.length).toFixed(2)}`)
        })
      }
    }
  }

  // 7. DATA QUALITY SIGNALS
  lines.push("\n=== SECTION 7: DATA QUALITY SIGNALS ===")
  columnProfiles.forEach((p) => {
    const nullPct = (p.null_count / n) * 100
    if (nullPct > 50) lines.push(`  HIGH NULL: "${p.key}" has ${nullPct.toFixed(1)}% nulls`)
    else if (nullPct > 20) lines.push(`  MODERATE NULL: "${p.key}" has ${nullPct.toFixed(1)}% nulls`)
    if (p.dtype === "categorical" && p.distinct_count === n) lines.push(`  UNIQUE IDs: "${p.key}" is likely an ID column`)
    if (p.dtype === "categorical" && p.distinct_count === 1) lines.push(`  CONSTANT: "${p.key}" has only 1 unique value`)
    if (p.dtype === "numeric" && p.stats) {
      const numVals = rows.map((r) => Number(r[p.key])).filter((v) => !isNaN(v))
      const variance = numVals.reduce((acc, v) => acc + (v - p.stats!.mean) ** 2, 0) / numVals.length
      const stddev = Math.sqrt(variance)
      const cv = p.stats.mean !== 0 ? stddev / Math.abs(p.stats.mean) : 0
      if (cv > 2) lines.push(`  HIGH VARIABILITY: "${p.key}" CV=${(cv * 100).toFixed(0)}%`)
    }
  })

  // 8. SAMPLE DATA — limited to 5 rows x 8 cols to save tokens
  lines.push("\n=== SECTION 8: SAMPLE DATA (first 5 rows) ===")
  const sampleCols = columns.slice(0, 8).map((c) => c.key)
  lines.push(sampleCols.join(" | "))
  rows.slice(0, 5).forEach((row) => {
    lines.push(sampleCols.map((c) => String(row[c] ?? "").substring(0, 20)).join(" | "))
  })

  return lines.join("\n")
}

/* ── Debug Logger ── */

function log(stage: string, data?: unknown) {
  const timestamp = new Date().toISOString()
  const separator = "─".repeat(60)
  console.log(`\n${separator}`)
  console.log(`[ANALYZE API] ${timestamp} │ ${stage}`)
  if (data !== undefined) {
    if (typeof data === "string") {
      if (data.length > 800) {
        console.log(`  ▸ [${data.length} chars total]`)
        console.log(`  ▸ FIRST 400:\n${data.substring(0, 400)}`)
        console.log(`  ▸ ...`)
        console.log(`  ▸ LAST 300:\n${data.substring(data.length - 300)}`)
      } else {
        console.log(data)
      }
    } else {
      console.log(JSON.stringify(data, null, 2))
    }
  }
  console.log(separator)
}

function logError(stage: string, error: unknown) {
  const timestamp = new Date().toISOString()
  console.error(`\n${"═".repeat(60)}`)
  console.error(`[ANALYZE API ERROR] ${timestamp} │ ${stage}`)
  if (error instanceof Error) {
    console.error(`  ✖ Message: ${error.message}`)
    console.error(`  ✖ Stack:   ${error.stack?.split("\n").slice(0, 4).join("\n             ")}`)
  } else {
    console.error(`  ✖ Raw:`, error)
  }
  console.error("═".repeat(60))
}

/* ── AI Analysis via Groq ── */

async function runAIAnalysis(dataSummary: string): Promise<{
  kpis: KPI[]
  charts: ChartData[]
  description: string
  trends: string[]
  recommendations: string[]
  conclusions: Conclusion[]
}> {
  const chartColors = ["#00d4ff", "#ff3d71", "#ffaa00", "#7c5cff", "#00e676"]

  // Cap summary to ~8,000 tokens (≈32,000 chars) to stay under Groq's 12k TPM limit.
  // The static prompt template consumes ~2,500 tokens; response needs ~1,500 tokens headroom.
  const MAX_SUMMARY_CHARS = 14_000
  const safeSummary =
    dataSummary.length > MAX_SUMMARY_CHARS
      ? dataSummary.substring(0, MAX_SUMMARY_CHARS) +
        "\n\n[Summary truncated to fit token limit. Analyze what is provided above.]"
      : dataSummary

  const prompt = `You are a senior data scientist and business analyst with 20 years of experience turning raw data into strategic insight. You will be given a pre-computed statistical summary of a dataset.

IMPORTANT: Your job is NOT to repeat the statistics back. Your job is to REASON about what the data means — to discover hidden patterns, explain WHY things are the way they are, identify what is surprising or unexpected, and tell a coherent story about the underlying reality this data represents.

Think like a detective, not a calculator. Ask yourself:
- What is unusual or unexpected here? What defies intuition?
- What relationships BETWEEN columns reveal something that neither column reveals alone?
- If this were a business, what would keep the CEO up at night?
- What is this data NOT telling us, and why does that absence matter?
- What story does the trend arc tell — acceleration, decline, seasonality, disruption?
- Which segments are behaving fundamentally differently from the rest, and what does that signal?

=== BANNED OUTPUTS — NEVER WRITE THESE ===
- "The dataset contains X records" — obvious, adds zero insight
- "Column X has a mean of Y" — just repeating the summary
- "Consider analyzing further" — vague and useless
- "The top category is X" — only meaningful if you explain WHY and WHAT IT IMPLIES
- Any sentence that could apply to ANY dataset — must be 100% specific to THIS data
- Restating a number without interpreting what that number MEANS in context

=== WHAT GOOD INSIGHTS LOOK LIKE ===
GOOD: "Despite accounting for only 12% of transactions, the top 3 customers generate 67% of revenue — a dangerous concentration that means losing any one of them could drop total revenue by 20-30%"
GOOD: "Sales velocity doubles in the last 3 days of each month, suggesting reps are sandbagging deals for quota timing — a pattern that inflates end-of-month forecasts by an estimated 40%"
GOOD: "The 18% null rate in the discount column correlates with the highest-value orders, implying discounts are being applied off-system for premium customers — a compliance and margin visibility risk"
GOOD: "Customer acquisition cost has risen 3.4x while average order value has been flat for 8 months — the business is on a trajectory where CAC will exceed LTV within 2 quarters if nothing changes"

Return ONLY valid JSON. No markdown fences, no text outside the JSON object.

{
  "kpis": [
    {
      "label": "METRIC NAME IN CAPS (max 4 words)",
      "value": "formatted value like 1.24M or 38.5% or 4821",
      "change": null,
      "positive": true,
      "color": "#00d4ff"
    }
  ],
  "charts": [
    {
      "type": "line or bar or pie",
      "title": "Title that names the INSIGHT not just the data e.g. Top 3 Categories Drive 78 Percent of Revenue",
      "description": "Sentence 1: the surprising or important pattern this chart reveals. Sentence 2: the exact numbers that make it striking. Sentence 3: the business implication and what decision this should drive.",
      "data": [{"name": "label", "value": 123.45}],
      "xKey": "name",
      "yKey": "value",
      "color": "#00d4ff"
    }
  ],
  "description": "4-5 sentence narrative that tells the STORY of this dataset. Do not list facts — connect them causally. Start with the single most important finding. Explain the underlying dynamic — not just what, but WHY. Note the biggest hidden risk or opportunity. End with what the trajectory implies if nothing changes.",
  "trends": [
    "Each trend must be a PATTERN not a data point. Format: what is changing + the rate or magnitude + what is driving it if inferable + what it means for the future. Minimum 2 sentences. Example: Revenue has accelerated from flat growth in H1 to 23% MoM in H2, with Electronics leading the surge at 41% category share. This inflection coincides with the expansion into the 18-25 age segment, suggesting a new customer cohort is driving a structural shift in demand — not just a seasonal bump."
  ],
  "recommendations": [
    "Format: (1) the specific action, (2) the exact data evidence that justifies it with column names and values, (3) the estimated impact or risk if ignored. Be concrete enough that someone could act tomorrow."
  ],
  "conclusions": [
    {
      "category": "behavioral or operational or financial or risk or opportunity or data_quality",
      "title": "A title that sounds like a discovery not a label. Example: Premium Customers Are Being Systematically Underserved",
      "finding": "The core insight stated as a complete thought. Must make a stakeholder say I did not know that or that is a problem. Must synthesize at least 2 data signals from different columns.",
      "evidence": "List the exact column names, values, percentages, and ratios from the data summary that prove this. Be specific and precise.",
      "implication": "What decision, risk, or opportunity does this create? What happens if this is ignored for 6 months? What is the first concrete action someone should take?",
      "confidence": "high or medium or low"
    }
  ]
}

=== RULES ===
KPIs: exactly 4. Pick metrics that together tell the most important story — not just the biggest numbers. Colors in order: #00d4ff, #ff3d71, #ffaa00, #7c5cff.

Charts: exactly 4-5.
- Titles must name the INSIGHT not just the axis labels
- Line charts: show trajectory and inflection points over time
- Bar charts: show ranking gaps where the gap between items IS the story
- Pie charts: only when concentration or composition IS the insight
- Data must come from the pre-aggregated sections — use real values only
- 5 to 15 data points per chart

Trends: exactly 5. Each must explain a direction, a rate, and an implication. No snapshots.

Recommendations: exactly 4. Specific enough to act on tomorrow. No vague advice.

Conclusions: 6-8 total. Must include at least one of each category. Each must synthesize signals from at least 2 columns. The finding must be non-obvious — something you could not see by looking at a single number.

=== DATA SUMMARY ===
${safeSummary}`

  // ── Log outgoing prompt ──
  log("📤 SENDING PROMPT TO GROQ", prompt)
  log("📊 PROMPT STATS", {
    total_chars: prompt.length,
    total_tokens_approx: Math.round(prompt.length / 4),
    summary_chars_original: dataSummary.length,
    summary_chars_used: safeSummary.length,
    summary_was_truncated: dataSummary.length > MAX_SUMMARY_CHARS,
    model: "llama-3.3-70b-versatile",
  })

  const startTime = Date.now()

  let raw: string
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2500,
    })
    raw = (completion.choices[0]?.message?.content ?? "").trim()

    const elapsed = Date.now() - startTime
    log(`✅ RAW RESPONSE FROM GROQ (${elapsed}ms)`, raw)
    log("📊 RESPONSE STATS", {
      response_chars: raw.length,
      response_tokens_approx: Math.round(raw.length / 4),
      elapsed_ms: elapsed,
      starts_with_fence: raw.startsWith("```"),
    })
  } catch (error) {
    logError("Groq API call failed", error)
    throw error
  }

  // Strip markdown code fences if present
  const hadFence = raw.startsWith("```")
  raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
  if (hadFence) {
    log("🔧 STRIPPED MARKDOWN FENCES", { cleaned_length: raw.length })
  }

  let aiResult: {
    kpis: KPI[]
    charts: ChartData[]
    description: string
    trends: string[]
    recommendations: string[]
    conclusions: Conclusion[]
  }

  try {
    aiResult = JSON.parse(raw)
    log("✅ JSON PARSE SUCCESSFUL", {
      kpis_count: aiResult.kpis?.length ?? 0,
      charts_count: aiResult.charts?.length ?? 0,
      trends_count: aiResult.trends?.length ?? 0,
      recommendations_count: aiResult.recommendations?.length ?? 0,
      conclusions_count: aiResult.conclusions?.length ?? 0,
      has_description: !!aiResult.description,
    })
  } catch (parseError) {
    logError("JSON parse failed", parseError)
    log("💥 UNPARSEABLE RAW RESPONSE", raw)
    throw new Error(`Failed to parse Groq JSON response. Raw preview: ${raw.substring(0, 300)}`)
  }

  // Log the parsed KPIs and chart titles for quick inspection
  log("📈 PARSED KPIs", aiResult.kpis?.map((k) => `${k.label}: ${k.value}`) ?? [])
  log("📊 PARSED CHARTS", aiResult.charts?.map((c, i) => ({
    index: i,
    type: c.type,
    title: c.title,
    data_points: c.data?.length ?? 0,
    xKey: c.xKey,
    yKey: c.yKey,
  })) ?? [])
  log("💡 TRENDS", aiResult.trends ?? [])
  log("🎯 RECOMMENDATIONS", aiResult.recommendations ?? [])
  log("🔍 CONCLUSIONS", aiResult.conclusions?.map((c) => `[${c.category}/${c.confidence}] ${c.title}`) ?? [])

  // Enrich with fallback colors
  const enrichedCharts = aiResult.charts.map((chart, idx) => ({
    ...chart,
    color: chart.color || chartColors[idx % chartColors.length],
    data: Array.isArray(chart.data) ? chart.data : [],
  }))

  return {
    kpis: aiResult.kpis || [],
    charts: enrichedCharts,
    description: aiResult.description || "",
    trends: aiResult.trends || [],
    recommendations: aiResult.recommendations || [],
    conclusions: aiResult.conclusions || [],
  }
}

/* ── Main Handler ── */

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 8).toUpperCase()

  log(`🚀 [${requestId}] REQUEST RECEIVED`)

  try {
    const body: AnalysisRequest = await request.json()
    const { columns, rows, dataset_id } = body

    log(`📥 [${requestId}] REQUEST BODY`, {
      dataset_id,
      columns_count: columns?.length ?? 0,
      rows_count: rows?.length ?? 0,
      column_names: columns?.map((c) => c.key) ?? [],
    })

    if (!columns || !rows || rows.length === 0) {
      log(`⚠️  [${requestId}] VALIDATION FAILED — no data`)
      return NextResponse.json({ error: "No data provided for analysis" }, { status: 400 })
    }

    // Detect column types
    const numericCols = detectNumericColumns(columns, rows)
    const boolCols = detectBooleanColumns(columns, rows, numericCols)
    const dateCols = detectDateColumns(columns, rows)
    const categoricalCols = detectCategoricalColumns(columns, rows, numericCols, dateCols, boolCols)

    log(`🔍 [${requestId}] COLUMN DETECTION`, {
      numeric: numericCols,
      boolean: boolCols,
      date: dateCols,
      categorical: categoricalCols,
      unclassified: columns
        .map((c) => c.key)
        .filter((k) => !numericCols.includes(k) && !boolCols.includes(k) && !dateCols.includes(k) && !categoricalCols.includes(k)),
    })

    // Build column profiles
    const columnProfiles = buildColumnProfiles(
      columns, rows, numericCols, categoricalCols, dateCols, boolCols
    )
    log(`📋 [${requestId}] COLUMN PROFILES BUILT`, { count: columnProfiles.length })

    // Build data summary
    const dataSummary = buildDataSummary(
      columns, rows, numericCols, categoricalCols, dateCols, boolCols, columnProfiles
    )
    log(`📝 [${requestId}] DATA SUMMARY BUILT`, {
      summary_chars: dataSummary.length,
      summary_lines: dataSummary.split("\n").length,
    })

    // Run AI analysis
    log(`🤖 [${requestId}] STARTING AI ANALYSIS...`)
    const aiAnalysis = await runAIAnalysis(dataSummary)
    log(`✅ [${requestId}] AI ANALYSIS COMPLETE`)

    const finalResponse = {
      ...aiAnalysis,
      column_profiles: columnProfiles,
      meta: {
        total_records: rows.length,
        numeric_columns: numericCols,
        categorical_columns: categoricalCols,
        date_columns: dateCols,
        boolean_columns: boolCols,
        total_columns: columns.length,
      },
    }

    log(`📤 [${requestId}] SENDING FINAL RESPONSE`, {
      kpis: finalResponse.kpis.length,
      charts: finalResponse.charts.length,
      trends: finalResponse.trends.length,
      recommendations: finalResponse.recommendations.length,
      conclusions: finalResponse.conclusions.length,
      column_profiles: finalResponse.column_profiles.length,
      total_records: finalResponse.meta.total_records,
    })

    return NextResponse.json(finalResponse)

  } catch (error) {
    logError(`[${requestId}] UNHANDLED ERROR in POST handler`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    )
  }
}