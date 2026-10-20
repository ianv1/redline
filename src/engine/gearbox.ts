export interface EngineState {
  gear: number;
  rpm: number;
  throttle: number;
  shifting: boolean;
}

export interface GearboxConfig {
  idleRpm: number;
  redlineRpm: number;
  maxRpm: number;
  gearTopKph: number[];
  gearScale: number;
  shiftUpFrac: [number, number];
  shiftDownFrac: number;
  kickdownThrottle: number;
  shiftTimeMs: number;
  minShiftGapMs: number;
}

export const DEFAULT_GEARBOX: GearboxConfig = {
  idleRpm: 900,
  redlineRpm: 8000,
  maxRpm: 9000,
  gearTopKph: [62, 104, 148, 196, 252, 320],
  gearScale: 1,
  shiftUpFrac: [0.3, 0.96],
  shiftDownFrac: 0.16,
  kickdownThrottle: 0.75,
  shiftTimeMs: 170,
  minShiftGapMs: 450,
};

export class Gearbox {
  private gear = 0;
  private rpm: number;
  private shiftLeft = 0;
  private sinceShift = 10;
  private revHeld = false;
  private revLevel = 0;
  private revClock = 0;
  private running = true;
  private catchBoost = 0;

  constructor(private readonly cfg: GearboxConfig = DEFAULT_GEARBOX) {
    this.rpm = cfg.idleRpm;
  }

  rev(held: boolean): void {
    this.revHeld = held;
  }

  setRunning(on: boolean): void {
    this.running = on;
  }

  cut(): void {
    this.running = false;
    this.rpm = 0;
  }

  ignite(): void {
    this.running = true;
    this.catchBoost = 1;
    this.rpm = Math.max(this.rpm, this.cfg.idleRpm);
  }

  update(speedKph: number, accelMps2: number, dt: number): EngineState {
    const c = this.cfg;
    let throttle = virtualThrottle(speedKph, accelMps2);
    this.shiftLeft = Math.max(0, this.shiftLeft - dt);
    this.sinceShift += dt;

    let target: number;
    if (speedKph <= 2.5) {
      this.gear = 0;
      target = c.idleRpm;
    } else {
      if (this.gear === 0) this.gear = 1;
      const topGear = c.gearTopKph.length;
      const canShift = this.shiftLeft === 0 && this.sinceShift * 1000 >= c.minShiftGapMs;
      if (canShift) {
        const upAt = c.redlineRpm * (c.shiftUpFrac[0] + (c.shiftUpFrac[1] - c.shiftUpFrac[0]) * throttle);
        const downAt = c.redlineRpm * c.shiftDownFrac;
        const here = this.rpmIn(this.gear, speedKph);
        if (this.gear < topGear && here > upAt) {
          this.shift(this.gear + 1);
        } else if (this.gear > 1 && here < downAt) {
          this.shift(this.gear - 1);
        } else if (
          this.gear > 1 &&
          throttle > c.kickdownThrottle &&
          this.rpmIn(this.gear - 1, speedKph) < upAt * 0.9
        ) {
          this.shift(this.gear - 1);
        }
      }
      target = Math.min(c.maxRpm, Math.max(c.idleRpm, this.rpmIn(this.gear, speedKph)));
    }

    this.revLevel = this.revHeld ? Math.min(1, this.revLevel + dt / 0.9) : Math.max(0, this.revLevel - dt / 0.45);
    this.revClock += dt;
    if (this.revLevel > 0) {
      const bounce = this.revHeld && this.revLevel >= 1 ? 160 * Math.max(0, Math.sin(this.revClock * 2 * Math.PI * 7)) : 0;
      target = Math.max(target, c.idleRpm + (c.redlineRpm - c.idleRpm) * this.revLevel - bounce);
      if (this.revHeld) throttle = 1;
    }

    if (!this.running) {
      target = 0;
      throttle = 0;
    } else if (this.catchBoost > 0) {
      this.catchBoost = Math.max(0, this.catchBoost - dt / 1.8);
      target = Math.max(target, c.idleRpm * (1 + 0.45 * this.catchBoost));
    }

    const tau = !this.running ? 0.6 : this.shiftLeft > 0 ? 0.07 : 0.11;
    this.rpm += (target - this.rpm) * Math.min(1, dt / tau);
    return { gear: this.gear, rpm: this.rpm, throttle, shifting: this.shiftLeft > 0 };
  }

  private rpmIn(gear: number, speedKph: number): number {
    return (speedKph / (this.cfg.gearTopKph[gear - 1] * this.cfg.gearScale)) * this.cfg.redlineRpm;
  }

  private shift(to: number): void {
    this.gear = to;
    this.shiftLeft = this.cfg.shiftTimeMs / 1000;
    this.sinceShift = 0;
  }
}

function virtualThrottle(speedKph: number, accelMps2: number): number {
  const hold = 0.1 + speedKph / 900;
  const t = accelMps2 >= 0 ? hold + accelMps2 / 5.2 : hold + accelMps2 / 1.2;
  return Math.min(1, Math.max(0, t));
}
