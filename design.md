# Design System — Sleepy Owl MFR Dashboard

A reference for the visual language of this dashboard, written so it can be **lifted into another project**. It captures the real tokens, utilities, and component patterns that give the app its "premium executive finance tool" feel — not generic advice.

> **North star:** *Bloomberg-terminal precision wearing a fintech suit.* Calm, dense, trustworthy. Depth comes from light and shadow, never heavy borders. Color is spent sparingly — one brand hue, a few semantic accents, and a lot of quiet neutral. Every number is tabular. Motion is present but subtle, and all of it shares **one easing curve**.

---

## 1. Design principles (the transferable part)

1. **Depth over borders.** Cards float on soft, layered shadows and translucent "glass", not 1px outlines. Borders are hairlines (`rgba(15,23,42,0.05)`), used only to separate, never to decorate.
2. **Restraint with color.** Exactly one brand hue (violet). Everything else is neutral until a number needs meaning (green up / red down / amber watch). If a screen has more than ~3 accent colors, one is wrong.
3. **Numbers are first-class.** Every figure uses `tabular-nums` so columns align and values don't jitter as they update. Currency/units get scale words (Cr / L / K), sign-aware color, and a ₹ prefix.
4. **One motion signature.** A single ease — `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) — is used for *every* transition and entrance. Consistency of motion reads as quality more than any individual animation.
5. **Micro-interactions, not decoration.** Hover lift, cursor spotlight, press-scale — each confirms interactivity in <300ms. Nothing loops or demands attention.
6. **Information hierarchy by weight + size, not color.** Hero lines bold, supporting lines muted, section labels tiny + uppercase + letter-spaced.
7. **Theme-aware and print-aware from the start.** Light/dark are designed together; a print stylesheet flattens glass to plain white so exports are clean.

---

## 2. Color system

All colors are **OKLCH** tokens (perceptually uniform — lightness edits stay in-gamut). The brand layer overrides the base theme's `--primary` so the identity is consistent regardless of which neutral theme is active.

### Brand
| Token | Value | Use |
|---|---|---|
| `--primary` | `oklch(0.52 0.19 277)` ≈ `#6d5efc` | Primary actions, active states, accents |
| `--primary-foreground` | `oklch(0.99 0 0)` | Text/icons on primary |
| `--brand-indigo` | `#4338ca` | Gradient start |
| `--brand-violet` | `#6d5efc` | Gradient mid / primary series |
| `--brand-violet-2` | `#8b7bff` | Lighter violet, secondary series |
| `--brand-sky` | `#0ea5e9` | Gradient end / secondary data series |

Signature gradient (text or fills): `linear-gradient(100deg, var(--brand-indigo), var(--brand-violet) 55%, var(--brand-sky))`.

### Semantic (meaning, not brand)
| Token | Value | Meaning |
|---|---|---|
| `--pos` / `--ic-revenue` | `#16a34a` | Positive, growth, revenue |
| `--neg` / `--ic-negative` | `#dc2626` / `#ef4444` | Negative, decline |
| `--ic-warning` | `#f59e0b` | Watch / caution |
| `--ic-growth` | `#7c6cff` | Momentum |
| `--ic-marketplace` | `#0ea5e9` | Channel / marketplace |
| `--ic-inventory` | `#d97706` | Inventory / build-up |

Status trio used for badges/dots: `good #10b981`, `watch #f59e0b`, `weak #ef4444` (render at ~12% opacity background + full-strength text/icon).

### Neutrals (default = near-monochrome, from the "vercel" base theme)
| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(0.99 0 0)` | `oklch(0 0 0)` |
| `--card` | `oklch(1 0 0)` (pure white) | `oklch(0.14 0 0)` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.23 0 0)` |
| `--muted-foreground` | `oklch(0.44 0 0)` | `oklch(0.72 0 0)` |
| `--border` | `oklch(0.92 0 0)` | `oklch(0.26 0 0)` |
| `--hairline` | `rgba(15,23,42,0.05)` | `rgba(255,255,255,0.06)` |

### The canvas (do not skip this — it's half the "premium" feel)
The page background is **not** flat. It's a layered gradient: two soft brand-colored radial glows over a cool off-white vertical gradient.
```css
--app-canvas:
  radial-gradient(1200px 600px at 12% -8%,  rgba(109,94,252,0.08), transparent 60%),
  radial-gradient(1000px 500px at 100% 0%,  rgba(14,165,233,0.06), transparent 55%),
  linear-gradient(180deg, #f7f8fc 0%, #f2f4fb 100%);
/* dark: */
--app-canvas:
  radial-gradient(1200px 600px at 12% -8%, rgba(109,94,252,0.12), transparent 60%),
  linear-gradient(180deg, #0b0e18 0%, #0a0c14 100%);
```
Cards (white) sit on this cool ground, so white reads as "raised" without a single border.

