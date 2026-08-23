---
name: Maibanc
description: A card-based, chart-forward personal finance app built on Maibanc's own brand green and blue.
colors:
  cream: "#f5f7f3"
  card: "#ffffff"
  charcoal: "#23262b"
  charcoal-soft: "#7c8289"
  line: "#e6eae5"
  green: "#00bf63"
  green-soft: "#e1f7ea"
  blue: "#2e56a8"
  blue-soft: "#e3e9f5"
  gold: "#d1a13b"
  gold-soft: "#f5ecd6"
  violet: "#7c5cbf"
  violet-soft: "#ece6f6"
  coral: "#d2503f"
  coral-soft: "#fae3df"
  negative: "#d2503f"
typography:
  display:
    fontFamily: "Bricolage Grotesque, General Sans, -apple-system, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontWeight: 400
rounded:
  sm: "10px"
  md: "11px"
  lg: "18px"
  pill: "999px"
spacing:
  page: "40px"
  card: "20-24px"
components:
  button-primary:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.charcoal}"
  button-secondary:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
---

# Design System: Maibanc

## Overview

**Creative North Star: "Charts as the Centerpiece, Branded in Green and Blue"**

Maibanc replaced its first shipped identity — a bound-ledger, zero-radius, ruled-table system — with a card-based, chart-forward system at the user's explicit direction, using Monarch Money as a named reference and then deliberately differentiating it on Maibanc's own brand colors rather than a generic soft-SaaS palette. Every page is a set of white, generously-rounded cards floating on a cool cream ground; real charts (donut, area, bar) carry the story on every page, never a wall of numbers alone. The one non-negotiable constraint: nothing is fabricated — every chart, every dollar figure, every empty state reflects real Plaid data, real IRS/FTB tax brackets, or an honest "not available" state when the real data source doesn't exist yet (S&P 500 history, net worth before Maibanc started recording it, Insights before a model key is configured).

**Key Characteristics:**
- Cool cream background (`#f5f7f3`, not warm-cream) holding white cards with soft layered shadows and 18px radius — confidently rounded, unlike the ledger system it replaced.
- Maibanc's real brand green (`#00bf63`) is the system's primary voice — positive figures, the active nav item, primary chart series — with brand blue (`#2e56a8`) as secondary. Gold/violet/coral fill out multi-category charts.
- Bricolage Grotesque carries every heading and headline figure; Public Sans carries every label, table cell, and body sentence.
- Every chart renders with `isAnimationActive={false}` — figures are legible the instant data arrives, never gated behind an entrance animation.

## Colors

A Full-palette strategy: unlike the prior Restrained system, this world uses distinct hues per data category (allocation, spend-by-category, chart legends) because charts are the centerpiece and categories must read apart at a glance. Brand green and blue lead; gold/violet/coral are the supporting cast, always in that resonance order.

### Primary
- **Maibanc Green** (`#00bf63`): the brand's own color. Positive figures (gains, positive net worth, on-track budgets), the active sidebar item, primary line/area chart series, primary button hover accents.

### Secondary
- **Maibanc Blue** (`#2e56a8`): the brand's secondary color. Bonds/fixed-income in allocation charts, the assets line in Assets vs. Liabilities, the S&P 500 benchmark line.

### Tertiary
- **Gold** (`#d1a13b`), **Violet** (`#7c5cbf`): third and fourth chart-category hues (Cash, Crypto) — rounding out the multi-series palette without introducing a fifth or sixth accent beyond what a legend can hold clearly.

### Neutral
- **Cream** (`#f5f7f3`): the app's background, outside every card.
- **Card White** (`#ffffff`): every card, the sidebar.
- **Charcoal** (`#23262b`): primary text, headline figures, the active nav pill's background.
- **Charcoal Soft** (`#7c8289`): secondary text, field labels, inactive nav, axis labels.
- **Line** (`#e6eae5`): card borders, table row dividers, chart gridlines.

### Named Rules
**The One Negative Rule.** Coral (`#d2503f`) is the system's only negative/warning color — losses, over-budget bars, liabilities, destructive actions (Disconnect, Remove). It never appears as a decorative or category-neutral color.

## Typography

**Display Font:** Bricolage Grotesque (with General Sans, system sans fallback)
**Body Font:** Public Sans (with system sans fallback)

**Character:** Bricolage Grotesque is a geometric sans with genuine, slightly quirky personality at display sizes — it carries the "elegant but modern" brief without reaching for an overused reflex serif. Public Sans is a plain, highly legible workhorse for every data-dense surface: tables, labels, form fields.

### Hierarchy
- **Page title** (Bricolage, 700, 24px): one per page, top-left.
- **Card headline** (Bricolage, 700, 15px): one per card, names what the card shows.
- **Headline figure** (Bricolage, 700, 20–32px, tabular-nums): net worth, totals, the numbers a page exists to show.
- **Label** (Public Sans, 600, 11–11.5px, +0.02–0.04em tracking, uppercase): stat-tile labels, table headers, field labels.
- **Body** (Public Sans, 400–500, 12.5–13.5px): table cells, descriptions, nav items, chat bubbles.

