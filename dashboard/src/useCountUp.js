import { useEffect, useState } from 'react';

/**
 * Animates a number up to its final value. This is presentation only — it is
 * NOT a progress indicator and must never be used to imply that a measurement
 * is elapsing. The value is already known before the animation starts.
 */
export function useCountUp(target, durationMs = 700) {
  // Lazy initial state avoids a one-frame flash of the final value: start at
  // 0 for the animated path, or at the target immediately for reduced motion.
  const [value, setValue] = useState(() => {
    if (typeof target !== 'number' || Number.isNaN(target)) return target;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced ? target : 0;
  });

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
