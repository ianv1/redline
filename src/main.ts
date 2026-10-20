import './style.css';
import { Dial } from './gauges/dial';
import { Compass } from './gauges/compass';
import { EvPanel } from './gauges/ev';
import { engineArt } from './gauges/engines';
import { Trip } from './trip';
import { Gearbox } from './engine/gearbox';
import type { EngineAudio } from './engine/audio';
import { SampledEngine } from './engine/sampled';
import { EngineSound } from './engine/sound';
import {
  DEFAULT_ENGINE,
  ENGINE_OPTIONS,
  findEngine,
  gearboxFor,
  packOption,
  synthSpecFor,
  type EngineOption,
} from './engine/options';
import { SpeedEstimator } from './speed/estimator';
import { GpsSpeedSource } from './speed/gps';
import { DemoSpeedSource } from './speed/demo';
import type { SpeedSource } from './speed/types';

type Units = 'kph' | 'mph';

interface RpmSpec {
  idleRpm: number;
  redlineRpm: number;
  maxRpm: number;
}

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.236936;
const STORAGE_UNITS = 'redline.units';
const STORAGE_VOLUME = 'redline.volume';
const STORAGE_ENGINE = 'redline.engine';
const STORAGE_BEST_SPRINT = 'redline.bestSprint';
const SHIFT_LIGHT_MARGIN = 120;
const EV_RPM_PER_KPH = 50;
const EV_FADE_IN_KPH = 15;

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');

