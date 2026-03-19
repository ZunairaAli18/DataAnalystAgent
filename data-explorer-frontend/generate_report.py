"""
generate_report.py
Reads JSON analysis data from stdin, writes a fully-featured PDF to stdout.
Charts are rendered with matplotlib and embedded as images.
"""

import sys
import json
import io
import math
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib import rcParams

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Image, KeepTogether
)
from reportlab.platypus.flowables import Flowable

# ── Palette ──────────────────────────────────────────────────────────────────
DARK_BG    = colors.HexColor("#0d1117")
CARD_BG    = colors.HexColor("#161b22")
BORDER     = colors.HexColor("#21262d")
PRIMARY    = colors.HexColor("#00d4ff")
SECONDARY  = colors.HexColor("#7c5cff")
ACCENT1    = colors.HexColor("#ff3d71")
ACCENT2    = colors.HexColor("#ffaa00")
ACCENT3    = colors.HexColor("#00e676")
TEXT_MAIN  = colors.HexColor("#e6edf3")
TEXT_MUTED = colors.HexColor("#8b949e")
TEXT_DIM   = colors.HexColor("#484f58")

CHART_COLORS = ["#00d4ff","#7c5cff","#ff3d71","#ffaa00","#00e676",
                "#f472b6","#38bdf8","#fbbf24","#a78bfa","#34d399"]

rcParams.update({
    "figure.facecolor":  "#0d1117",
    "axes.facecolor":    "#161b22",
    "axes.edgecolor":    "#21262d",
    "axes.labelcolor":   "#8b949e",
    "xtick.color":       "#8b949e",
    "ytick.color":       "#8b949e",
    "text.color":        "#e6edf3",
    "grid.color":        "#21262d",
    "grid.alpha":        0.8,
    "font.family":       "DejaVu Sans",
    "font.size":         9,
})

W, H = A4
MARGIN = 18 * mm

# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    base = getSampleStyleSheet()

    def ps(name, **kw):
        return ParagraphStyle(name, **kw)

    return {
        "cover_title": ps("cover_title",
            fontSize=32, leading=38, textColor=TEXT_MAIN,
            fontName="Helvetica-Bold", alignment=TA_LEFT),
        "cover_sub": ps("cover_sub",
            fontSize=13, leading=18, textColor=PRIMARY,
            fontName="Helvetica", alignment=TA_LEFT),
        "cover_meta": ps("cover_meta",
            fontSize=9, leading=14, textColor=TEXT_MUTED,
            fontName="Helvetica", alignment=TA_LEFT),
        "section_title": ps("section_title",
            fontSize=16, leading=22, textColor=TEXT_MAIN,
            fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6),
        "subsection": ps("subsection",
            fontSize=12, leading=16, textColor=PRIMARY,
            fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4),
        "body": ps("body",
            fontSize=9, leading=14, textColor=TEXT_MUTED,
            fontName="Helvetica", spaceAfter=4),
        "body_main": ps("body_main",
            fontSize=9, leading=14, textColor=TEXT_MAIN,
            fontName="Helvetica", spaceAfter=4),
        "caption": ps("caption",
            fontSize=8, leading=11, textColor=TEXT_DIM,
            fontName="Helvetica-Oblique", alignment=TA_CENTER),
        "kpi_value": ps("kpi_value",
            fontSize=22, leading=26, textColor=PRIMARY,
            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "kpi_label": ps("kpi_label",
            fontSize=8, leading=11, textColor=TEXT_MUTED,
            fontName="Helvetica", alignment=TA_CENTER),
        "tag": ps("tag",
            fontSize=8, leading=11, textColor=ACCENT3,
            fontName="Helvetica-Bold"),
        "bullet": ps("bullet",
            fontSize=9, leading=14, textColor=TEXT_MUTED,
            fontName="Helvetica", leftIndent=12, spaceAfter=3),
        "toc_item": ps("toc_item",
            fontSize=10, leading=16, textColor=TEXT_MUTED,
            fontName="Helvetica"),
        "col_name": ps("col_name",
            fontSize=9, leading=12, textColor=PRIMARY,
            fontName="Helvetica-Bold"),
        "table_header": ps("table_header",
            fontSize=8, leading=11, textColor=TEXT_MAIN,
            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "table_cell": ps("table_cell",
            fontSize=8, leading=11, textColor=TEXT_MUTED,
            fontName="Helvetica", alignment=TA_CENTER),
    }

# ── Helper flowables ─────────────────────────────────────────────────────────
class ColorRect(Flowable):
    def __init__(self, w, h, fill, radius=4):
        super().__init__()
        self.w, self.h, self.fill, self.radius = w, h, fill, radius
    def draw(self):
        self.canv.setFillColor(self.fill)
        self.canv.roundRect(0, 0, self.w, self.h, self.radius, stroke=0, fill=1)

def hr(color=BORDER, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=6, spaceBefore=6)

def sp(h=6):
    return Spacer(1, h)

def card_table(rows, col_widths, style_extra=None):
    base_style = [
        ("BACKGROUND",   (0,0), (-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[CARD_BG, colors.HexColor("#1c2128")]),
        ("TEXTCOLOR",    (0,0), (-1,-1), TEXT_MUTED),
        ("FONTNAME",     (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-1), 8),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("GRID",         (0,0), (-1,-1), 0.3, BORDER),
        ("ROUNDEDCORNERS",(0,0),(-1,-1), 4),
    ]
    if style_extra:
        base_style.extend(style_extra)
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle(base_style))
    return t

# ── Chart helpers ─────────────────────────────────────────────────────────────
def fig_to_image(fig, width_pt, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    buf.seek(0)
    plt.close(fig)
    img = Image(buf)
    aspect = img.imageHeight / img.imageWidth
    img.drawWidth  = width_pt
    img.drawHeight = width_pt * aspect
    return img

def bar_chart(labels, values, title, color=None, width_pt=440, height_in=3):
    colors_list = [color or CHART_COLORS[i % len(CHART_COLORS)] for i, _ in enumerate(labels)]
    fig, ax = plt.subplots(figsize=(width_pt/100, height_in))
    bars = ax.bar(range(len(labels)), values, color=colors_list, edgecolor="none", zorder=3)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels([str(l)[:18] for l in labels], rotation=30, ha="right", fontsize=8)
    ax.yaxis.grid(True, zorder=0)
    ax.set_axisbelow(True)
    ax.spines[['top','right','left','bottom']].set_visible(False)
    ax.tick_params(axis='y', labelsize=8)
    ax.set_title(title, fontsize=10, fontweight='bold', color='#e6edf3', pad=8)
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + max(values)*0.01,
                f"{val:,.0f}", ha='center', va='bottom', fontsize=7, color='#8b949e')
    fig.tight_layout()
    return fig_to_image(fig, width_pt)

def hbar_chart(labels, values, title, width_pt=440, height_in=3):
    fig, ax = plt.subplots(figsize=(width_pt/100, height_in))
    bar_colors = [CHART_COLORS[i % len(CHART_COLORS)] for i in range(len(labels))]
    bars = ax.barh(range(len(labels)), values, color=bar_colors, edgecolor="none", zorder=3)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels([str(l)[:22] for l in labels], fontsize=8)
    ax.xaxis.grid(True, zorder=0)
    ax.set_axisbelow(True)
    ax.spines[['top','right','left','bottom']].set_visible(False)
    ax.tick_params(axis='x', labelsize=8)
    ax.set_title(title, fontsize=10, fontweight='bold', color='#e6edf3', pad=8)
    for bar, val in zip(bars, values):
        ax.text(val + max(values)*0.01, bar.get_y() + bar.get_height()/2,
                f"{val:,.0f}", va='center', fontsize=7, color='#8b949e')
    fig.tight_layout()
    return fig_to_image(fig, width_pt)

def pie_chart(labels, values, title, width_pt=300):
    fig, ax = plt.subplots(figsize=(width_pt/100, width_pt/100))
    clrs = [CHART_COLORS[i % len(CHART_COLORS)] for i in range(len(labels))]
    wedges, texts, autotexts = ax.pie(
        values, labels=None, colors=clrs,
        autopct='%1.1f%%', pctdistance=0.75,
        startangle=140, wedgeprops=dict(width=0.55, edgecolor='#0d1117', linewidth=1.5)
    )
    for at in autotexts:
        at.set_fontsize(7)
        at.set_color('#e6edf3')
    ax.set_title(title, fontsize=10, fontweight='bold', color='#e6edf3', pad=6)
    legend_labels = [f"{l[:18]}  {v:,.0f}" for l, v in zip(labels, values)]
    ax.legend(legend_labels, loc='lower center', bbox_to_anchor=(0.5, -0.28),
              ncol=2, fontsize=7, frameon=False, labelcolor='#8b949e')
    fig.tight_layout()
    return fig_to_image(fig, width_pt)

def line_chart(labels, values, title, color=None, width_pt=440, height_in=2.8):
    c = color or CHART_COLORS[0]
    fig, ax = plt.subplots(figsize=(width_pt/100, height_in))
    ax.plot(range(len(labels)), values, color=c, linewidth=2, marker='o',
            markersize=4, markerfacecolor=c, zorder=3)
    ax.fill_between(range(len(labels)), values, alpha=0.12, color=c)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels([str(l)[:10] for l in labels], rotation=30, ha="right", fontsize=8)
    ax.yaxis.grid(True, zorder=0)
    ax.set_axisbelow(True)
    ax.spines[['top','right','left','bottom']].set_visible(False)
    ax.tick_params(axis='y', labelsize=8)
    ax.set_title(title, fontsize=10, fontweight='bold', color='#e6edf3', pad=8)
    fig.tight_layout()
    return fig_to_image(fig, width_pt)

def sparkbar(values, color, width_pt=80, height_pt=28):
    fig, ax = plt.subplots(figsize=(width_pt/72, height_pt/72))
    ax.bar(range(len(values)), values, color=color, edgecolor='none', width=0.8)
    ax.axis('off')
    fig.patch.set_alpha(0)
    ax.set_facecolor('none')
    fig.tight_layout(pad=0)
    return fig_to_image(fig, width_pt)

def dtype_color(dtype):
    return {"numeric":"#00d4ff","categorical":"#ff3d71","date":"#ffaa00",
            "boolean":"#7c5cff","text":"#8b949e"}.get(str(dtype).lower(), "#8b949e")

# ── Section builders ──────────────────────────────────────────────────────────
def build_cover(story, data, S):
    meta = data.get("meta", {})
    now  = datetime.now().strftime("%B %d, %Y  %H:%M")

    story.append(sp(40))
    story.append(Paragraph("Data Analysis Report", S["cover_title"]))
    story.append(sp(6))
    story.append(Paragraph("Automated Intelligence Summary", S["cover_sub"]))
    story.append(sp(20))
    story.append(hr(PRIMARY, 1.5))
    story.append(sp(12))

    meta_rows = [
        ["Records Analysed", f"{meta.get('total_records',0):,}"],
        ["Columns",           str(meta.get('total_columns', 0))],
        ["Numeric Cols",      str(len(meta.get('numeric_columns', [])))],
        ["Categorical Cols",  str(len(meta.get('categorical_columns', [])))],
        ["Date Cols",         str(len(meta.get('date_columns', [])))],
        ["Generated",         now],
    ]
    cw = [(W - 2*MARGIN) * 0.38, (W - 2*MARGIN) * 0.62]
    rows_fmt = []
    for k, v in meta_rows:
        rows_fmt.append([
            Paragraph(k, S["body"]),
            Paragraph(f"<b>{v}</b>", S["body_main"]),
        ])
    t = Table(rows_fmt, colWidths=cw)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[CARD_BG, colors.HexColor("#1c2128")]),
        ("TOPPADDING",   (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LEFTPADDING",  (0,0),(-1,-1), 10),
        ("RIGHTPADDING", (0,0),(-1,-1), 10),
        ("GRID",         (0,0),(-1,-1), 0.3, BORDER),
    ]))
    story.append(t)
    story.append(sp(20))

    desc = data.get("description","")
    if desc:
        story.append(Paragraph(desc, S["body"]))

    story.append(PageBreak())

