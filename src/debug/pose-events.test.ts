import { describe, expect, it } from 'vitest';
import { EventRing, poseTransitions } from './pose-events';
import type { ClipPose } from '../tracking/clip-format';

// M0.4: the overlay's "last 10 events". Until the motion kit (M1) emits real
// events, the ring carries lifecycle + pose appear/disappear transitions.

const pose = (): ClipPose => Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);

describe('poseTransitions (M0.4)', () => {
  it('reports a pose appearing in a slot', () => {
    expect(poseTransitions([null, null], [pose(), null])).toEqual(['pose found · slot 0']);
  });

  it('reports a pose disappearing from a slot', () => {
    expect(poseTransitions([pose(), pose()], [pose(), null])).toEqual(['pose lost · slot 1']);
  });

  it('reports nothing when presence is unchanged', () => {
    expect(poseTransitions([pose(), null], [pose(), null])).toEqual([]);
  });

  it('handles the first frame (no previous)', () => {
    expect(poseTransitions(null, [pose(), pose()])).toEqual([
      'pose found · slot 0',
      'pose found · slot 1',
    ]);
  });
});

describe('EventRing (M0.4)', () => {
  it('keeps only the last N entries, newest last', () => {
    const ring = new EventRing(3);
    for (const label of ['a', 'b', 'c', 'd']) ring.push(label, 1);
    expect(ring.entries().map((e) => e.label)).toEqual(['b', 'c', 'd']);
  });

  it('stamps entries with the given time', () => {
    const ring = new EventRing(10);
    ring.push('started', 1.25);
    expect(ring.entries()[0]).toEqual({ label: 'started', tS: 1.25 });
  });
});
