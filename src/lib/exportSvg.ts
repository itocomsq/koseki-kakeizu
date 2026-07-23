// Render a Layout to a standalone, self-contained SVG string (the "きれいな一枚絵").
// No external CSS/fonts: everything needed is inlined so a downloaded .svg opens
// correctly anywhere.

import type { FamilyTree } from '../types/koseki';
import { fullName, formatDate } from '../types/koseki';
import { BOX_W, BOX_H, type Layout } from './layout';

const PAD = 40;

// Clean "nameplate" look: white box with a thin, gender-tinted border and a
// slightly bolder top edge — reads as a conventional family-tree chart.
const STROKE = {
  male: '#4a86d6',
  female: '#d06699',
  unknown: '#9aa0a6',
};
const FILL = {
  male: '#e8f1fb',
  female: '#fbeaf0',
  unknown: '#eef0f2',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportSvg(layout: Layout, tree: FamilyTree): string {
  const w = layout.width + PAD * 2;
  const h = layout.height + PAD * 2;

  const lines = layout.connectors
    .map(
      (c) =>
        `<line x1="${(c.x1 + PAD).toFixed(1)}" y1="${(c.y1 + PAD).toFixed(1)}" ` +
        `x2="${(c.x2 + PAD).toFixed(1)}" y2="${(c.y2 + PAD).toFixed(1)}" />`,
    )
    .join('\n    ');

  const boxes = layout.nodes
    .map((n) => {
      const p = n.person;
      const x = n.left + PAD;
      const y = n.top + PAD;
      const sex = p.sex;
      const name = esc(fullName(p));
      const birth = esc(formatDate(p.birth));
      const death = esc(formatDate(p.death));
      const rel = p.relationInRegister ? esc(p.relationInRegister) : '';

      const cx = x + BOX_W / 2;
      // Vertical (縦書き) name, centered in the box. 続柄 sits at the top, dates
      // stack horizontally near the bottom.
      const dateLines: string[] = [];
      if (birth) dateLines.push(birth);
      if (death) dateLines.push(`没${death}`);
      const dateSvg = dateLines
        .map(
          (t, i) =>
            `<text x="${cx.toFixed(1)}" y="${(y + BOX_H - 8 - (dateLines.length - 1 - i) * 12).toFixed(1)}" class="date" text-anchor="middle">${t}</text>`,
        )
        .join('\n      ');

      return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${BOX_W}" height="${BOX_H}" rx="7"
        fill="${FILL[sex]}" stroke="${STROKE[sex]}" stroke-width="1.25" />
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${BOX_W}" height="4" rx="2" fill="${STROKE[sex]}" />
      ${rel ? `<text x="${cx.toFixed(1)}" y="${(y + 18).toFixed(1)}" class="rel" text-anchor="middle">${rel}</text>` : ''}
      <text x="${cx.toFixed(1)}" y="${(y + 26).toFixed(1)}" class="name">${name}</text>
      ${dateSvg}
    </g>`;
    })
    .join('\n    ');

  const title = tree.meta?.title ? esc(tree.meta.title) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" font-family="'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif">
  <style>
    .name { font-size: 18px; font-weight: 600; fill: #1a1a1a; writing-mode: vertical-rl; letter-spacing: 1px; }
    .date { font-size: 10px; fill: #555; }
    .rel  { font-size: 10px; fill: #888; }
    line  { stroke: #9aa0a6; stroke-width: 1.5; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff" />
  ${title ? `<text x="${PAD}" y="${(PAD - 8).toFixed(0)}" font-size="16" font-weight="700" fill="#333">${title}</text>` : ''}
  <g>
    ${lines}
  </g>
  <g>
    ${boxes}
  </g>
</svg>`;
}