def build_kpis(story, data, S):
    kpis = data.get("kpis", [])
    if not kpis:
        return
    story.append(Paragraph("Key Performance Indicators", S["section_title"]))
    story.append(hr())

    usable_w = W - 2*MARGIN
    cols = min(4, len(kpis))
    cell_w = usable_w / cols

    rows = []
    row = []
    for i, kpi in enumerate(kpis):
        chg = kpi.get("change")
        chg_str = ""
        if chg is not None:
            arrow = "▲" if kpi.get("positive", True) else "▼"
            chg_str = f"{arrow} {chg}%"
        cell = [
            Paragraph(kpi.get("value","—"), S["kpi_value"]),
            Paragraph(kpi.get("label",""),  S["kpi_label"]),
        ]
        if chg_str:
            clr = "#00e676" if kpi.get("positive", True) else "#ff3d71"
            cell.append(Paragraph(f'<font color="{clr}">{chg_str}</font>', S["kpi_label"]))
        row.append(cell)
        if len(row) == cols or i == len(kpis)-1:
            while len(row) < cols:
                row.append([""])
            rows.append(row)
            row = []

    for r in rows:
        inner = []
        for cell in r:
            inner_t = Table([[p] for p in cell], colWidths=[cell_w - 16])
            inner_t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), CARD_BG),
                ("TOPPADDING",    (0,0),(-1,-1), 10),
                ("BOTTOMPADDING", (0,0),(-1,-1), 10),
                ("LEFTPADDING",   (0,0),(-1,-1), 8),
                ("RIGHTPADDING",  (0,0),(-1,-1), 8),
                ("ALIGN",         (0,0),(-1,-1), "CENTER"),
            ]))
            inner.append(inner_t)
        outer = Table([inner], colWidths=[cell_w]*cols)
        outer.setStyle(TableStyle([
            ("LEFTPADDING",  (0,0),(-1,-1), 3),
            ("RIGHTPADDING", (0,0),(-1,-1), 3),
            ("TOPPADDING",   (0,0),(-1,-1), 3),
            ("BOTTOMPADDING",(0,0),(-1,-1), 3),
            ("GRID",         (0,0),(-1,-1), 0.4, BORDER),
            ("BACKGROUND",   (0,0),(-1,-1), CARD_BG),
        ]))
        story.append(outer)
        story.append(sp(4))
    story.append(sp(8))

