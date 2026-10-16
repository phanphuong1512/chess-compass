---
name: Chess Compass (Grandmaster Atlas)
description: Precision instrument for chess opening repertoire mastery and FSRS-6 spaced repetition
colors:
  bg-canvas: "#0B0F17"
  bg-surface: "#141B29"
  bg-surface-elevated: "#1E293B"
  text-primary: "#F9FAFB"
  text-secondary: "#9CA3AF"
  text-muted: "#6B7280"
  accent-primary: "#F59E0B"
  accent-hover: "#FBBF24"
  accent-success: "#10B981"
  accent-danger: "#EF4444"
  border-subtle: "rgba(255, 255, 255, 0.08)"
  border-default: "rgba(255, 255, 255, 0.12)"
typography:
  display:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  data:
    fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent-primary}"
    textColor: "{colors.bg-canvas}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
---

# Design System: The Precision Instrument

## Overview
Chess Compass is built for rigorous intellectual focus. The design language avoids playful consumer gamification, toy-like gradients, and generic AI templates in favor of a clean, high-density dark instrument. Information hierarchy prioritizes rapid scanability, chess move clarity, and zero-distraction analysis.

## Colors
- **Canvas (`#0B0F17`)**: Deep obsidian canvas establishing maximum contrast for light chess pieces and board squares.
- **Surface (`#141B29`)**: Solid slate panels for cards, sidebar navigation, and analysis dashboards.
- **Elevated Surface (`#1E293B`)**: Modal surfaces and interactive popovers.
- **Primary Accent (`#F59E0B`)**: Warm gold / amber used deliberately for active navigation, key CTA buttons, and highlighted board moves.
- **Success (`#10B981`)**: Emerald for verified repertoire moves, mastered cards, and win results.
- **Danger (`#EF4444`)**: Rose/ruby for blunder alerts, deviation flags, and losses.
- **Text Hierarchy**: Pure white (`#FFFFFF`) for active moves/headers; neutral gray (`#9CA3AF`) for meta information; dark muted (`#6B7280`) for helper labels.

## Typography
- **Primary Sans**: Clean geometric sans-serif (`Geist Sans` / Apple System Sans) with negative letter-spacing on display headings (`-0.02em` to `-0.03em`) and `text-wrap: balance`.
- **Monospace & Tabular Data**: Reserved strictly for literal chess notation (SAN moves like `1. e4 c5 2. Nf3`), FEN strings, engine evaluation centipawns (`+0.35 cp`), ratings, and timers. All numerical stats use `tabular-nums` to prevent layout shift.

## Layout
- Full dynamic viewport height (`100dvh`) preventing iOS/Android mobile address bar layout shifts.
- Left-rail compact sidebar providing instant 1-click access to Repertoire, Deviations, Games, Puzzles, and Achievements.
- Modular right-hand workbench adapting between interactive board, chapter tree DAG, and engine evaluation graph.

## Elevation & Depth
- **Flat at rest**: Cards and table rows carry zero drop shadows when resting.
- **Depth reserved for floating overlays**: Shadows (`shadow-2xl`) are strictly permitted only on modal dialogs, account switchers, and tooltip popovers.
- **Borders over lines**: Separation is created through subtle surface tonal contrast (`bg-white/5`) rather than harsh dividing hairline borders.

## Shapes
- Radius scale: `rounded-xl` (12–16px) for major cards and view containers; `rounded-lg` (8–10px) for buttons and inputs; `rounded-full` for circular badges and status indicators.
- Pills (`rounded-full`) are reserved exclusively for compact badges (e.g., win/loss counters, rank numbers).

## Components
- **Primary Buttons**: Flat amber (`bg-amber-400 text-stone-950 font-bold`) with subtle hover darkening (`hover:bg-amber-300`) and active micro-scale (`active:scale-[0.98]`). No gradient fills.
- **Secondary Buttons**: Ghost or bordered surface (`border border-white/10 bg-white/5 hover:bg-white/10 text-white`).
- **Icons**: Drawn SVG icons strictly sourced from `lucide-react` with unified `1.5px`–`2px` stroke weight. Zero emojis in interactive UI.
- **Selection & Caret**: Themed selection (`::selection`) using amber background and obsidian foreground; amber caret on all inputs.

## Do's and Don'ts
- **DO** use `tabular-nums` for any rating, move ply, or timer numbers.
- **DO** use Lucide icons with meaningful semantic colorings (e.g. `CheckCircle2` in emerald, `AlertTriangle` in amber/rose).
- **DON'T** use multi-color gradients (purple-to-blue, rainbow gradients) on buttons or hero banners.
- **DON'T** place thick colored side-borders (`border-l-4`) on cards or list rows.
- **DON'T** use raw unicode emojis (`🧩`, `⚡`, `🥇`) as interface icons.
- **DON'T** apply drop shadows to resting cards or list items.
