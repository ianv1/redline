const ATTRS = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

function svg(body: string): string {
  return `<svg viewBox="0 0 240 100" class="car-line" aria-hidden="true"><g ${ATTRS}>${body}</g></svg>`;
}

function bore(cx: number, cy: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="8.5"/><circle cx="${cx}" cy="${cy}" r="2.5"/>`;
}

export function vee(perBank: number): string {
  const bores: string[] = [];
  for (let i = 0; i < perBank; i++) {
    const x = 44 + ((i + 0.5) * 152) / perBank;
    bores.push(bore(x, 27), bore(x, 73));
  }
  return svg(
    '<rect x="40" y="12" width="160" height="30" rx="8"/><rect x="40" y="58" width="160" height="30" rx="8"/>' +
      '<rect x="70" y="43" width="100" height="14" rx="6"/><path d="M60 50 L70 50"/><path d="M170 50 L180 50"/>' +
      bores.join(''),
  );
}

export function inline(n: number): string {
  const bores: string[] = [];
  for (let i = 0; i < n; i++) bores.push(bore(34 + ((i + 0.5) * 158) / n, 50));
  return svg('<rect x="34" y="30" width="158" height="40" rx="9"/><rect x="42" y="37" width="142" height="26" rx="6"/>' + bores.join(''));
}

export function flat(perSide: number): string {
  const parts: string[] = ['<rect x="104" y="18" width="32" height="64" rx="7"/>'];
  for (let i = 0; i < perSide; i++) {
    const y = 20 + ((i + 0.5) * 60) / perSide;
    parts.push(`<rect x="32" y="${y - 9}" width="72" height="18" rx="9"/><circle cx="42" cy="${y}" r="3"/>`);
    parts.push(`<rect x="136" y="${y - 9}" width="72" height="18" rx="9"/><circle cx="198" cy="${y}" r="3"/>`);
  }
  return svg(parts.join(''));
}

export function electric(): string {
  const fins = [84, 100, 116, 132, 148].map((x) => `<path d="M${x} 36 L${x} 64" opacity="0.6"/>`).join('');
  return svg(
    '<rect x="64" y="28" width="112" height="44" rx="14"/>' +
      fins +
      '<rect x="176" y="45" width="36" height="10" rx="3"/><path d="M212 42 L212 58"/>' +
      '<rect x="96" y="10" width="48" height="18" rx="4"/><path d="M122 12 L115 20 L120 20 L117 26 L125 18 L120 18 Z"/>',
  );
}

export const ENGINE_ART: Record<string, string> = {
  lamborghini: vee(6),
  lfa: vee(5),
  f458: vee(4),
  tesla: electric(),
};

export function engineArt(theme: string): string {
  return ENGINE_ART[theme] ?? inline(4);
}
