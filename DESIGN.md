# DESIGN.md — Lecture Theatre WiFi Simulator

Durable visual decisions for the dashboard. Pinned by two references the user
supplied: `METER REF.png` (instrument form) and `DASH REF.jpg` (colour and
surface language).

---

## 1. The world

A measuring instrument, rendered in a calm institutional palette.

The page has one job: let someone see, in seconds, what two WiFi standards
deliver to a room full of students. The gauge is not decoration standing in for
content — it *is* the content, which is the only reason a dial earns its place
here rather than reading as dashboard costume.

**Light, not dark.** Chosen from the use scene rather than category habit: this
is demonstrated in a lit room, likely projected, to an examiner or an IT
manager. Light-on-dark washes out under those conditions. `DASH REF` is light
and the palette is built for it.

## 2. Palette

Taken from `DASH REF.jpg`. Monochromatic green on a warm-neutral ground.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F4F6F5` | Page ground |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-sunken` | `#EDF1EE` | Wells, inactive tracks |
| `--border` | `#E1E7E3` | Hairlines |
| `--ink` | `#16211B` | Primary text, needle |
| `--ink-dim` | `#5F6F67` | Secondary text, tick labels |
| `--forest` | `#0F3D26` | **WiFi 6**, primary actions |
| `--forest-600` | `#1B5E3B` | Button fill, gradient start |
| `--green` | `#4E9E6E` | **WiFi 5** |
| `--mint` | `#8FCBA4` | Gauge gradient mid |
| `--mint-pale` | `#D6E9DE` | Gauge track, tints |
| `--warn` | `#B45309` | Unavailable and caveat states only |

**Standard identity is value, not hue.** WiFi 5 is `--green`, WiFi 6 is
`--forest`. Value contrast survives colourblindness and print, and it keeps the
comparison inside the reference palette rather than importing an accent hue that
would editorialise the result. Charts add line style (solid for WiFi 6, dashed
for WiFi 5) as a redundant second channel.

`--warn` is reserved for genuinely absent data and dataset caveats. It never
marks a standard.

## 3. The instrument

From `METER REF.png`, re-tuned for a light ground.

- **Semicircular arc**, 180°, stroke `16px`, round caps.
- **Track** in `--mint-pale`; **fill** a gradient running `--mint` → `--forest`
  along the sweep, so the arc deepens as the value climbs.
- **Needle** in `--ink` — the reference uses white on dark; on a light ground
  the needle inverts to near-black or it disappears. A pivot disc in `--surface`
  with an `--ink` ring sits at the arc's centre.
- **Tick labels** ringing the outside in `--ink-dim`, at `0.7rem`, marking the
  scale so the number has a frame of reference. The reference's ticks are what
  make it read as an instrument rather than a progress ring; they are not
  optional.
- **Full scale is 5 Mbps per student** — enough for HD video, so the arc's
  full sweep means something rather than being arbitrary.

## 4. Type

**Nunito Sans**, self-hosted via `@fontsource-variable/nunito-sans`. The
reference's face is a rounded humanist sans with a double-storey `a`; Poppins
(single-storey) is the wrong match. A system fallback stack is a failure here,
not a fallback.

| Role | Spec |
|---|---|
| Page title | 800, `clamp(1.75rem, 4vw, 2.5rem)`, tracking `-0.02em` |
| Section heading | 700, `1.25rem` |
| Condition question | 600, `1.05rem` |
| Gauge value | 800, `clamp(2.5rem, 6vw, 3.5rem)`, tracking `-0.03em` |
| Body | 400, `1rem`, measure 65–75ch |
| Tick / meta | 400, `0.75rem` |

**Every number uses `font-variant-numeric: tabular-nums`.** Values change on
re-roll; proportional figures make them jitter, which reads as instability in a
tool whose subject is measurement.

## 5. Surfaces and depth

- Cards: `--surface`, `1px solid --border`, radius `16px`.
- Shadow: `0 1px 2px rgba(16,33,27,.05), 0 10px 28px rgba(16,33,27,.07)` — real
  offset plus blur. No zero-offset halos.
- Buttons: full pill. Primary is `--forest-600` → `--green` at 135°, white text.
- **No nested cards.** The gauges sit directly on the results card, not in cards
  of their own.

## 6. Browser surfaces

These ship with defaults belonging to no design system, so they are themed:

```css
::selection { background: var(--mint-pale); color: var(--ink); }
:focus-visible { outline: 2px solid var(--forest); outline-offset: 2px; }
html { caret-color: var(--forest); scrollbar-color: var(--mint) var(--surface-sunken); }
```

## 7. Motion

**One authored moment:** on GO, the needle sweeps from zero to its value while
the figure counts up, ~700 ms, exponential ease-out. Both gauges animate
together, not staggered.

Nothing else animates on arrival. No section entrances, no scattered hovers
beyond a simple state change.

**The needle sweep is presentation of a value already known.** It must never be
dressed as measurement in progress: no progress bar, no spinner, no indeterminate
timer. This is a product constraint from the spec, not a stylistic preference,
and it is the one place where "make it feel like Speedtest" could quietly become
a misrepresentation.

Respect `prefers-reduced-motion`: land on the final value immediately.

## 8. What this world refuses

- Dark theme (wrong for the use scene).
- A hue outside the green family for either standard.
- Gradient text; emphasis is weight and size.
- Emoji or unicode glyphs as icons; any icon is drawn SVG at one stroke weight.
- Nested cards, or same-size cards used as page structure.
- A kicker or eyebrow above any heading.
- Monospace as a costume for "technical". Data uses tabular numerals in the
  body face.
