export interface SpeedSample {
  speedMps: number;
  time: number;
  accuracy?: number;
  heading?: number;
}

export type SampleListener = (sample: SpeedSample) => void;

export type SourceId = 'gps' | 'demo';

export interface SpeedSource {
  readonly id: SourceId;
  start(): Promise<void>;
  stop(): void;
  subscribe(listener: SampleListener): () => void;
  status(): string;
  hasFix?(): boolean;
}
