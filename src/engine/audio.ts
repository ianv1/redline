export interface EngineAudio {
  readonly running: boolean;
  start(): Promise<void>;
  set(rpm: number, throttle: number, shifting: boolean): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  stop(): void;
}
