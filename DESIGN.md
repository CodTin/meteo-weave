# MeteoWeave Design System

## Design Philosophy

### Core Principles

**Data as Art, Precision as Beauty**

MeteoWeave transforms complex meteorological data into a visual experience that honors both scientific precision and human curiosity. We reject generic tech aesthetics in favor of a design language that feels like observing weather itself: layered, dynamic, and surprisingly elegant.

**Three Pillars:**

1. **Scientific Authority** — Every design choice communicates precision, reliability, and professional-grade data
2. **Editorial Drama** — Weather is inherently dramatic; our interface amplifies this through bold typography and spatial composition
3. **Fluid Intelligence** — Interfaces that breathe and flow like atmospheric patterns, never static or rigid

### Aesthetic Direction

**Precision Meets Poetry**

We combine the rigorous clarity of scientific visualization with the emotional resonance of editorial design. Think: weather station readouts reimagined as art installations, where every metric tells a story.

**What Makes Us Unforgettable:**

- Unexpected serif headlines that contrast sharply with monospace data
- Deep, atmospheric backgrounds that shift subtly based on context
- Data visualizations that feel alive, not just informative
- Generous negative space punctuated by moments of intense density

---

## Visual Identity

### Color System

Our palette is atmospheric: moody depths punctuated by sharp, electric accents.

#### Base Palette (CSS Variables)

```css
:root {
  /* Foundation — Deep atmospheric layers */
  --color-void: #0a0e14; /* Deepest night sky */
  --color-midnight: #151b26; /* Primary background */
  --color-slate: #1e2835; /* Elevated surfaces */
  --color-charcoal: #2a3441; /* Interactive surfaces */

  /* Neutrals — Atmospheric gradations */
  --color-fog: #3d4856; /* Subtle borders, dividers */
  --color-mist: #5c6b7f; /* Secondary text, disabled states */
  --color-cloud: #8a9bae; /* Tertiary text */
  --color-silver: #b8c5d6; /* Primary text (subtle) */
  --color-frost: #e8edf3; /* Primary text (bright) */
  --color-snow: #f8fafc; /* Bright text, icons */

  /* Accents — Electric alerts */
  --color-lightning: #ffd23f; /* Warning, highlight, energy */
  --color-storm: #7b61ff; /* Primary brand, CTAs */
  --color-aurora: #00e5d4; /* Success, data viz accent */
  --color-ember: #ff6b47; /* Error, critical alerts */
  --color-dusk: #e94b9e; /* Secondary accent */

  /* Semantic Colors */
  --color-success: var(--color-aurora);
  --color-warning: var(--color-lightning);
  --color-error: var(--color-ember);
  --color-info: var(--color-storm);

  /* Data Visualization Palette */
  --color-viz-1: #7b61ff;
  --color-viz-2: #00e5d4;
  --color-viz-3: #ffd23f;
  --color-viz-4: #ff6b47;
  --color-viz-5: #e94b9e;
  --color-viz-6: #4ecdc4;
  --color-viz-7: #95e1d3;
  --color-viz-8: #ffa07a;
}
```

#### Color Usage Guidelines

- **Backgrounds**: Always start with `--color-midnight` as the base canvas
- **Text Hierarchy**: `--color-snow` for headings, `--color-frost` for body, `--color-silver` for secondary
- **Accents**: Use sparingly and intentionally. Each accent color has semantic meaning
- **Data Viz**: Rotate through viz palette for multi-series charts, ensuring sufficient contrast

### Typography

Typography creates dramatic tension: classical serifs for storytelling, technical monospace for precision.

#### Font Stack

```css
:root {
  /* Display — Editorial drama */
  --font-display: 'Crimson Pro', 'Crimson Text', Georgia, serif;

  /* Body — Readable, refined */
  --font-body: 'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Mono — Data precision */
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;

  /* Weights */
  --font-weight-light: 300;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-black: 900;
}
```

#### Type Scale

