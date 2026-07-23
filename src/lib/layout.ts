// Custom genealogy layout — the single source of layout truth. Both the
// interactive HTML view and the SVG export render from its output.
//
// Approach: build the tree from relative "blocks" and compose them with a
// per-row contour merge so nothing overlaps. This lets us:
//   1. keep blood siblings adjacent and push spouses to the outer side,
//   2. place an in-married spouse's *birth family* locally — parents centered
//      right above the spouse, that spouse's siblings just outboard — instead of
//      dumping it far away,
//   3. draw our own connectors (marriage line + sibling bus + drop lines).
//
// A Block maps person id -> { col, row }. `col` is a (possibly fractional) slot
// index; `row` is the generation. Blocks are merged left-to-right by shifting so
// that, on every shared row, the next block starts clear of the previous one.

import type { FamilyTree, Person } from '../types/koseki';

// Visible box size (portrait, vertical names).
export const BOX_W = 64;
export const BOX_H = 152;

// Grid spacing.
const SLOT_PX = 104; // horizontal distance between adjacent person centers
const ROW_PX = 212; // vertical distance between generations
const GAP = 1; // min slot gap between adjacent blocks on a shared row
const MARGIN = 40;

export interface PositionedNode {
  id: string;
  person: Person;
  left: number;
  top: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Layout {
  rootId: string;
  width: number;
  height: number;
  nodes: PositionedNode[];
  connectors: Segment[];
}

export interface LayoutError {
  error: string;
}

export function isLayoutError(l: Layout | LayoutError): l is LayoutError {
  return 'error' in l;
}

type Cell = { col: number; row: number };
type Block = Map<string, Cell>;

function rowBounds(b: Block): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  for (const { col, row } of b.values()) {
    const cur = m.get(row);
    if (!cur) m.set(row, [col, col]);
    else {
      cur[0] = Math.min(cur[0], col);
      cur[1] = Math.max(cur[1], col);
    }
  }
  return m;
}

function shiftBlock(b: Block, dx: number): Block {
  const n: Block = new Map();
  for (const [id, c] of b) n.set(id, { col: c.col + dx, row: c.row });
  return n;
}

/** Minimum dx so `next` clears `base` on every shared row (may be negative). */
function requiredShift(base: Block, next: Block): number {
  const bb = rowBounds(base);
  const nb = rowBounds(next);
  let need = -Infinity;
  for (const [row, [nmin]] of nb) {
    const b = bb.get(row);
    if (b) need = Math.max(need, b[1] + GAP - nmin);
  }
  return need === -Infinity ? 0 : need;
}

function union(base: Block, add: Block): Block {
  const m: Block = new Map(base);
  for (const [id, c] of add) m.set(id, c);
  return m;
}

/** Place `next` fully to the right of `base` on shared rows. */
function stackRight(base: Block | null, next: Block): Block {
  if (!base) return next;
  return union(base, shiftBlock(next, requiredShift(base, next)));
}

/** Attach `add` keeping its current (aligned) position when possible; only push
 * right if it would otherwise overlap `base`. Preserves in-law alignment. */
function attach(base: Block, add: Block): Block {
  return union(base, shiftBlock(add, Math.max(0, requiredShift(base, add))));
}

