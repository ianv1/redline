import type { EngineAudio } from './audio';

export interface Keyframe {
  t: number;
  rpm: number;
}

export interface EnginePack {
  name: string;
  credit: string;
  license: string;
  idleRpm: number;
  redlineRpm: number;
  maxRpm: number;
  gain?: number;
  bass?: number;
  sweep: {
    file: string;
    keyframes: Keyframe[];
  };
  idle?: {
    file: string;
    start: number;
    end: number;
    rpm: number;
    gain?: number;
  };
}

const GRAIN_S = 0.1;
const HOP_S = GRAIN_S / 2;
const LOOKAHEAD_S = 0.15;
const JITTER_S = 0.035;
const MIN_RATE = 0.5;
const MAX_RATE = 2;

export class SampledEngine implements EngineAudio {
  pack: EnginePack | null = null;

  private ctx: AudioContext | null = null;
  private sweep: AudioBuffer | null = null;
  private grainBus!: GainNode;
  private idleGain!: GainNode;
  private tone!: BiquadFilterNode;
  private shelf!: BiquadFilterNode;
  private boom!: BiquadFilterNode;
  private sub1!: OscillatorNode;
  private sub2!: OscillatorNode;
  private sub1Gain!: GainNode;
  private sub2Gain!: GainNode;
  private master!: GainNode;
  private readonly window = hann(128);
  private nextGrain = 0;
  private timer = 0;
  private flip = 1;

  private rpm = 900;
  private muted = false;
  private volume = 1;

