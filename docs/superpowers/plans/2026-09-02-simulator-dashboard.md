# Simulator Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-chart dashboard with a simulator-style interface — set conditions in plain language, press GO, see WiFi 5 and WiFi 6 raced side by side — implementing the PRD's Sample Run requirement.

**Architecture:** Pure logic (metric vocabulary, scenario selection, verdict generation) lives in plain `.js` modules that take data as arguments and are unit-tested with Node's built-in test runner. React components stay thin and presentational. `results.json` is unchanged; all available options are derived from it at runtime so the UI lights up as the matrix grows.

**Tech Stack:** Vite 8, React 19, Recharts 3 (already installed), Node 24's built-in `node:test` runner, and `@fontsource-variable/nunito-sans` for the self-hosted display face.

**Spec:** `docs/superpowers/specs/2026-09-02-simulator-dashboard-design.md`
**Visual system:** `DESIGN.md` — pinned by the user's `METER REF.png` (instrument form) and `DASH REF.jpg` (colour and surface language). Read it before Task 3.

## Global Constraints

- **Every control must map to a parameter the simulation actually varied.** A control whose value the matrix does not cover would require inventing a response. No exceptions for visual completeness.
- **No fake progress indicator.** A counting-up animation on result numbers is presentation and is permitted. Any progress bar, spinner, or timer implying that measurement is elapsing is forbidden. This is a correctness requirement, not a style preference.
- **A permanent line beneath the GO button reads exactly:** `Replays a stored NS-3 trial — not a live measurement.` Not in a tooltip, not behind an info icon, not on hover.
- **Every result view carries a provenance badge** naming the trial number, the seed, the NS-3 version, and the word `pre-computed`.
- **Metric keys in `results.json` are unchanged.** Presentation changes only. The keys are: `aggregate_throughput_mbps`, `per_user_throughput_mbps`, `latency_ms`, `jitter_ms`, `packet_loss_pct`, `satisfaction_ratio_pct`, `fairness_index`, `airtime_utilization_pct`.
- **`per_user_throughput_mbps` is the headline metric.** "Each student gets 1.7 Mbps" is meaningful; "aggregate throughput 172 Mbps" is not.
- **Unavailable combinations are shown as unavailable, never silently substituted** with the nearest scenario.
- **Where the two standards do not differ meaningfully, the verdict says so** rather than manufacturing a contrast.
- **Latency and jitter are delivered-packets-only** and must carry that caveat; the text comes from `meta.caveats`.
- **The design is pinned by `DESIGN.md`.** Light theme, forest-green palette, needle instrument. WiFi 5 is `--green` (`#4E9E6E`), WiFi 6 is `--forest` (`#0F3D26`) — distinguished by value, never by an accent hue. Do not substitute your own palette or "improve" the direction.
- **Every number renders with `font-variant-numeric: tabular-nums`.** Values change on re-roll; proportional figures jitter and read as instability in a measurement tool.
- **One authored motion moment:** the needle sweep plus count-up on GO, ~700 ms, both gauges together. Nothing else animates on arrival. Honour `prefers-reduced-motion` by landing on the final value.
- Topology maps to access points: `single_ap` = 1 AP, `multi_ap` = 3 APs.
- Traffic types map to plain language: `web` = "Browsing the web", `video` = "Streaming video", `bulk` = "Downloading files".
- All work is under `dashboard/`. Do not modify `data/results.json`, `pipeline/`, or `sim/`.
- Run `npm test` and `npm run build` from `dashboard/`. Never leave a dev server running.

## File Structure

| File | Responsibility |
|---|---|
| `src/metrics.js` (modify) | Metric vocabulary: key, plain label, explanation, unit, direction |
| `src/scenarios.js` (create) | Derive available conditions from data; find a scenario; pick a trial |
| `src/verdict.js` (create) | Build the plain-English verdict sentence |
| `src/theme.css` (create) | Design tokens and shared component styles |
| `src/ConditionsPanel.jsx` (create) | The three primary dials plus the advanced panel |
| `src/ResultGauges.jsx` (create) | Two gauges side by side, plus supporting metric tiles |
| `src/ProvenanceBadge.jsx` (create) | Trial / seed / version / pre-computed label |
| `src/useCountUp.js` (create) | Small hook animating a number to its final value |
| `src/App.jsx` (modify) | Orchestrates setup and results states |
| `src/ComparisonChart.jsx` (keep) | Retained below the fold as the data explorer |
| `src/*.test.js` (create) | Node `node:test` unit tests for the pure modules |

Pure logic takes data as arguments and never imports `results.json`, so tests use small fixtures rather than the real dataset.

---

### Task 1: Metric vocabulary and verdict sentence

**Files:**
- Modify: `dashboard/src/metrics.js`
- Create: `dashboard/src/verdict.js`
- Create: `dashboard/src/verdict.test.js`
- Modify: `dashboard/package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `METRICS` — array of `{ key, label, plainLabel, explanation, unit, betterWhen, headline? }`
  - `TRAFFIC_LABELS` — `{ web, video, bulk }` to plain strings
  - `STANDARD_LABELS` — `{ wifi5, wifi6 }` (already exists, unchanged)
  - `buildVerdict({ wifi5, wifi6, clients, trafficType }) -> string` where `wifi5`/`wifi6` are scenario objects or `null`

- [ ] **Step 1: Add the test script**

In `dashboard/package.json`, add to `"scripts"`:

```json
    "test": "node --test \"src/*.test.js\"",
```

Node 24 ships a test runner; no dependency is added. Use the glob form exactly
as written: `node --test src/` (a bare directory argument) fails with
MODULE_NOT_FOUND on Node 24 for Windows, while the glob resolves correctly.

- [ ] **Step 2: Write the failing verdict tests**

Create `dashboard/src/verdict.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerdict } from './verdict.js';