### Chart palette
`--chart-1 … --chart-5` (blue / orange / red / gold / deep-violet). For brand-led charts, prefer `brand-violet` (primary series) + `brand-sky` (secondary series) so a two-series comparison (e.g. Primary vs Secondary) is instantly legible.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Sans (default) | **Geist** | UI, body, labels |
| Mono | **Geist Mono** | codes, IDs |
| Display / serif accent | Playfair Display | optional editorial headings |
| **Data** | any sans **+ `tabular-nums`** | apply `.tabnum` or `[font-variant-numeric:tabular-nums]` to every number |

Type scale actually in use (px):
- **Page title:** 24 / bold / tracking-tight
- **KPI value:** 22 / bold / `leading-none` + tabnum
- **Card/section title:** 13.5–14 / semibold
- **Body:** 12–12.5 / normal
- **Metric labels & eyebrows:** 10–11 / semibold / **UPPERCASE** / `tracking-[0.14em]`
- **Micro (sub-labels):** 9.5–11 / muted

Radius: `--radius: 0.5rem` base, but signature **cards use `rounded-[20px]`** and pills/controls `rounded-lg`. Larger radii on big surfaces + tight radii on controls is part of the look.

---

## 4. Signature surface utilities (copy these first)

These four classes do most of the heavy lifting. They're plain CSS — portable to any stack.

```css
/* Translucent frosted surface */
.glass {
  background: rgba(255,255,255,0.66);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid var(--hairline);
}
.dark .glass { background: rgba(22,26,38,0.60); border-color: rgba(255,255,255,0.06); }

/* Floating elevation — depth via shadow, not border */
.elev {
  box-shadow: 0 1px 2px rgba(15,23,42,0.03), 0 10px 30px -12px rgba(15,23,42,0.10);
}
/* Lift + brand glow on hover (interactive cards) */
.elev-hover {
  transition: transform .3s cubic-bezier(.16,1,.3,1),
              box-shadow .3s cubic-bezier(.16,1,.3,1), border-color .3s ease;
}
.elev-hover:hover {
  transform: translateY(-5px);
  box-shadow: 0 2px 4px rgba(15,23,42,.04),
              0 24px 50px -16px rgba(79,70,229,.28),   /* violet glow */
              0 8px 18px -8px rgba(15,23,42,.10);
  border-color: rgba(109,94,252,.28);
}

/* Cursor-follow spotlight (set --mx/--my on mousemove) */
.spotlight::before {
  content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:0;
  background: radial-gradient(240px circle at var(--mx,50%) var(--my,-20%), rgba(109,94,252,.10), transparent 62%);
  opacity:0; transition:opacity .35s ease;
}
.spotlight:hover::before { opacity:1; }

/* Tactile press */
.press { transition: transform .12s cubic-bezier(.16,1,.3,1); }
.press:active { transform: scale(.97); }
```
Spotlight is wired from React with a `mousemove` handler that sets `--mx`/`--my` as `%` of the card:
```js
onMouseMove={(e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX-r.left)/r.width)*100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY-r.top)/r.height)*100}%`);
}}
```
Also available: `.brand-gradient-text` (gradient clipped to text), `.shimmer` (skeleton loading), `.drift` (14s ambient float for hero accents), `.tabnum`.

**The canonical card = `glass elev rounded-[20px] p-5`.** Make it interactive by adding `elev-hover spotlight` and `position: relative`.

---

## 5. Motion system

- **One easing everywhere:** `cubic-bezier(0.16, 1, 0.3, 1)` (in Framer/`motion`: `ease: [0.16, 1, 0.3, 1]`).
- **Entrance pattern** (used on nearly every block):
  ```jsx
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  ```
  Headers slide from `y: -8`; grids **stagger** children by `delay: 0.05 * index`.
- **Durations:** micro-interactions 120–300ms; entrances 450–500ms. Nothing over ~500ms.
- **Sliding segmented control:** the active "pill" is a `motion.span` with a shared `layoutId`, so it *slides* between options (spring, `stiffness 420 / damping 34`) instead of snapping.
- **Theme toggle = circular view-transition:** on click, capture pointer `--x/--y` and run a `document.startViewTransition`; a `clip-path: circle()` reveal wipes the new theme outward from the cursor (0.4s).
- **Respect `prefers-reduced-motion`:** a media query disables `.elev-hover`, `.spotlight`, `.shimmer`, `.drift`, `.press`.

---

## 6. Layout patterns

- **Sticky glass header** per page: full-bleed (negative `-mx`/`-mt`), `sticky top-0 z-30`, `bg-background/85 backdrop-blur-xl`, hairline bottom border. Content scrolls *under* it.
- **Header anatomy:** `[sidebar toggle] · eyebrow (uppercase + live ping dot) · Title (24/bold) · scope metadata row (clock · source · filter chips)` on the left; **filters + global actions (incl. theme toggle) pinned top-right**.
- **KPI grid:** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`, gap-3. Two clean rows of six.
- **Content grids:** `grid-cols-1 xl:grid-cols-3`, with the primary panel `xl:col-span-2` and a companion panel beside it (chart + legend, table + side stats).
- **Panel** wrapper: `glass elev rounded-[20px] p-5`, with an optional title/subtitle/action header row.
- **Sidebar + inset** shell (collapsible sidebar, brand logo, grouped nav with active-state highlight; ⌘K command palette mirrors the nav).

