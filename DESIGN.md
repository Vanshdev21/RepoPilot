---
name: Autonomous Engineering Telemetry
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393e'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b20'
  surface-container: '#1e1f24'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343439'
  on-surface: '#e3e2e8'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e3e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#8c909f'
  outline-variant: '#424753'
  surface-tint: '#afc6ff'
  primary: '#afc6ff'
  on-primary: '#002d6c'
  primary-container: '#528dff'
  on-primary-container: '#00275f'
  inverse-primary: '#0059c6'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#42d9e8'
  on-tertiary: '#00363b'
  tertiary-container: '#00a0ac'
  on-tertiary-container: '#002f33'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#afc6ff'
  on-primary-fixed: '#001a43'
  on-primary-fixed-variant: '#004398'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#88f3ff'
  tertiary-fixed-dim: '#42d9e8'
  on-tertiary-fixed: '#001f23'
  on-tertiary-fixed-variant: '#004f56'
  background: '#121317'
  on-background: '#e3e2e8'
  surface-variant: '#343439'
typography:
  display-hero:
    fontFamily: Geist
    fontSize: 4.5rem
    fontWeight: '600'
    lineHeight: '1.05'
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Geist
    fontSize: 2.5rem
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: -0.03em
  headline-xl:
    fontFamily: Geist
    fontSize: 3rem
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: -0.01em
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: -0.005em
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-code:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: '0'
  label-tag:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.06em
  telemetry-metric:
    fontFamily: JetBrains Mono
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.03em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 4rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
  space-2xl: 4rem
---

## Brand & Style

This design system establishes a high-performance visual language calibrated for senior software architects, staff engineers, and systems infrastructure leads. The emotional tone evokes absolute deterministic control, surgical accuracy, and dark luxury minimalism. It steers clear of playful gradients, rounded novelty shapes, or decorative blur meshes. Instead, it mirrors the cold precision of high-frequency trading terminals, mission control aerospace monitors, and high-end developer IDEs.

The overarching aesthetic fuses high-contrast technical editorial typography with functional developer telemetry. Razor-thin borders define architectural surfaces, monospaced metadata badges anchor every interaction in deterministic states, and vibrant chromatic indicators signal execution flow, git operations, and autonomous agent loops.

## Colors

The palette operates on pure chromatic restraint against an abyss of deep slate and carbon blacks.

### Canvas & Surface Hierarchy
- **Base Canvas (`#08090D`)**: The primary deep dark viewport baseline. Used exclusively for full-canvas application viewports and landing page backgrounds.
- **Surface Layer 1 (`#101219`)**: Structural card backdrops, command bars, sidebar panels, and terminal windows.
- **Surface Layer 2 (`#161922`)**: Hover states, table headers, active code cells, and secondary telemetry modules.
- **Surface Layer 3 (`#1D2230`)**: Floating tooltips, popovers, and elevated command palettes.

### Structural Contours
- **Subtle White Border (`rgba(255, 255, 255, 0.08)`)**: Universal line separating cards, panels, and structural grid columns.
- **Active / Focused Border (`rgba(255, 255, 255, 0.16)`)**: Applied during keyboard navigation, card active states, and code block selections.

### Chromatic Signals & Accents
- **Primary / Electric Neon Blue (`#4F8CFF`)**: Interactive hooks, primary call-to-action buttons, active tab indicators, and branch diff links.
- **Secondary / Electric Violet (`#8B5CF6`)**: Autonomous agent reasoning traces, model inference indicators, and speculative execution tags.
- **Tertiary / Cyan (`#42D9E8`)**: Live telemetry, network I/O stats, and compilation throughput metrics.
- **Success / Verified Green (`#65D69A`)**: Verified automated test passes, clean builds, and PR merge statuses.
- **Warning / Alert Amber (`#F59E0B`)**: Dependency conflicts and human-in-the-loop escalation requests.
- **Critical / Failure Coral (`#EF4444`)**: Unit failure, build regression, and syntax diagnostics.

## Typography

The typography pairings intentionally set up a dialogue between human editorial synthesis and machine-executable syntax.

- **Primary Headings (`Geist`)**: Tight, mechanical, neo-grotesque letterforms. Used for editorial claims, value propositions, and section landmarks. Tight negative tracking creates optical tension and architectural density.
- **Technical & Body Prose (`JetBrains Mono`)**: Strict tabular monospace for all narrative paragraphs, specs, terminal readouts, metrics, and micro-labels. By rendering regular prose in monospace, the interface communicates immediate developer ergonomics, treating all system descriptions as structured data.

## Layout & Spacing

The layout model is governed by an engineered 12-column modular grid anchored to strict mathematical intervals.