def compute_chart_insights(labels, values, ctype, title):
    """Derive statistical insight bullets from chart data."""
    if not values:
        return []
    total   = sum(values)
    max_v   = max(values)
    min_v   = min(values)
    mean_v  = total / len(values)
    max_lbl = labels[values.index(max_v)] if labels else ""
    min_lbl = labels[values.index(min_v)] if labels else ""
    insights = []

    # Leader / dominant share
    max_pct = (max_v / total * 100) if total else 0
    insights.append(
        f"<b>{max_lbl}</b> leads with <b>{max_v:,.0f}</b> "
        f"({max_pct:.1f}% of total {total:,.0f})."
    )

    # Trailing item
    if len(labels) > 1:
        min_pct = (min_v / total * 100) if total else 0
        insights.append(
            f"<b>{min_lbl}</b> is the lowest at <b>{min_v:,.0f}</b> "
            f"({min_pct:.1f}%), a <b>{((max_v - min_v) / min_v * 100):.0f}%</b> "
            f"gap vs the leader."
            if min_v > 0 else
            f"<b>{min_lbl}</b> records the lowest value at <b>{min_v:,.0f}</b>."
        )

    # Concentration — top-2 share
    if len(values) >= 3:
        sorted_vals = sorted(values, reverse=True)
        top2_pct = sum(sorted_vals[:2]) / total * 100 if total else 0
        insights.append(
            f"Top 2 categories account for <b>{top2_pct:.1f}%</b> of the total, "
            f"indicating {'high' if top2_pct > 60 else 'moderate'} concentration."
        )

    # Trend direction for line charts
    if ctype == "line" and len(values) >= 3:
        first_half  = sum(values[:len(values)//2])
        second_half = sum(values[len(values)//2:])
        direction   = "upward" if second_half > first_half else "downward"
        change_pct  = abs((second_half - first_half) / first_half * 100) if first_half else 0
        insights.append(
            f"Overall <b>{direction} trend</b>: second half averages "
            f"<b>{change_pct:.1f}%</b> {'more' if direction=='upward' else 'less'} "
            f"than the first half."
        )
        # Peak detection
        peak_idx = values.index(max_v)
        insights.append(
            f"Peak at <b>{max_lbl}</b> ({max_v:,.0f}). "
            f"{'Growth accelerates toward period end.' if peak_idx >= len(values)//2 else 'Peak occurs early in the period.'}"
        )

    # Average vs leader for bar/pie
    if ctype in ("bar","pie","column") and len(values) > 2:
        above_avg = sum(1 for v in values if v > mean_v)
        insights.append(
            f"Average across categories: <b>{mean_v:,.0f}</b>. "
            f"<b>{above_avg}</b> of {len(values)} categories exceed the average."
        )

    return insights


def build_charts(story, data, S):
    charts = data.get("charts", [])
    if not charts:
        return
    story.append(Paragraph("Chart-by-Chart Insights", S["section_title"]))
    story.append(hr())

    usable_w = W - 2*MARGIN

    for i, chart in enumerate(charts):
        cdata = chart.get("data", [])
        if not cdata:
            continue

        labels = [str(d.get(chart.get("xKey","name"), "")) for d in cdata]
        values = [float(d.get(chart.get("yKey","value"), 0) or 0) for d in cdata]
        title  = chart.get("title","Chart")
        ctype  = chart.get("type","bar")
        color  = chart.get("color", CHART_COLORS[i % len(CHART_COLORS)])
        desc   = chart.get("description","")

        story.append(Paragraph(f"{i+1}. {title}", S["subsection"]))
        story.append(hr(BORDER, 0.3))

        # ── Description paragraph ──
        if desc:
            story.append(Paragraph(desc, S["body"]))
            story.append(sp(4))

        # ── Chart image ──
        try:
            if ctype == "pie":
                img = pie_chart(labels, values, title, width_pt=usable_w * 0.65)
            elif ctype == "line":
                img = line_chart(labels, values, title, color=color, width_pt=usable_w)
            else:
                if len(labels) > 8:
                    img = hbar_chart(labels, values, title, width_pt=usable_w,
                                     height_in=max(2.5, len(labels)*0.32))
                else:
                    img = bar_chart(labels, values, title, color=color, width_pt=usable_w)
            story.append(img)
        except Exception as e:
            story.append(Paragraph(f"[Chart error: {e}]", S["body"]))

        story.append(sp(6))

        # ── Statistical insights block ──
        insights = compute_chart_insights(labels, values, ctype, title)
        if insights:
            dot_style = ParagraphStyle("dot", fontSize=9,
                textColor=colors.HexColor(color if color else "#00d4ff"),
                fontName="Helvetica-Bold", alignment=TA_LEFT)
            insight_rows = []
            for ins in insights:
                insight_rows.append([
                    Paragraph("●", dot_style),
                    Paragraph(ins, S["body"]),
                ])
            dot_w  = 14
            text_w = usable_w - dot_w
            ins_t  = Table(insight_rows, colWidths=[dot_w, text_w])
            ins_t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), colors.HexColor("#0d1117")),
                ("TOPPADDING",    (0,0),(-1,-1), 4),
                ("BOTTOMPADDING", (0,0),(-1,-1), 4),
                ("LEFTPADDING",   (0,0),(0,-1),  6),
                ("RIGHTPADDING",  (0,0),(0,-1),  2),
                ("LEFTPADDING",   (1,0),(1,-1),  4),
                ("RIGHTPADDING",  (1,0),(1,-1),  8),
                ("VALIGN",        (0,0),(-1,-1), "TOP"),
                ("LINEBEFORE",    (0,0),(0,-1),  2, colors.HexColor(color if color else "#00d4ff")),
            ]))
            story.append(ins_t)
            story.append(sp(6))

        # ── Data table beneath chart ──
        if len(labels) <= 20:
            total = sum(values)
            trows = [[
                Paragraph("Category",  S["table_header"]),
                Paragraph("Value",     S["table_header"]),
                Paragraph("Share %",   S["table_header"]),
                Paragraph("vs Avg",    S["table_header"]),
            ]]
            mean_v = total / len(values) if values else 1
            for lbl, val in zip(labels, values):
                pct     = (val / total * 100) if total else 0
                vs_avg  = ((val - mean_v) / mean_v * 100) if mean_v else 0
                vs_col  = "#00e676" if vs_avg >= 0 else "#ff3d71"
                vs_sign = "+" if vs_avg >= 0 else ""
                trows.append([
                    Paragraph(str(lbl)[:32], S["table_cell"]),
                    Paragraph(f"{val:,.2f}", S["table_cell"]),
                    Paragraph(f"{pct:.1f}%", S["table_cell"]),
                    Paragraph(
                        f'<font color="{vs_col}">{vs_sign}{vs_avg:.1f}%</font>',
                        S["table_cell"]),
                ])
            cw4 = [usable_w*0.44, usable_w*0.20, usable_w*0.18, usable_w*0.18]
            t = Table(trows, colWidths=cw4)
            t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1, 0), colors.HexColor("#21262d")),
                ("BACKGROUND",    (0,1),(-1,-1), CARD_BG),
                ("ROWBACKGROUNDS",(0,1),(-1,-1),[CARD_BG, colors.HexColor("#1c2128")]),
                ("TOPPADDING",    (0,0),(-1,-1), 5),
                ("BOTTOMPADDING", (0,0),(-1,-1), 5),
                ("LEFTPADDING",   (0,0),(-1,-1), 8),
                ("RIGHTPADDING",  (0,0),(-1,-1), 8),
                ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
                ("ALIGN",         (0,0),(-1,-1), "CENTER"),
            ]))
            story.append(t)

        story.append(sp(18))

