export class Trip {
  distanceM = 0;
  movingS = 0;
  maxKph = 0;
  lastSprintS: number | null = null;
  bestSprintS: number | null;

  private armed = true;
  private sprintStart = 0;

  constructor(bestSprintS: number | null = null) {
    this.bestSprintS = bestSprintS;
  }

  update(kph: number, dt: number, now: number, sprintToKph: number): void {
    if (kph > 1) {
      this.distanceM += (kph / 3.6) * dt;
      this.movingS += dt;
    }
    if (kph > this.maxKph) this.maxKph = kph;

    if (kph < 2) {
      this.armed = true;
      this.sprintStart = 0;
    } else if (this.armed && this.sprintStart === 0) {
      this.sprintStart = now;
    } else if (this.armed && this.sprintStart > 0 && kph >= sprintToKph) {
      const s = (now - this.sprintStart) / 1000;
      this.lastSprintS = s;
      if (this.bestSprintS === null || s < this.bestSprintS) this.bestSprintS = s;
      this.armed = false;
    }
  }

  get avgKph(): number {
    return this.movingS > 0 ? (this.distanceM / this.movingS) * 3.6 : 0;
  }
}
