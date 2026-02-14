"""
PDF Report Generator - generates a detailed textual analytical report
from dashboard data using reportlab.
Usage: Called by the Next.js API route /api/export-report
"""

import json
import sys
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Palette ──────────────────────────────────────────────────────────────────
DARK_BG    = colors.HexColor("#0d1b2a")
ACCENT     = colors.HexColor("#00d4ff")
ACCENT2    = colors.HexColor("#7c5cff")
ACCENT3    = colors.HexColor("#ffaa00")
MUTED      = colors.HexColor("#94a3b8")
CARD_BG    = colors.HexColor("#1a2a3a")
BORDER     = colors.HexColor("#2d3f50")
WHITE      = colors.white
RED        = colors.HexColor("#ff3d71")
GREEN      = colors.HexColor("#00e676")

W, H = A4
MARGIN = 18 * mm


def make_styles():
    base = getSampleStyleSheet()

    styles = {
        "cover_title": ParagraphStyle(
            "cover_title",
            fontName="Helvetica-Bold",
            fontSize=28,
            textColor=WHITE,
            leading=36,
            spaceAfter=6,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            fontName="Helvetica",
            fontSize=13,
            textColor=MUTED,
            leading=18,
            spaceAfter=4,
        ),
        "section_heading": ParagraphStyle(
            "section_heading",
            fontName="Helvetica-Bold",
            fontSize=14,
            textColor=ACCENT,
            leading=20,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "sub_heading": ParagraphStyle(
            "sub_heading",
            fontName="Helvetica-Bold",
            fontSize=10,
            textColor=WHITE,
            leading=14,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            fontName="Helvetica",
            fontSize=9,
            textColor=MUTED,
            leading=14,
            spaceAfter=4,
        ),
        "body_white": ParagraphStyle(
            "body_white",
            fontName="Helvetica",
            fontSize=9,
            textColor=WHITE,
            leading=14,
            spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            fontName="Helvetica",
            fontSize=9,
            textColor=MUTED,
            leading=14,
            leftIndent=12,
            spaceAfter=3,
        ),
        "kpi_value": ParagraphStyle(
            "kpi_value",
            fontName="Helvetica-Bold",
            fontSize=16,
            textColor=ACCENT,
            leading=20,
        ),
        "table_header": ParagraphStyle(
            "table_header",
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=WHITE,
            leading=11,
        ),
        "table_cell": ParagraphStyle(
            "table_cell",
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            leading=11,
        ),
        "caption": ParagraphStyle(
            "caption",
            fontName="Helvetica-Oblique",
            fontSize=8,
            textColor=MUTED,
            leading=11,
            spaceAfter=6,
        ),
        "footer": ParagraphStyle(
            "footer",
            fontName="Helvetica",
            fontSize=7,
            textColor=MUTED,
            leading=10,
        ),
    }
    return styles


def divider(color=BORDER, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=8, spaceBefore=4)


def section_header(text, styles):
    return [
        Paragraph(text, styles["section_heading"]),
        divider(ACCENT, 1),
    ]


# ── Cover Page ────────────────────────────────────────────────────────────────
def build_cover(story, data, styles):
    generated_at = datetime.now().strftime("%B %d, %Y  %H:%M")
    meta = data.get("meta", {})
    total = meta.get("total_records", 0)
    total_cols = meta.get("total_columns", 0)

    story.append(Spacer(1, 40 * mm))
    story.append(Paragraph("Data Analysis Report", styles["cover_title"]))
    story.append(Paragraph("Automated Intelligence Summary", styles["cover_sub"]))
    story.append(Spacer(1, 6 * mm))
    story.append(divider(ACCENT, 2))
    story.append(Spacer(1, 4 * mm))

    # Meta row
    meta_items = [
        ("Records Analysed", f"{total:,}"),
        ("Columns", str(total_cols)),
        ("Numeric Cols", str(len(meta.get("numeric_columns", [])))),
        ("Categorical Cols", str(len(meta.get("categorical_columns", [])))),
        ("Date Cols", str(len(meta.get("date_columns", [])))),
        ("Generated", generated_at),
    ]
    tdata = [[Paragraph(k, styles["table_header"]), Paragraph(v, styles["body_white"])]
             for k, v in meta_items]
    t = Table(tdata, colWidths=[55 * mm, 80 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [CARD_BG, DARK_BG]),
        ("BOX",  (0, 0), (-1, -1), 0.5, BORDER),
        ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 8 * mm))

    # Description
    description = data.get("description", "")
    if description:
        story.append(Paragraph(description, styles["body"]))

    story.append(PageBreak())