### Grid Anatomy
- **Desktop (>= 1280px)**: 12 equal columns, `1.5rem` (24px) gutters, `4rem` (64px) outer margin bounds with an absolute `max-width` cap of `1440px`.
- **Tablet (768px - 1279px)**: 8 columns, `1rem` (16px) gutters, `2rem` (32px) margins.
- **Mobile (< 768px)**: 4 columns, `1rem` (16px) gutters, `1rem` (16px) margins.

### Spacing Philosophy
Layout spacing adheres strictly to multiples of `0.25rem` (4px). Structural modules maintain compact visual density—resembling a functional instrument panel rather than a loose marketing showcase. Terminal sections and telemetry feeds use micro-spacers (`space-xs`, `space-sm`) to maximize visible information density, while editorial transitions span `space-xl` and `space-2xl` to allow cognitive breathing room.

## Elevation & Depth

This design system rejects heavy dropshadows, blurred gradient orbs, and murky frosted glass overlays. Elevation is communicated purely through **surface luminances** and **crisp 8-12% structural contours**.

### Depth Layers
- **Elevation 0 (Canvas Base)**: `#08090D`. The deepest ground level.
- **Elevation 1 (Structural Cards & Viewports)**: `#101219` bounded by an exact `1px solid rgba(255, 255, 255, 0.08)` hairline border.
- **Elevation 2 (Floating Popouts, Inspect Drawers, Tooltips)**: `#161922` bounded by `1px solid rgba(255, 255, 255, 0.14)` paired with an ultra-focused technical shadow: `0 4px 16px rgba(0, 0, 0, 0.6)`.

### Chromatic Light Emittance
Selected interactive cards and terminal execution frames use zero-blur inner borders or hairline highlight strokes (`1px solid #4F8CFF` or `1px solid #8B5CF6` at 30% opacity) to denote active operational threads, creating the impression of precision laser edge illumination rather than diffuse neon glow.

## Shapes

The shape hierarchy is strictly anchored at roundedness level `1` (Soft/Crisp).

- **Standard Base Radii (`0.25rem` / 4px)**: Buttons, telemetry chips, code badges, input fields, and tab toggles.
- **Container Radii (`0.5rem` / 8px)**: Large feature cards, terminal windows, code review diff panels, and modal shells.
- **Strictly Disallowed**: Fully round pills (`border-radius: 9999px`) and squircle shapes. The form language must maintain an engineered, mechanical profile.

## Components

### Buttons
- **Primary Execution**: Background `#4F8CFF`, foreground `#08090D`, border `1px solid transparent`, font `JetBrains Mono` 500, `0.25rem` radius. Hover shifts to `#6BA0FF`. Active state scales down to `0.98`.
- **Secondary Ghost**: Background `transparent`, foreground `#FFFFFF`, border `1px solid rgba(255, 255, 255, 0.1)`. Hover shifts background to `rgba(255, 255, 255, 0.04)` and border to `rgba(255, 255, 255, 0.2)`.
- **Command / Keybound Trigger**: Monospace text accompanied by an inline right-aligned key badge (`KBD` tag with `rgba(255, 255, 255, 0.08)` fill and `0.25rem` radius).

### Monospaced Badges & Chips
- **Telemetry Indicators**: Uppercase `label-tag` typography with an embedded 4px radial status dot.
- **State Variants**:
  - Autonomous Agent Active: `#8B5CF6` dot, border `rgba(139, 92, 246, 0.25)`, background `rgba(139, 92, 246, 0.06)`.
  - Continuous Integration Passed: `#65D69A` dot, border `rgba(101, 214, 154, 0.25)`, background `rgba(101, 214, 154, 0.06)`.
  - Execution Stream: `#42D9E8` dot, border `rgba(66, 217, 232, 0.25)`, background `rgba(66, 217, 232, 0.06)`.

### Terminal Viewports & Code Diffs
- Structured shell with a top header bar containing window status dots (monochrome low-opacity grays), file tree path (`JetBrains Mono`, `0.75rem`), and branch hash.
- Background `#0B0C11`, surrounded by a `1px solid rgba(255, 255, 255, 0.08)` border.
- Diff gutters display line numbers in `rgba(255, 255, 255, 0.24)`, additions highlighted with `rgba(101, 214, 154, 0.1)` and deletions with `rgba(239, 68, 68, 0.1)`.

### Inputs & Terminal Prompt Bars
- Inline `$ repo-pilot` prefix in `#4F8CFF`.
- Background `#101219`, text `#FFFFFF`, border `1px solid rgba(255, 255, 255, 0.1)`.
- Focus state switches border to `1px solid #4F8CFF` without external halos or blurred glow rings.

### Feature & Metric Cards
- Surfaces constructed in `#101219` with top right corner metadata indexes (e.g., `// 01_SPEC_ORCHESTRATION`).
- Subtle gridlines etched via `border-right` and `border-bottom` divider lines (`1px solid rgba(255, 255, 255, 0.06)`).