import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const requestTimestamps: number[] = []
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 25

function isRateLimited(): boolean {
  const now = Date.now()
  while (requestTimestamps.length && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) return true
  requestTimestamps.push(now)
  return false
}

// ─── Retry with exponential back-off ─────────────────────────────────────────
async function groqWithRetry(
  params: Parameters<typeof groq.chat.completions.create>[0],
  retries = 2
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await groq.chat.completions.create(params)
    } catch (err: unknown) {
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") || err.message.toLowerCase().includes("rate limit"))
      if (is429 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      throw err
    }
  }
  throw new Error("Unreachable")
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnProfile {
  key: string
  dtype: string
  distinct_count: number
  null_count: number
  total_count: number
  stats?: { min: number; max: number; mean: number; median: number; sum: number }
  top_values: { value: string; count: number; percentage: number }[]
}

interface AnalysisMeta {
  total_records: number
  total_columns: number
  numeric_columns: string[]
  categorical_columns: string[]
  date_columns: string[]
  boolean_columns: string[]
}

interface ChatRequest {
  question: string
  history: { role: "user" | "assistant"; content: string }[]
  analysis: {
    meta: AnalysisMeta
    column_profiles: ColumnProfile[]
    description: string
    trends: string[]
    recommendations: string[]
    conclusions?: { title: string; finding: string; evidence: string }[]
    kpis: { label: string; value: string }[]
  }
}

interface ChartOutput {
  type: "bar" | "line" | "pie"
  title: string
  description: string
  data: { name: string; value: number }[]
  xKey: string
  yKey: string
  color: string
}

// ─── Formula/metric detection ─────────────────────────────────────────────────

function isFormulaRequest(question: string): boolean {
  const q = question.toLowerCase()
  return (
    q.includes("churn") ||
    q.includes("retention") ||
    q.includes("growth rate") ||
    q.includes("cagr") ||
    q.includes("roi") ||
    q.includes("margin") ||
    q.includes("conversion rate") ||
    q.includes("average order") ||
    q.includes("lifetime value") ||
    q.includes("ltv") ||
    q.includes("clv") ||
    q.includes("cac") ||
    q.includes("acquisition cost") ||
    q.includes("revenue per") ||
    q.includes("cost per") ||
    q.includes("calculate") ||
    q.includes("formula") ||
    q.includes("compute") ||
    q.includes("percentage") ||
    q.includes("ratio") ||
    q.includes("rate of") ||
    q.includes("month over month") ||
    q.includes("year over year") ||
    q.includes("yoy") ||
    q.includes("mom") ||
    q.includes("forecast") ||
    q.includes("trend over") ||
    q.includes("correlation")
  )
}

function isChartRequest(question: string): boolean {
  const q = question.toLowerCase()
  return (
    q.includes("chart") || q.includes("graph") || q.includes("plot") ||
    q.includes("visuali") || q.includes("show me a") || q.includes("bar chart") ||
    q.includes("pie chart") || q.includes("line chart") || q.includes("histogram") ||
    q.includes("breakdown of") || q.includes("distribution of")
  )
}

// ─── Context builders ─────────────────────────────────────────────────────────

