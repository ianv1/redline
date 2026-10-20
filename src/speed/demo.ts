import type { SampleListener, SpeedSample, SpeedSource } from './types';

export class DemoSpeedSource implements SpeedSource {
  readonly id = 'demo' as const;

  private readonly listeners = new Set<SampleListener>();
  private speed = 0;
  private heading = 20;
  private throttle = false;
  private brake = false;
  private raf = 0;
  private last = 0;

  private readonly onKey = (e: KeyboardEvent): void => {
    const down = e.type === 'keydown';
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.throttle = down;
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
      case ' ':
        this.brake = down;
        e.preventDefault();
        break;
    }
  };

  private readonly step = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const v = this.speed;
    const drive = this.throttle ? 6.5 * Math.max(0.15, 1 - v / 80) : 0;
    const braking = this.brake ? 7 : 0;
    const drag = 0.0022 * v * v + 0.25;
    this.speed = Math.max(0, v + (drive - braking - drag) * dt);
    this.heading = (this.heading + this.speed * dt * 0.8) % 360;
    const sample: SpeedSample = { speedMps: this.speed, time: now, heading: this.speed > 1 ? this.heading : undefined };
    for (const listener of this.listeners) listener(sample);
    this.raf = requestAnimationFrame(this.step);
  };

  async start(): Promise<void> {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.step);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.throttle = false;
    this.brake = false;
  }

  subscribe(listener: SampleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): string {
    if (this.throttle) return 'accelerating';
    if (this.brake) return 'braking';
    return 'hold ↑ to accelerate · ↓ to brake';
  }

  setThrottle(on: boolean): void {
    this.throttle = on;
  }

  setBrake(on: boolean): void {
    this.brake = on;
  }
}