  constructor(private readonly packUrl: string) {}

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  async start(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    try {
      this.buildGraph(ctx);
      await this.load(ctx);
    } catch (err) {
      this.ctx = null;
      void ctx.close();
      throw err;
    }
    this.nextGrain = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 20);
    await ctx.resume();
  }

  set(rpm: number, throttle: number, shifting: boolean): void {
    const ctx = this.ctx;
    const pack = this.pack;
    if (!ctx || !pack) return;
    this.rpm = rpm;
    const t = ctx.currentTime;

    this.tone.frequency.setTargetAtTime(900 + 6500 * throttle, t, 0.06);

    const level = (0.55 + 0.45 * throttle) * (shifting ? 0.35 : 1) * (pack.gain ?? 1) * this.volume;
    this.master.gain.setTargetAtTime(this.muted ? 0 : level, t, shifting ? 0.015 : 0.05);

    const crank = rpm / 60;
    const swell = (0.5 + 0.5 * throttle) * (shifting ? 0.4 : 1) * (pack.bass ?? 1);
    this.sub1.frequency.setTargetAtTime(crank, t, 0.03);
    this.sub2.frequency.setTargetAtTime(crank * 2, t, 0.03);
    this.sub1Gain.gain.setTargetAtTime(0.22 * swell, t, 0.05);
    this.sub2Gain.gain.setTargetAtTime(0.16 * swell * clamp(1 - (crank * 2 - 180) / 160, 0.3, 1), t, 0.05);

    if (pack.idle) {
      const w = clamp(1 - (rpm - pack.idle.rpm) / 500, 0, 1);
      this.idleGain.gain.setTargetAtTime(w * (pack.idle.gain ?? 1), t, 0.05);
      this.grainBus.gain.setTargetAtTime(1 - 0.85 * w, t, 0.05);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && muted) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1);
  }

  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  stop(): void {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  private buildGraph(ctx: AudioContext): void {
    this.grainBus = ctx.createGain();
    this.idleGain = ctx.createGain();
    this.idleGain.gain.value = 0;

    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 6000;
    this.tone.Q.value = 0.7;

    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 200;
    this.boom = ctx.createBiquadFilter();
    this.boom.type = 'peaking';
    this.boom.frequency.value = 70;
    this.boom.Q.value = 0.8;

    this.sub1 = ctx.createOscillator();
    this.sub1.type = 'sine';
    this.sub1Gain = ctx.createGain();
    this.sub1Gain.gain.value = 0;
    this.sub2 = ctx.createOscillator();
    this.sub2.type = 'sine';
    this.sub2Gain = ctx.createGain();
    this.sub2Gain.gain.value = 0;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;

    this.grainBus.connect(this.tone);
    this.idleGain.connect(this.tone);
    this.tone.connect(this.shelf).connect(this.boom).connect(this.master);
    this.sub1.connect(this.sub1Gain).connect(this.master);
    this.sub2.connect(this.sub2Gain).connect(this.master);
    this.master.connect(compressor).connect(ctx.destination);
    this.sub1.start();
    this.sub2.start();
  }

  private async load(ctx: AudioContext): Promise<void> {
    const base = new URL(this.packUrl, location.href);
    const pack = (await fetchJson(base)) as EnginePack;
    const kf = pack.sweep?.keyframes;
    if (!kf || kf.length < 2) throw new Error(`pack ${pack.name ?? base} has no usable sweep keyframes`);

    const buffers = new Map<string, AudioBuffer>();
    const buffer = async (file: string): Promise<AudioBuffer> => {
      const cached = buffers.get(file);
      if (cached) return cached;
      const res = await fetch(new URL(file, base));
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
      buffers.set(file, decoded);
      return decoded;
    };

    this.sweep = await buffer(pack.sweep.file);
    if (pack.idle) {
      const src = ctx.createBufferSource();
      src.buffer = await buffer(pack.idle.file);
      src.loop = true;
      src.loopStart = pack.idle.start;
      src.loopEnd = pack.idle.end;
      src.connect(this.idleGain);
      src.start(0, pack.idle.start);
    }
    this.pack = pack;
    this.rpm = pack.idleRpm;
    const bass = pack.bass ?? 1;
    this.shelf.gain.value = 9 * bass;
    this.boom.gain.value = 4 * bass;
    this.sub1.frequency.value = pack.idleRpm / 60;
    this.sub2.frequency.value = pack.idleRpm / 30;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.pack || !this.sweep) return;
    if (this.nextGrain < ctx.currentTime - 0.1) this.nextGrain = ctx.currentTime + 0.02;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    while (this.nextGrain < horizon) {
      this.spawnGrain(ctx, this.pack, this.sweep, this.nextGrain);
      this.nextGrain += HOP_S;
    }
  }

  private spawnGrain(ctx: AudioContext, pack: EnginePack, sweep: AudioBuffer, when: number): void {
    const kf = pack.sweep.keyframes;
    const first = kf[0];
    const last = kf[kf.length - 1];

    this.flip = -this.flip;
    let pos = timeAt(kf, this.rpm) + this.flip * Math.random() * JITTER_S;
    pos = clamp(pos, first.t, Math.max(first.t, Math.min(last.t, sweep.duration) - GRAIN_S * MAX_RATE));
    const rate = clamp(this.rpm / rpmAt(kf, pos), MIN_RATE, MAX_RATE);

    const startAt = Math.max(when, ctx.currentTime + 0.005);
    const src = ctx.createBufferSource();
    src.buffer = sweep;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(this.window, startAt, GRAIN_S);
    src.connect(env).connect(this.grainBus);
    src.start(startAt, pos, GRAIN_S * rate + 0.01);
    src.stop(startAt + GRAIN_S + 0.02);
    src.onended = () => {
      src.disconnect();
      env.disconnect();
    };
  }
}

function timeAt(kf: Keyframe[], rpm: number): number {
  if (rpm <= kf[0].rpm) return kf[0].t;
  for (let i = 1; i < kf.length; i++) {
    if (rpm <= kf[i].rpm) {
      const a = kf[i - 1];
      const b = kf[i];
      return a.t + ((rpm - a.rpm) / (b.rpm - a.rpm)) * (b.t - a.t);
    }
  }
  return kf[kf.length - 1].t;
}

function rpmAt(kf: Keyframe[], t: number): number {
  if (t <= kf[0].t) return kf[0].rpm;
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i].t) {
      const a = kf[i - 1];
      const b = kf[i];
      return a.rpm + ((t - a.t) / (b.t - a.t)) * (b.rpm - a.rpm);
    }
  }
  return kf[kf.length - 1].rpm;
}

async function fetchJson(url: URL): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.pathname}: HTTP ${res.status}`);
  return res.json();
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