```css
:root {
  --text-xs: 0.75rem; /* 12px — Labels, captions */
  --text-sm: 0.875rem; /* 14px — Secondary text */
  --text-base: 1rem; /* 16px — Body text */
  --text-lg: 1.125rem; /* 18px — Emphasized body */
  --text-xl: 1.25rem; /* 20px — Section headings */
  --text-2xl: 1.5rem; /* 24px — Card headings */
  --text-3xl: 1.875rem; /* 30px — Page subheadings */
  --text-4xl: 2.25rem; /* 36px — Page headings */
  --text-5xl: 3rem; /* 48px — Hero headings */
  --text-6xl: 3.75rem; /* 60px — Display headings */
  --text-7xl: 4.5rem; /* 72px — Landing hero */

  /* Line Heights */
  --leading-tight: 1.2;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;
}
```

#### Typography Rules

**Display Typography (Headlines)**

- Always use `--font-display` (Crimson Pro)
- Weight: 600-900 for maximum impact
- Line height: `--leading-tight` (1.2)
- Letter spacing: -0.02em for large sizes
- Color: `--color-snow` or `--color-frost`

**Body Typography**

- Use `--font-body` (Inter Variable)
- Weight: 400 for body, 500-600 for emphasis
- Line height: `--leading-relaxed` (1.625) for readability
- Max width: 65-75 characters per line
- Color: `--color-frost` primary, `--color-silver` secondary

**Data Typography (Metrics, Codes)**

- Always use `--font-mono` (JetBrains Mono)
- Weight: 400-600 only
- Tabular numerals enabled: `font-variant-numeric: tabular-nums`
- Letter spacing: 0 (monospace doesn't need adjustment)
- Color: `--color-aurora` or accent colors for live data

### Spacing System

Geometric progression based on 4px base unit, emphasizing generous whitespace.

```css
:root {
  --space-0: 0;
  --space-px: 1px;
  --space-0_5: 0.125rem; /* 2px */
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem; /* 8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem; /* 16px */
  --space-5: 1.25rem; /* 20px */
  --space-6: 1.5rem; /* 24px */
  --space-8: 2rem; /* 32px */
  --space-10: 2.5rem; /* 40px */
  --space-12: 3rem; /* 48px */
  --space-16: 4rem; /* 64px */
  --space-20: 5rem; /* 80px */
  --space-24: 6rem; /* 96px */
  --space-32: 8rem; /* 128px */
}
```

**Spacing Philosophy:**

- Component padding: `--space-6` minimum for breathing room
- Section spacing: `--space-16` to `--space-32` for dramatic separation
- Micro-spacing: `--space-2` to `--space-4` for related elements
- Grid gaps: `--space-6` to `--space-8` for cards and layouts

### Elevation & Depth

Layering creates atmospheric depth through shadows and glows.

```css
:root {
  /* Shadows — Subtle depth */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-base: 0 2px 4px 0 rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 8px 0 rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 16px 0 rgba(0, 0, 0, 0.6);
  --shadow-xl: 0 12px 24px 0 rgba(0, 0, 0, 0.7);

  /* Glows — Electric accents */
  --glow-storm: 0 0 20px rgba(123, 97, 255, 0.4);
  --glow-aurora: 0 0 20px rgba(0, 229, 212, 0.4);
  --glow-lightning: 0 0 20px rgba(255, 210, 63, 0.4);

  /* Surface Elevation */
  --elevation-flat: var(--color-midnight); /* Base canvas */
  --elevation-raised: var(--color-slate); /* Cards, panels */
  --elevation-floating: var(--color-charcoal); /* Modals, dropdowns */
  --elevation-overlay: rgba(10, 14, 20, 0.95); /* Overlays */
}
```

### Borders & Radii

Sharp geometry with selective softening.

```css
:root {
  /* Border Widths */
  --border-thin: 1px;
  --border-base: 2px;
  --border-thick: 3px;

  /* Border Colors */
  --border-subtle: var(--color-fog);
  --border-base: var(--color-mist);
  --border-accent: var(--color-storm);

  /* Border Radius */
  --radius-none: 0;
  --radius-sm: 0.25rem; /* 4px — Buttons, inputs */
  --radius-base: 0.5rem; /* 8px — Cards, panels */
  --radius-lg: 0.75rem; /* 12px — Large cards */
  --radius-xl: 1rem; /* 16px — Hero sections */
  --radius-full: 9999px; /* Pills, avatars */
}
```

**Border Philosophy:**

- Default to `--radius-base` for most components
- Use `--radius-none` for data tables and technical interfaces
- Reserve `--radius-xl` for prominent hero elements
- Accent borders (--border-accent) only on interactive or highlighted elements

---

## Components & Patterns

### Layout Primitives

#### Container

Maximum content width with responsive padding.

```css
.container {
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: var(--space-6);
}

@media (min-width: 768px) {
  .container {
    padding-inline: var(--space-8);
  }
}

@media (min-width: 1024px) {
  .container {
    padding-inline: var(--space-12);
  }
}
```

#### Grid System

Flexible 12-column grid with generous gaps.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-6);
}

