import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { groupEgoEdges } from '../src/client/egoNetwork';
import { colorForGeneration, legibleTextColor } from '../src/client/generations';
import { arcPath, barSegments, layoutSageArcs, shortGenLabel } from '../src/client/sageArcLayout';

const SCRATCH =
  '/private/tmp/claude-501/-Users-shaunie-Documents-Code-talmud/90ad28f9-f2d6-4821-9726-dec63ddcf83d/scratchpad';
const KIND_COLOR: Record<string, string> = {
  opposes: '#b91c1c',
  'responds-to': '#666',
  resolves: '#15803d',
  cites: '#475569',
  supports: '#0891b2',
};

function render(file: string, out: string, expanded: string | null) {
  const wire = JSON.parse(readFileSync(`${SCRATCH}/${file}`, 'utf8'));
  const rows = groupEgoEdges(wire.edges);
  const l = layoutSageArcs(wire.node.generation, rows, expanded);
  const anyExp = l.groups.some((g) => g.expanded && g.dots.length > 0);
  const axisY = 10 + Math.max(l.maxAbove, 26) + 12;
  const labelsY = axisY + l.maxBelow + (anyExp ? 62 : 0) + 14;
  const barsY = labelsY + 15;
  const H = barsY + 22 + 8;
  const maxT = Math.max(...l.groups.map((g) => g.total), 1);
  const p: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.width} ${H}" width="${l.width}" height="${H}" style="background:#fff" font-family="sans-serif">`,
  ];
  for (const g of l.groups)
    if (g.expanded && !l.autoExpanded && g.dots.length)
      p.push(
        `<rect x="${g.x}" y="14" width="${g.width}" height="${axisY + l.maxBelow - 10}" rx="10" fill="#8a6d3b" opacity="0.06"/>`,
      );
  for (const a of l.edges)
    p.push(
      `<path d="${arcPath(a, axisY)}" fill="none" stroke="${colorForGeneration(a.gen)}" stroke-width="${a.stroke}" stroke-linecap="round" opacity="${a.kind === 'trunk' ? 0.75 : 0.55}"/>`,
    );
  p.push(`<line x1="0" x2="${l.width}" y1="${axisY}" y2="${axisY}" stroke="#c9c2b2"/>`);
  for (const g of l.groups) {
    p.push(`<line x1="${g.x}" x2="${g.x}" y1="${axisY - 4}" y2="${axisY + 4}" stroke="#c9c2b2"/>`);
    const lbl =
      shortGenLabel(g.gen, false) +
      (!l.autoExpanded && g.partnerCount ? (g.expanded ? ' ×' : ` (${g.partnerCount})`) : '');
    p.push(
      `<text x="${g.x + g.width / 2}" y="${labelsY}" font-size="9.5" fill="#8a6d3b" text-anchor="middle">${lbl}</text>`,
    );
    if (g.pill) {
      p.push(
        `<circle cx="${g.pill.x}" cy="${axisY}" r="${g.pill.r}" fill="${colorForGeneration(g.gen)}" stroke="#fff" stroke-width="2"/>`,
      );
      p.push(
        `<text x="${g.pill.x}" y="${axisY + 3}" font-size="8.5" font-weight="700" fill="${legibleTextColor(colorForGeneration(g.gen))}" text-anchor="middle">${g.pill.partnerCount}</text>`,
      );
    }
    for (const d of g.dots) {
      p.push(
        `<circle cx="${d.x}" cy="${axisY}" r="${d.r}" fill="${colorForGeneration(d.row.other.generation)}" stroke="#fff" stroke-width="2"/>`,
      );
      const nm =
        d.row.other.name.length > 22 ? d.row.other.name.slice(0, 21) + '…' : d.row.other.name;
      p.push(
        `<text transform="rotate(40 ${d.x} ${axisY + l.maxBelow + 10})" x="${d.x}" y="${axisY + l.maxBelow + 10}" font-size="9" fill="#555" text-anchor="start" style="paint-order:stroke;stroke:#fff;stroke-width:3px">${nm}</text>`,
      );
    }
    if (g.total > 0) {
      const totalW = Math.max(0, g.width - 16) * (g.total / maxT);
      const x0 = g.x + g.width / 2 - totalW / 2;
      for (const seg of barSegments(g.byKind, g.total, totalW))
        p.push(
          `<rect x="${x0 + seg.x}" y="${barsY}" width="${seg.w}" height="7" rx="2" fill="${KIND_COLOR[seg.kind] ?? '#999'}"/>`,
        );
      p.push(
        `<text x="${g.x + g.width / 2}" y="${barsY + 17}" font-size="8.5" fill="#a89e8a" text-anchor="middle">×${g.total}</text>`,
      );
    }
  }
  p.push(
    `<circle cx="${l.center.x}" cy="${axisY}" r="${l.center.r}" fill="${colorForGeneration(wire.node.generation)}" stroke="#fff" stroke-width="2"/>`,
  );
  p.push(
    `<text x="${l.center.x}" y="${axisY - l.center.r - 5}" font-size="10" font-weight="700" fill="#333" text-anchor="middle" style="paint-order:stroke;stroke:#fff;stroke-width:3px">${wire.node.name}</text>`,
  );
  p.push('</svg>');
  writeFileSync(`${SCRATCH}/${out}`, p.join('\n'));
  console.log(`${out}: ${l.width}x${H} edges=${l.edges.length}`);
}

it('renders previews', () => {
  render('rava-ego.json', 'trunks-l1.svg', null);
  render('rava-ego.json', 'trunks-l2.svg', 'amora-bavel-2');
  render('small-ego.json', 'trunks-small.svg', null);
});