function scenario(standard, perUser) {
  return {
    standard,
    aggregates: { per_user_throughput_mbps: { mean: perUser, std: 0 } },
  };
}

test('names both figures and the percentage difference', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 1.6),
    wifi6: scenario('wifi6', 2.4),
    clients: 60,
    trafficType: 'video',
  });
  assert.match(s, /60 students/);
  assert.match(s, /streaming video/i);
  assert.match(s, /1\.6/);
  assert.match(s, /2\.4/);
  assert.match(s, /50%/);
  assert.match(s, /WiFi 6/);
});

test('says both cope when the difference is under five percent', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 2.00),
    wifi6: scenario('wifi6', 2.04),
    clients: 20,
    trafficType: 'video',
  });
  assert.match(s, /no meaningful difference|both/i);
  assert.doesNotMatch(s, /more/);
});

test('reports WiFi 5 ahead when it actually is', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 3.0),
    wifi6: scenario('wifi6', 2.0),
    clients: 40,
    trafficType: 'bulk',
  });
  assert.match(s, /WiFi 5/);
  assert.match(s, /50%/);
});

test('returns an explicit no-data sentence when a standard is missing', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 2.0),
    wifi6: null,
    clients: 40,
    trafficType: 'video',
  });
  assert.match(s, /not been simulated|no data/i);
  assert.doesNotMatch(s, /%/);
});

