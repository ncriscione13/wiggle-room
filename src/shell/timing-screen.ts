// The 15 s "clap with the drum" runner (M1.8/M1.10; DESIGN "Measuring it").
// Drums are scheduled on the AUDIO clock; claps arrive on the MOTION clock.
// Each beat's schedule is translated into motion time AT SCHEDULING (the two
// clocks tick at the same rate and differ only by base), so the stored offset
// is clock-skew-free and safe to persist across sessions.

import type { AudioBusHandle } from '../audio/bus';
import { ClapDetector } from '../motion/clap';
import { TIMING_BEAT_PERIOD_S, TIMING_CHECK_DURATION_S } from '../motion/config';
import { matchClapsToBeats, type TimingResult } from '../motion/timing-check';
import type { LiveMotion } from './live-motion';
import { saveTimingResult } from './timing-store';

export async function runTimingCheck(
  lm: LiveMotion,
  audio: AudioBusHandle,
  onStatus: (text: string) => void,
): Promise<TimingResult> {
  const beatCount = Math.floor(TIMING_CHECK_DURATION_S / TIMING_BEAT_PERIOD_S);
  const leadInS = 1.5;
  const audioNow = audio.nowS();
  const motionNow = lm.kit.nowS();

  const beatsMotion: number[] = [];
  for (let i = 0; i < beatCount; i += 1) {
    const atAudio = audioNow + leadInS + i * TIMING_BEAT_PERIOD_S;
    audio.scheduleSfx('drum', atAudio);
    beatsMotion.push(motionNow + (atAudio - audioNow));
  }

  const claps: number[] = [];
  const detectors = [new ClapDetector(), new ClapDetector()];
  const offTap = lm.onFrame((tS, frame) => {
    for (const [slot, view] of frame.players.entries()) {
      if (view.pose !== null && view.seenNow && detectors[slot]?.update(view.pose, tS) === true) {
        claps.push(tS);
      }
    }
  });

  onStatus('Clap along with the drum!');
  const totalMs = (leadInS + beatCount * TIMING_BEAT_PERIOD_S + 1) * 1000;
  await new Promise((resolve) => setTimeout(resolve, totalMs));
  offTap();

  const result = matchClapsToBeats(beatsMotion, claps);
  if (result.ok) {
    saveTimingResult(result, Date.now());
    onStatus(`Timing saved: ${String(Math.round(result.offsetS * 1000))} ms.`);
  } else {
    onStatus(`Couldn't get a clear read (${String(result.validCount)} claps matched) — try again!`);
  }
  return result;
}