# ── Executive Summary ─────────────────────────────────────────────────────────
def build_executive_summary(story, data, styles):
    story += section_header("1. Executive Summary", styles)
    meta = data.get("meta", {})
    kpis = data.get("kpis", [])
    trends = data.get("trends", [])

    # Narrative
    total = meta.get("total_records", 0)
    num_cols = meta.get("numeric_columns", [])
    cat_cols = meta.get("categorical_columns", [])
    date_cols = meta.get("date_columns", [])

    intro = (
        f"This report presents an automated analysis of a dataset containing "
        f"<b>{total:,} records</b> across "
        f"<b>{meta.get('total_columns', 0)} columns</b>. "
        f"The dataset includes {len(num_cols)} numeric, "
        f"{len(cat_cols)} categorical, and {len(date_cols)} date columns. "
        f"The analysis covers key performance indicators, statistical trends, "
        f"data quality observations, and actionable recommendations."
    )
    story.append(Paragraph(intro, ParagraphStyle(
        "intro", fontName="Helvetica", fontSize=9.5, textColor=WHITE,
        leading=15, spaceAfter=10
    )))

    # KPI summary table
    if kpis:
        story.append(Paragraph("Key Performance Indicators", styles["sub_heading"]))
        headers = ["Metric", "Value", "Change", "Direction"]
        rows = [headers]
        for kpi in kpis:
            change_str = f"{kpi.get('change', 0)}%" if kpi.get("change") is not None else "N/A"
            direction = "Positive" if kpi.get("positive") else "Negative" if kpi.get("change") is not None else "—"
            rows.append([
                kpi.get("label", ""),
                kpi.get("value", ""),
                change_str,
                direction,
            ])

        col_widths = [70 * mm, 40 * mm, 30 * mm, 30 * mm]
        t = Table(rows, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0), ACCENT),
            ("TEXTCOLOR",   (0, 0), (-1, 0), DARK_BG),
            ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, 0), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD_BG, DARK_BG]),
            ("TEXTCOLOR",   (0, 1), (-1, -1), MUTED),
            ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE",    (0, 1), (-1, -1), 8),
            ("BOX",  (0, 0), (-1, -1), 0.5, BORDER),
            ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
            ("ALIGN",  (1, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING",   (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1, 6 * mm))

    # Trends summary
    if trends:
        story.append(Paragraph("Key Trends Overview", styles["sub_heading"]))
        for i, trend in enumerate(trends, 1):
            story.append(Paragraph(f"<b>{i}.</b>  {trend}", styles["bullet"]))
        story.append(Spacer(1, 4 * mm))

    story.append(PageBreak())


# ── Column Profiles ───────────────────────────────────────────────────────────
def build_column_profiles(story, data, styles):
    profiles = data.get("column_profiles", [])
    if not profiles:
        return

    story += section_header("2. Column-by-Column Analysis", styles)
    story.append(Paragraph(
        "Each column is profiled below with its data type, completeness, cardinality, "
        "and the distribution of its most frequent values.",
        styles["body"]
    ))
    story.append(Spacer(1, 3 * mm))

    dtype_labels = {
        "numeric": "Numeric",
        "categorical": "Categorical",
        "date": "Date / Time",
        "boolean": "Boolean",
        "text": "Free Text",
    }

    for idx, col in enumerate(profiles):
        key = col.get("key", "")
        dtype = col.get("dtype", "")
        distinct = col.get("distinct_count", 0)
        nulls = col.get("null_count", 0)
        total = col.get("total_count", 1)
        null_pct = (nulls / total * 100) if total else 0
        completeness = 100 - null_pct

        # Column heading
        story.append(Paragraph(
            f"{idx + 1}. {key.replace('_', ' ').title()}  "
            f"<font color='#00d4ff' size='7'>[{dtype_labels.get(dtype, dtype)}]</font>",
            styles["sub_heading"]
        ))

        # Stats row
        stat_parts = [
            f"<b>Distinct values:</b> {distinct:,}",
            f"<b>Completeness:</b> {completeness:.1f}%",
            f"<b>Null records:</b> {nulls:,} ({null_pct:.1f}%)",
        ]
        stats_obj = col.get("stats")
        if stats_obj:
            stat_parts += [
                f"<b>Min:</b> {stats_obj['min']:,}",
                f"<b>Max:</b> {stats_obj['max']:,}",
                f"<b>Mean:</b> {stats_obj['mean']:.2f}",
                f"<b>Median:</b> {stats_obj['median']:,}",
                f"<b>Sum:</b> {stats_obj['sum']:,}",
            ]
        story.append(Paragraph("  |  ".join(stat_parts), styles["body"]))

        # Quality note
        if null_pct > 20:
            story.append(Paragraph(
                f"&#x26A0;  High null rate ({null_pct:.1f}%) — consider imputation or exclusion before modelling.",
                ParagraphStyle("warn", fontName="Helvetica-Oblique", fontSize=8,
                               textColor=ACCENT3, leading=12, spaceAfter=3)
            ))
        elif null_pct == 0:
            story.append(Paragraph(
                "&#x2713;  Column is fully complete with no missing values.",
                ParagraphStyle("ok", fontName="Helvetica-Oblique", fontSize=8,
                               textColor=GREEN, leading=12, spaceAfter=3)
            ))

        # Top values table
        top_vals = col.get("top_values", [])
        if top_vals:
            headers = ["Value", "Count", "% of Total"]
            rows = [headers]
            for tv in top_vals[:10]:
                rows.append([str(tv["value"]), f"{tv['count']:,}", f"{tv['percentage']:.1f}%"])
            col_w = [90 * mm, 35 * mm, 35 * mm]
            t = Table(rows, colWidths=col_w)
            t.setStyle(TableStyle([
                ("BACKGROUND",  (0, 0), (-1, 0), ACCENT2),
                ("TEXTCOLOR",   (0, 0), (-1, 0), WHITE),
                ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",    (0, 0), (-1, 0), 7.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD_BG, DARK_BG]),
                ("TEXTCOLOR",   (0, 1), (-1, -1), MUTED),
                ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE",    (0, 1), (-1, -1), 8),
                ("BOX",  (0, 0), (-1, -1), 0.5, BORDER),
                ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
                ("ALIGN",  (1, 0), (-1, -1), "RIGHT"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING",   (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ]))
            story.append(t)

        story.append(Spacer(1, 5 * mm))
        story.append(divider())

    story.append(PageBreak())


# ── Chart Insights ────────────────────────────────────────────────────────────
def build_chart_insights(story, data, styles):
    charts = data.get("charts", [])
    if not charts:
        return

    story += section_header("3. Chart-by-Chart Insights", styles)
    story.append(Paragraph(
        "The following section narrates the key findings from each chart generated "
        "during the analysis. Data tables accompany each chart insight.",
        styles["body"]
    ))
    story.append(Spacer(1, 3 * mm))

    for idx, chart in enumerate(charts):
        title = chart.get("title", f"Chart {idx + 1}")
        description = chart.get("description", "")
        chart_data = chart.get("data", [])
        chart_type = chart.get("type", "bar")
        x_key = chart.get("xKey", "name")
        y_key = chart.get("yKey", "value")

        story.append(Paragraph(f"3.{idx + 1}  {title}", styles["sub_heading"]))

        if description:
            story.append(Paragraph(description, styles["body"]))

        # Narrative insight
        if chart_data:
            values = [float(row.get(y_key, 0) or 0) for row in chart_data]
            total  = sum(values)
            max_v  = max(values) if values else 0
            min_v  = min(values) if values else 0
            peak   = next((str(r.get(x_key, "")) for r in chart_data if float(r.get(y_key, 0) or 0) == max_v), "N/A")
            lowest = next((str(r.get(x_key, "")) for r in chart_data if float(r.get(y_key, 0) or 0) == min_v), "N/A")
            avg    = total / len(values) if values else 0

            if chart_type == "line":
                narrative = (
                    f"The trend spans {len(chart_data)} data points. "
                    f"The highest value of <b>{max_v:,.2f}</b> occurs at <b>{peak}</b>, "
                    f"while the lowest of <b>{min_v:,.2f}</b> is at <b>{lowest}</b>. "
                    f"The average across all points is <b>{avg:,.2f}</b>, "
                    f"with a cumulative total of <b>{total:,.2f}</b>."
                )
            elif chart_type in ("pie",):
                top_pct = (max_v / total * 100) if total else 0
                narrative = (
                    f"This distribution covers {len(chart_data)} segments. "
                    f"<b>{peak}</b> holds the dominant share at "
                    f"<b>{top_pct:.1f}%</b> ({max_v:,.2f}). "
                    f"The smallest segment is <b>{lowest}</b> at {min_v:,.2f}. "
                    f"Total across all segments: <b>{total:,.2f}</b>."
                )
            else:
                top_pct = (max_v / total * 100) if total else 0
                narrative = (
                    f"Comparing {len(chart_data)} categories, <b>{peak}</b> ranks first "
                    f"with <b>{max_v:,.2f}</b> ({top_pct:.1f}% of the total). "
                    f"<b>{lowest}</b> registers the lowest at {min_v:,.2f}. "
                    f"Combined total: <b>{total:,.2f}</b>, average per category: <b>{avg:,.2f}</b>."
                )
            story.append(Paragraph(narrative, styles["body"]))

        # Data table (top 12 rows)
        if chart_data:
            x_label = x_key.replace("_", " ").title()
            y_label = y_key.replace("_", " ").title()
            trows = [[x_label, y_label]]
            for row in chart_data[:12]:
                trows.append([str(row.get(x_key, "")), f"{float(row.get(y_key, 0) or 0):,.2f}"])
            t = Table(trows, colWidths=[105 * mm, 55 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND",  (0, 0), (-1, 0), CARD_BG),
                ("TEXTCOLOR",   (0, 0), (-1, 0), ACCENT),
                ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",    (0, 0), (-1, 0), 7.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD_BG, DARK_BG]),
                ("TEXTCOLOR",   (0, 1), (-1, -1), MUTED),
                ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE",    (0, 1), (-1, -1), 8),
                ("BOX",  (0, 0), (-1, -1), 0.5, BORDER),
                ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
                ("ALIGN",  (1, 0), (-1, -1), "RIGHT"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING",   (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ]))
            story.append(t)
            if len(chart_data) > 12:
                story.append(Paragraph(
                    f"Showing top 12 of {len(chart_data)} rows.",
                    styles["caption"]
                ))

        story.append(Spacer(1, 5 * mm))
        story.append(divider())

    story.append(PageBreak())


# ── Trends & Recommendations ──────────────────────────────────────────────────
def build_trends_and_recommendations(story, data, styles):
    trends = data.get("trends", [])
    recommendations = data.get("recommendations", [])

    story += section_header("4. Trends & Recommendations", styles)

    if trends:
        story.append(Paragraph("Identified Trends", styles["sub_heading"]))
        for i, trend in enumerate(trends, 1):
            story.append(Paragraph(
                f"<b>{i}.</b>  {trend}",
                styles["bullet"]
            ))
        story.append(Spacer(1, 5 * mm))

    if recommendations:
        story.append(Paragraph("Actionable Recommendations", styles["sub_heading"]))
        for i, rec in enumerate(recommendations, 1):
            story.append(Paragraph(
                f"<b>{i}.</b>  {rec}",
                styles["bullet"]
            ))
        story.append(Spacer(1, 5 * mm))

    story.append(PageBreak())


# ── Data Quality Scorecard ────────────────────────────────────────────────────
def build_data_quality(story, data, styles):
    profiles = data.get("column_profiles", [])
    if not profiles:
        return

    story += section_header("5. Data Quality Scorecard", styles)
    story.append(Paragraph(
        "This section summarises data quality metrics across all columns, "
        "highlighting completeness, cardinality, and any concerns.",
        styles["body"]
    ))
    story.append(Spacer(1, 3 * mm))

    headers = ["Column", "Type", "Completeness", "Distinct", "Quality Signal"]
    rows = [headers]
    for col in profiles:
        total = col.get("total_count", 1) or 1
        nulls = col.get("null_count", 0)
        completeness = ((total - nulls) / total * 100)
        distinct = col.get("distinct_count", 0)
        null_pct = 100 - completeness

        if null_pct > 30:
            signal = "High Nulls"
        elif null_pct > 10:
            signal = "Moderate Nulls"
        elif distinct == 1:
            signal = "Constant Column"
        elif distinct == total:
            signal = "Unique (ID-like)"
        else:
            signal = "Good"

        rows.append([
            col.get("key", "").replace("_", " "),
            col.get("dtype", ""),
            f"{completeness:.1f}%",
            f"{distinct:,}",
            signal,
        ])

    col_widths = [55 * mm, 28 * mm, 28 * mm, 28 * mm, 31 * mm]
    t = Table(rows, colWidths=col_widths)

    row_colors = []
    for i, row in enumerate(rows[1:], 1):
        if row[4] in ("High Nulls",):
            row_colors.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#2a1a1a")))
        elif row[4] == "Good":
            row_colors.append(("BACKGROUND", (0, i), (-1, i), CARD_BG if i % 2 else DARK_BG))

    style_cmds = [
        ("BACKGROUND",  (0, 0), (-1, 0), ACCENT3),
        ("TEXTCOLOR",   (0, 0), (-1, 0), DARK_BG),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, 0), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD_BG, DARK_BG]),
        ("TEXTCOLOR",   (0, 1), (-1, -1), MUTED),
        ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",    (0, 1), (-1, -1), 8),
        ("BOX",  (0, 0), (-1, -1), 0.5, BORDER),
        ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("ALIGN",  (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
    ] + row_colors

    t.setStyle(TableStyle(style_cmds))
    story.append(t)
    story.append(Spacer(1, 4 * mm))

    # Highlight high-null columns with specific advice
    high_null = [c for c in profiles if (c.get("null_count", 0) / (c.get("total_count", 1) or 1)) > 0.2]
    if high_null:
        story.append(Paragraph("Columns Requiring Attention", styles["sub_heading"]))
        for col in high_null:
            pct = col["null_count"] / (col["total_count"] or 1) * 100
            story.append(Paragraph(
                f"<b>{col['key'].replace('_', ' ').title()}</b>: {pct:.1f}% null. "
                "Consider mean/mode imputation, forward-fill (if time-series), "
                "or exclusion from predictive modelling.",
                styles["bullet"]
            ))


# ── Page background canvas ────────────────────────────────────────────────────
def dark_background(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(DARK_BG)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)

    # Top accent bar
    canvas.setFillColor(ACCENT)
    canvas.rect(0, H - 6, W, 6, fill=1, stroke=0)

    # Footer
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    page_num = doc.page
    canvas.drawString(MARGIN, 12 * mm, f"Data Analysis Report  |  Generated {datetime.now().strftime('%Y-%m-%d')}")
    canvas.drawRightString(W - MARGIN, 12 * mm, f"Page {page_num}")

    # Footer line
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 15 * mm, W - MARGIN, 15 * mm)

    canvas.restoreState()


# ── Main entry ────────────────────────────────────────────────────────────────
def generate_pdf(data: dict) -> bytes:
    buffer = BytesIO()
    styles = make_styles()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 8 * mm,
        bottomMargin=20 * mm,
        title="Data Analysis Report",
        author="Analytics Dashboard",
    )

    story = []
    build_cover(story, data, styles)
    build_executive_summary(story, data, styles)
    build_column_profiles(story, data, styles)
    build_chart_insights(story, data, styles)
    build_trends_and_recommendations(story, data, styles)
    build_data_quality(story, data, styles)

    doc.build(story, onFirstPage=dark_background, onLaterPages=dark_background)
    return buffer.getvalue()


if __name__ == "__main__":
    # Accept JSON from stdin when called as a subprocess
    raw = sys.stdin.read()
    data = json.loads(raw)
    pdf_bytes = generate_pdf(data)
    sys.stdout.buffer.write(pdf_bytes)