def build_column_profiles(story, data, S):
    profiles = data.get("column_profiles", [])
    if not profiles:
        return

    story.append(PageBreak())
    story.append(Paragraph("Column-by-Column Analysis", S["section_title"]))
    story.append(hr())
    story.append(Paragraph(
        "Each column is profiled below with its data type, completeness, "
        "cardinality, statistical summary, and distribution of its most frequent values.",
        S["body"]))
    story.append(sp(8))

    usable_w = W - 2*MARGIN

    for idx, col in enumerate(profiles):
        key   = col.get("key","")
        dtype = col.get("dtype","")
        dist  = col.get("distinct_count", 0)
        nulls = col.get("null_count", 0)
        total = col.get("total_count", 1) or 1
        null_pct = (nulls / total) * 100
        comp_pct = 100 - null_pct
        stats = col.get("stats")
        top_v = col.get("top_values", [])
        dcolor = dtype_color(dtype)

        header = Table([[
            Paragraph(f'<font color="{dcolor}">■</font>  {key.upper()}', S["col_name"]),
            Paragraph(f'<font color="{dcolor}">[{dtype}]</font>', S["col_name"]),
            Paragraph(f'Distinct: <b>{dist:,}</b>', S["body"]),
            Paragraph(f'Complete: <b>{comp_pct:.1f}%</b>', S["body"]),
            Paragraph(f'Nulls: <b>{nulls:,}</b>', S["body"]),
        ]], colWidths=[usable_w*0.28, usable_w*0.14, usable_w*0.18,
                      usable_w*0.18, usable_w*0.22])
        header.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), colors.HexColor("#1c2128")),
            ("TOPPADDING",    (0,0),(-1,-1), 6),
            ("BOTTOMPADDING", (0,0),(-1,-1), 6),
            ("LEFTPADDING",   (0,0),(-1,-1), 8),
            ("RIGHTPADDING",  (0,0),(-1,-1), 8),
            ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ]))

        body_parts = [header]

        # Stats row for numeric columns
        if stats:
            stat_data = [
                ["Min", f"{stats.get('min',0):,.2f}"],
                ["Max", f"{stats.get('max',0):,.2f}"],
                ["Mean", f"{stats.get('mean',0):,.2f}"],
                ["Median", f"{stats.get('median',0):,.2f}"],
                ["Sum", f"{stats.get('sum',0):,.0f}"],
            ]
            stat_row = [[
                Paragraph(f'<font color="{TEXT_MUTED.hexval()}">{k}</font><br/>'
                          f'<b>{v}</b>', S["kpi_label"])
                for k,v in stat_data
            ]]
            st = Table(stat_row, colWidths=[usable_w/5]*5)
            st.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), CARD_BG),
                ("TOPPADDING",    (0,0),(-1,-1), 8),
                ("BOTTOMPADDING", (0,0),(-1,-1), 8),
                ("LEFTPADDING",   (0,0),(-1,-1), 6),
                ("RIGHTPADDING",  (0,0),(-1,-1), 6),
                ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
                ("ALIGN",         (0,0),(-1,-1), "CENTER"),
            ]))
            body_parts.append(st)

        # Top values + mini bar chart side by side
        if top_v:
            tv_labels = [str(tv.get("value",""))[:22] for tv in top_v[:8]]
            tv_counts = [float(tv.get("count",0)) for tv in top_v[:8]]
            tv_pcts   = [float(tv.get("percentage",0)) for tv in top_v[:8]]

            try:
                mini_img = hbar_chart(tv_labels, tv_counts,
                                      f"Top values — {key}",
                                      width_pt=usable_w*0.52,
                                      height_in=max(1.8, len(tv_labels)*0.28))
            except Exception:
                mini_img = Paragraph("", S["body"])

            # Top values table
            tv_rows = [[
                Paragraph("Value", S["table_header"]),
                Paragraph("Count", S["table_header"]),
                Paragraph("%", S["table_header"]),
            ]]
            for lbl, cnt, pct in zip(tv_labels, tv_counts, tv_pcts):
                tv_rows.append([
                    Paragraph(lbl, S["table_cell"]),
                    Paragraph(f"{cnt:,.0f}", S["table_cell"]),
                    Paragraph(f"{pct:.1f}%", S["table_cell"]),
                ])
            tv_cw = [usable_w*0.22, usable_w*0.11, usable_w*0.09]
            tv_t = Table(tv_rows, colWidths=tv_cw)
            tv_t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1, 0), colors.HexColor("#21262d")),
                ("BACKGROUND",    (0,1),(-1,-1), CARD_BG),
                ("ROWBACKGROUNDS",(0,1),(-1,-1),[CARD_BG, colors.HexColor("#1c2128")]),
                ("TOPPADDING",    (0,0),(-1,-1), 4),
                ("BOTTOMPADDING", (0,0),(-1,-1), 4),
                ("LEFTPADDING",   (0,0),(-1,-1), 6),
                ("RIGHTPADDING",  (0,0),(-1,-1), 6),
                ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
            ]))

            combined = Table([[tv_t, mini_img]],
                             colWidths=[usable_w*0.42, usable_w*0.58])
            combined.setStyle(TableStyle([
                ("VALIGN",        (0,0),(-1,-1), "TOP"),
                ("LEFTPADDING",   (0,0),(-1,-1), 0),
                ("RIGHTPADDING",  (0,0),(-1,-1), 0),
                ("TOPPADDING",    (0,0),(-1,-1), 0),
                ("BOTTOMPADDING", (0,0),(-1,-1), 0),
            ]))
            body_parts.append(combined)

        for part in body_parts:
            story.append(part)
        story.append(sp(10))

