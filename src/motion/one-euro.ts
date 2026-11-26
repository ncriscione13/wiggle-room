// One Euro filter (M1.1; Casiez et al.): adaptive low-pass -- heavy smoothing
// while a joint is nearly still, almost none while it moves fast. Pure and
// allocation-free in the hot path (lag budget: whole kit <= 2 ms/frame).

import { ONE_EURO_BETA_COEFF, ONE_EURO_D_CUTOFF_HZ, ONE_EURO_MIN_CUTOFF_HZ } from './config.ts';

const TWO_PI = Math.PI * 2;

function alpha(cutoffHz: number, dtS: number): number {
  const tau = 1 / (TWO_PI * cutoffHz);
  return 1 / (1 + tau / dtS);
}

export class OneEuroFilter {
  private readonly minCutoffHz: number;
  private readonly betaCoeff: number;
  private readonly dCutoffHz: number;

  private hasPrev = false;
  private prevValue = 0;
  private prevDeriv = 0;
  private prevT = 0;

  constructor(
    minCutoffHz: number = ONE_EURO_MIN_CUTOFF_HZ,
    betaCoeff: number = ONE_EURO_BETA_COEFF,
    dCutoffHz: number = ONE_EURO_D_CUTOFF_HZ,
  ) {
    this.minCutoffHz = minCutoffHz;
    this.betaCoeff = betaCoeff;
    this.dCutoffHz = dCutoffHz;
  }

  reset(): void {
    this.hasPrev = false;
  }

  filter(value: number, tS: number): number {
    if (!this.hasPrev) {
      this.hasPrev = true;
      this.prevValue = value;
      this.prevDeriv = 0;
      this.prevT = tS;
      return value;
    }
    const dtS = Math.max(tS - this.prevT, 1e-4); // duplicate stamps: tiny dt, no NaN
    this.prevT = tS;

    const rawDeriv = (value - this.prevValue) / dtS;
    const aD = alpha(this.dCutoffHz, dtS);
    const deriv = aD * rawDeriv + (1 - aD) * this.prevDeriv;
    this.prevDeriv = deriv;

    const cutoff = this.minCutoffHz + this.betaCoeff * Math.abs(deriv);
    const a = alpha(cutoff, dtS);
    const out = a * value + (1 - a) * this.prevValue;
    this.prevValue = out;
    return out;
  }
}

export class OneEuroPoint {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(minCutoffHz?: number, betaCoeff?: number, dCutoffHz?: number) {
    this.fx = new OneEuroFilter(minCutoffHz, betaCoeff, dCutoffHz);
    this.fy = new OneEuroFilter(minCutoffHz, betaCoeff, dCutoffHz);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }

  filter(x: number, y: number, tS: number): { x: number; y: number } {
    return { x: this.fx.filter(x, tS), y: this.fy.filter(y, tS) };
  }
}