export function computeLayout(tree: FamilyTree, rootId?: string): Layout | LayoutError {
  if (tree.persons.length === 0) return { error: '人物が登録されていません。' };

  const personById = new Map(tree.persons.map((p) => [p.id, p]));
  const gen = assignGenerations(tree);
  const parentUnionOf = (id: string) => tree.unions.find((u) => u.childIds.includes(id));
  const unionsAsPartner = (id: string) => tree.unions.filter((u) => u.partnerIds.includes(id));
  const birthKey = (id: string) => personById.get(id)?.birth?.iso || '9999';

  const visited = new Set<string>();

  const hasUnvisitedSpouse = (id: string) =>
    unionsAsPartner(id).some((u) => u.partnerIds.some((pid) => pid !== id && !visited.has(pid)));

  // Unmarried siblings in the middle, married ones toward the ends (spouse then
  // sits outside, not between blood siblings).
  const orderChildren = (ids: string[]): string[] => {
    const kids = ids.filter((id) => !visited.has(id));
    const byBirth = (a: string, b: string) =>
      birthKey(a) < birthKey(b) ? -1 : birthKey(a) > birthKey(b) ? 1 : 0;
    const married = kids.filter(hasUnvisitedSpouse).sort(byBirth);
    const single = kids.filter((id) => !hasUnvisitedSpouse(id)).sort(byBirth);
    const leftM = married.slice(0, Math.floor(married.length / 2));
    const rightM = married.slice(Math.floor(married.length / 2));
    return [...leftM, ...single, ...rightM];
  };

  // Build a couple + its descendants + each spouse's birth family.
  const buildCouple = (anchorId: string, g: number): Block => {
    visited.add(anchorId);
    const spouses: string[] = [];
    for (const u of unionsAsPartner(anchorId))
      for (const pid of u.partnerIds)
        if (pid !== anchorId && !visited.has(pid)) {
          visited.add(pid);
          spouses.push(pid);
        }
    const members = [anchorId, ...spouses];

    const childIds = orderChildren(unionsAsPartner(anchorId).flatMap((u) => u.childIds));
    let childrenBlock: Block | null = null;
    for (const c of childIds) childrenBlock = stackRight(childrenBlock, buildCouple(c, g + 1));

    let block: Block = new Map();
    let coupleLeft: number;
    if (childrenBlock) {
      // Center over *our own* children only (their couple columns), not the
      // whole row — in-law relatives merged in must not drag the couple sideways.
      const childCols = childIds.map((c) => childrenBlock!.get(c)!.col);
      const center = (Math.min(...childCols) + Math.max(...childCols)) / 2;
      coupleLeft = center - (members.length - 1) / 2;
      block = new Map(childrenBlock);
    } else {
      coupleLeft = 0;
    }
    members.forEach((m, i) => block.set(m, { col: coupleLeft + i, row: g }));

    // Attach each spouse's birth family on the outer (right) side, aligned so
    // its reserved spouse column lands on the spouse.
    for (const sp of spouses) {
      const inlaw = buildInLaw(sp, g);
      if (inlaw) {
        const spCol = block.get(sp)!.col;
        block = attach(block, shiftBlock(inlaw.block, spCol - inlaw.spouseCol));
      }
    }
    return block;
  };

  // Birth family of an in-married spouse (excludes the spouse). Returns the block
  // plus the column the spouse should occupy, so the caller can align it.
  const buildInLaw = (spouseId: string, spouseGen: number): { block: Block; spouseCol: number } | null => {
    const pu = parentUnionOf(spouseId);
    if (!pu) return null;

    const sibIds = orderChildren(pu.childIds.filter((id) => id !== spouseId));
    let sibsBlock: Block | null = null;
    for (const s of sibIds) sibsBlock = stackRight(sibsBlock, buildCouple(s, spouseGen));

    // The spouse sits just left of their siblings (adjacent to the main couple).
    let spouseCol = 0;
    let childMin = 0;
    let childMax = 0;
    let block: Block = new Map();
    if (sibsBlock) {
      const sb = rowBounds(sibsBlock).get(spouseGen) ?? [0, 0];
      spouseCol = sb[0] - 1;
      childMin = spouseCol;
      childMax = sb[1];
      block = new Map(sibsBlock);
    }

    // Parents centered above [spouse .. siblings]; recurse further up.
    const parentIds = pu.partnerIds.filter((id) => !visited.has(id));
    if (parentIds.length > 0) {
      parentIds.forEach((id) => visited.add(id));
      const center = (childMin + childMax) / 2;
      const pLeft = center - (parentIds.length - 1) / 2;
      parentIds.forEach((id, i) => block.set(id, { col: pLeft + i, row: spouseGen - 1 }));
      for (const pid of parentIds) {
        const up = buildInLaw(pid, spouseGen - 1);
        if (up) block = attach(block, shiftBlock(up.block, block.get(pid)!.col - up.spouseCol));
      }
    }

    if (block.size === 0) return null;
    return { block, spouseCol };
  };

  // Roots = people with no parents; main bloodline (most descendants) first.
  const descendantCount = (id: string): number => {
    const seen = new Set<string>();
    const walk = (pid: string) => {
      for (const u of tree.unions)
        if (u.partnerIds.includes(pid))
          for (const c of u.childIds)
            if (!seen.has(c)) {
              seen.add(c);
              walk(c);
            }
    };
    walk(id);
    return seen.size;
  };
  const roots = tree.persons
    .filter((p) => !parentUnionOf(p.id))
    .map((p) => p.id)
    .sort((a, b) => descendantCount(b) - descendantCount(a));
  const startRoots =
    rootId && !parentUnionOf(rootId) ? [rootId, ...roots.filter((r) => r !== rootId)] : roots;

  let full: Block | null = null;
  for (const r of startRoots) if (!visited.has(r)) full = stackRight(full, buildCouple(r, gen.get(r) ?? 0));
  full = full ?? new Map();

  // Safety: anyone still unplaced (cycles / odd data) gets appended.
  for (const p of tree.persons) {
    if (!full.has(p.id)) {
      const right = full.size ? Math.max(...[...full.values()].map((c) => c.col)) : -1;
      full.set(p.id, { col: right + 1 + GAP, row: gen.get(p.id) ?? 0 });
    }
  }

  // ---- slots/generations -> pixels ---------------------------------------
  const cols = [...full.values()].map((c) => c.col);
  const minCol = Math.min(...cols);
  const minRow = Math.min(...[...full.values()].map((c) => c.row));

  const centerX = (id: string) => (full!.get(id)!.col - minCol) * SLOT_PX + BOX_W / 2 + MARGIN;
  const topY = (id: string) => (full!.get(id)!.row - minRow) * ROW_PX + MARGIN;

  const nodes: PositionedNode[] = tree.persons.map((p) => ({
    id: p.id,
    person: p,
    left: centerX(p.id) - BOX_W / 2,
    top: topY(p.id),
  }));

  const connectors = buildConnectors(tree, centerX, topY);
  const maxX = Math.max(...nodes.map((n) => n.left + BOX_W));
  const maxY = Math.max(...nodes.map((n) => n.top + BOX_H));

  return {
    rootId: startRoots[0] ?? tree.persons[0].id,
    width: maxX + MARGIN,
    height: maxY + MARGIN,
    nodes,
    connectors,
  };
}

