import type { EngineAudio } from './audio';

export interface SynthSpec {
  firingsPerRev: number;
  idleRpm: number;
  maxRpm: number;
  rolloff?: number;
  oddBias?: number;
  lope?: number;
  growl?: number;
}

export const V8_SPEC: SynthSpec = { firingsPerRev: 4, idleRpm: 900, maxRpm: 9000 };

export class EngineSound implements EngineAudio {
  private ctx: AudioContext | null = null;
  private pulse!: OscillatorNode;
  private sub!: OscillatorNode;
  private growl!: OscillatorNode;
  private growlGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private noiseGain!: GainNode;
  private drive!: GainNode;
  private tone!: BiquadFilterNode;
  private master!: GainNode;
  private shake!: OscillatorNode;
  private shakeDepth!: GainNode;
  private muted = false;
  private volume = 1;

  constructor(private readonly spec: SynthSpec = V8_SPEC) {}

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

    const rolloff = this.spec.rolloff ?? 28;
    const oddBias = this.spec.oddBias ?? 0.85;
    const partials = 40;
    const real = new Float32Array(partials);
    const imag = new Float32Array(partials);
    for (let n = 1; n < partials; n++) {
      imag[n] = (1 / n) * (n % 2 === 0 ? 1 : oddBias) * Math.exp(-n / rolloff);
    }
    const wave = ctx.createPeriodicWave(real, imag);

    this.pulse = ctx.createOscillator();
    this.pulse.setPeriodicWave(wave);
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.9;

    this.sub = ctx.createOscillator();
    this.sub.type = 'sawtooth';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.45;

    this.growl = ctx.createOscillator();
    this.growl.type = 'square';
    this.growlGain = ctx.createGain();
    this.growlGain.gain.value = 0;

    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx, 2);
    noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.Q.value = 0.8;
    this.noiseFilter.frequency.value = 1500;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;

    this.drive = ctx.createGain();
    this.drive.gain.value = 0.7;
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClip(4);
    clipper.oversample = '2x';

    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 1.1;
    this.tone.frequency.value = 400;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    const out = ctx.createGain();
    out.gain.value = 0.9;

    this.shake = ctx.createOscillator();
    this.shake.type = 'sine';
    this.shakeDepth = ctx.createGain();
    this.shakeDepth.gain.value = 0;
    this.shake.connect(this.shakeDepth).connect(this.master.gain);

    this.pulse.connect(pulseGain).connect(this.drive);
    this.sub.connect(subGain).connect(this.drive);
    this.growl.connect(this.growlGain).connect(this.drive);
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.drive);
    this.drive.connect(clipper).connect(this.tone).connect(this.master).connect(compressor).connect(out).connect(ctx.destination);

    const t = ctx.currentTime;
    for (const osc of [this.pulse, this.sub, this.growl, this.shake]) osc.start(t);
    noise.start(t);

    this.set(this.spec.idleRpm, 0, false);
    await ctx.resume();
  }

  set(rpm: number, throttle: number, shifting: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const spec = this.spec;
    const t = ctx.currentTime;
    const firing = (rpm / 60) * spec.firingsPerRev;
    const r = Math.min(1, rpm / spec.maxRpm);
    const growl = spec.growl ?? 0.25;
    const lope = spec.lope ?? 0.1;

    this.pulse.frequency.setTargetAtTime(firing, t, 0.03);
    this.sub.frequency.setTargetAtTime(firing / 2, t, 0.03);
    this.growl.frequency.setTargetAtTime(firing * 2, t, 0.03);
    this.shake.frequency.setTargetAtTime(Math.max(1, firing / 8), t, 0.05);

    this.growlGain.gain.setTargetAtTime(0.05 + growl * throttle, t, 0.05);
    this.noiseFilter.frequency.setTargetAtTime(900 + 2200 * r, t, 0.05);
    this.noiseGain.gain.setTargetAtTime(0.02 + 0.14 * throttle, t, 0.05);
    this.drive.gain.setTargetAtTime(0.5 + 0.9 * throttle + 0.3 * r, t, 0.04);
    this.tone.frequency.setTargetAtTime(220 + 2600 * r + 1500 * throttle, t, 0.04);
    this.shakeDepth.gain.setTargetAtTime(lope * Math.max(0, 1 - rpm / (spec.idleRpm * 3.9)), t, 0.1);

    const level = (0.16 + 0.55 * throttle) * (0.65 + 0.35 * r) * (shifting ? 0.3 : 1);
    const target = this.muted ? 0 : level * this.volume;
    this.master.gain.setTargetAtTime(target, t, shifting ? 0.015 : 0.05);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && muted) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  stop(): void {
    const ctx = this.ctx;
    this.ctx = null;
    void ctx?.close();
  }
}

function whiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function softClip(k: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}