const app = document.getElementById('app') as HTMLElement;
app.innerHTML = `
  <section class="start" id="start">
    <h1 class="wordmark">REDLINE</h1>
    <p class="tagline">An engine for your EV</p>
    <div class="buttons">
      <button class="btn primary" id="start-btn">Start</button>
    </div>
    <div class="engines" id="start-engines" role="radiogroup" aria-label="Engine"></div>
    <p class="note">Pick an engine, tap Start, allow location, and it fires up.</p>
  </section>
  <div class="topbar">
    <div class="compass" id="compass"></div>
  </div>
  <section class="ev" id="ev"></section>
  <div class="cluster">
    <div class="dial" id="rpm"></div>
    <div class="dial" id="speed"></div>
  </div>
  <div class="revrow" id="revrow">
    <button class="rev" id="rev" title="Hold to rev (R)">Rev</button>
  </div>
  <footer class="statusbar">
    <button class="status" id="status" type="button" title="Tap to restart GPS">Ready</button>
    <span class="controls">
      <button class="chip" id="engine" aria-haspopup="true" aria-expanded="false">Engine</button>
      <label class="chip volume" for="volume">
        <span>Vol</span>
        <input type="range" id="volume" min="0" max="100" step="5" aria-label="Engine volume">
        <span class="volume-value" id="volume-value">100%</span>
      </label>
    </span>
  </footer>
  <div class="engine-menu" id="engine-menu" hidden>
    <div class="engines" id="menu-engines" role="radiogroup" aria-label="Engine"></div>
  </div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const urlUnits = params.get('units');
let units: Units = urlUnits === 'mph' || urlUnits === 'kph' ? urlUnits : read(STORAGE_UNITS) === 'mph' ? 'mph' : 'kph';
if (urlUnits) write(STORAGE_UNITS, units);
let volume = clamp01(Number(read(STORAGE_VOLUME) ?? 1));
let lastVolume = volume > 0 ? volume : 1;

const options: EngineOption[] = [...ENGINE_OPTIONS];
const urlPack = params.get('pack');
if (urlPack && !findEngine(urlPack)) options.push(packOption(urlPack));
let engine: EngineOption =
  options.find((o) => o.id === urlPack || o.id === `pack:${urlPack}`) ??
  options.find((o) => o.id === read(STORAGE_ENGINE)) ??
  DEFAULT_ENGINE;

let rpmSpec: RpmSpec = engine;
let rpmDial = makeRpmDial();
let speedDial = makeSpeedDial();
const compass = new Compass($('compass'));
const ev = new EvPanel($('ev'));
const trip = new Trip(Number(read(STORAGE_BEST_SPRINT)) || null);
let savedBestSprint = trip.bestSprintS;
let gearbox = new Gearbox(gearboxFor(engine));
gearbox.cut();

const estimator = new SpeedEstimator();
let audio: EngineAudio | null = null;
let audioToken = 0;
let started = false;
let ignition = false;
let heading: number | null = null;

let source: SpeedSource | null = null;
let unsubscribe: (() => void) | null = null;

function makeRpmDial(): Dial {
  return new Dial($('rpm'), {
    min: 0,
    max: rpmSpec.maxRpm,
    major: 1000,
    mid: 500,
    minor: 250,
    label: 'rpm × 1000',
    numeralScale: 1000,
    redlineFrom: rpmSpec.redlineRpm,
    readoutSize: 96,
  });
}

function makeSpeedDial(): Dial {
  return new Dial(
    $('speed'),
    units === 'kph'
      ? { min: 0, max: 240, major: 40, mid: 20, minor: 10, label: 'km/h' }
      : { min: 0, max: 160, major: 20, mid: 10, minor: 5, label: 'mph' },
  );
}

function applyRpmSpec(spec: RpmSpec, engineChanged = false): void {
  if (engine.ev) return;
  const same =
    spec.idleRpm === rpmSpec.idleRpm && spec.redlineRpm === rpmSpec.redlineRpm && spec.maxRpm === rpmSpec.maxRpm;
  if (same && !engineChanged) return;
  rpmSpec = { idleRpm: spec.idleRpm, redlineRpm: spec.redlineRpm, maxRpm: spec.maxRpm };
  if (!same) {
    const previous = rpmDial;
    rpmDial = makeRpmDial();
    rpmDial.adopt(previous);
  }
  gearbox = new Gearbox({ ...gearboxFor(engine), ...rpmSpec });
  if (!ignition) gearbox.cut();
}

function makeAudio(o: EngineOption): EngineAudio {
  return o.pack
    ? new SampledEngine(`${import.meta.env.BASE_URL}sounds/${o.pack}/pack.json`)
    : new EngineSound(synthSpecFor(o));
}

async function startAudio(o: EngineOption): Promise<void> {
  const token = ++audioToken;
  audio?.stop();
  audio = null;
  if (o.ev && !o.pack) return;

  let next = makeAudio(o);
  try {
    await next.start();
    if (token !== audioToken) return next.stop();
    if (next instanceof SampledEngine && next.pack) applyRpmSpec(next.pack);
  } catch (err) {
    if (token !== audioToken) return;
    console.warn(`Engine pack for ${o.name} unavailable, using the synthesised engine`, err);
    next = new EngineSound(synthSpecFor(o));
    try {
      await next.start();
      if (token !== audioToken) return next.stop();
    } catch (synthErr) {
      console.warn('Audio could not start', synthErr);
      return;
    }
  }
  audio = next;
  applyMute();
  audio.setVolume(volume);
}

function selectEngine(o: EngineOption): void {
  engine = o;
  write(STORAGE_ENGINE, o.id);
  applyRpmSpec(o, true);
  syncEngineUi();
  if (started) void startAudio(o);
}

function renderEngineChips(container: HTMLElement): void {
  container.innerHTML = options
    .map(
      (o) => `
      <button class="chip engine-chip" type="button" role="radio" aria-checked="false" data-engine="${esc(o.id)}" data-theme="${esc(o.theme)}">
        <span class="engine-photo">${
          o.image ? `<img src="${esc(import.meta.env.BASE_URL + o.image)}" alt="" loading="lazy">` : engineArt(o.theme)
        }</span>
        <span class="engine-text">
          <span class="engine-name">${esc(o.name)}</span>
          <span class="engine-kind">${esc(o.layout)}</span>
        </span>
      </button>`,
    )
    .join('');
  container.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-engine]');
    const picked = chip && options.find((o) => o.id === chip.dataset.engine);
    if (!picked) return;
    selectEngine(picked);
    toggleEngineMenu(false);
  });
}

function syncEngineUi(): void {
  for (const chip of document.querySelectorAll<HTMLElement>('[data-engine]')) {
    chip.setAttribute('aria-checked', String(chip.dataset.engine === engine.id));
  }
  $('engine').textContent = engine.short;
  app.dataset.theme = engine.theme;
  app.dataset.mode = engine.ev ? 'ev' : 'engine';
}

function toggleEngineMenu(open = $('engine-menu').hidden): void {
  $('engine-menu').hidden = !open;
  $('engine').setAttribute('aria-expanded', String(open));
}

renderEngineChips($('start-engines'));
renderEngineChips($('menu-engines'));
syncEngineUi();
$('start-engines').hidden = options.length < 2;
$('engine').hidden = options.length < 2;

async function useSource(): Promise<void> {
  unsubscribe?.();
  source?.stop();
  estimator.reset();

  const next: SpeedSource = DEMO ? new DemoSpeedSource() : new GpsSpeedSource();
  source = next;
  unsubscribe = next.subscribe((sample) => {
    estimator.push(sample);
    if (sample.heading !== undefined) heading = sample.heading;
  });
  statusOverride = null;
  refreshStatus();

  try {
    await next.start();
  } catch (err) {
    if (source !== next) return;
    setStatus(`GPS · ${(err as Error).message} · tap to retry`, Infinity);
  }
}

async function begin(): Promise<void> {
  started = true;
  const audioReady = startAudio(engine);
  $('start').hidden = true;
  void useSource();
  void requestWakeLock();
  void requestFullscreen();
  await startSequence(audioReady);
}

async function startSequence(audioReady: Promise<void>): Promise<void> {
  if (engine.ev) {
    ignition = true;
    ev.boot();
    await sleep(1300);
    return;
  }
  ignition = false;
  applyMute();
  gearbox.setRunning(false);
  await Promise.all([sleep(400), Promise.race([audioReady, sleep(4000)])]);
  ignition = true;
  gearbox.ignite();
  applyMute();
}

async function requestWakeLock(): Promise<void> {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
  }
}

async function requestFullscreen(): Promise<void> {
  if (!matchMedia('(pointer: coarse)').matches) return;
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
  }
}

let statusOverride: { text: string; until: number } | null = null;

function setStatus(text: string, forMs = 6000): void {
  statusOverride = { text, until: performance.now() + forMs };
  $('status').textContent = text;
}

function refreshStatus(): void {
  if (statusOverride && performance.now() < statusOverride.until) return;
  statusOverride = null;
  const text = source ? `${source.id} · ${source.status()}` : 'Ready';
  const el = $('status');
  if (el.textContent !== text) el.textContent = text;
}

function setUnits(next: Units): void {
  units = next;
  write(STORAGE_UNITS, next);
  speedDial = makeSpeedDial();
}

function applyMute(): void {
  audio?.setMuted(!ignition || volume === 0);
}

function setVolume(next: number): void {
  volume = clamp01(next);
  if (volume > 0) lastVolume = volume;
  write(STORAGE_VOLUME, String(volume));
  const pct = String(Math.round(volume * 100));
  $<HTMLInputElement>('volume').value = pct;
  $('volume-value').textContent = `${pct}%`;
  audio?.setVolume(volume);
  if (volume === 0) setRev(false);
  $('revrow').hidden = volume === 0;
  applyMute();
}

function cycleEngine(): void {
  selectEngine(options[(options.indexOf(engine) + 1) % options.length]);
}

function setRev(on: boolean): void {
  gearbox.rev(on);
  $('rev').toggleAttribute('data-down', on);
}

$('start-btn').addEventListener('click', () => void begin());
$('volume').addEventListener('input', () => setVolume(Number($<HTMLInputElement>('volume').value) / 100));
$('engine').addEventListener('click', () => toggleEngineMenu());
$('status').addEventListener('click', () => {
  if (started) void useSource();
});

const rev = $('rev');
rev.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  rev.setPointerCapture(e.pointerId);
  setRev(true);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  rev.addEventListener(ev, () => setRev(false));
}
rev.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('pointerdown', (e) => {
  if ($('engine-menu').hidden) return;
  const target = e.target as HTMLElement;
  if (!target.closest('#engine-menu') && !target.closest('#engine')) toggleEngineMenu(false);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'u' || e.key === 'U') setUnits(units === 'kph' ? 'mph' : 'kph');
  if (e.key === 'm' || e.key === 'M') setVolume(volume > 0 ? 0 : lastVolume);
  if (e.key === 'e' || e.key === 'E') cycleEngine();
  if (e.key === 'Escape') toggleEngineMenu(false);
  if ((e.key === 'r' || e.key === 'R') && !e.repeat) setRev(true);
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'r' || e.key === 'R') setRev(false);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) void audio?.suspend();
  else void audio?.resume();
});

setVolume(volume);

let last = performance.now();
let statusClock = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  const { speedMps, accelMps2 } = estimator.update(now, dt);
  const kph = speedMps * MPS_TO_KPH;
  const state = gearbox.update(kph, accelMps2, dt);
  const shown = units === 'kph' ? kph : speedMps * MPS_TO_MPH;

  rpmDial.setValue(state.rpm);
  speedDial.setValue(shown);
  rpmDial.setReadout(state.gear === 0 ? 'N' : String(state.gear));
  rpmDial.setShiftLight(ignition && !engine.ev && state.rpm >= rpmSpec.redlineRpm - SHIFT_LIGHT_MARGIN);
  speedDial.setReadout(String(Math.round(shown)));
  rpmDial.tick(dt);
  speedDial.tick(dt);
  compass.setHeading(heading);
  compass.tick(dt);

  if (started && ignition) {
    trip.update(kph, dt, now, units === 'kph' ? 100 : 96.56);
    if (trip.bestSprintS !== savedBestSprint && trip.bestSprintS !== null) {
      savedBestSprint = trip.bestSprintS;
      write(STORAGE_BEST_SPRINT, String(trip.bestSprintS));
    }
  }
  if (engine.ev) {
    ev.update({
      speed: shown,
      max: units === 'kph' ? 240 : 160,
      unit: units === 'kph' ? 'km/h' : 'mph',
      maxKph: trip.maxKph,
      lastSprintS: trip.lastSprintS,
      bestSprintS: trip.bestSprintS,
    });
    ev.tick(dt);
  }

  if (engine.ev) {
    audio?.set(kph * EV_RPM_PER_KPH, state.throttle, false);
    audio?.setVolume(volume * Math.min(1, kph / EV_FADE_IN_KPH));
  } else {
    audio?.set(state.rpm, state.throttle, state.shifting);
  }

  statusClock += dt;
  if (statusClock > 0.25) {
    statusClock = 0;
    refreshStatus();
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

if (import.meta.env.PROD) {
  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.dataset.cfBeacon = JSON.stringify({ token: 'c487936c87194b59aed5d1bfc88b729e' });
  document.body.append(beacon);
}

if (import.meta.env.DEV) {
  Object.assign(window, {
    __redline: {
      audio: () => audio,
      engine: () => engine,
      options,
      select: selectEngine,
      gearbox: () => gearbox,
      estimator,
      source: () => source,
      compass,
      ev,
      trip,
      state: () => ({ ignition, heading }),
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}
