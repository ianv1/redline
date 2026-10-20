export interface DialOptions {
  min: number;
  max: number;
  major: number;
  mid?: number;
  minor: number;
  label: string;
  numeralScale?: number;
  redlineFrom?: number;
  readoutSize?: number;
}

const CX = 200;
const CY = 200;
const START_DEG = -130;
const SWEEP_DEG = 260;
const R_BEZEL = 192;
const R_FACE = 185;
const R_TICK = 175;
const R_NUMERAL = 120;
const R_REDLINE = 170;

let nextId = 0;

export class Dial {
  readonly el: SVGSVGElement;
  private readonly opts: DialOptions;
  private readonly needle: SVGGElement;
  private readonly hubSpin: SVGGElement[];
  private readonly readoutEl: SVGTextElement;
  private readonly captionEl: SVGTextElement;
  private target: number;
  private pos: number;
  private vel = 0;

  constructor(container: HTMLElement, opts: DialOptions) {
    this.opts = opts;
    this.target = opts.min;
    this.pos = opts.min;
    container.innerHTML = render(opts, `dial${nextId++}`);
    this.el = container.querySelector('svg') as SVGSVGElement;
    this.needle = this.el.querySelector('.needle') as SVGGElement;
    this.hubSpin = Array.from(this.el.querySelectorAll<SVGGElement>('.hub-spin'));
    this.readoutEl = this.el.querySelector('.readout') as SVGTextElement;
    this.captionEl = this.el.querySelector('.caption') as SVGTextElement;
    this.tick(0);
  }

  setValue(value: number): void {
    this.target = value;
  }

  adopt(other: Dial): void {
    this.target = other.target;
    this.pos = other.pos;
    this.vel = other.vel;
    this.tick(0);
  }

  setReadout(text: string, caption = ''): void {
    if (this.readoutEl.textContent !== text) this.readoutEl.textContent = text;
    if (this.captionEl.textContent !== caption) this.captionEl.textContent = caption;
  }

  setShiftLight(on: boolean): void {
    if (this.el.classList.contains('shift') !== on) this.el.classList.toggle('shift', on);
  }

  tick(dt: number): void {
    const stiffness = 150;
    const damping = 2 * 0.72 * Math.sqrt(stiffness);
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = stiffness * (this.target - this.pos) - damping * this.vel;
      this.vel += accel * h;
      this.pos += this.vel * h;
    }
    const span = this.opts.max - this.opts.min;
    const lo = this.opts.min - span * 0.01;
    const hi = this.opts.max + span * 0.02;
    if (this.pos < lo) {
      this.pos = lo;
      this.vel = 0;
    } else if (this.pos > hi) {
      this.pos = hi;
      this.vel = 0;
    }
    const deg = angleOf(this.pos, this.opts);
    const rotate = `rotate(${deg.toFixed(2)} ${CX} ${CY})`;
    this.needle.setAttribute('transform', rotate);
    for (const g of this.hubSpin) g.setAttribute('transform', rotate);
  }
}

function renderHub(id: string): string {
  const lines: string[] = [];
  for (let i = 0; i < 90; i++) {
    const a = ((i * 4) * Math.PI) / 180;
    const [x1, y1] = [CX + 7.6 * Math.cos(a), CY + 7.6 * Math.sin(a)];
    const [x2, y2] = [CX + 14.6 * Math.cos(a), CY + 14.6 * Math.sin(a)];
    const tone = i % 2 === 0 ? '#fff' : '#000';
    const opacity = (0.04 + 0.11 * (((i * 37) % 7) / 6)).toFixed(3);
    lines.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${tone}" stroke-width="0.55" opacity="${opacity}"/>`);
  }
  const sector = (fromDeg: number, toDeg: number, fill: string, opacity: number): string => {
    const [ax, ay] = point(fromDeg, 14.6);
    const [bx, by] = point(toDeg, 14.6);
    return `<path d="M ${CX} ${CY} L ${f(ax)} ${f(ay)} A 14.6 14.6 0 0 1 ${f(bx)} ${f(by)} Z" fill="${fill}" opacity="${opacity}"/>`;
  };
  const cross =
    sector(20, 70, '#fff', 0.16) + sector(200, 250, '#fff', 0.16) + sector(110, 160, '#000', 0.22) + sector(290, 340, '#000', 0.22);

  return `<circle cx="${CX + 1.5}" cy="${CY + 3}" r="17" fill="#000" opacity="0.6" filter="url(#${id}-hub-blur)"/>
  <circle cx="${CX}" cy="${CY}" r="16.6" fill="url(#${id}-hub-rim)"/>
  <circle cx="${CX}" cy="${CY}" r="14.8" fill="#0d0d0d"/>
  <circle cx="${CX}" cy="${CY}" r="14.4" fill="url(#${id}-hub-dome)"/>
  <g class="hub-spin" transform="rotate(0 ${CX} ${CY})" clip-path="url(#${id}-hub-brush)">${cross}${lines.join('')}</g>
  <ellipse cx="${CX - 4.5}" cy="${CY - 6}" rx="7.5" ry="4.2" transform="rotate(-35 ${CX - 4.5} ${CY - 6})" fill="#fff" opacity="0.38" filter="url(#${id}-hub-soft)"/>
  <circle cx="${CX}" cy="${CY}" r="7.3" fill="none" stroke="#0a0a0a" stroke-width="1.3" opacity="0.9"/>
  <circle cx="${CX}" cy="${CY}" r="6.3" fill="none" stroke="#fff" stroke-width="0.6" opacity="0.28"/>
  <circle cx="${CX}" cy="${CY}" r="5.6" fill="url(#${id}-hub-screw)"/>
  <g class="hub-spin" transform="rotate(0 ${CX} ${CY})">
    <rect x="${CX - 3.4}" y="${CY - 0.75}" width="6.8" height="1.5" rx="0.75" fill="#050505" opacity="0.9"/>
    <rect x="${CX - 3.2}" y="${CY + 0.85}" width="6.4" height="0.5" rx="0.25" fill="#fff" opacity="0.22"/>
  </g>`;
}

