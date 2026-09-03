/**
 * The study's intended parameter space, from TRD section 3 and PRD section 8.
 *
 * This is NOT invented and it is NOT a claim that data exists. It is the range
 * the instrument can reach. Whether a position has data behind it is decided
 * at runtime by `isCombinationAvailable` against the real dataset — a position
 * with no data renders unpowered and cannot be selected.
 *
 * Why show them at all: options derived purely from the data hide the study's
 * scope. A viewer seeing only "Streaming video / 1 access point" cannot tell
 * the work covers browsing, downloading and multi-AP at all. A range switch
 * that shows every detent it can reach, with the unpowered ones visibly dead,
 * discloses scope without ever offering a value the simulation never ran.
 */

// TRD section 3 specifies N = 20, 40, 60, 80, 100, 120, 150, 200.
//
// CAPPED AT 60 as a documented study constraint. WiFi 6 runs cost roughly 9x
// their WiFi 5 equivalents and hit a sharp cost knee between 16 and 20
// clients; a single 200-client WiFi 6 run projects to many hours, and the
// full grid to days of compute the project does not have.
//
// Consequence, which the write-up must state rather than bury: 60 students
// offering 3 Mbps each is ~180 Mbps against a measured ceiling near 346 Mbps,
// so the medium may never saturate inside this grid. Where no threshold
// crossing occurs, max_supported_clients reports ">60" and is NOT to be read
// as a saturation point.
const PLANNED_CLIENTS = [20, 40, 60];

// TRD section 3: web (bursty), video (CBR UDP), bulk (rate-limited TCP).
const PLANNED_TRAFFIC = ['web', 'video', 'bulk'];

// TRD section 3: single AP primary, 3-AP secondary.
const PLANNED_APS = [1, 3];

/**
 * Union the planned space with whatever the dataset actually contains, so a
 * density run outside the planned grid (the 10/14/20 fast slice, for example)
 * still appears rather than being silently dropped.
 */
export function reachableConditions(available) {
  const clients = [...new Set([...PLANNED_CLIENTS, ...available.clients])]
    .sort((a, b) => a - b);

  const trafficTypes = [
    ...PLANNED_TRAFFIC,
    ...available.trafficTypes.filter((t) => !PLANNED_TRAFFIC.includes(t)),
  ];

  const apCounts = [...new Set([...PLANNED_APS, ...available.apCounts])]
    .sort((a, b) => a - b);

  return { clients, trafficTypes, apCounts };
}
