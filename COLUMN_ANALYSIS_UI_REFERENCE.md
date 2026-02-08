# Column Analysis Feature - UI Reference Guide

## Visual Components Overview

### 1. Navigation Integration

#### Sidebar (Updated)
```
┌─────────────────────────────┐
│         AVANTE              │
│        SOFT BI              │
├─────────────────────────────┤
│ ▲ Ingestion                │
│ ▢ View Data                │
│ ⊞ Cleaned Data             │
│ 📈 Column Analysis ← NEW    │
│ 📊 Dashboard               │
│ 💬 AI Analyst              │
├─────────────────────────────┤
│                             │
│ EXIT TO SITE                │
│                             │
├─────────────────────────────┤
│ LIVE ANALYSIS               │
│ Connected to ERP Cluster   │
│ ● STREAMING DATA            │
└─────────────────────────────┘
```

#### Cleaned Data Page (Button Added)
```
┌─────────────────────────────────────────────┐
│ ← Back to Original Data                    │
│                                             │
│ Cleaned Data ✓                              │
│ Your data has been cleaned and is ready    │
│ for analysis.                               │
│                                             │
│ Original Dataset: [abc123def456]           │
│                                             │
│ Column Analysis Button    Export CSV Button│
│ (CYAN/Trending Up)        (Primary Color)  │
└─────────────────────────────────────────────┘
```

---

### 2. Column Analysis Page Layout

#### Full Page View
```
┌─────────────────────────────────────────────────────────────────────┐
│                    AVANTE SIDEBAR    │  MAIN CONTENT                │
├──────────────────────────────────────┼───────────────────────────────┤
│                                      │                               │
│ ▲ Ingestion                         │ Column Analysis & Insights    │
│ ▢ View Data                         │ Automated analysis with...   │
│ ⊞ Cleaned Data                      │                               │
│ 📈 Column Analysis (ACTIVE)         │ Column 1 of 5                │
│ 📊 Dashboard                        │ Sales                         │
│ 💬 AI Analyst                       │ ◀ Previous    Next ▶          │
│                                      │                               │
│ EXIT TO SITE                        │ [Sales] [Quantity] [Cost]    │
│                                      │ [Region] [Date]              │
│ LIVE ANALYSIS                       │                               │
│ Connected to ERP                    │                               │
│ ● STREAMING DATA                    │ ┌─────────────────────────┐  │
│                                      │ │ Sales                   │  │
│                                      │ │ numeric                 │  │
│                                      │ │                         │  │
│                                      │ │ 'Sales' is a numeric    │  │
│                                      │ │ column with 1000 values │  │
│                                      │ │ ...                     │  │
│                                      │ └─────────────────────────┘  │
│                                      │                               │
│                                      │ ┌──┬──┬──┬──┬──┬──┐          │
│                                      │ │TC│MS│UV│MN│MX│MA│ Stats   │
│                                      │ │10│5 │85│10│50│25│ Cards  │
│                                      │ │00│.2│6 │0 │00│34│         │
│                                      │ └──┴──┴──┴──┴──┴──┘          │
│                                      │                               │
│                                      │ [Distribution Graph]         │
│                                      │ [Histogram Chart]            │
│                                      │                               │
│                                      │ [Key Insights Card]          │
│                                      │ [Recommendations Card]       │
│                                      │ [Navigation Tips Card]       │
│                                      │                               │
└──────────────────────────────────────┴───────────────────────────────┘
```

---

### 3. Statistics Cards

#### Layout (6 Columns)
```
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Total    │ Missing  │ Unique   │ Mean     │ Min      │ Max      │
│ Values   │    %     │ Values   │          │          │          │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│   1000   │   5.2%   │   856    │ 5234.56  │  100.0   │ 50000.0  │
├──────────┴──────────┴──────────┴──────────┴──────────┴──────────┤
│ Displays in dark background (slate-900/50)                      │
│ Values highlighted in different colors:                          │
│ - Cyan for totals                                                │
│ - Yellow for warnings                                            │
│ - Purple for unique                                              │
│ - Emerald for mean                                               │
│ - Blue for min                                                   │
│ - Red for max                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 4. Distribution Graphs

#### Numeric Column (Histogram)
```
Count
  |     ╭─╮
  |   ╭─╰─╰─╮
  | ╭─╰─────╰─╮
  │─┼────────────┼─→ Range
  0 │___________│ 
    0   1000  2000  3000  4000  5000