test('does not divide by zero when both are zero', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 0),
    wifi6: scenario('wifi6', 0),
    clients: 200,
    trafficType: 'video',
  });
  assert.ok(typeof s === 'string' && s.length > 0);
  assert.doesNotMatch(s, /NaN|Infinity/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd dashboard && npm test`
Expected: FAIL — cannot find module `./verdict.js`.

- [ ] **Step 4: Write the verdict module**

Create `dashboard/src/verdict.js`:

```javascript
import { TRAFFIC_LABELS } from './metrics.js';

// Below this relative gap the two standards are reported as equivalent rather
// than as one "winning". At low densities neither standard is stressed, and
// manufacturing a contrast there would misrepresent the data.
const MEANINGFUL_DIFFERENCE = 0.05;

function perUser(scenarioObj) {
  return scenarioObj?.aggregates?.per_user_throughput_mbps?.mean ?? null;
}

export function buildVerdict({ wifi5, wifi6, clients, trafficType }) {
  const activity = (TRAFFIC_LABELS[trafficType] ?? trafficType).toLowerCase();
  const setting = `At ${clients} students ${activity}`;

  const a = perUser(wifi5);
  const b = perUser(wifi6);

  if (a === null || b === null) {
    return `${setting}, this combination has not been simulated yet.`;
  }

  const best = Math.max(a, b);
  if (best === 0) {
    return `${setting}, neither standard delivered any usable throughput.`;
  }

  const gap = Math.abs(a - b) / best;
  if (gap < MEANINGFUL_DIFFERENCE) {
    return (
      `${setting}, both standards deliver about ${a.toFixed(1)} Mbps per ` +
      `student — no meaningful difference at this density.`
    );
  }

  const leaderIsSix = b > a;
  const leader = leaderIsSix ? 'WiFi 6' : 'WiFi 5';
  const lead = leaderIsSix ? b : a;
  const trail = leaderIsSix ? a : b;
  const other = leaderIsSix ? 'WiFi 5' : 'WiFi 6';
  const pct = Math.round(((lead - trail) / trail) * 100);

  return (
    `${setting}, ${leader} gives each student ${lead.toFixed(1)} Mbps ` +
    `versus ${other}'s ${trail.toFixed(1)} Mbps — about ${pct}% more.`
  );
}
```

- [ ] **Step 5: Rewrite the metric vocabulary**

Replace the `METRICS` array in `dashboard/src/metrics.js` and add `TRAFFIC_LABELS`. Keep `STANDARD_LABELS` and `toChartRows` exactly as they are — `ComparisonChart` still uses them.

```javascript
// Each metric carries a technical label (for the explorer chart), a plain
// label and explanation (for the results view), its unit, and its direction.
// Keys must match results.json exactly and must never be renamed here.
export const METRICS = [
  {
    key: 'per_user_throughput_mbps',
    label: 'Per-user throughput',
    plainLabel: 'Speed per student',
    explanation: 'what one person actually gets',
    unit: 'Mbps',
    betterWhen: 'higher',
    headline: true,
  },
  {
    key: 'aggregate_throughput_mbps',
    label: 'Aggregate throughput',
    plainLabel: 'Total speed',
    explanation: 'the whole room combined',
    unit: 'Mbps',
    betterWhen: 'higher',
  },
  {
    key: 'latency_ms',
    label: 'Latency (delivered packets)',
    plainLabel: 'Lag',
    explanation: 'delay before things respond',
    unit: 'ms',
    betterWhen: 'lower',
  },
  {
    key: 'jitter_ms',
    label: 'Jitter (delivered packets)',
    plainLabel: 'Jitter',
    explanation: 'how much the delay varies',
    unit: 'ms',
    betterWhen: 'lower',
  },
  {
    key: 'packet_loss_pct',
    label: 'Packet loss',
    plainLabel: 'Data lost',
    explanation: 'what never arrived',
    unit: '%',
    betterWhen: 'lower',
  },
  {
    key: 'satisfaction_ratio_pct',
    label: 'Offered-load satisfaction',
    plainLabel: 'Demand met',
    explanation: 'share of what was asked for',
    unit: '%',
    betterWhen: 'higher',
  },
  {
    key: 'fairness_index',
    label: "Jain's fairness index",
    plainLabel: 'Fairness',
    explanation: 'does everyone get an equal share',
    unit: '0-1',
    betterWhen: 'higher',
  },
  {
    key: 'airtime_utilization_pct',
    label: 'Airtime utilization',
    plainLabel: 'Airwave usage',
    // Lower airtime for the same delivered throughput is the WiFi 6
    // efficiency advantage this study exists to measure.
    explanation: 'how congested the channel is',
    unit: '%',
    betterWhen: 'lower',
  },
];

export const TRAFFIC_LABELS = {
  web: 'Browsing the web',
  video: 'Streaming video',
  bulk: 'Downloading files',
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd dashboard && npm test`
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/metrics.js dashboard/src/verdict.js dashboard/src/verdict.test.js dashboard/package.json
git commit -m "feat(dashboard): plain-language metric vocabulary and verdict sentence"
```

---

### Task 2: Scenario selection and availability

**Files:**
- Create: `dashboard/src/scenarios.js`
- Create: `dashboard/src/scenarios.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (independent module)
- Produces:
  - `TOPOLOGY_BY_APS` — `{ 1: 'single_ap', 3: 'multi_ap' }`
  - `availableConditions(scenarios) -> { clients: number[], trafficTypes: string[], apCounts: number[] }` (each sorted ascending / alphabetical)
  - `findScenario(scenarios, { clients, trafficType, aps, standard }) -> scenario | null`
  - `isCombinationAvailable(scenarios, { clients, trafficType, aps }) -> boolean` (true only when BOTH standards are present)
  - `pickTrial(scenario, { excludeSeed = null, rng = Math.random } = {}) -> trial | null`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/src/scenarios.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableConditions,
  findScenario,
  isCombinationAvailable,
  pickTrial,
  TOPOLOGY_BY_APS,
} from './scenarios.js';

function sc(standard, clients, traffic, topology, trials) {
  return {
    standard,
    clients,
    traffic_type: traffic,
    topology,
    trials: trials.map((seed) => ({ seed, per_user_throughput_mbps: seed })),
    aggregates: { per_user_throughput_mbps: { mean: 1, std: 0 } },
  };
}

const DATA = [
  sc('wifi5', 10, 'video', 'single_ap', [1, 2]),
  sc('wifi6', 10, 'video', 'single_ap', [1, 2]),
  sc('wifi5', 20, 'video', 'single_ap', [1, 2]),
  sc('wifi6', 20, 'video', 'single_ap', [1]),
  sc('wifi5', 20, 'web', 'multi_ap', [1, 2]),
];

test('available conditions are derived from the data, sorted', () => {
  const a = availableConditions(DATA);
  assert.deepEqual(a.clients, [10, 20]);
  assert.deepEqual(a.trafficTypes, ['video', 'web']);
  assert.deepEqual(a.apCounts, [1, 3]);
});

test('available conditions are empty for an empty dataset', () => {
  const a = availableConditions([]);
  assert.deepEqual(a.clients, []);
  assert.deepEqual(a.trafficTypes, []);
  assert.deepEqual(a.apCounts, []);
});

test('findScenario matches on all four fields', () => {
  const s = findScenario(DATA, {
    clients: 10, trafficType: 'video', aps: 1, standard: 'wifi6',
  });
  assert.equal(s.standard, 'wifi6');
  assert.equal(s.clients, 10);
});

test('findScenario returns null rather than a near match', () => {
  const s = findScenario(DATA, {
    clients: 14, trafficType: 'video', aps: 1, standard: 'wifi6',
  });
  assert.equal(s, null);
});

test('findScenario maps 3 access points to multi_ap', () => {
  const s = findScenario(DATA, {
    clients: 20, trafficType: 'web', aps: 3, standard: 'wifi5',
  });
  assert.equal(s.topology, 'multi_ap');
});

test('a combination needs BOTH standards to count as available', () => {
  assert.equal(
    isCombinationAvailable(DATA, { clients: 10, trafficType: 'video', aps: 1 }),
    true,
  );
  // wifi6 exists at 20/video/1ap, wifi5 exists — available
  assert.equal(
    isCombinationAvailable(DATA, { clients: 20, trafficType: 'video', aps: 1 }),
    true,
  );
  // only wifi5 exists for web/multi_ap — not a comparison
  assert.equal(
    isCombinationAvailable(DATA, { clients: 20, trafficType: 'web', aps: 3 }),
    false,
  );
});

test('pickTrial avoids the excluded seed when another exists', () => {
  const scenarioObj = DATA[0];
  const t = pickTrial(scenarioObj, { excludeSeed: 1, rng: () => 0 });
  assert.equal(t.seed, 2);
});

test('pickTrial returns the only trial when it cannot avoid the seed', () => {
  const single = DATA[3]; // wifi6, 20 clients, one trial
  const t = pickTrial(single, { excludeSeed: 1, rng: () => 0 });
  assert.equal(t.seed, 1);
});

test('pickTrial returns null for a scenario with no trials', () => {
  assert.equal(pickTrial({ trials: [] }), null);
  assert.equal(pickTrial(null), null);
});

test('TOPOLOGY_BY_APS maps both supported values', () => {
  assert.equal(TOPOLOGY_BY_APS[1], 'single_ap');
  assert.equal(TOPOLOGY_BY_APS[3], 'multi_ap');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dashboard && npm test`
Expected: FAIL — cannot find module `./scenarios.js`.

- [ ] **Step 3: Write the module**

Create `dashboard/src/scenarios.js`:

```javascript
// Access-point count is what a viewer understands; topology is what the
// dataset stores. This is the only place the two vocabularies meet.
export const TOPOLOGY_BY_APS = { 1: 'single_ap', 3: 'multi_ap' };

const APS_BY_TOPOLOGY = { single_ap: 1, multi_ap: 3 };

/**
 * Every selectable value, derived from the data rather than hardcoded, so new
 * options appear as the simulation matrix grows without a frontend change.
 */
export function availableConditions(scenarios) {
  const clients = new Set();
  const trafficTypes = new Set();
  const apCounts = new Set();

  for (const s of scenarios) {
    clients.add(s.clients);
    trafficTypes.add(s.traffic_type);
    const aps = APS_BY_TOPOLOGY[s.topology];
    if (aps !== undefined) apCounts.add(aps);
  }

  return {
    clients: [...clients].sort((a, b) => a - b),
    trafficTypes: [...trafficTypes].sort(),
    apCounts: [...apCounts].sort((a, b) => a - b),
  };
}

export function findScenario(scenarios, { clients, trafficType, aps, standard }) {
  const topology = TOPOLOGY_BY_APS[aps];
  return (
    scenarios.find(
      (s) =>
        s.clients === clients &&
        s.traffic_type === trafficType &&
        s.topology === topology &&
        s.standard === standard,
    ) ?? null
  );
}

/**
 * A combination is only usable if BOTH standards were simulated for it — the
 * whole point of the view is the comparison, and showing one standard alone
 * would invite a reader to infer the other.
 */
export function isCombinationAvailable(scenarios, { clients, trafficType, aps }) {
  return (
    findScenario(scenarios, { clients, trafficType, aps, standard: 'wifi5' }) !== null &&
    findScenario(scenarios, { clients, trafficType, aps, standard: 'wifi6' }) !== null
  );
}

/**
 * Choose one stored trial. `excludeSeed` supports "run again": it picks a
 * different seed so the numbers visibly change, which is the point of the
 * interaction. With only one trial it returns that trial rather than pretending.
 */
export function pickTrial(scenario, { excludeSeed = null, rng = Math.random } = {}) {
  const trials = scenario?.trials ?? [];
  if (trials.length === 0) return null;

  const candidates =
    excludeSeed === null ? trials : trials.filter((t) => t.seed !== excludeSeed);
  const pool = candidates.length > 0 ? candidates : trials;

  return pool[Math.floor(rng() * pool.length) % pool.length];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm test`
Expected: 15 tests pass (5 from Task 1, 10 here).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/scenarios.js dashboard/src/scenarios.test.js
git commit -m "feat(dashboard): scenario lookup, availability and trial selection"
```

---

### Task 3: Design tokens and application shell

**Files:**
- Create: `dashboard/src/theme.css`
- Modify: `dashboard/src/main.jsx` (import the theme)
- Modify: `dashboard/src/App.jsx`
- Modify: `dashboard/src/index.css`

**Interfaces:**
- Consumes: `METRICS`, `TRAFFIC_LABELS` (Task 1); `availableConditions` (Task 2)
- Produces: an `App` with a `phase` state of `'setup' | 'results'`, holding `conditions` state `{ clients, trafficType, aps }` and a `run` state `{ wifi5Trial, wifi6Trial, seed }`

This task establishes structure and styling only; the panel and gauges arrive in Tasks 4 and 5. Use simple placeholder markup for them here so the shell is testable on its own.

- [ ] **Step 1: Install the display face**

Run: `cd dashboard && npm install @fontsource-variable/nunito-sans`

`DESIGN.md` pins Nunito Sans — a rounded humanist sans with a double-storey `a`, matching the reference. Poppins is the wrong match (single-storey `a`). A system fallback stack is not acceptable as the display voice.

- [ ] **Step 2: Write the design tokens**

Create `dashboard/src/theme.css`. Values come from `DESIGN.md` sections 2-6 — do not invent alternatives.

```css
@import '@fontsource-variable/nunito-sans';

:root {
  /* Palette — DASH REF.jpg. Monochromatic green on a warm-neutral ground. */
  --bg: #f4f6f5;
  --surface: #ffffff;
  --surface-sunken: #edf1ee;
  --border: #e1e7e3;
  --ink: #16211b;
  --ink-dim: #5f6f67;

  /* Standards are separated by VALUE, not hue. Never swap these for an
     accent colour: a warm hue on one standard editorialises the result. */
  --green: #4e9e6e;    /* WiFi 5 */
  --forest: #0f3d26;   /* WiFi 6, primary actions */
  --forest-600: #1b5e3b;
  --mint: #8fcba4;
  --mint-pale: #d6e9de;

  /* Absent data and dataset caveats only. Never marks a standard. */
  --warn: #b45309;

  --radius: 16px;
  --gap: 1.25rem;
  --maxw: 1080px;
  --font: 'Nunito Sans Variable', system-ui, sans-serif;
  --shadow: 0 1px 2px rgba(16, 33, 27, 0.05), 0 10px 28px rgba(16, 33, 27, 0.07);
}

* { box-sizing: border-box; }

html {
  caret-color: var(--forest);
  scrollbar-color: var(--mint) var(--surface-sunken);
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

::selection { background: var(--mint-pale); color: var(--ink); }

:focus-visible { outline: 2px solid var(--forest); outline-offset: 2px; }

/* Data must not jitter when the seed changes. */
.num { font-variant-numeric: tabular-nums; }

.shell { max-width: var(--maxw); margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }

.page-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin: 0 0 0.4rem;
}

.page-sub { color: var(--ink-dim); margin: 0 0 2rem; max-width: 70ch; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: var(--shadow);
}

.go-button {
  display: block;
  width: 100%;
  max-width: 240px;
  margin: 2rem auto 0.6rem;
  padding: 1.05rem;
  font-family: inherit;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #ffffff;
  background: linear-gradient(135deg, var(--forest-600), var(--green));
  border: none;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: var(--shadow);
  transition: filter 140ms ease-out;
}

.go-button:hover:not(:disabled) { filter: brightness(1.07); }

.go-button:disabled {
  background: var(--surface-sunken);
  color: var(--ink-dim);
  box-shadow: none;
  cursor: not-allowed;
}

/* Permanent, never a tooltip. Spec section 2. */
.go-note {
  text-align: center;
  color: var(--ink-dim);
  font-size: 0.85rem;
  margin: 0;
}

.verdict {
  font-size: clamp(1.15rem, 2.4vw, 1.45rem);
  font-weight: 600;
  line-height: 1.45;
  margin: 0 0 1.75rem;
  max-width: 60ch;
}

.unavailable {
  color: var(--warn);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.9rem 1.1rem;
  margin-top: 1rem;
}

.secondary-button {
  background: var(--surface);
  color: var(--forest);
  border: 1.5px solid var(--forest);
  border-radius: 999px;
  padding: 0.65rem 1.35rem;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  transition: background 140ms ease-out;
}

.secondary-button:hover:not(:disabled) { background: var(--mint-pale); }

.secondary-button:disabled {
  color: var(--ink-dim);
  border-color: var(--border);
  cursor: not-allowed;
}

.explorer { margin-top: 3.5rem; }

.explorer h2 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.25rem; }
```

- [ ] **Step 3: Import the theme and strip the Vite starter styles**

In `dashboard/src/main.jsx`, add `import './theme.css';` immediately after the existing `import './index.css';`.

Then replace the entire contents of `dashboard/src/index.css` with a single comment, so the Vite starter styles stop fighting the theme:

```css
/* Vite starter styles removed; see theme.css for this app's design tokens. */
```

- [ ] **Step 4: Rewrite the app shell**

Replace `dashboard/src/App.jsx` entirely:

```jsx
import { useMemo, useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import { METRICS } from './metrics';
import { availableConditions, findScenario, isCombinationAvailable, pickTrial } from './scenarios';
import { buildVerdict } from './verdict';

export default function App() {
  const scenarios = results.scenarios;
  const options = useMemo(() => availableConditions(scenarios), [scenarios]);

  const [conditions, setConditions] = useState({
    clients: options.clients[0],
    trafficType: options.trafficTypes[0],
    aps: options.apCounts[0],
  });
  const [phase, setPhase] = useState('setup');
  const [run, setRun] = useState(null);
  // The explorer chart keeps its own metric selection, independent of the
  // simulator's conditions — it is the technical view, not the plain one.
  const [explorerMetricKey, setExplorerMetricKey] = useState('per_user_throughput_mbps');

  const available = isCombinationAvailable(scenarios, conditions);

  function start(excludeSeed = null) {
    const wifi5 = findScenario(scenarios, { ...conditions, standard: 'wifi5' });
    const wifi6 = findScenario(scenarios, { ...conditions, standard: 'wifi6' });
    const t5 = pickTrial(wifi5, { excludeSeed });
    const t6 = pickTrial(wifi6, { excludeSeed });
    setRun({ wifi5, wifi6, trial5: t5, trial6: t6, seed: t5?.seed ?? null });
    setPhase('results');
  }

  return (
    <main className="shell">
      <h1 className="page-title">Lecture theatre WiFi simulator</h1>
      <p className="page-sub">
        WiFi 5 (802.11ac) against WiFi 6 (802.11ax), from NS-3 simulations.
      </p>

      {phase === 'setup' ? (
        <section className="card">
          <p>Conditions panel arrives in Task 4.</p>
          <button
            className="go-button"
            onClick={() => start(null)}
            disabled={!available}
          >
            GO
          </button>
          <p className="go-note">
            Replays a stored NS-3 trial — not a live measurement.
          </p>
          {!available && (
            <p className="unavailable">
              This combination has not been simulated yet.
            </p>
          )}
        </section>
      ) : (
        <section className="card">
          <p className="verdict">
            {buildVerdict({
              wifi5: run.wifi5,
              wifi6: run.wifi6,
              clients: conditions.clients,
              trafficType: conditions.trafficType,
            })}
          </p>
          <p>Gauges arrive in Task 5.</p>
          <button className="secondary-button" onClick={() => setPhase('setup')}>
            Change conditions
          </button>
        </section>
      )}

      <section className="explorer">
        <h2>Explore the full dataset</h2>
        <p className="page-sub">Every metric across every simulated density.</p>
        <label className="condition">
          <span className="condition-q">Metric</span>
          <select
            value={explorerMetricKey}
            onChange={(e) => setExplorerMetricKey(e.target.value)}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.plainLabel} — {m.label}
              </option>
            ))}
          </select>
        </label>
        <ComparisonChart
          scenarios={scenarios}
          topology={conditions.aps === 3 ? 'multi_ap' : 'single_ap'}
          trafficType={conditions.trafficType}
          metric={METRICS.find((m) => m.key === explorerMetricKey)}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify the build and the shell**