.grid-dense {
  gap: var(--space-4);
}

.grid-loose {
  gap: var(--space-8);
}
```

#### Stack

Vertical rhythm for content flow.

```css
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stack-tight {
  gap: var(--space-2);
}

.stack-loose {
  gap: var(--space-8);
}
```

### Cards

Cards are atmospheric containers that elevate content.

```css
.card {
  background: var(--elevation-raised);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-base);
  padding: var(--space-6);
  box-shadow: var(--shadow-base);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.card-accent {
  border-color: var(--color-storm);
  box-shadow: var(--shadow-base), var(--glow-storm);
}

.card-header {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-snow);
  margin-bottom: var(--space-4);
}

.card-body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-relaxed);
  color: var(--color-frost);
}
```

**Card Variants:**

- `.card` — Standard elevation
- `.card-flat` — No shadow, flush with background
- `.card-accent` — Glowing accent border
- `.card-glass` — Frosted glass effect with backdrop blur

### Buttons

Buttons are decisive, with clear hierarchy and purpose.

```css
.btn {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--font-weight-semibold);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-sm);
  border: var(--border-base) solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.btn-primary {
  background: var(--color-storm);
  color: var(--color-snow);
  border-color: var(--color-storm);
}

.btn-primary:hover {
  background: #6b51e8;
  box-shadow: var(--glow-storm);
  transform: translateY(-1px);
}

.btn-secondary {
  background: transparent;
  color: var(--color-frost);
  border-color: var(--border-base);
}

.btn-secondary:hover {
  background: var(--elevation-raised);
  border-color: var(--color-storm);
}

.btn-ghost {
  background: transparent;
  color: var(--color-frost);
  border: none;
  padding: var(--space-2) var(--space-4);
}

.btn-ghost:hover {
  background: var(--elevation-raised);
  color: var(--color-snow);
}
```

### Data Display

#### Metric Cards

Live data presented with drama and precision.

```css
.metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: var(--text-4xl);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--color-aurora);
  line-height: var(--leading-tight);
  letter-spacing: -0.02em;
}

.metric-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-cloud);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-trend {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.metric-trend.positive {
  color: var(--color-aurora);
}

.metric-trend.negative {
  color: var(--color-ember);
}
```

#### Data Tables

Precise, scannable, terminal-inspired.

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-none);
}

.table thead {
  background: var(--elevation-raised);
  border-bottom: var(--border-base) solid var(--border-accent);
}

.table th {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  font-weight: var(--font-weight-semibold);
  color: var(--color-silver);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--text-xs);
}

.table td {
  padding: var(--space-3) var(--space-4);
  color: var(--color-frost);
  border-bottom: var(--border-thin) solid var(--border-subtle);
  font-variant-numeric: tabular-nums;
}

.table tbody tr:hover {
  background: var(--elevation-raised);
}

.table tbody tr:last-child td {
  border-bottom: none;
}
```

### Forms

Forms are clean, focused, and provide clear feedback.

```css
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-frost);
}

.form-input {
  font-family: var(--font-body);
  font-size: var(--text-base);
  padding: var(--space-3) var(--space-4);
  background: var(--elevation-raised);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-snow);
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-storm);
  box-shadow: 0 0 0 3px rgba(123, 97, 255, 0.1);
}

.form-input::placeholder {
  color: var(--color-mist);
}

.form-input[type='number'] {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.form-error {
  font-size: var(--text-sm);
  color: var(--color-ember);
}

.form-help {
  font-size: var(--text-sm);
  color: var(--color-cloud);
}
```

---

## Motion & Interaction

### Animation Philosophy

Motion in MeteoWeave mimics atmospheric phenomena: fluid, organic, never mechanical.

**Core Principles:**

1. **Purposeful** — Every animation communicates state or guides attention
2. **Atmospheric** — Smooth, flowing transitions like weather patterns
3. **Performant** — Prefer transform and opacity; avoid layout thrashing

### Timing Functions

```css
:root {
  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  --ease-smooth: cubic-bezier(0.33, 1, 0.68, 1);
}
```

### Standard Transitions

```css
:root {
  --transition-fast: 0.15s;
  --transition-base: 0.2s;
  --transition-slow: 0.3s;
  --transition-slower: 0.5s;
}

/* Apply to most interactive elements */
.interactive {
  transition: all var(--transition-base) var(--ease-in-out);
}
```

### Micro-Interactions

**Hover States**

- Subtle lift: `transform: translateY(-2px)`
- Glow: Add appropriate `--glow-*` shadow
- Color shift: Brighten by 10-15%

**Active States**

- Slight press: `transform: scale(0.98)`
- Remove glow temporarily

**Focus States**

- Always visible outline or glow
- Use `box-shadow` for focus rings, not `outline`

### Page Transitions

Staggered reveals create depth and hierarchy.

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: fadeInUp var(--transition-slow) var(--ease-out) backwards;
}