Title: Distribution
Bars colored in cyan
Interactive tooltips on hover
```

#### Categorical Column (Bar Chart)
```
Count
  |        ╱────╲
  |    ╱────    ╲
  |╱────          ╲
  ├────────────────────→ Category
  │
Electronics  Clothing  Food  Home  Sports
    (pink bars)
```

#### Temporal Column (Timeline)
```
Timeline from
2024-01-01
         to
2024-12-31

Displays date range in a centered card view
```

---

### 5. Insights Card

#### Example Display
```
┌────────────────────────────────────────────────┐
│ 📈 Key Insights                                │
├────────────────────────────────────────────────┤
│                                                │
│ ✓ 📊 Contains 5.2% missing values that        │
│   should be handled                            │
│                                                │
│ ✓ 📈 Right-skewed distribution detected       │
│                                                │
│ ✓ ⚠️ Potential outliers detected:              │
│   Maximum value (50000) exceeds 3σ threshold  │
│                                                │
└────────────────────────────────────────────────┘

Colors:
- Border: Emerald-500/20
- Background: Emerald-500/5
- Title: Emerald-400
- Icons: Checkmarks in emerald
```

---

### 6. Recommendations Card

#### Example Display
```
┌────────────────────────────────────────────────┐
│ 💡 Recommendations                             │
├────────────────────────────────────────────────┤
│                                                │
│ 1 Consider imputing missing values using       │
│   mean/median or domain-specific methods       │
│                                                │
│ 2 Apply log transformation to handle           │
│   right-skew and improve model performance    │
│                                                │
│ 3 Investigate outliers to determine if they    │
│   are data errors or valid extremes           │
│                                                │
└────────────────────────────────────────────────┘

Colors:
- Border: Amber-500/20
- Background: Amber-500/5
- Title: Amber-400
- Numbers: Amber-400 circles
```

---

### 7. Column Navigator

#### Card Display
```
┌──────────────────────────────────────────┐
│ Column 1 of 5                ◀ Next ▶    │
│ Sales                                     │
└──────────────────────────────────────────┘

Dark background with cyan accent
Previous button disabled on first column
Next button disabled on last column
```

---

### 8. Column Tabs

#### Quick Selection
```
┌──────────────────────────────────────────────────────────┐
│ [Sales] [Quantity] [Cost] [Region] [Date] [Category]   │
│  ↑ Active (cyan)    Inactive (outlined)                  │
└──────────────────────────────────────────────────────────┘

Scrollable horizontally on mobile
Active tab: bg-cyan-500 text-white
Inactive tabs: border-slate-600, can click
```

---

### 9. Header Card

#### Column Title Section
```
┌────────────────────────────────────────────────┐
│ Sales                        numeric           │
│ 'Sales' is a numeric column with 1000 total   │
│ values. Values range from 100 to 50000 with an│
│ average of 5234.56. 5.2% of values are missing│
│                                                │
│ Left: Title + Description                      │
│ Right: Type Badge (cyan background)            │
└────────────────────────────────────────────────┘

Colors:
- Background gradient: slate-900 to slate-800
- Title: Cyan-400
- Badge: Cyan-500/20 with cyan-400 text
- Border: Cyan-500/20
```

---

### 10. Navigation Tips Card

#### Info Display
```
┌────────────────────────────────────────────────┐
│ Navigation Tips                                │
├────────────────────────────────────────────────┤
│                                                │
│ • Use the arrow buttons to navigate between   │
│   columns                                      │
│                                                │
│ • Click on column names above for quick       │
│   access                                       │
│                                                │
│ • Review insights and recommendations for     │
│   data quality improvements                   │
│                                                │
└────────────────────────────────────────────────┘

Subtle styling to not distract from main content
```

---

## Color Scheme

### Primary Colors
- **Cyan**: #06b6d4 - Main accent color, highlights, active states
- **Slate**: #1e293b, #0f172a - Backgrounds, text
- **White**: #ffffff - Primary text
- **Gray**: #64748b, #94a3b8 - Secondary text

### Status Colors
- **Green/Emerald**: #10b981 - Insights, positive data quality
- **Amber/Yellow**: #f59e0b - Recommendations, warnings
- **Red**: #ef4444 - Errors, critical issues
- **Blue**: #3b82f6 - Statistics, information

### Data Type Colors (in graphs)
- **Numeric**: Cyan (#06b6d4)
- **Categorical**: Pink (#ec4899)
- **Temporal**: Blue (#3b82f6)

---

## Responsive Behavior

### Desktop (>1024px)
```
┌──────────┬─────────────────────────────────┐
│ Sidebar  │     Main Content (full width)   │
│ 256px    │     Optimal reading              │
└──────────┴─────────────────────────────────┘

