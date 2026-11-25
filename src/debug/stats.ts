// Windowed timing stats (M0.4): feeds the overlay now, the device check
// (M0.6) and the bench (M1.1) later.

export class RollingStats {
  private readonly windowSize: number;
  private readonly values: number[] = [];

  constructor(windowSize: number) {
    this.windowSize = Math.max(1, windowSize);
  }

  push(value: number): void {
    this.values.push(value);
    if (this.values.length > this.windowSize) this.values.shift();
  }

  count(): number {
    return this.values.length;
  }

  mean(): number {
    if (this.values.length === 0) return 0;
    let sum = 0;
    for (const v of this.values) sum += v;
    return sum / this.values.length;
  }

  p99(): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1);
    return sorted[Math.max(0, idx)] ?? 0;
  }

  max(): number {
    if (this.values.length === 0) return 0;
    return Math.max(...this.values);
  }
}