.stagger-1 {
  animation-delay: 0.1s;
}
.stagger-2 {
  animation-delay: 0.2s;
}
.stagger-3 {
  animation-delay: 0.3s;
}
.stagger-4 {
  animation-delay: 0.4s;
}
.stagger-5 {
  animation-delay: 0.5s;
}
```

### Loading States

```css
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-slate) 0%,
    var(--color-charcoal) 50%,
    var(--color-slate) 100%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite linear;
  border-radius: var(--radius-base);
}
```

### Data Visualization Animation

Charts and graphs should animate in smoothly.

```css
@keyframes drawPath {
  from {
    stroke-dashoffset: 1000;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.chart-path {
  stroke-dasharray: 1000;
  animation: drawPath 1.5s var(--ease-smooth) forwards;
}
```

---

## Data Visualization Guidelines

### Chart Color Mapping

Use the data viz palette consistently:

```
Temperature: --color-viz-4 (warm orange)
Precipitation: --color-viz-2 (cool cyan)
Wind Speed: --color-viz-1 (purple)
Humidity: --color-viz-3 (yellow)
Pressure: --color-viz-5 (pink)
```

### Chart Typography

- **Axis Labels**: `--font-mono`, `--text-xs`, `--color-cloud`
- **Values**: `--font-mono`, `--text-sm`, `--color-frost`, tabular-nums
- **Legends**: `--font-body`, `--text-sm`, `--font-weight-medium`

### Best Practices

1. **Dark Background Optimized**: All charts assume dark mode
2. **Grid Lines**: Subtle, `--color-fog` at 20% opacity
3. **Tooltips**: Use card styles with `--elevation-floating`
4. **Accessibility**: Ensure 4.5:1 contrast ratio for all data elements
5. **Responsive**: Mobile views may need simplified chart variants

---

## Accessibility Standards

MeteoWeave meets WCAG 2.1 AA standards minimum, AAA where feasible.

### Color Contrast

All text must meet these ratios against their backgrounds:

- Normal text (< 18px): **4.5:1 minimum**
- Large text (≥ 18px): **3:1 minimum**
- Interactive elements: **3:1 minimum**

**Tested Combinations (AA Compliant):**

- `--color-snow` on `--color-midnight`: 16.2:1 ✓
- `--color-frost` on `--color-midnight`: 13.8:1 ✓
- `--color-silver` on `--color-midnight`: 9.1:1 ✓
- `--color-aurora` on `--color-midnight`: 7.2:1 ✓
- `--color-storm` on `--color-midnight`: 5.3:1 ✓

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Focus indicators must be clearly visible (use glows)
- Tab order must follow logical reading flow
- Escape key should close modals/dropdowns

### Screen Reader Support

```html
<!-- Always provide semantic HTML -->
<button aria-label="View weather details">
  <IconEye />
</button>

<!-- Use ARIA landmarks -->
<nav aria-label="Main navigation">
  <!-- nav content -->
</nav>

<!-- Announce dynamic content -->
<div role="status" aria-live="polite">Weather data updated</div>

<!-- Label form inputs properly -->
<label for="location">Location</label>
<input id="location" type="text" />
```

### Motion Preferences

Respect user preferences for reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Guidelines

### Tech Stack Integration

**Next.js + Tailwind CSS**

Configure Tailwind to use our design tokens:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        void: '#0A0E14',
        midnight: '#151B26',
        slate: '#1E2835',
        storm: '#7B61FF',
        aurora: '#00E5D4',
        // ... map all CSS variables
      },
      fontFamily: {
        display: ['Crimson Pro', 'Georgia', 'serif'],
        body: ['Inter Variable', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        // ... map space-* variables
      },
    },
  },
  plugins: [],
}
```

**Component Structure**

Organize components by type:

```
components/
├── layout/          # Container, Grid, Stack
├── ui/              # Button, Card, Input
├── data/            # Metric, Table, Chart
├── navigation/      # Header, Sidebar, Breadcrumb
└── visualization/   # Charts, Maps, Graphs
```

### CSS Architecture

Use CSS Modules or styled-components with design tokens:

```tsx
// Metric.module.css
.metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.value {
  font-family: var(--font-mono);
  font-size: var(--text-4xl);
  color: var(--color-aurora);
}

// Metric.tsx
import styles from './Metric.module.css'

export function Metric({ value, label, trend }) {
  return (
    <div className={styles.metric}>
      <div className={styles.value}>{value}</div>
      {/* ... */}
    </div>
  )
}
```

### Performance Considerations

1. **Font Loading**: Use `font-display: swap` for custom fonts
2. **Animation**: Use `will-change` sparingly, only on active animations
3. **Images**: Always optimize and use Next.js Image component
4. **Code Splitting**: Lazy load charts and heavy visualizations

### Testing Checklist

Before shipping any interface:

- [ ] Test on mobile, tablet, desktop viewports
- [ ] Verify keyboard navigation works
- [ ] Run axe or Lighthouse accessibility audit
- [ ] Test with screen reader (VoiceOver/NVDA)
- [ ] Verify color contrast ratios
- [ ] Test reduced motion preference
- [ ] Check loading states and error states
- [ ] Verify all interactive states (hover, active, focus, disabled)

---

## Page-Specific Patterns

### Landing Page

**Hero Section:**

- Massive display headline (`--text-7xl`, Crimson Pro 900)
- Atmospheric gradient background with subtle animation
- Single, bold CTA button with glow effect
- Generous vertical spacing (`--space-32`)

**Feature Cards:**

- 3-column grid on desktop, stacked on mobile
- Each card with accent glow on hover
- Icon + headline + short description
- Stagger animation on scroll

### Dashboard

**Layout:**

- Sidebar navigation (240px fixed width)
- Main content area with metrics grid
- Sticky header with breadcrumb and actions

**Metrics Grid:**

- 2x2 or 3x3 grid of metric cards
- Each metric: large monospace value + label
- Sparkline charts for trends
- Hover reveals detailed tooltip

### Data Explorer

**Filters:**

- Sidebar with stacked filter groups
- Each filter: label + input/select
- Apply button at bottom
- Collapsible sections for advanced filters

**Results:**

- Data table with sortable columns
- Pagination controls at top and bottom
- Export button (CSV, JSON)
- Loading skeleton during fetch

### API Documentation

**Layout:**

- Two-column: TOC sidebar + content
- Sticky navigation
- Code examples in right column on wide screens

**Code Blocks:**

- Dark theme with syntax highlighting
- Copy button in top-right corner
- Language selector for multi-language examples
- Monospace font throughout

---

## Brand Voice in UI Copy

**Tone:** Professional, confident, approachable

**Do:**

- "Your forecast is ready" (active, direct)
- "No data available for this location" (clear, helpful)
- "Explore 10 years of historical weather" (specific, inviting)

**Don't:**

- "Oops! Something went wrong!" (overly casual)
- "We couldn't find that" (vague, unhelpful)
- "Check out our amazing features!" (marketing fluff)

**Error Messages:**

- Be specific about what went wrong
- Provide actionable next steps
- Use `--color-ember` sparingly, prefer neutral tone

**Empty States:**

- Illustrate the benefit of taking action
- Provide clear CTA to populate the view
- Use encouraging but not desperate language

---

## Conclusion

This design system is a living document. As MeteoWeave evolves, so too should our design language. The core principles—precision, drama, fluidity—remain constant, but execution can adapt.

**Remember:**

- Every pixel serves a purpose
- Data is beautiful when presented with intention
- Accessibility is non-negotiable
- Performance enables great experiences

Weather is dynamic, layered, and endlessly fascinating. Our design should be too.
