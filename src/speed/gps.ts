import type { SampleListener, SpeedSample, SpeedSource } from './types';

export class GpsSpeedSource implements SpeedSource {
  readonly id = 'gps' as const;

  private static readonly MAX_ACCURACY_M = 60;

  private watchId: number | null = null;
  private readonly listeners = new Set<SampleListener>();
  private previous: GeolocationPosition | null = null;
  private lastSpeed = 0;
  private lastAccuracy: number | null = null;
  private lastFixAt = 0;
  private error: string | null = null;

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('no geolocation in this browser'));
        return;
      }
      let settled = false;
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.error = null;
          this.handle(position);
          if (!settled) {
            settled = true;
            resolve();
          }
        },
        (err) => {
          this.error = describe(err);
          if (settled) return;
          settled = true;
          if (err.code === err.PERMISSION_DENIED) reject(new Error(this.error));
          else resolve();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    });
  }

  stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.previous = null;
  }

  subscribe(listener: SampleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): string {
    if (this.error) return this.error;
    if (this.lastAccuracy === null) return 'acquiring fix';
    const age = (performance.now() - this.lastFixAt) / 1000;
    const acc = `±${Math.round(this.lastAccuracy)} m`;
    return age > 5 ? `${acc} · stale ${Math.round(age)}s` : acc;
  }

  private handle(position: GeolocationPosition): void {
    const { coords } = position;
    this.lastAccuracy = coords.accuracy;
    this.lastFixAt = performance.now();

    let speed = coords.speed;
    if (speed === null || Number.isNaN(speed) || speed < 0) {
      if (coords.accuracy > GpsSpeedSource.MAX_ACCURACY_M) {
        speed = 0;
      } else if (this.previous) {
        speed = derivedSpeed(this.previous, position) ?? this.lastSpeed;
      } else {
        speed = 0;
      }
    }

    let heading: number | undefined;
    if (speed > 1) {
      if (coords.heading !== null && !Number.isNaN(coords.heading)) heading = coords.heading;
      else if (this.previous && coords.accuracy <= GpsSpeedSource.MAX_ACCURACY_M) heading = bearing(this.previous, position);
    }

    this.previous = position;
    this.lastSpeed = speed;
    const sample: SpeedSample = { speedMps: speed, time: this.lastFixAt, accuracy: coords.accuracy, heading };
    for (const listener of this.listeners) listener(sample);
  }

  hasFix(): boolean {
    return !this.error && this.lastAccuracy !== null && performance.now() - this.lastFixAt < 5000;
  }
}

function describe(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'location permission denied';
    case err.POSITION_UNAVAILABLE:
      return 'position unavailable';
    case err.TIMEOUT:
      return 'waiting for fix';
    default:
      return err.message || 'location error';
  }
}

function bearing(a: GeolocationPosition, b: GeolocationPosition): number | undefined {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = rad(a.coords.latitude);
  const lat2 = rad(b.coords.latitude);
  const dLon = rad(b.coords.longitude - a.coords.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return undefined;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function derivedSpeed(a: GeolocationPosition, b: GeolocationPosition): number | null {
  const dt = (b.timestamp - a.timestamp) / 1000;
  if (dt < 0.25) return null;
  const R = 6371000;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.coords.latitude - a.coords.latitude);
  const dLon = rad(b.coords.longitude - a.coords.longitude);
  const lat1 = rad(a.coords.latitude);
  const lat2 = rad(b.coords.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distance = 2 * R * Math.asin(Math.sqrt(h));
  return distance / dt;
}
