const W = 480;
const H = 64;
const PX_PER_DEG = 4;
const CENTRE = W / 2;
const LETTERS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Compass {
  private readonly el: SVGSVGElement;
  private readonly tape: SVGGElement;
  private readonly readout: SVGTextElement;
  private target: number | null = null;
  private pos = 0;
  private known = false;

  constructor(container: HTMLElement) {
    container.innerHTML = render();
    this.el = container.querySelector('svg') as SVGSVGElement;
    this.tape = this.el.querySelector('.tape') as SVGGElement;
    this.readout = this.el.querySelector('.heading') as SVGTextElement;
    this.draw();
  }

  setHeading(deg: number | null | undefined): void {
    if (deg === null || deg === undefined || !Number.isFinite(deg)) return;
    this.target = ((deg % 360) + 360) % 360;
    if (!this.known) {
      this.known = true;
      this.pos = this.target;
      this.el.classList.add('known');
    }
  }

  tick(dt: number): void {
    if (this.target === null) return;
    const delta = ((this.target - this.pos + 540) % 360) - 180;
    this.pos = (this.pos + delta * Math.min(1, dt / 0.3) + 360) % 360;
    this.draw();
  }

  private draw(): void {
    this.tape.setAttribute('transform', `translate(${(-this.pos * PX_PER_DEG).toFixed(2)} 0)`);
    const text = this.known ? `${String(Math.round(this.pos) % 360).padStart(3, '0')}°` : '---';
    if (this.readout.textContent !== text) this.readout.textContent = text;
  }
}

function render(): string {
  const marks: string[] = [];
  for (let deg = -360; deg <= 720; deg += 15) {
    const x = CENTRE + deg * PX_PER_DEG;
    const major = deg % 30 === 0;
    const letter = deg % 45 === 0 ? LETTERS[(((deg / 45) % 8) + 8) % 8] : null;
    const len = letter ? 14 : major ? 10 : 6;
    marks.push(`<line class="ctick${letter ? ' cardinal' : ''}" x1="${x}" y1="8" x2="${x}" y2="${8 + len}"/>`);
    if (letter) {
      marks.push(`<text class="cletter${letter.length === 1 ? ' major' : ''}" x="${x}" y="41" text-anchor="middle">${letter}</text>`);
    } else if (major) {
      marks.push(`<text class="cdeg" x="${x}" y="38" text-anchor="middle">${((deg % 360) + 360) % 360}</text>`);
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Compass heading">
  <defs>
    <linearGradient id="compass-fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.2" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.8" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="compass-mask"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#compass-fade)"/></mask>
  </defs>
  <g mask="url(#compass-mask)"><g class="tape">${marks.join('')}</g></g>
  <path class="lubber" d="M ${CENTRE - 6} 0 L ${CENTRE + 6} 0 L ${CENTRE} 9 Z"/>
  <text class="heading" x="${CENTRE}" y="60" text-anchor="middle">---</text>
</svg>`;
}