---

## 7. Component recipes

**KPI card** — icon (accent-tinted) · label (10px uppercase muted) · big tabular value (22/bold) · trend delta (sign-colored) · subtitle · inline sparkline; expandable detail rows. Accent color passed per-card.

**Data table (statement style)** — sticky first column with a right shadow (`shadow-[7px_0_12px_-10px_...]`); **section band rows** (tiny uppercase tracked label on a `bg-primary/[0.07]` strip) group metrics; hero rows bold, cost rows muted, the bottom line (e.g. CM2) gets a `border-t-2 border-primary` accent + tint; whole table scrolls inside `overflow-x-auto` so the page never scrolls sideways. Grouped column headers (2-row `<thead>` with `colSpan`) for "Target vs MTD"-style pairs.

**Segmented toggle** — glass track, sliding `layoutId` pill, `text-white` on active. (Month/FY, Primary/Secondary, Online/Offline.)

**Multi-select popover** — glass popover, tri-state checkboxes (on / indeterminate `—` / off), category headers that select the whole group on click, with a hover-revealed "All/Clear".

**Donut + legend** — fixed-size donut (`h-[190px] w-[172px]`) beside a flexible ranked legend (rank № · color dot · label · mini bar · %); a shared helper caps small slices into a single "Others" to avoid legend clutter and duplicate slices.

**Icon buttons** (top-right cluster) — `glass h-8 w-8 rounded-lg` ghost buttons (export, reset, theme). Icons from **lucide-react**, 3.5–4 `h/w`, `strokeWidth` default; never emoji.

**Business highlights / insight chips** — `glass elev spotlight` cards, sentiment dot (good/watch/bad), one sentence each, auto-generated from the data and mode-aware.

---

## 8. Data-visualization conventions

- **Indian numerics:** group as `1,58,43,640`; abbreviate ₹ with **Cr / L / K** scale words; percentages to 1 decimal; sign-aware (`+`/`−`) and color-coded.
- **Never let a formatting library guess** — feed pre-formatted strings so grouping stays Indian regardless of locale.
- **Two-series comparisons** use `brand-violet` (primary) vs `brand-sky` (secondary) consistently, with a matching two-dot legend.
- **Recharts** for charts; custom value labels when the library's built-ins are unreliable on animated series; axis formatters share the Cr/L/K scale words.
- **Tables carry the detail, charts carry the shape** — pair a hero chart with a dense table rather than over-annotating one chart.

---

## 9. Accessibility & print

- Contrast: body text ≥ 4.5:1 (muted-foreground is `oklch(0.44)` on white — passes). Never convey meaning by color alone — pair with a dot, arrow, or `+/−`.
- Focus rings on every control (`focus:ring-2 focus:ring-primary/25`); real `aria-label`s on icon-only buttons; `sr-only` text where an icon stands alone.
- `prefers-reduced-motion` disables the decorative motion set.
- **Print stylesheet** hides the sidebar, flattens `.glass`/`.elev` to plain white cards with a light border, forces `print-color-adjust: exact` so chart colors survive, and sets `@page { margin: 12mm }`. "Export to PDF" = `window.print()`.

---

## 10. Applying this to another project — checklist

1. **Drop in the canvas + four utilities.** Copy `--app-canvas`, `.glass`, `.elev`/`.elev-hover`, `.spotlight`, `.press` (Section 4). Put a white/`--card` surface on the gradient canvas — you're 50% there immediately.
2. **Set one brand hue** as `--primary` in OKLCH and derive the gradient + a lighter tint. Keep neutrals near-monochrome.
3. **Adopt the one easing** `cubic-bezier(0.16,1,0.3,1)` for *all* transitions, and the `opacity+y` staggered entrance.
4. **Make the canonical card** `glass elev rounded-[20px] p-5`; add `elev-hover spotlight` for interactive ones.
5. **Turn on `tabular-nums`** globally for anything numeric; add scale-word + sign-aware formatting.
6. **Standardize the type scale** (24 title / 22 metric / 13.5 section / 12 body / 10-11 uppercase-tracked labels).
7. **Build the sticky glass header** (eyebrow + title + metadata; actions top-right including the theme toggle).
8. **Design light + dark together**, and add the print flatten rules before you ship exports.
9. **Audit color budget:** if a screen uses more than one brand hue + the semantic trio, cut back.

---

*Source of truth in this repo: `src/styles/globals.css` (brand layer + utilities), `src/styles/themes/*.css` (neutral tokens), `src/components/themes/` (theme + font config), `src/features/mfr/components/` (component patterns). This file documents the intended system; when in doubt, the CSS wins.*
