export interface EvReading {
  speed: number;
  max: number;
  unit: 'km/h' | 'mph';
  maxKph: number;
  lastSprintS: number | null;
  bestSprintS: number | null;
}

const W = 420;
const H = 280;
const CX = 210;
const CY = 190;
const R = 150;
const START_DEG = -120;
const SWEEP_DEG = 240;
const ARC_LEN = R * ((SWEEP_DEG * Math.PI) / 180);

export class EvPanel {
  private readonly el: SVGSVGElement;
  private readonly fill: SVGPathElement;
  private readonly digits: SVGTextElement;
  private readonly unit: SVGTextElement;
  private readonly scale: SVGGElement;
  private readonly stats: Record<string, HTMLElement>;
  private frac = 0;
  private target = 0;
  private bootAt = 0;
  private scaleKey = '';

  constructor(container: HTMLElement) {
    container.innerHTML = render();
    this.el = container.querySelector('svg') as SVGSVGElement;
    this.fill = this.el.querySelector('.arc-fill') as SVGPathElement;
    this.digits = this.el.querySelector('.ev-digits') as SVGTextElement;
    this.unit = this.el.querySelector('.ev-unit') as SVGTextElement;
    this.scale = this.el.querySelector('.ev-scale') as SVGGElement;
    this.stats = {};
    for (const s of container.querySelectorAll<HTMLElement>('[data-stat]')) this.stats[s.dataset.stat as string] = s;
    this.draw();
  }

  boot(): void {
    this.bootAt = performance.now();
  }

  update(r: EvReading): void {
    this.target = Math.min(1, Math.max(0, r.speed / r.max));
    this.setScale(r.max, r.unit);
    const digits = String(Math.round(r.speed));
    if (this.digits.textContent !== digits) this.digits.textContent = digits;

    const km = r.unit === 'km/h';
    this.stat('max', 'Top speed', String(Math.round(km ? r.maxKph : r.maxKph * 0.621371)), r.unit);
    const label = km ? '0–100 km/h' : '0–60 mph';
    if (r.lastSprintS !== null) {
      const better = r.bestSprintS !== null && r.bestSprintS < r.lastSprintS ? ` · best ${r.bestSprintS.toFixed(1)}` : '';
      this.stat('sprint', label, r.lastSprintS.toFixed(1), `s${better}`);
    } else if (r.bestSprintS !== null) {
      this.stat('sprint', label, r.bestSprintS.toFixed(1), 's best');
    } else {
      this.stat('sprint', label, '–', '');
    }
  }

  tick(dt: number): void {
    let target = this.target;
    if (this.bootAt) {
      const t = (performance.now() - this.bootAt) / 1000;
      if (t < 1.3) target = t < 0.65 ? t / 0.65 : Math.max(0, 1 - (t - 0.65) / 0.65);
      else this.bootAt = 0;
    }
    this.frac += (target - this.frac) * Math.min(1, dt / 0.14);
    this.draw();
  }

  private draw(): void {
    this.fill.setAttribute('stroke-dashoffset', (ARC_LEN * (1 - this.frac)).toFixed(1));
  }

  private stat(name: string, label: string, value: string, unit: string): void {
    const el = this.stats[name];
    if (!el) return;
    const l = el.querySelector('.stat-label') as HTMLElement;
    const v = el.querySelector('.stat-value') as HTMLElement;
    const u = el.querySelector('.stat-unit') as HTMLElement;
    if (l.textContent !== label) l.textContent = label;
    if (v.textContent !== value) v.textContent = value;
    if (u.textContent !== unit) u.textContent = unit;
  }

  private setScale(max: number, unit: 'km/h' | 'mph'): void {
    const key = `${max}${unit}`;
    if (key === this.scaleKey) return;
    this.scaleKey = key;
    const step = unit === 'km/h' ? 40 : 20;
    const marks: string[] = [];
    for (let v = 0; v <= max; v += step) {
      const deg = START_DEG + (SWEEP_DEG * v) / max;
      const numeral = v % (max / 2) === 0;
      const [x1, y1] = point(deg, R + 9);
      const [x2, y2] = point(deg, R + (numeral ? 17 : 13));
      marks.push(`<line class="etick${numeral ? ' major' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
      if (numeral) {
        const [nx, ny] = point(deg, R + 32);
        marks.push(`<text class="enum" x="${f(nx)}" y="${f(ny)}" text-anchor="middle" dominant-baseline="central">${v}</text>`);
      }
    }
    this.scale.innerHTML = marks.join('');
    this.unit.textContent = unit.toUpperCase();
  }
}

function point(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function f(n: number): string {
  return n.toFixed(2);
}

function render(): string {
  const [sx, sy] = point(START_DEG, R);
  const [ex, ey] = point(START_DEG + SWEEP_DEG, R);
  const arc = `M ${f(sx)} ${f(sy)} A ${R} ${R} 0 1 1 ${f(ex)} ${f(ey)}`;
  const stat = (name: string) =>
    `<div class="stat" data-stat="${name}"><span class="stat-label"></span><span class="stat-line"><span class="stat-value">–</span><span class="stat-unit"></span></span></div>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Speed">
  <path class="arc-track" d="${arc}"/>
  <path class="arc-fill" d="${arc}" stroke-dasharray="${f(ARC_LEN)}" stroke-dashoffset="${f(ARC_LEN)}"/>
  <g class="ev-scale"></g>
  <text class="ev-digits" x="${CX}" y="${CY + 18}" text-anchor="middle">0</text>
  <text class="ev-unit" x="${CX}" y="${CY + 64}" text-anchor="middle">KM/H</text>
</svg>
<div class="ev-stats">${stat('max')}${stat('sprint')}</div>`;
}
