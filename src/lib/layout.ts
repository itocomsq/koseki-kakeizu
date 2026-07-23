// Custom genealogy layout — the single source of layout truth. Both the
// interactive HTML view and the SVG export render from its output.
//
// Why custom (instead of a library): we need control over three things a
// descendants-only layout can't give us —
//   1. spouses placed on the *outer* side so blood siblings stay grouped
//      (married siblings are pushed toward the ends of the sibling row),
//   2. an in-married spouse's own birth family (parents / siblings) still
//      getting drawn,
//   3. connectors we draw ourselves (marriage line + sibling bus + drop lines)
//      for a conventional 家系図 look.
//
// Algorithm: a Reingold–Tilford-style pass over the descendant forest. Leaves
// take the next free horizontal slot; a couple is centered over its children.

import type { FamilyTree, Person } from '../types/koseki';

// Visible box size (portrait, vertical names).
export const BOX_W = 64;
export const BOX_H = 152;

// Grid spacing.
const SLOT_PX = 104; // horizontal distance between adjacent person centers
const ROW_PX = 212; // vertical distance between generations
const SIB_GAP = 0.55; // extra slots between sibling subtrees
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

// ---- generation assignment ------------------------------------------------

function assignGenerations(tree: FamilyTree): Map<string, number> {
  const gen = new Map<string, number>();
  const hasParent = (id: string) => tree.unions.some((u) => u.childIds.includes(id));

  // Seed: people with no recorded parents start at generation 0.
  for (const p of tree.persons) if (!hasParent(p.id)) gen.set(p.id, 0);
  if (gen.size === 0 && tree.persons.length > 0) gen.set(tree.persons[0].id, 0);

  // Relax constraints: partners share a generation; children sit one below.
  // Bounded iterations keep it safe against cycles.
  for (let iter = 0; iter <= tree.persons.length; iter++) {
    let changed = false;
    for (const u of tree.unions) {
      const known = u.partnerIds.map((id) => gen.get(id)).filter((g): g is number => g != null);
      if (known.length === 0) continue;
      const g = Math.max(...known);
      for (const id of u.partnerIds) {
        if (gen.get(id) !== g) {
          gen.set(id, g);
          changed = true;
        }
      }
      for (const c of u.childIds) {
        if ((gen.get(c) ?? -Infinity) < g + 1) {
          gen.set(c, g + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  for (const p of tree.persons) if (!gen.has(p.id)) gen.set(p.id, 0);
  return gen;
}

// ---- main layout ----------------------------------------------------------

export function computeLayout(tree: FamilyTree, rootId?: string): Layout | LayoutError {
  if (tree.persons.length === 0) return { error: '人物が登録されていません。' };

  const personById = new Map(tree.persons.map((p) => [p.id, p]));
  const gen = assignGenerations(tree);

  const parentUnionOf = (id: string) => tree.unions.find((u) => u.childIds.includes(id));
  const unionsAsPartner = (id: string) => tree.unions.filter((u) => u.partnerIds.includes(id));

  const birthKey = (id: string) => personById.get(id)?.birth?.iso || '9999';

  const slot = new Map<string, number>(); // person id -> horizontal slot (float)
  const visited = new Set<string>();
  let cursor = 0;

  // Order siblings so unmarried ones stay in the middle and married ones move to
  // the ends (their spouse then sits on the outside, not between siblings).
  const orderChildren = (ids: string[]): string[] => {
    const kids = ids.filter((id) => !visited.has(id));
    const hasSpouse = (id: string) =>
      unionsAsPartner(id).some((u) => u.partnerIds.some((pid) => pid !== id && !visited.has(pid)));
    const byBirth = (a: string, b: string) => (birthKey(a) < birthKey(b) ? -1 : birthKey(a) > birthKey(b) ? 1 : 0);
    const married = kids.filter(hasSpouse).sort(byBirth);
    const single = kids.filter((id) => !hasSpouse(id)).sort(byBirth);
    const leftMarried = married.slice(0, Math.floor(married.length / 2));
    const rightMarried = married.slice(Math.floor(married.length / 2));
    return [...leftMarried, ...single, ...rightMarried];
  };

  interface Extent {
    left: number;
    center: number;
    right: number;
  }

  const layoutSubtree = (anchorId: string, g: number): Extent => {
    visited.add(anchorId);

    // Spouses drawn adjacent to the anchor (to the right).
    const spouses: string[] = [];
    for (const u of unionsAsPartner(anchorId)) {
      for (const pid of u.partnerIds) {
        if (pid !== anchorId && !visited.has(pid)) {
          visited.add(pid);
          spouses.push(pid);
        }
      }
    }
    const members = [anchorId, ...spouses];
    const unitW = members.length;

    const childIds = orderChildren(
      unionsAsPartner(anchorId).flatMap((u) => u.childIds),
    );

    if (childIds.length === 0) {
      const left = cursor;
      members.forEach((m, i) => slot.set(m, left + i));
      const right = left + unitW - 1;
      cursor = right + 1 + SIB_GAP;
      return { left, center: (left + right) / 2, right };
    }

    const childExtents = childIds.map((c) => layoutSubtree(c, g + 1));
    const kidsCenter =
      (childExtents[0].center + childExtents[childExtents.length - 1].center) / 2;
    const uLeft = kidsCenter - (unitW - 1) / 2;
    members.forEach((m, i) => slot.set(m, uLeft + i));
    const uRight = uLeft + unitW - 1;
    cursor = Math.max(cursor, uRight + 1 + SIB_GAP);
    return {
      left: Math.min(uLeft, childExtents[0].left),
      center: kidsCenter,
      right: Math.max(uRight, childExtents[childExtents.length - 1].right),
    };
  };

  // Process roots (no parents), main bloodline first (most descendants).
  const descendantCount = (id: string): number => {
    const seen = new Set<string>();
    const walk = (pid: string) => {
      for (const u of tree.unions) {
        if (!u.partnerIds.includes(pid)) continue;
        for (const c of u.childIds)
          if (!seen.has(c)) {
            seen.add(c);
            walk(c);
          }
      }
    };
    walk(id);
    return seen.size;
  };

  const roots = tree.persons
    .filter((p) => !parentUnionOf(p.id))
    .map((p) => p.id)
    .sort((a, b) => descendantCount(b) - descendantCount(a));

  const startRoots = rootId && !parentUnionOf(rootId) ? [rootId, ...roots.filter((r) => r !== rootId)] : roots;
  for (const r of startRoots) if (!visited.has(r)) layoutSubtree(r, gen.get(r) ?? 0);

  // Safety: place anyone left (cycles / odd data) so nothing is dropped.
  for (const p of tree.persons) {
    if (!slot.has(p.id)) {
      slot.set(p.id, cursor);
      cursor += 1 + SIB_GAP;
    }
  }

  // ---- convert slots/generations to pixels --------------------------------
  const minSlot = Math.min(...[...slot.values()]);
  const minGen = Math.min(...tree.persons.map((p) => gen.get(p.id) ?? 0));

  const centerX = (id: string) => (slot.get(id)! - minSlot) * SLOT_PX + BOX_W / 2 + MARGIN;
  const topY = (id: string) => ((gen.get(id) ?? 0) - minGen) * ROW_PX + MARGIN;

  const nodes: PositionedNode[] = tree.persons.map((p) => ({
    id: p.id,
    person: p,
    left: centerX(p.id) - BOX_W / 2,
    top: topY(p.id),
  }));

  const connectors = buildConnectors(tree, gen, centerX, topY);

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

function buildConnectors(
  tree: FamilyTree,
  _gen: Map<string, number>,
  centerX: (id: string) => number,
  topY: (id: string) => number,
): Segment[] {
  const segs: Segment[] = [];
  const midY = (id: string) => topY(id) + BOX_H / 2;
  const bottomY = (id: string) => topY(id) + BOX_H;

  for (const u of tree.unions) {
    const partners = u.partnerIds.filter((id) => centerX(id) != null);
    // Marriage line between adjacent partners.
    if (partners.length >= 2) {
      const sorted = [...partners].sort((a, b) => centerX(a) - centerX(b));
      for (let i = 0; i < sorted.length - 1; i++) {
        segs.push({ x1: centerX(sorted[i]), y1: midY(sorted[i]), x2: centerX(sorted[i + 1]), y2: midY(sorted[i + 1]) });
      }
    }

    if (u.childIds.length === 0) continue;

    // Couple midpoint (between partners), drop to the sibling bus, then to kids.
    const coupleMidX =
      partners.length > 0
        ? partners.reduce((s, id) => s + centerX(id), 0) / partners.length
        : centerX(u.childIds[0]);
    const parentBottom = partners.length > 0 ? Math.max(...partners.map(bottomY)) : topY(u.childIds[0]) - 30;
    const childTop = Math.min(...u.childIds.map(topY));
    const busY = (parentBottom + childTop) / 2;

    // vertical from couple down to bus
    segs.push({ x1: coupleMidX, y1: parentBottom, x2: coupleMidX, y2: busY });

    // horizontal bus across children
    const childXs = u.childIds.map(centerX);
    segs.push({ x1: Math.min(coupleMidX, ...childXs), y1: busY, x2: Math.max(coupleMidX, ...childXs), y2: busY });

    // vertical from bus down to each child
    for (const c of u.childIds) segs.push({ x1: centerX(c), y1: busY, x2: centerX(c), y2: topY(c) });
  }

  return segs;
}