function angleOf(value: number, o: DialOptions): number {
  return START_DEG + ((value - o.min) / (o.max - o.min)) * SWEEP_DEG;
}

function point(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function arc(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = point(fromDeg, r);
  const [x2, y2] = point(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${f(x1)} ${f(y1)} A ${r} ${r} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
}

function isMultiple(x: number, step: number): boolean {
  const q = x / step;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

function f(n: number): string {
  return n.toFixed(2);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render(o: DialOptions, id: string): string {
  const scale = o.numeralScale ?? 1;
  const marks: string[] = [];
  const count = Math.round((o.max - o.min) / o.minor);

  for (let i = 0; i <= count; i++) {
    const v = o.min + i * o.minor;
    const major = isMultiple(v - o.min, o.major);
    const mid = !major && o.mid !== undefined && isMultiple(v - o.min, o.mid);
    const red = o.redlineFrom !== undefined && v >= o.redlineFrom - 1e-6;
    const deg = angleOf(v, o);
    const len = major ? 20 : mid ? 13 : 8;
    const [x1, y1] = point(deg, R_TICK);
    const [x2, y2] = point(deg, R_TICK - len);
    const cls = `tick ${major ? 'major' : mid ? 'mid' : 'minor'}${red ? ' red' : ''}`;
    marks.push(`<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
    if (major) {
      const [nx, ny] = point(deg, R_NUMERAL);
      marks.push(
        `<text class="numeral${red ? ' red' : ''}" x="${f(nx)}" y="${f(ny)}" text-anchor="middle" dominant-baseline="central">${Math.round(v / scale)}</text>`,
      );
    }
  }

  let redline = '';
  if (o.redlineFrom !== undefined) {
    const d = arc(angleOf(o.redlineFrom, o), angleOf(o.max, o), R_REDLINE);
    redline = `<path class="redline-glow" d="${d}" filter="url(#${id}-glow)"/><path class="redline" d="${d}"/>`;
  }

  const needlePath = `M ${CX} 28 L ${CX + 3.6} ${CY + 6} L ${CX + 2.6} ${CY + 32} L ${CX - 2.6} ${CY + 32} L ${CX - 3.6} ${CY + 6} Z`;

  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(o.label)} gauge">
  <defs>
    <radialGradient id="${id}-face" cx="50%" cy="45%" r="60%">
      <stop offset="0" class="face-in"/>
      <stop offset="0.7" class="face-mid"/>
      <stop offset="1" class="face-out"/>
    </radialGradient>
    <linearGradient id="${id}-bezel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2f2f2"/>
      <stop offset="0.35" stop-color="#8e8e8e"/>
      <stop offset="0.62" stop-color="#4c4c4c"/>
      <stop offset="1" stop-color="#d4d4d4"/>
    </linearGradient>
    <linearGradient id="${id}-hub-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4f4f4"/>
      <stop offset="0.4" stop-color="#9a9a9a"/>
      <stop offset="0.65" stop-color="#383838"/>
      <stop offset="1" stop-color="#cfcfcf"/>
    </linearGradient>
    <radialGradient id="${id}-hub-dome" cx="36%" cy="30%" r="72%">
      <stop offset="0" stop-color="#fafafa"/>
      <stop offset="0.25" stop-color="#d4d4d4"/>
      <stop offset="0.6" stop-color="#858585"/>
      <stop offset="1" stop-color="#303030"/>
    </radialGradient>
    <radialGradient id="${id}-hub-screw" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#a8a8a8"/>
      <stop offset="0.55" stop-color="#444"/>
      <stop offset="1" stop-color="#151515"/>
    </radialGradient>
    <filter id="${id}-hub-blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.4"/>
    </filter>
    <filter id="${id}-hub-soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
    <clipPath id="${id}-hub-brush">
      <path clip-rule="evenodd" d="M ${CX - 14.4} ${CY} a 14.4 14.4 0 1 0 28.8 0 a 14.4 14.4 0 1 0 -28.8 0 Z M ${CX - 7.4} ${CY} a 7.4 7.4 0 1 0 14.8 0 a 7.4 7.4 0 1 0 -14.8 0 Z"/>
    </clipPath>
    <filter id="${id}-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
    <filter id="${id}-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>
  <circle class="bezel" cx="${CX}" cy="${CY}" r="${R_BEZEL}" fill="none" stroke="url(#${id}-bezel)" stroke-width="6"/>
  <circle cx="${CX}" cy="${CY}" r="${R_FACE + 2}" fill="none" stroke="#000" stroke-width="3" opacity="0.9"/>
  <circle class="face" cx="${CX}" cy="${CY}" r="${R_FACE}" fill="url(#${id}-face)"/>
  ${redline}
  <g class="ticks">${marks.join('')}</g>
  <text class="label" x="${CX}" y="122" text-anchor="middle">${esc(o.label.toUpperCase())}</text>
  <text class="readout" x="${CX}" y="286" text-anchor="middle" dominant-baseline="central" style="font-size:${o.readoutSize ?? 58}px"></text>
  <text class="caption" x="${CX}" y="328" text-anchor="middle"></text>
  <g class="needle" transform="rotate(0 ${CX} ${CY})">
    <path class="needle-shadow" d="${needlePath}" transform="translate(2 3)" filter="url(#${id}-shadow)"/>
    <path class="needle-body" d="${needlePath}"/>
  </g>
  ${renderHub(id)}
</svg>`;
}
