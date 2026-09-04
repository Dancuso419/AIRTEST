#!/usr/bin/env python3
"""Batch-run the NS-3 lecture theatre scenario.

Idempotent: runs whose output already exists are skipped, so an interrupted
matrix can be resumed. Fault tolerant: a failed run is recorded and does not
halt the batch.
"""
import argparse
import itertools
import json
import multiprocessing
import os
import subprocess
import time
from pathlib import Path

NS3_DIR = Path.home() / "wifi-sim" / "ns-3.42"
BINARY = NS3_DIR / "build" / "scratch" / "ns3.42-lecture-theatre-optimized"

# The vertical slice. Widening happens in a later plan, not here.
SLICE = {
    "topology": ["single_ap"],
    "standard": ["wifi5", "wifi6"],
    "traffic": ["web", "video", "bulk"],
    # wifi6 cost knee at 16-20 clients (~N^1.2 below, ~N^3.3 above); 40c would
    # be ~2h/run x2 runs, turning the smoke slice into a 2+ hour job. 40c
    # belongs in the full matrix, not here.
    "clients": [10, 14, 20],
    "seed": [1, 2],
}

DURATION = 5.0
TIMEOUT_S = 1800  # measured: wifi5 10/20/40c = 34/82/141s; wifi6 10/20/40c =
# 193/~450/~1050s at 5s simulated. 1800s gives headroom without letting a
# pathological run block the batch for an hour.


def run_id(topology, standard, traffic, clients, seed):
    return f"{topology}_{standard}_{traffic}_c{clients}_s{seed}"


def combinations(matrix):
    keys = ["topology", "standard", "traffic", "clients", "seed"]
    for values in itertools.product(*(matrix[k] for k in keys)):
        yield dict(zip(keys, values))


def execute(job):
    outdir = Path(job["outdir"])
    rid = run_id(job["topology"], job["standard"], job["traffic"],
                 job["clients"], job["seed"])
    prefix = outdir / rid

    xml_path = prefix.with_suffix(".xml")
    phy_path = Path(str(prefix) + ".phy.json")
    meta_path = Path(str(prefix) + ".meta.json")
    # Four artifacts now, not three: the time series joined them when the
    # dashboard began replaying runs second by second. Adding it here is what
    # makes existing three-artifact runs regenerate instead of being skipped
    # forever with no series behind them.
    series_path = Path(str(prefix) + ".series.json")
    if (xml_path.exists() and phy_path.exists() and meta_path.exists()
            and series_path.exists()):
        return {"run_id": rid, "status": "skipped", "seconds": 0.0}

    if job["topology"] == "multi_ap":
        aps = 3
    elif job["topology"] == "single_ap":
        aps = 1
    else:
        raise ValueError(f"unrecognised topology: {job['topology']!r}")
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = str(NS3_DIR / "build" / "lib")

    started = time.monotonic()
    try:
        proc = subprocess.run(
            [
                str(BINARY),
                f"--standard={job['standard']}",
                f"--clients={job['clients']}",
                f"--traffic={job['traffic']}",
                f"--aps={aps}",
                f"--seed={job['seed']}",
                f"--duration={DURATION}",
                f"--out={prefix}",
            ],
            cwd=NS3_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        return {"run_id": rid, "status": "timeout",
                "seconds": time.monotonic() - started}
    except Exception as exc:
        # A crash here (missing/unexecutable binary, OSError under
        # resource pressure, ...) must not kill the pool -- record it
        # like any other failed run so the manifest still gets written.
        return {"run_id": rid, "status": "crashed",
                "seconds": time.monotonic() - started, "error": repr(exc)}

    elapsed = time.monotonic() - started
    if proc.returncode != 0:
        return {"run_id": rid, "status": "failed", "seconds": elapsed,
                "returncode": proc.returncode, "stderr": proc.stderr[-2000:]}

    if not (xml_path.exists() and phy_path.exists() and meta_path.exists()
            and series_path.exists()):
        return {"run_id": rid, "status": "missing_output", "seconds": elapsed}

    return {"run_id": rid, "status": "ok", "seconds": elapsed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default=str(Path.home() / "wifi-sim" / "raw"))
    # Default 4, not more: a wifi6 20-client run measured 28,377s on a
    # shared 8-core box vs ~600s idle (~47x penalty). Oversubscribing this
    # box with memory-hungry Spectrum-PHY sims is catastrophically worse
    # than linear slowdown -- do not raise this back up.
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--clients", type=int, nargs="+", default=None,
                     help="override SLICE['clients'] for quick smoke tests")
    ap.add_argument("--standard", nargs="+", default=None,
                     help="override SLICE['standard'] for quick smoke tests")
    args = ap.parse_args()

    slice_ = dict(SLICE)
    if args.clients is not None:
        slice_["clients"] = args.clients
    if args.standard is not None:
        slice_["standard"] = args.standard

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    jobs = [dict(c, outdir=str(outdir)) for c in combinations(slice_)]
    print(f"{len(jobs)} runs, {args.workers} workers, output to {outdir}")

    with multiprocessing.Pool(args.workers) as pool:
        results = []
        for r in pool.imap_unordered(execute, jobs):
            results.append(r)
            print(f"[{len(results)}/{len(jobs)}] {r['run_id']}: "
                  f"{r['status']} ({r['seconds']:.1f}s)")

    manifest = {
        "total": len(results),
        "ok": sum(1 for r in results if r["status"] == "ok"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "failed": [r for r in results if r["status"]
                   not in ("ok", "skipped")],
        "runs": results,
    }
    manifest_text = json.dumps(manifest, indent=2)
    try:
        (outdir / "_manifest.json").write_text(manifest_text)
    except OSError as exc:
        # Writing the manifest failing must not discard the results --
        # print them so they survive in the log.
        print(f"\nWARNING: could not write _manifest.json: {exc!r}")
        print(manifest_text)

    if slice_ != SLICE:
        print("\nNOTE: --clients/--standard override in effect; the "
              "extrapolation below is based only on the jobs actually run, "
              "not the full SLICE.")

    ok_times = [r["seconds"] for r in results if r["status"] == "ok"]
    if ok_times:
        mean_s = sum(ok_times) / len(ok_times)
        total_jobs = len(jobs)
        print(f"\nmean run time: {mean_s:.1f}s")
        print(f"extrapolated {total_jobs}-run matrix at {args.workers} "
              f"workers: {total_jobs * mean_s / args.workers / 3600:.1f} hours")

    if manifest["failed"]:
        print(f"\n{len(manifest['failed'])} run(s) failed - see _manifest.json")


if __name__ == "__main__":
    main()