Run: `cd dashboard && npm run build`
Expected: build succeeds.

Then run `npm run dev`, open the served URL, and confirm: the title renders on one line without overlap, the GO button is enabled, pressing it swaps to the results view showing a verdict sentence, "Change conditions" returns to setup, and the explorer chart still renders below. **Stop the dev server afterwards.**

- [ ] **Step 6: Commit**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/src/theme.css dashboard/src/index.css dashboard/src/main.jsx dashboard/src/App.jsx
git commit -m "feat(dashboard): design tokens and two-phase simulator shell"
```

---

### Task 4: Conditions panel

**Files:**
- Create: `dashboard/src/ConditionsPanel.jsx`
- Modify: `dashboard/src/App.jsx`

**Interfaces:**
- Consumes: `availableConditions`, `isCombinationAvailable` (Task 2); `TRAFFIC_LABELS` (Task 1)
- Produces: `<ConditionsPanel scenarios conditions onChange />` where `onChange(nextConditions)` replaces the whole conditions object

- [ ] **Step 1: Write the panel**

Create `dashboard/src/ConditionsPanel.jsx`:

```jsx
import { TRAFFIC_LABELS } from './metrics';
import { availableConditions, isCombinationAvailable } from './scenarios';

/**
 * Every control is derived from the dataset. A value the simulation never
 * covered is shown disabled rather than offered and silently substituted.
 */
