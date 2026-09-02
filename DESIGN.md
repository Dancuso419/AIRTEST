# DESIGN.md — AIREST

Written at finish, from the built world. Replaces the earlier light/green
system, which shipped as a generic admin template and was rejected.

**World:** a small aircraft's night instrument six-pack. Chosen by the user
over the roll's assigned Site Survey. Seed key `09b6f6e4`.

---

## 1. Thesis

AIREST is an instrument panel, not a dashboard. Six dials, each owning one
truth, each carrying **both standards on one shared scale** — so the gap
between the two needles *is* the reading, rather than something the viewer
reconstructs by comparing separate gauges.

It refuses the arrangement it previously shipped: white cards on grey, KPI
tiles, a centred column of stacked form fields.

## 2. Palette

Taken from the chosen world's quality bar.

| Token | Value | Role |
|---|---|---|
| `--panel` | `#0b0d0f` | Panel ground |
| `--panel-raised` | `#14171a` | Plates |
| `--face` | `#0f1114` | Instrument faces, inputs, wells |
| `--bezel` | `#1b1f23` | Dial bezels |
| `--plate` | `#2a2d31` | Borders, minor ticks |
| `--hairline` | `#22272c` | Rules, seams |
| `--lum` | `#f2f5f5` | Luminous white — text, major ticks |
| `--lum-dim` | `#8b969b` | Secondary text, tick labels |
| `--radium` | `#7cff9e` | Section labels, engage, WiFi 6 |
| `--amber` | `#ffb000` | **Caution only** |
| `--warning` | `#ff3b30` | **Warning only** |

**Amber and red are signals, not decoration.** Amber is spent on exactly one
thing: the dataset's own caveats. Red is currently unspent. Using either
ornamentally destroys the only alarm channel the panel has.

**Standard identity:** WiFi 5 is luminous white, WiFi 6 is radium green. This
is the world's own needle convention, and it separates by **value as well as
hue**, so it survives colourblindness and greyscale printing in a
dissertation.

## 3. Type

| Role | Face |
|---|---|
| Display, numerals, placards | **Saira Variable** |
| Body, data, controls | **JetBrains Mono Variable** |

Both self-hosted via `@fontsource-variable`.

Mono as body text is earned here rather than worn as a costume: this surface
*is* measurement. Placards and section labels are uppercase Saira at
0.16–0.26em tracking. Every number carries `font-variant-numeric: tabular-nums`
— values change on re-seed, and proportional figures jitter.

## 4. The instrument

- **240° sweep** starting at 210°. The dead zone at the bottom is where a
  needle parks, so "no data" is visibly distinct from "zero".
- **21 minor ticks, 3 major.** Major ticks are luminous white and carry a
  labelled value; the labelled scale is what makes it an instrument rather
  than a progress ring.
- **Two needles per dial.** WiFi 5 runs full length in white; WiFi 6 runs
  14 units shorter in radium with a drop-shadow glow. The length difference is
  load-bearing: at an exact tie a single-length pair would hide one needle,
  and "both standards are equal" is itself a finding.
- **Counterweight tail** of 9 units past the pivot, as on the real thing.
- **Fixed scales**, never derived from the data: 5 Mbps per student, 100 ms
  latency (so the study's 50 ms threshold sits mid-dial), 20% loss, 100% for
  the two percentages, 1.0 for fairness. A self-rescaling dial destroys
  comparability between runs, which is the whole point.
- **Readout well** beneath the pivot: `white / green`, bordered, in the sweep's
  dead zone so it never collides with tick labels.

## 5. Materials

- Panel: `--panel-raised` with a 1px hairline, 6px radius, and a top-edge
  light gradient.
- **Fasteners**: 7px radial-gradient discs at plate corners.
- Dial face: 6px bezel ring, inset shadow for depth, a subtle top highlight
  reading as anti-reflective glass.
- Body carries a fine repeating-gradient grain plus one faint radium bloom at
  the top. Without grain a black page reads as an empty div.

## 6. Browser surfaces

```css
color-scheme: dark;                       /* native controls follow the panel */
::selection { background: rgba(124,255,158,0.25); }
:focus-visible { outline: 1px solid var(--radium); outline-offset: 3px; }
html { caret-color: var(--radium); scrollbar-color: var(--plate) var(--panel); }
```

Native `<select>` arrows are drawn with CSS gradient triangles rather than
left at browser default. Recharts' tooltip is themed to the instrument face —
its default is a white box, which on this ground is white text on white.

## 7. Motion

**One authored moment:** on engage, all twelve needles sweep from zero while
their readouts count up, ~700 ms, exponential ease-out. Nothing else animates
on arrival.

The sweep presents a value **already known**. It must never be dressed as
measurement in progress: no progress bar, no spinner, no indeterminate timer.
This is a product constraint from PRODUCT.md, not a stylistic one.

`prefers-reduced-motion` lands on final values at first paint and disables all
transitions.

## 8. What this world refuses

- Light theme, white cards, KPI tiles, sidebars — the rejected arrangement.
- Amber or red for anything but caution and warning.
- A hue outside white/radium for either standard.
- Self-rescaling dials.
- A dial without a labelled scale (that is a progress ring).
- Emoji or unicode glyphs as icons.
- Gradient text.