function buildDocumentContext(analysis: ChatRequest["analysis"], question?: string): string {
  const { meta, column_profiles, description, trends, recommendations, conclusions, kpis } = analysis
  const lines: string[] = []

  lines.push(`Records:${meta.total_records} Cols:${meta.total_columns}`)
  lines.push(`Numeric:${meta.numeric_columns.join(",") || "none"}`)
  lines.push(`Categorical:${meta.categorical_columns.join(",") || "none"}`)
  if (meta.date_columns.length) lines.push(`Dates:${meta.date_columns.join(",")}`)
  if (meta.boolean_columns.length) lines.push(`Booleans:${meta.boolean_columns.join(",")}`)
  lines.push("KPIs:" + kpis.map((k) => `${k.label}=${k.value}`).join(" | "))

  const q = (question ?? "").toLowerCase()
  const mentionedCols = column_profiles.filter(
    (p) =>
      q.includes(p.key.toLowerCase()) ||
      q.includes(p.key.replace(/_/g, " ").toLowerCase())
  )

  // For formula requests, include ALL numeric columns with full stats
  const wantsFormula = isFormulaRequest(question ?? "")
  let colsToShow: ColumnProfile[]

  if (wantsFormula) {
    // Prioritise mentioned cols, then all numeric, then top categorical
    const numericProfiles = column_profiles.filter(p => p.dtype === "numeric" || p.dtype === "date")
    const others = column_profiles.filter(p => p.dtype !== "numeric" && p.dtype !== "date").slice(0, 4)
    colsToShow = [...new Set([...mentionedCols, ...numericProfiles, ...others])]
  } else {
    colsToShow = mentionedCols.length > 0 ? mentionedCols : column_profiles.slice(0, 6)
  }

  lines.push("COLUMNS:")
  colsToShow.forEach((p) => {
    const nullPct = ((p.null_count / p.total_count) * 100).toFixed(1)
    lines.push(`[${p.key}] ${p.dtype} distinct=${p.distinct_count} nulls=${nullPct}%`)
    if (p.stats) {
      lines.push(
        `  min=${p.stats.min} max=${p.stats.max} mean=${p.stats.mean.toFixed(2)} median=${p.stats.median} sum=${p.stats.sum.toLocaleString()}`
      )
    }
    if (p.top_values.length > 0) {
      const top = p.top_values.slice(0, 5).map((v) => `"${v.value}"(${v.count},${v.percentage}%)`).join(",")
      lines.push(`  top:${top}`)
    }
  })

  lines.push("SUMMARY:" + description.substring(0, 400))
  lines.push("TRENDS:" + trends.slice(0, 4).map((t, i) => `${i + 1}.${t}`).join(" | "))
  lines.push("RECS:" + recommendations.slice(0, 3).map((r, i) => `${i + 1}.${r}`).join(" | "))
  if (conclusions?.length) {
    lines.push(
      "CONCLUSIONS:" + conclusions.slice(0, 4).map((c) => `${c.title}: ${c.finding}`).join(" | ")
    )
  }

  return lines.join("\n")
}

function buildSuggestionsContext(analysis: ChatRequest["analysis"]): string {
  const { meta, column_profiles, kpis, description } = analysis
  const lines: string[] = []
  lines.push(`Records:${meta.total_records} Cols:${meta.total_columns}`)
  lines.push(`Numeric:${meta.numeric_columns.join(",")}`)
  lines.push(`Categorical:${meta.categorical_columns.join(",")}`)
  if (meta.date_columns.length) lines.push(`Dates:${meta.date_columns.join(",")}`)
  lines.push("KPIs:" + kpis.map((k) => `${k.label}=${k.value}`).join("|"))
  lines.push("SUMMARY:" + description.substring(0, 200))
  column_profiles.slice(0, 5).forEach((p) => {
    const top = p.top_values.slice(0, 3).map((v) => v.value).join(",")
    lines.push(`[${p.key}] ${p.dtype} top:${top}`)
  })
  return lines.join("\n")
}

// ─── Suggestions handler ──────────────────────────────────────────────────────

