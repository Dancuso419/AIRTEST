# AIRTEST — report outline

The supervisor's template was written for a leisure/tourism venue-discovery
mobile application. Its **structure** is the department's standard FYP
skeleton and is kept exactly. Its **domain-specific subsections** describe a
different system and are substituted below.

Anything marked **NEEDS YOU** cannot be written from the repository and must
not be invented.

---

## Chapter One — Introduction

Template maps directly. No substitutions needed.

| § | Section | Source |
|---|---|---|
| 1.0 | Introduction | PRD §1 |
| 1.1 | Background and Motivation | PRD §2 |
| 1.2 | Problem Statement | PRD §2 |
| 1.3 | Aims and Objectives | PRD §3, verbatim |
| 1.4 | Project Scope | PRD §4 (non-goals) + measured density limit |
| 1.5 | Risk Management | PRD §11 + risks that actually materialised |
| 1.6 | SWOT Analysis | Derived |
| 1.7 | Significance of the Project | PRD §5 |
| 1.8 | Organizational Structure | Standard |

## Chapter Two — Literature Review

Every subsection here is substituted. The template's are about tourism.

| Template § | Substitute for AIRTEST |
|---|---|
| 2.0.1 Concept of Leisure and Recreation | **Evolution of IEEE 802.11 standards** |
| 2.0.2 Tourism and the Hospitality Industry | **High-density wireless environments** |
| 2.0.3 Mobile Applications and LBS | **802.11ax mechanisms** — OFDMA, MU-MIMO, BSS colouring, TWT |
| 2.0.4 Restaurant and Activity Discovery Systems | **Network simulation tools** — NS-3, OMNeT++, ns-2, testbeds |
| 2.0.5 Online Reviews and Recommendation Systems | **Performance metrics for WLAN evaluation** — throughput, latency, jitter, Jain's fairness, airtime |
| 2.1.3 Google Maps | **Prior 802.11ax simulation studies** |
| 2.1.4 TripAdvisor | **Prior high-density WLAN measurement studies** |
| 2.1.5 Yelp | **Existing WiFi comparison dashboards / visualisation tools** |
| 2.2 Comparative Analysis (table) | Table comparing those studies: standard, tool, density range, metrics, findings |

**NEEDS YOU** — Chapter 2 requires real cited literature. I will not invent
references, DOIs or author names. Supply the papers you have gathered (or say
which databases you have access to) and I will write the review around them.
Every citation placeholder in the draft is marked `[CITE]`.

## Chapter Three — Methodology

Mostly maps. Three subsections do not apply as written.

| § | Status |
|---|---|
| 3.2.1–3.2.4 development models | Keep as-is (generic) |
| 3.3 Proposed Model | **Substitute**: the project did not use Waterfall. It used spec-then-plan-then-incremental-slice, with a vertical slice that caught 13 defects before the full matrix ran. Justify honestly rather than claim Waterfall. |
| 3.4.1 Observation | Usable — observation of lecture theatre conditions and device counts. **NEEDS YOU**: did you observe/count anything? |
| 3.4.2 Interview | **NEEDS YOU** — did you interview anyone (IT staff, students)? If not, this section says so; it is not fabricated. |
| 3.4.3 Data Analysis | Strong — this is the core method |
| 3.5.1 Developer Hardware | Known: Intel i7-4702HQ, 4 cores / 8 threads, 16GB RAM, WSL2 |
| 3.5.2 Developer Software | Known: NS-3 3.42, Ubuntu/WSL2, Python 3, Node 24, React 19, Vite 8, Recharts 3 |
| 3.5.3 Client Minimum Spec | Known: any modern browser; static site, no backend |
| 3.6 Ethical Considerations | Simulation only, no human subjects, no personal data — plus data-integrity commitments |
| 3.9.2 Use Case Diagram | Applies (small: view comparison, change conditions, replay, read report) |
| 3.9.3 Data Design | **Substitute**: `results.json` schema, not a database schema |
| 3.9.7 ERD | **Does not apply** — no database. Replace with **Data Model / JSON schema**, and say why an ERD is not applicable |
| 3.9.8 Figma Mockups | **Substitute** — the UI was designed in code, not Figma. Use annotated screenshots and the design rationale in `DESIGN.md` |

## Chapter Four — Implementation and Testing

Feature list substituted entirely.

| Template § | Substitute |
|---|---|
| 4.1.1 User Discovery and Map Interface | **Conditions control band** — density, activity, AP count |
| 4.1.2 Budget Filter | **Instrument cluster** — six dials, two needles, one shared scale |
| 4.1.3 Mood and Category Selection | **Timed replay** of a stored trial |
| 4.1.4 Venue Profiles and Reviews | **Evaluation report** — plain-language verdict per condition |
| 4.1.5 Saved Lists | **Full-dataset explorer** — metric stepper and density chart |
| 4.1.6 Business Owner Portal | **Provenance and caveat disclosure** |

4.2/4.3 are the strongest sections in the report — the defects found and
fixed are documented in git history with measurements. 4.4 is fully
supported: 47 JavaScript tests and 39 Python tests, all passing.

## Chapter Five — Discussion, Conclusion, Recommendations

Maps directly. 5.1 assesses against the three PRD objectives, including the
one only partially met (saturation point).

## Appendices

| Appendix | Status |
|---|---|
| A: Interview Questions | **NEEDS YOU** — omit if no interviews were conducted |
| B: Survey/Questionnaire | **NEEDS YOU** — same |
| C: Figma UI Designs | Substitute: UI screenshots + `DESIGN.md` |
| D: Database Schema | Substitute: `results.json` schema |
| E: Source Code Samples | Ready — scenario, parser, evaluation module |
