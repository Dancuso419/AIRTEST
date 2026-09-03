import test from 'node:test';
import assert from 'node:assert/strict';
import { frameIndexAt, REPLAY_SECONDS } from './useReplay.js';

test('starts on the first recorded sample', () => {
  assert.equal(frameIndexAt(0, 29), 0);
});

test('ends on the last recorded sample, never past it', () => {
  assert.equal(frameIndexAt(REPLAY_SECONDS, 29), 28);
  assert.equal(frameIndexAt(REPLAY_SECONDS * 5, 29), 28);
});

test('advances monotonically across playback', () => {
  const seen = [];
  for (let s = 0; s <= REPLAY_SECONDS; s += 0.5) seen.push(frameIndexAt(s, 29));
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i] >= seen[i - 1], `index went backwards at ${i}`);
  }
  // It must actually move — a replay stuck on frame 0 looks identical to a
  // working one until you check.
  assert.ok(seen.at(-1) > seen[0]);
  assert.ok(new Set(seen).size > 5, 'too few distinct frames to read as motion');
});

test('halfway through playback lands mid-run', () => {
  const mid = frameIndexAt(REPLAY_SECONDS / 2, 29);
  assert.ok(mid > 10 && mid < 18, `expected a middle frame, got ${mid}`);
});

test('never returns a fractional or out-of-range index', () => {
  for (let s = 0; s <= REPLAY_SECONDS; s += 0.137) {
    const i = frameIndexAt(s, 29);
    assert.ok(Number.isInteger(i), `${i} is not an integer`);
    assert.ok(i >= 0 && i <= 28);
  }
});

test('degrades safely for a run with too few samples to replay', () => {
  assert.equal(frameIndexAt(3, 1), 0);
  assert.equal(frameIndexAt(3, 0), 0);
});

test('negative elapsed time clamps to the first frame', () => {
  assert.equal(frameIndexAt(-2, 29), 0);
});
