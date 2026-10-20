import type { SpeedSample } from './types';

export interface SpeedEstimate {
  speedMps: number;
  accelMps2: number;
}

export class SpeedEstimator {
  private static readonly ACCEL_WINDOW_MS = 100;
  private static readonly MAX_EXTRAPOLATE_S = 1.5;
  private static readonly LOST_AFTER_S = 5;

  private latest: SpeedSample | null = null;
  private reference: SpeedSample | null = null;
  private accel = 0;
  private speed = 0;

  reset(): void {
    this.latest = null;
    this.reference = null;
    this.accel = 0;
    this.speed = 0;
  }

  push(sample: SpeedSample): void {
    if (this.reference) {
      const dt = (sample.time - this.reference.time) / 1000;
      if (dt * 1000 >= SpeedEstimator.ACCEL_WINDOW_MS) {
        const raw = (sample.speedMps - this.reference.speedMps) / dt;
        const weight = dt >= 0.5 ? 0.6 : 0.3;
        this.accel += (raw - this.accel) * weight;
        this.reference = sample;
      }
    } else {
      this.reference = sample;
    }
    this.latest = sample;
  }

  update(now: number, dt: number): SpeedEstimate {
    if (!this.latest) return { speedMps: 0, accelMps2: 0 };

    const age = (now - this.latest.time) / 1000;
    let target: number;
    if (age > SpeedEstimator.LOST_AFTER_S) {
      target = 0;
      this.accel = 0;
    } else {
      const ahead = Math.min(age, SpeedEstimator.MAX_EXTRAPOLATE_S);
      target = Math.max(0, this.latest.speedMps + this.accel * ahead);
    }

    const tau = 0.25;
    this.speed += (target - this.speed) * Math.min(1, dt / tau);
    return { speedMps: this.speed, accelMps2: this.accel };
  }
}