def build_trends_recs(story, data, S):
    trends = data.get("trends", [])
    recs   = data.get("recommendations", [])
    if not trends and not recs:
        return

    story.append(PageBreak())
    story.append(Paragraph("Trends & Recommendations", S["section_title"]))
    story.append(hr())

    usable_w = W - 2*MARGIN

    if trends:
        story.append(Paragraph("Identified Trends", S["subsection"]))
        for i, t in enumerate(trends, 1):
            story.append(Paragraph(
                f'<font color="#00d4ff"><b>{i}.</b></font>  {t}',
                S["bullet"]))
        story.append(sp(10))

    if recs:
        story.append(Paragraph("Actionable Recommendations", S["subsection"]))
        rec_colors = [CHART_COLORS[i % len(CHART_COLORS)] for i in range(len(recs))]
        for i, (rec, rc) in enumerate(zip(recs, rec_colors), 1):
            story.append(Paragraph(
                f'<font color="{rc}"><b>{i}.</b></font>  {rec}',
                S["bullet"]))
        story.append(sp(10))

def build_conclusions(story, data, S):
    conclusions = data.get("conclusions", [])
    if not conclusions:
        return

    story.append(PageBreak())
    story.append(Paragraph("AI General Conclusions", S["section_title"]))
    story.append(hr())
    story.append(Paragraph(
        "Cross-column synthesis — patterns, risks, and opportunities extracted by AI.",
        S["body"]))
    story.append(sp(8))

    usable_w = W - 2*MARGIN
    CAT_COLORS = {
        "financial":    "#00e676", "behavioral": "#38bdf8",
        "operational":  "#ffaa00", "risk":       "#ff3d71",
        "opportunity":  "#a78bfa", "data_quality":"#fbbf24",
    }
    CONF_COLORS = {"high":"#00e676","medium":"#ffaa00","low":"#ff3d71"}

    for c in conclusions:
        cat    = c.get("category","operational")
        conf   = c.get("confidence","medium")
        cc     = CAT_COLORS.get(cat, "#8b949e")
        confc  = CONF_COLORS.get(conf, "#8b949e")
        title  = c.get("title","")
        finding= c.get("finding","")
        evid   = c.get("evidence","")
        impl   = c.get("implication","")

        blk = Table([[
            Table([[
                Paragraph(f'<font color="{cc}"><b>[{cat.upper()}]</b></font>'
                          f'  <font color="{confc}">● {conf} confidence</font>', S["tag"]),
                Paragraph(f"<b>{title}</b>", S["body_main"]),
                Paragraph(finding, S["body"]),
            ]], colWidths=[usable_w - 30]),
        ]], colWidths=[usable_w])
        blk.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), CARD_BG),
            ("LEFTPADDING",   (0,0),(-1,-1), 10),
            ("RIGHTPADDING",  (0,0),(-1,-1), 10),
            ("TOPPADDING",    (0,0),(-1,-1), 8),
            ("BOTTOMPADDING", (0,0),(-1,-1), 8),
            ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
            ("LINEBEFORE",    (0,0),(0,-1),  2, colors.HexColor(cc)),
        ]))
        story.append(blk)

        if evid or impl:
            sub_rows = []
            if evid:
                sub_rows.append([
                    Paragraph('<font color="#484f58"><b>EVIDENCE</b></font>', S["caption"]),
                    Paragraph(evid, S["body"]),
                ])
            if impl:
                sub_rows.append([
                    Paragraph('<font color="#484f58"><b>IMPLICATION</b></font>', S["caption"]),
                    Paragraph(impl, S["body"]),
                ])
            sub_t = Table(sub_rows, colWidths=[usable_w*0.18, usable_w*0.82])
            sub_t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), colors.HexColor("#0d1117")),
                ("TOPPADDING",    (0,0),(-1,-1), 5),
                ("BOTTOMPADDING", (0,0),(-1,-1), 5),
                ("LEFTPADDING",   (0,0),(-1,-1), 8),
                ("RIGHTPADDING",  (0,0),(-1,-1), 8),
                ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
                ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ]))
            story.append(sub_t)
        story.append(sp(6))