### Named Rules
**The Tabular Truth Rule** (carried over from the prior system): every rendered dollar figure uses `font-variant-numeric: tabular-nums` (the `.mc-tnum` utility) and is right-aligned in tables.

## Layout

A fixed 256px white sidebar (logo, icon nav, an account list grouped by type) beside a flexible cream content pane. Every page opens with a page title + one-line description, then a row of stat cards (2–4 across, 5px gap), then one or more chart cards, then supporting tables/lists. Cards use 20–24px internal padding and stack in a single column on narrower content, 2-column grids on wide sections (allocation + performance, income + expenses).

## Elevation & Depth

Cards float on the cream ground with a soft, two-layer shadow (`0 1px 2px rgba(35,38,43,.04), 0 8px 24px -12px rgba(35,38,43,.10)`) — ambient, not directional, never a hard offset. The active sidebar nav item uses a solid green fill rather than elevation to show state. Buttons lift 1px with a soft shadow on hover (primary) as the only interactive elevation change in the system.

### Named Rules
**The Soft Shadow Rule.** Every shadow in this system is ambient (ambient blur, low opacity, no hard offset). A `box-shadow: Npx Npx 0` hard-offset block shadow has no place here — that belongs to a neobrutalist world this one isn't.

## Shapes

Generously rounded throughout: 18px on cards, 10–11px on inputs/buttons, a full pill (999px) on nav items, chips, tags, and toggles. This is a deliberate reversal of the prior "Flat Page" ledger system — the user asked for "clean, card-based... modern style," and rounded, soft-shadowed cards are how that reads.

## Components

### Cards (`.mc-card`)
- **Corner Style:** 18px radius.
- **Background:** white, 1px `line`-colored border, soft ambient shadow.
- **Internal Padding:** 20–24px.

### Buttons
- **Primary** (`.mc-btn-primary`): solid charcoal, white text, 11px radius; lifts 1px with a shadow on hover; 45% opacity when disabled.
- **Secondary** (`.mc-btn-secondary`): cream fill, charcoal text, line border; darkens to `line` on hover; 45% opacity when disabled.

### Inputs / Selects (`.mc-input`, `.mc-select`)
- **Style:** cream fill, line border, 10px radius.
- **Focus:** border switches to green with a soft green glow ring (`box-shadow: 0 0 0 3px green-soft`).

### Toggle (`.mc-toggle`)
- **Style:** a 38×22px pill switch; off state is a `line`-colored track, on state fills green with the knob sliding right. Used for the Business account flag on Connect Bank.

### Tables (`.mc-table`)
- **Header:** uppercase 11.5px labels, semibold, `charcoal-soft`, bottom line border.
- **Rows:** `line`-colored bottom border per row, generous 13px vertical padding, no zebra striping.

### Tags / Chips (`.mc-chip`, `.mc-tag-btn`, `.mc-prompt-chip`)
- **Style:** full-pill radius, small (11.5–12.5px) semibold text. Used for stamped confirmations, tax-category tags, and Insights' suggested-prompt chips.

### Chat Bubbles (`.mc-chat-bubble-user`, `.mc-chat-bubble-assistant`)
- **User:** solid charcoal, white text, right-aligned, one sharp corner (bottom-right) breaking the pill for a speech-tail read.
- **Assistant:** white card-bordered bubble, left-aligned, matching sharp corner on the bottom-left.

### Navigation (Sidebar)
- **Style:** icon + label rows, full-pill radius, `charcoal-soft` at rest.
- **Active:** solid green fill, white text/icon, semibold.
- Below the nav, a real account list grouped by type (Credit Cards, Banking, Investments, Loans), pulled live from `/api/accounts`.

### Charts (recharts, house style)
- **Palette order:** green → blue → gold → violet → coral → charcoal-soft, applied via `Cell` (never a raw `<rect>`).
- **Animation:** `isAnimationActive={false}` everywhere — data must be legible on first paint, not after an entrance animation.
- **Area fills:** a linear gradient from the series' own color at ~28% opacity to fully transparent, never a flat opaque fill.
- **Gridlines/axes:** `line` color, no axis lines or tick lines (`axisLine={false} tickLine={false}`), keeping the chart reading as data first.

## Do's and Don'ts

### Do:
- **Do** lead every page with a real chart or headline figure, not a row of identical icon-plus-text cards.
- **Do** keep green exclusive to positive/primary meaning and coral exclusive to negative/destructive meaning (The One Negative Rule).
- **Do** set `isAnimationActive={false}` on every recharts element.
- **Do** color multi-series charts with `<Cell>`, never a raw SVG element.
- **Do** show an honest empty/unavailable state (Insights with no API key, Investments performance with no benchmark source) rather than fabricating data.

### Don't:
- **Don't** introduce a new accent color outside green/blue/gold/violet/coral without updating this system deliberately.
- **Don't** use a hard-offset shadow anywhere in this system.
- **Don't** let a chart's entrance animation be the only way data becomes visible.
- **Don't** reintroduce the prior ledger system's zero-radius, ruled-table language on a new page — this system is confidently rounded and card-based by explicit direction.