function assignGenerations(tree: FamilyTree): Map<string, number> {
  const gen = new Map<string, number>();
  const hasParent = (id: string) => tree.unions.some((u) => u.childIds.includes(id));
  for (const p of tree.persons) if (!hasParent(p.id)) gen.set(p.id, 0);
  if (gen.size === 0 && tree.persons.length > 0) gen.set(tree.persons[0].id, 0);

  for (let iter = 0; iter <= tree.persons.length; iter++) {
    let changed = false;
    for (const u of tree.unions) {
      const known = u.partnerIds.map((id) => gen.get(id)).filter((g): g is number => g != null);
      if (known.length === 0) continue;
      const g = Math.max(...known);
      for (const id of u.partnerIds)
        if (gen.get(id) !== g) {
          gen.set(id, g);
          changed = true;
        }
      for (const c of u.childIds)
        if ((gen.get(c) ?? -Infinity) < g + 1) {
          gen.set(c, g + 1);
          changed = true;
        }
    }
    if (!changed) break;
  }
  for (const p of tree.persons) if (!gen.has(p.id)) gen.set(p.id, 0);
  return gen;
}

function buildConnectors(
  tree: FamilyTree,
  centerX: (id: string) => number,
  topY: (id: string) => number,
): Segment[] {
  const segs: Segment[] = [];
  const midY = (id: string) => topY(id) + BOX_H / 2;
  const bottomY = (id: string) => topY(id) + BOX_H;

  for (const u of tree.unions) {
    const partners = u.partnerIds;
    if (partners.length >= 2) {
      const sorted = [...partners].sort((a, b) => centerX(a) - centerX(b));
      for (let i = 0; i < sorted.length - 1; i++)
        segs.push({ x1: centerX(sorted[i]), y1: midY(sorted[i]), x2: centerX(sorted[i + 1]), y2: midY(sorted[i + 1]) });
    }

    if (u.childIds.length === 0) continue;

    const coupleMidX =
      partners.length > 0
        ? partners.reduce((s, id) => s + centerX(id), 0) / partners.length
        : centerX(u.childIds[0]);
    const parentBottom = partners.length > 0 ? Math.max(...partners.map(bottomY)) : topY(u.childIds[0]) - 30;
    const childTop = Math.min(...u.childIds.map(topY));
    const busY = (parentBottom + childTop) / 2;

    segs.push({ x1: coupleMidX, y1: parentBottom, x2: coupleMidX, y2: busY });
    const childXs = u.childIds.map(centerX);
    segs.push({ x1: Math.min(coupleMidX, ...childXs), y1: busY, x2: Math.max(coupleMidX, ...childXs), y2: busY });
    for (const c of u.childIds) segs.push({ x1: centerX(c), y1: busY, x2: centerX(c), y2: topY(c) });
  }
  return segs;
}