async function handleSuggestions(analysis: ChatRequest["analysis"]): Promise<NextResponse> {
  if (!analysis) return NextResponse.json({ questions: [] })

  if (isRateLimited()) {
    return NextResponse.json({ questions: [] })
  }

  try {
    const documentContext = buildSuggestionsContext(analysis)

    const completion = await groqWithRetry({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a JSON generator. You ONLY output raw JSON arrays. No markdown, no explanation, no backticks.",
        },
        {
          role: "user",
          content: `Dataset:\n${documentContext}\n\nGenerate exactly 6 short questions (max 10 words each) a data analyst would ask about THIS data. Include: 1 trend question, 1 segment/outlier question, 1 cross-column relationship, 1 chart request, 1 formula/metric question (e.g. churn rate, growth rate, margin), 1 comparison question. Each must reference actual column names or values.\n\nReturn ONLY: ["question1","question2","question3","question4","question5","question6"]`,
        },
      ],
      temperature: 0.5,
      max_tokens: 200,
    })

    const raw = (completion.choices[0]?.message?.content ?? "[]").trim()

    const arrayMatch = raw.match(/\[[\s\S]*\]/)
    if (!arrayMatch) {
      console.error("Suggestions: no JSON array in response:", raw)
      return NextResponse.json({ questions: [] })
    }

    const questions = JSON.parse(arrayMatch[0])
    return NextResponse.json({
      questions: Array.isArray(questions) ? questions.slice(0, 6) : [],
    })
  } catch (error) {
    console.error("Suggested questions error:", error)
    return NextResponse.json({ questions: [] })
  }
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest & { mode?: "suggestions" } = await request.json()

    if (body.mode === "suggestions") {
      return handleSuggestions(body.analysis)
    }

    const { question, history, analysis } = body

    if (!question?.trim()) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 })
    }
    if (!analysis) {
      return NextResponse.json({ error: "No document context provided" }, { status: 400 })
    }

    if (isRateLimited()) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 }
      )
    }

    const documentContext = buildDocumentContext(analysis, question)
    const wantsChart = isChartRequest(question)
    const wantsFormula = isFormulaRequest(question)

    const formulaGuidance = wantsFormula ? `
FORMULA & METRIC RULES:
- You CAN calculate derived metrics using the column stats provided (min, max, mean, median, sum, counts, top_values with counts and percentages).
- Supported calculations from available data:
  • Churn Rate = (lost customers / total customers at start) × 100 — use count/distinct values to approximate if a status/churn column exists
  • Retention Rate = 100 - Churn Rate
  • Growth Rate = ((current - previous) / previous) × 100 — use min/max or top_values time periods
  • Margin = ((revenue - cost) / revenue) × 100 — if both revenue and cost columns exist
  • Conversion Rate = (converted / total) × 100 — use top_values counts for boolean/status columns
  • Average Order Value = sum(revenue) / count(orders)
  • Revenue per Customer = sum(revenue) / distinct_count(customer column)
  • Month-over-Month or Year-over-Year: derive from top_values on date columns showing period counts
  • Ratio/Percentage: any two numeric columns can be divided or compared
- Show your working: state which columns and values you used, write out the formula, then compute the result.
- If exact calculation is impossible (data not granular enough), clearly say what approximation you made and why.
- NEVER fabricate numbers. If a metric truly cannot be computed from the available stats, explain what additional data would be needed.
` : ""

    const systemPrompt = `You are a data analyst assistant locked to a single dataset. You ONLY answer questions about THIS specific dataset described below.

STRICT RULES:
1. NEVER answer general knowledge questions. If asked anything unrelated to the dataset, respond ONLY with: "I can only answer questions about your loaded dataset."
2. NEVER make up data. If the answer is not in the context, say: "That information is not available in the current dataset."
3. Always cite the exact column name or statistic from the context.
4. Be concise — lead with the answer, then support with data evidence.
5. Use **bold** for key numbers and column names.
6. For calculations, always show: Formula used → Values plugged in → Result.
${formulaGuidance}
${wantsChart ? `CHART RULE: After your explanation, append EXACTLY:
CHART_JSON:{"type":"bar|line|pie","title":"insight title","description":"what this reveals","data":[{"name":"label","value":123}],"xKey":"name","yKey":"value","color":"#00d4ff"}
- Use ONLY values from the context. bar=comparisons, line=time trends, pie=composition (max 6 slices). 5-12 data points.` : ""}

=== DATASET ===
${documentContext}`

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-4).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
      { role: "user", content: question },
    ]

    const completion = await groqWithRetry({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,
      // Give more tokens for formula answers so working is shown in full
      max_tokens: wantsFormula ? 800 : wantsChart ? 600 : 350,
    })

    const raw = completion.choices[0]?.message?.content ?? "Sorry, I could not generate a response."

    let answer = raw
    let chart: ChartOutput | null = null

    const chartMarker = "CHART_JSON:"
    const chartIdx = raw.indexOf(chartMarker)
    if (chartIdx !== -1) {
      answer = raw.substring(0, chartIdx).trim()
      try {
        const jsonStr = raw.substring(chartIdx + chartMarker.length).trim()
        const parsed = JSON.parse(jsonStr)
        if (parsed.type && parsed.title && Array.isArray(parsed.data) && parsed.data.length > 0) {
          chart = {
            type: parsed.type,
            title: parsed.title,
            description: parsed.description || "",
            data: parsed.data,
            xKey: parsed.xKey || "name",
            yKey: parsed.yKey || "value",
            color: parsed.color || "#00d4ff",
          }
        }
      } catch {
        answer = raw.replace(chartMarker, "").trim()
      }
    }

    return NextResponse.json({ answer, chart })
  } catch (error) {
    console.error("Chat error:", error)
    const msg = error instanceof Error ? error.message : "Chat failed"
    const status = msg.includes("429") || msg.toLowerCase().includes("rate limit") ? 429 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

// ─── GET (backward compat only) ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contextParam = searchParams.get("context")
  if (!contextParam) return NextResponse.json({ questions: [] })
  try {
    const analysis = JSON.parse(decodeURIComponent(contextParam))
    return handleSuggestions(analysis)
  } catch {
    return NextResponse.json({ questions: [] })
  }
}