- 2-column layout
- Sidebar always visible
- Content takes remaining space
- Statistics cards in 6-column grid
```

### Tablet (768px - 1024px)
```
┌──────────┬──────────────────────┐
│ Sidebar  │  Main Content        │
│ 224px    │  Responsive          │
└──────────┴──────────────────────┘

- 2-column layout maintained
- Smaller sidebar
- Statistics cards in 3-column grid
- Graphs scaled down slightly
```

### Mobile (<768px)
```
┌──────────────────────────┐
│ Mobile Sidebar (drawer)  │
├──────────────────────────┤
│   Main Content           │
│   Full Width             │
│                          │
│ Cards stacked vertically │
│ Statistics: 2 columns    │
│ Tabs scroll horizontally │
│                          │
└──────────────────────────┘

- Collapsible sidebar (hamburger menu)
- Full-width content
- Vertical scrolling
- Single-column statistics
- Horizontal tab scrolling
```

---

## Interactive Elements

### Buttons
```
Primary Button (Cyan):
┌──────────────────────────┐
│ Column Analysis ▼         │ (with icon)
│ Hover: darker cyan        │
│ Disabled: 50% opacity     │
└──────────────────────────┘

Secondary Button (Outlined):
┌──────────────────────────┐
│ ◀ Previous                │
│ Border: slate-600         │
│ Hover: slight background  │
│ Disabled: more faded      │
└──────────────────────────┘
```

### Tabs
```
Active Tab:
┌──────────┐
│ Sales    │ ← Cyan background, white text
└──────────┘

Inactive Tab:
┌──────────┐
│ Quantity │ ← Bordered, can click
└──────────┘
```

### Cards
```
Header Card:
┌─────────────────────────────────────┐
│ Title                    Type Badge  │
│ Description below title              │
│ Gradient background                  │
│ Subtle shadow                        │
└─────────────────────────────────────┘

Content Card:
┌─────────────────────────────────────┐
│ Title                                │
├─────────────────────────────────────┤
│                                      │
│ Content (graph, list, etc)           │
│ Proper padding and spacing           │
│                                      │
└─────────────────────────────────────┘
```

---

## Loading & Error States

### Loading State
```
While fetching analysis:
    ⟳ (spinning loader)
    Analyzing column...

- Centered spinner
- Cyan color (#06b6d4)
- Takes 1-3 seconds typically
```

### Error State
```
┌────────────────────────────────────┐
│ ⚠️  Analysis Error                  │
├────────────────────────────────────┤
│ Failed to analyze column            │
│ Please check dataset and try again  │
│                                    │
│ [Retry Button]                     │
└────────────────────────────────────┘

- Red border/background
- Clear error message
- Retry option
```

---

## Typography

### Headings
- **H1** (Page Title): 2xl, bold, cyan
- **H2** (Section Title): lg, bold, cyan
- **H3** (Card Title): base, bold, white/cyan
- **P** (Body Text): sm, gray/slate
- **Labels**: xs, gray, uppercase tracking

### Special Text
- **Statistics Values**: bold, colored per metric
- **Insights/Recommendations**: readable, with icons
- **Descriptions**: multi-line, justified

---

## Example Full Page

See the actual page by:
1. Starting backend: `python -m uvicorn main:app --reload`
2. Starting frontend: `npm run dev`
3. Going to: http://localhost:3000/column-analysis

The UI will match this reference guide.

---

## Customizing Appearance

To change colors, edit:
- `data-explorer-frontend/components/column-analysis.tsx`
- Look for `className` attributes
- Modify Tailwind color classes

To change layouts:
- Edit `renderGraph()` method for chart styling
- Edit card layouts with flexbox classes
- Adjust responsive grid with `grid-cols-*` classes

---

## Accessibility Features

- ✓ Semantic HTML elements
- ✓ Proper heading hierarchy
- ✓ Color not the only indicator
- ✓ Icons accompanied by text
- ✓ Keyboard navigation support
- ✓ ARIA labels where needed
- ✓ Screen reader friendly

---

This visual reference shows exactly what users will see!