export default function ConditionsPanel({ scenarios, conditions, onChange }) {
  const options = availableConditions(scenarios);

  function set(patch) {
    onChange({ ...conditions, ...patch });
  }

  function optionUsable(patch) {
    return isCombinationAvailable(scenarios, { ...conditions, ...patch });
  }

  return (
    <div className="conditions">
      <label className="condition">
        <span className="condition-q">How many students are in the room?</span>
        <select
          value={conditions.clients}
          onChange={(e) => set({ clients: Number(e.target.value) })}
        >
          {options.clients.map((c) => (
            <option key={c} value={c} disabled={!optionUsable({ clients: c })}>
              {c} students{optionUsable({ clients: c }) ? '' : ' — not simulated'}
            </option>
          ))}
        </select>
      </label>

      <label className="condition">
        <span className="condition-q">What are they doing?</span>
        <select
          value={conditions.trafficType}
          onChange={(e) => set({ trafficType: e.target.value })}
        >
          {options.trafficTypes.map((t) => (
            <option key={t} value={t} disabled={!optionUsable({ trafficType: t })}>
              {TRAFFIC_LABELS[t] ?? t}
              {optionUsable({ trafficType: t }) ? '' : ' — not simulated'}
            </option>
          ))}
        </select>
      </label>

      <label className="condition">
        <span className="condition-q">How many access points?</span>
        <select
          value={conditions.aps}
          onChange={(e) => set({ aps: Number(e.target.value) })}
        >
          {options.apCounts.map((a) => (
            <option key={a} value={a} disabled={!optionUsable({ aps: a })}>
              {a === 1 ? '1 access point' : `${a} access points`}
              {optionUsable({ aps: a }) ? '' : ' — not simulated'}
            </option>
          ))}
        </select>
      </label>

      <details className="advanced">
        <summary>Advanced conditions</summary>
        <p className="go-note">
          Competing networks and room spread are not in the dataset yet. They
          appear here once those simulations have been run.
        </p>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Add the panel styles**

Append to `dashboard/src/theme.css`:

```css
.conditions { display: grid; gap: var(--gap); }

.condition { display: grid; gap: 0.4rem; }

.condition-q { font-size: 1.05rem; font-weight: 600; }

.condition select {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  font-size: 1rem;
  font-family: inherit;
}

.advanced { margin-top: 0.5rem; }

.advanced summary { cursor: pointer; color: var(--ink-dim); }
```

- [ ] **Step 3: Wire it into the app**

In `dashboard/src/App.jsx`, add the import:

```jsx
import ConditionsPanel from './ConditionsPanel';
```

and replace the line `<p>Conditions panel arrives in Task 4.</p>` with:

```jsx
          <ConditionsPanel
            scenarios={scenarios}
            conditions={conditions}
            onChange={setConditions}
          />
```

- [ ] **Step 4: Verify**

Run: `cd dashboard && npm run build` — expect success.

Then `npm run dev` and confirm: three questions render in plain language, the traffic dropdown shows "Streaming video" rather than `video`, options with no data are disabled and suffixed "— not simulated", and changing a condition updates whether GO is enabled. With the current dataset only `video` / 1 AP / 10, 14, 20 students are usable. **Stop the dev server.**

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/ConditionsPanel.jsx dashboard/src/theme.css dashboard/src/App.jsx
git commit -m "feat(dashboard): plain-language conditions panel with unavailable states"
```

---

### Task 5: Result gauges and provenance

**Files:**
- Create: `dashboard/src/useCountUp.js`
- Create: `dashboard/src/ProvenanceBadge.jsx`
- Create: `dashboard/src/ResultGauges.jsx`
- Modify: `dashboard/src/App.jsx`
- Modify: `dashboard/src/theme.css`

**Interfaces:**
- Consumes: `METRICS`, `STANDARD_LABELS` (Task 1)
- Produces:
  - `useCountUp(target, durationMs) -> number`
  - `<ProvenanceBadge seed trialIndex trialCount ns3Version />`
  - `<ResultGauges trial5 trial6 />`

- [ ] **Step 1: Write the count-up hook**

Create `dashboard/src/useCountUp.js`:

```javascript
import { useEffect, useState } from 'react';

/**
 * Animates a number up to its final value. This is presentation only — it is
 * NOT a progress indicator and must never be used to imply that a measurement
 * is elapsing. The value is already known before the animation starts.
 */
export function useCountUp(target, durationMs = 700) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (typeof target !== 'number' || Number.isNaN(target)) {
      setValue(target);
      return undefined;
    }
    // DESIGN.md section 7: reduced motion lands on the final value at once.
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const from = 0;

    function tick(now) {
      const t = Math.min((now - start) / durationMs, 1);
      // ease-out so it decelerates into the final value
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
```

- [ ] **Step 2: Write the provenance badge**

Create `dashboard/src/ProvenanceBadge.jsx`:

```jsx
/**
 * Required on every result view. The PRD's risk register names the failure
 * mode this prevents: a sampled run being mistaken for a live simulation.
 */
export default function ProvenanceBadge({ seed, trialIndex, trialCount, ns3Version }) {
  return (
    <p className="provenance">
      Trial {trialIndex} of {trialCount} · seed {seed} · NS-3 {ns3Version} ·{' '}
      <strong>pre-computed</strong>
    </p>
  );
}
```

- [ ] **Step 3: Write the gauges**

Create `dashboard/src/ResultGauges.jsx`:

```jsx
import { METRICS, STANDARD_LABELS } from './metrics';
import { useCountUp } from './useCountUp';

const HEADLINE = METRICS.find((m) => m.headline);
const SUPPORTING = ['latency_ms', 'packet_loss_pct', 'airtime_utilization_pct'];

// Per-student speed at which the dial reads full. 5 Mbps comfortably covers HD
// video, so the sweep means something rather than being an arbitrary ceiling.
const FULL_SCALE_MBPS = 5;

const CX = 100;
const CY = 100;
const R = 72;
const NEEDLE_LEN = 58;
const SWEEP = Math.PI * R;

// Ticks give the dial a frame of reference. Per DESIGN.md section 3 they are
// what make this read as an instrument rather than a progress ring.
const TICKS = [0, 0.25, 0.5, 0.75, 1];

function polar(radius, fraction) {
  const angle = Math.PI * (1 - fraction); // 180deg at 0, 0deg at full
  return {
    x: CX + radius * Math.cos(angle),
    y: CY - radius * Math.sin(angle),
  };
}

function Dial({ value, gradientId, deep }) {
  const fraction = Math.max(0, Math.min(value / FULL_SCALE_MBPS, 1));
  const tip = polar(NEEDLE_LEN, fraction);
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <svg viewBox="0 0 200 128" className="gauge-dial" role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--mint)" />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
      </defs>

      <path d={arc} fill="none" stroke="var(--mint-pale)" strokeWidth="16" strokeLinecap="round" />
      <path
        d={arc}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${SWEEP * fraction} ${SWEEP}`}
      />

      {TICKS.map((t) => {
        const p = polar(R + 15, t);
        return (
          <text
            key={t}
            x={p.x}
            y={p.y}
            className="gauge-tick num"
            textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
          >
            {(t * FULL_SCALE_MBPS).toFixed(t === 0 || t === 1 ? 0 : 2).replace(/\.00$/, '')}
          </text>
        );
      })}

      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r="7" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" />
    </svg>
  );
}

function Gauge({ standard, trial }) {
  const raw = trial?.[HEADLINE.key] ?? 0;
  const shown = useCountUp(raw);
  const deep = standard === 'wifi5' ? 'var(--green)' : 'var(--forest)';

  return (
    <div className="gauge">
      <h3 className="gauge-title" style={{ color: deep }}>
        {STANDARD_LABELS[standard]}
      </h3>
      <Dial value={shown} gradientId={`grad-${standard}`} deep={deep} />
      <p className="gauge-value num">
        {shown.toFixed(1)}<span className="gauge-unit"> {HEADLINE.unit}</span>
      </p>
      <p className="gauge-label">
        {HEADLINE.plainLabel} — {HEADLINE.explanation}
      </p>

      <dl className="tiles">
        {SUPPORTING.map((key) => {
          const m = METRICS.find((x) => x.key === key);
          const v = trial?.[key];
          return (
            <div className="tile" key={key}>
              <dt>{m.plainLabel}</dt>
              <dd>
                {typeof v === 'number' ? v.toFixed(v < 10 ? 2 : 1) : '—'} {m.unit}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function ResultGauges({ trial5, trial6 }) {
  return (
    <div className="gauges">
      <Gauge standard="wifi5" trial={trial5} />
      <Gauge standard="wifi6" trial={trial6} />
    </div>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `dashboard/src/theme.css`:

```css
/* No nested cards (DESIGN.md section 5): the gauges sit on the results card,
   separated by a rule rather than boxed again. */
.gauges {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(1.5rem, 4vw, 3rem);
}

.gauge { text-align: center; }

.gauge + .gauge { border-left: 1px solid var(--border); padding-left: clamp(1.5rem, 4vw, 3rem); }

@media (max-width: 640px) {
  .gauge + .gauge {
    border-left: none;
    border-top: 1px solid var(--border);
    padding: 1.5rem 0 0;
  }
}

.gauge-title {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.gauge-dial { width: 100%; max-width: 260px; }

.gauge-tick { fill: var(--ink-dim); font-size: 9px; }

.gauge-value {
  font-size: clamp(2.5rem, 6vw, 3.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
  margin: -1.25rem 0 0;
}

.gauge-unit { font-size: 1.1rem; color: var(--ink-dim); font-weight: 600; letter-spacing: 0; }

.gauge-label { color: var(--ink-dim); margin: 0.5rem 0 1.25rem; font-size: 0.9rem; }

.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 0;
  text-align: left;
}

.tile {
  background: var(--surface-sunken);
  border-radius: 10px;
  padding: 0.6rem 0.7rem;
}

.tile dt { color: var(--ink-dim); font-size: 0.7rem; font-weight: 600; }

.tile dd { margin: 0.1rem 0 0; font-size: 1rem; font-weight: 700; font-variant-numeric: tabular-nums; }

.provenance {
  color: var(--ink-dim);
  font-size: 0.8rem;
  margin: 1.5rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.result-actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; flex-wrap: wrap; }
```

- [ ] **Step 5: Wire into the app**

In `dashboard/src/App.jsx`, add imports:

```jsx
import ResultGauges from './ResultGauges';
import ProvenanceBadge from './ProvenanceBadge';
```

Replace `<p>Gauges arrive in Task 5.</p>` and the surrounding button with:

```jsx
          <ResultGauges trial5={run.trial5} trial6={run.trial6} />

          <ProvenanceBadge
            seed={run.seed}
            trialIndex={
              (run.wifi5?.trials?.findIndex((t) => t.seed === run.seed) ?? 0) + 1
            }
            trialCount={run.wifi5?.trials?.length ?? 0}
            ns3Version={results.meta.ns3_version ?? '3.42'}
          />

          <div className="result-actions">
            <button
              className="secondary-button"
              onClick={() => start(run.seed)}
              disabled={(run.wifi5?.trials?.length ?? 0) < 2}
            >
              Run again (different seed)
            </button>
            <button className="secondary-button" onClick={() => setPhase('setup')}>
              Change conditions
            </button>
          </div>
```

- [ ] **Step 6: Verify**

Run: `cd dashboard && npm run build` — expect success.

Then `npm run dev` and confirm: two gauges render side by side with arcs and large per-student figures, the numbers animate up once on arrival, three supporting tiles show under each, the provenance badge names trial, seed, version and the word "pre-computed", "Run again" changes the seed and the displayed numbers, and it is disabled when a scenario has only one trial. Confirm there is **no progress bar or spinner anywhere**. **Stop the dev server.**

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/useCountUp.js dashboard/src/ProvenanceBadge.jsx dashboard/src/ResultGauges.jsx dashboard/src/theme.css dashboard/src/App.jsx
git commit -m "feat(dashboard): side-by-side gauges, provenance badge, run-again"
```

---

### Task 6: Caveats and explorer polish

**Files:**
- Modify: `dashboard/src/App.jsx`
- Modify: `dashboard/src/theme.css`

**Interfaces:**
- Consumes: everything above; `results.meta.caveats` from `results.json`
- Produces: the finished page

The dataset's own caveats must be visible. `meta.caveats` currently states that packet loss is inflated by the short measurement window and that latency and jitter cover delivered packets only. Presenting those metrics without the caveats overstates the results.

- [ ] **Step 1: Render the caveats and a metric legend**

In `dashboard/src/App.jsx`, immediately before the closing `</main>`, add:

```jsx
      <section className="explorer">
        <h2>What these numbers mean</h2>
        <dl className="legend">
          {METRICS.map((m) => (
            <div key={m.key}>
              <dt>{m.plainLabel}</dt>
              <dd>{m.explanation} ({m.unit})</dd>
            </div>
          ))}
        </dl>

        <h2>Caveats from this dataset</h2>
        <ul className="caveats">
          {(results.meta.caveats ?? []).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="go-note">
          Generated {results.meta.generated_utc ?? 'unknown'} · measurement
          window {results.meta.measurement_window_s ?? '?'} s · NS-3{' '}
          {results.meta.ns3_version ?? '?'}
        </p>
      </section>
```

- [ ] **Step 2: Add the styles**

Append to `dashboard/src/theme.css`:

```css
.legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  margin: 0 0 2rem;
}

.legend dt { font-weight: 600; }

.legend dd { margin: 0; color: var(--ink-dim); font-size: 0.9rem; }

.caveats { color: var(--ink-dim); padding-left: 1.2rem; }

.caveats li { margin-bottom: 0.5rem; }
```

- [ ] **Step 3: Bring the explorer chart into the palette**

`ComparisonChart.jsx` still uses matplotlib's default blue `#1f77b4` and red `#d62728`, which now contradict the design system. In `dashboard/src/ComparisonChart.jsx`, replace those four colour literals so WiFi 5 uses `#4e9e6e` (both the `<Area>` fill and the `<Line>` stroke) and WiFi 6 uses `#0f3d26`.

Then add the redundant second channel `DESIGN.md` section 2 requires, so the two series are distinguishable without relying on colour alone. On the WiFi 5 `<Line>` only, add:

```jsx
          strokeDasharray="6 4"
```

WiFi 6 stays solid. Leave the `<Area>` band elements undashed — a dashed fill edge reads as noise.

Also set the axis and grid to the palette rather than Recharts' defaults: give both `<XAxis>` and `<YAxis>` `stroke="#5f6f67"` and `tick={{ fill: '#5f6f67', fontSize: 12 }}`, and change `<CartesianGrid>` to `stroke="#e1e7e3"`.

- [ ] **Step 4: Verify the whole page**

Run: `cd dashboard && npm test` — expect 15 tests passing.
Run: `cd dashboard && npm run build` — expect success.

Then `npm run dev` and walk the whole flow: set conditions, GO, read the verdict, check the gauges and provenance, run again, change conditions, scroll to the explorer chart, the legend, and the caveats. Confirm the caveats text actually appears (it comes from `results.json`, so an empty list means the parser did not emit it). **Stop the dev server.**

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/App.jsx dashboard/src/theme.css dashboard/src/ComparisonChart.jsx
git commit -m "feat(dashboard): metric legend, dataset caveats, explorer in palette"
```

---

## Not in this plan

- The interference and room-depth sub-studies (+120 NS-3 runs). Until those exist the advanced panel states that they are not yet available, which Task 4 implements.
- `RadarView` and `SummaryTable` from the original PRD. The gauges and tiles now cover the at-a-glance need; revisit only if the dataset grows enough to make a radar meaningful.
- Deployment to Netlify or Vercel.