def build_quality_scorecard(story, data, S):
    profiles = data.get("column_profiles", [])
    if not profiles:
        return

    story.append(PageBreak())
    story.append(Paragraph("Data Quality Scorecard", S["section_title"]))
    story.append(hr())
    story.append(Paragraph(
        "Completeness, cardinality, and quality signals across all columns.",
        S["body"]))
    story.append(sp(8))

    usable_w = W - 2*MARGIN
    headers = [
        Paragraph("Column",       S["table_header"]),
        Paragraph("Type",         S["table_header"]),
        Paragraph("Completeness", S["table_header"]),
        Paragraph("Distinct",     S["table_header"]),
        Paragraph("Signal",       S["table_header"]),
    ]
    rows = [headers]
    for col in profiles:
        key   = col.get("key","")
        dtype = col.get("dtype","")
        nulls = col.get("null_count",0)
        total = col.get("total_count",1) or 1
        dist  = col.get("distinct_count",0)
        comp  = 100 - (nulls/total*100)
        signal = "Good" if comp >= 95 else ("Fair" if comp >= 80 else "Poor")
        sc = "#00e676" if signal == "Good" else ("#ffaa00" if signal == "Fair" else "#ff3d71")
        dc = dtype_color(dtype)
        rows.append([
            Paragraph(key, S["table_cell"]),
            Paragraph(f'<font color="{dc}">{dtype}</font>', S["table_cell"]),
            Paragraph(f"{comp:.1f}%", S["table_cell"]),
            Paragraph(f"{dist:,}", S["table_cell"]),
            Paragraph(f'<font color="{sc}">✓ {signal}</font>', S["table_cell"]),
        ])

    cw = [usable_w*0.30, usable_w*0.15, usable_w*0.20,
          usable_w*0.15, usable_w*0.20]
    t = Table(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1, 0), colors.HexColor("#21262d")),
        ("BACKGROUND",    (0,1),(-1,-1), CARD_BG),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[CARD_BG, colors.HexColor("#1c2128")]),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
        ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    story.append(t)

# ── Page template ─────────────────────────────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    # Dark background
    canvas.setFillColor(DARK_BG)
    canvas.rect(0, 0, W, H, stroke=0, fill=1)
    # Top accent bar
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, H - 3, W, 3, stroke=0, fill=1)
    # Footer
    canvas.setFillColor(TEXT_DIM)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(MARGIN, 10*mm,
        f"Data Analysis Report  |  Generated {datetime.now().strftime('%Y-%m-%d')}")
    canvas.drawRightString(W - MARGIN, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

# ── Main ──────────────────────────────────────────────────────────────────────
def generate(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + 6*mm, bottomMargin=MARGIN + 4*mm,
        title="Data Analysis Report",
    )

    S = make_styles()
    story = []

    build_cover(story, data, S)
    build_kpis(story, data, S)
    build_charts(story, data, S)
    build_column_profiles(story, data, S)
    build_trends_recs(story, data, S)
    build_conclusions(story, data, S)
    build_quality_scorecard(story, data, S)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


if __name__ == "__main__":
    raw = sys.stdin.buffer.read()
    data = json.loads(raw)
    pdf_bytes = generate(data)
    sys.stdout.buffer.write(pdf_bytes)