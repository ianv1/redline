import { DEFAULT_GEARBOX, type GearboxConfig } from './gearbox';
import type { SynthSpec } from './sound';

export interface EngineOption {
  id: string;
  name: string;
  short: string;
  layout: string;
  theme: string;
  image?: string;
  idleRpm: number;
  redlineRpm: number;
  maxRpm: number;
  gearTopKph: number[];
  pack?: string;
  synth?: Omit<SynthSpec, 'idleRpm' | 'maxRpm'>;
  ev?: boolean;
}

export const ENGINE_OPTIONS: EngineOption[] = [
  {
    id: 'tesla',
    name: 'Electric motor',
    short: 'Electric',
    layout: 'Whine with speed',
    theme: 'tesla',
    ev: true,
    pack: 'tesla-model-s-plaid',
    idleRpm: 0,
    redlineRpm: 1,
    maxRpm: 1,
    gearTopKph: DEFAULT_GEARBOX.gearTopKph,
  },
  {
    id: 'lamborghini-murcielago-sv-v12',
    name: '6.5 L V12',
    short: 'V12',
    layout: 'Supercar',
    idleRpm: 1100,
    redlineRpm: 8000,
    maxRpm: 9000,
    gearTopKph: [101, 148, 200, 253, 294, 336],
    theme: 'lamborghini',
    pack: 'lamborghini-murcielago-sv-v12',
    synth: { firingsPerRev: 6, rolloff: 40, oddBias: 0.9, lope: 0.05, growl: 0.2 },
  },
  {
    id: 'lexus-lfa-v10',
    name: '4.8 L V10',
    short: 'V10',
    layout: 'Nine-thousand scream',
    idleRpm: 1100,
    redlineRpm: 9000,
    maxRpm: 10000,
    gearTopKph: [84, 122, 167, 219, 277, 325],
    theme: 'lfa',
    pack: 'lexus-lfa-v10',
    synth: { firingsPerRev: 5, rolloff: 36, oddBias: 0.9, lope: 0.05, growl: 0.2 },
  },
  {
    id: 'ferrari-458-v8',
    name: '4.5 L V8',
    short: 'V8',
    layout: 'Flat-plane',
    idleRpm: 930,
    redlineRpm: 9000,
    maxRpm: 10000,
    gearTopKph: [77, 108, 145, 183, 229, 281, 342],
    theme: 'f458',
    pack: 'ferrari-458-v8',
    synth: { firingsPerRev: 4, rolloff: 34, oddBias: 0.9, lope: 0.05, growl: 0.22 },
  },
];

export const DEFAULT_ENGINE = ENGINE_OPTIONS[0];

export function findEngine(id: string | null | undefined): EngineOption | undefined {
  return ENGINE_OPTIONS.find((o) => o.id === id);
}

export function packOption(pack: string): EngineOption {
  return {
    id: `pack:${pack}`,
    name: pack,
    short: pack,
    layout: 'recording',
    theme: 'ferrari',
    idleRpm: DEFAULT_GEARBOX.idleRpm,
    redlineRpm: DEFAULT_GEARBOX.redlineRpm,
    maxRpm: DEFAULT_GEARBOX.maxRpm,
    gearTopKph: DEFAULT_GEARBOX.gearTopKph,
    pack,
    synth: { firingsPerRev: 4 },
  };
}

export function gearboxFor(o: EngineOption): GearboxConfig {
  return {
    ...DEFAULT_GEARBOX,
    idleRpm: o.idleRpm,
    redlineRpm: o.redlineRpm,
    maxRpm: o.maxRpm,
    gearTopKph: o.gearTopKph,
  };
}

export function synthSpecFor(o: EngineOption): SynthSpec {
  return { firingsPerRev: 4, ...o.synth, idleRpm: o.idleRpm, maxRpm: o.maxRpm };
}
