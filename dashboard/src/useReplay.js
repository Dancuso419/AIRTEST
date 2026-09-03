import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Replays a stored run's time series across REPLAY_SECONDS of wall clock.
 *
 * The needles move because the DATA moves. Each frame reads the sample the
 * run actually recorded at that point in simulated time — it is not an
 * interpolation toward a final number dressed up as activity.
 *
 * The measurement window is ~3 simulated seconds and playback takes 10, so
 * this runs at roughly 0.3x: slower than reality, never faster. The UI states
 * the rate rather than letting a viewer assume real time.
 */
export const REPLAY_SECONDS = 10;

/**
 * Which recorded sample belongs at `elapsedSec` into playback.
 *
 * Pure and exported so the replay's core arithmetic is testable: a browser
 * throttles requestAnimationFrame to zero in a background tab, so this can
 * never be verified by watching it under automation.
 *
 * Floors rather than rounds, so a needle always shows a sample the run
 * actually recorded and never a value interpolated between two of them.
 */
export function frameIndexAt(elapsedSec, frames, replaySeconds = REPLAY_SECONDS) {
  if (frames < 2) return 0;
  const progress = Math.min(Math.max(elapsedSec, 0) / replaySeconds, 1);
  return Math.min(Math.floor(progress * (frames - 1)), frames - 1);
}

export function useReplay(series5, series6) {
  const frames = Math.min(series5?.length ?? 0, series6?.length ?? 0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(null);
  const startedAt = useRef(0);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (frames < 2) return;
    // Reduced motion: land on the finished run rather than animating it.
    if (typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIndex(frames - 1);
      setPlaying(false);
      return;
    }
    setIndex(0);
    setPlaying(true);
    startedAt.current = performance.now();
  }, [frames]);

  useEffect(() => {
    if (!playing) return undefined;

    function tick(now) {
      const elapsed = (now - startedAt.current) / 1000;
      setIndex(frameIndexAt(elapsed, frames));
      if (elapsed < REPLAY_SECONDS) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    }

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, frames]);

  // A new run must never keep replaying the previous one's frames, and it
  // should start itself: driving playback from the click handler read a
  // frames count of 0, because the series had not reached state yet.
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;

    if (frames < 2) {
      setPlaying(false);
      setIndex(0);
      return;
    }

    const reduced = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setPlaying(false);
      setIndex(frames - 1);
      return;
    }

    setIndex(0);
    startedAt.current = performance.now();
    setPlaying(true);
  }, [series5, series6, frames]);

  const at = (series) => (frames > 0 ? series?.[Math.min(index, series.length - 1)] : null);

  return {
    playing,
    index,
    frames,
    progress: frames > 1 ? index / (frames - 1) : 0,
    simSeconds: at(series5)?.t ?? null,
    frame5: at(series5),
    frame6: at(series6),
    play,
    stop,
  };
}
