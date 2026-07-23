// The single source of layout truth. Both the interactive HTML view and the
// SVG export are rendered from the output of `computeLayout`, so they always
// look identical.

import calcTree from 'relatives-tree';
import type { FamilyTree, Person } from '../types/koseki';
import { toRelativesNodes, pickRootId } from './transform';

// We separate the *cell* (the grid slot relatives-tree positions) from the
// visible *box*. Making the cell larger than the box leaves generous whitespace
// so marriage links and child drop-lines are clearly visible — the look of a
// conventional family tree, rather than tightly packed blocks.
// Portrait boxes to suit vertical (縦書き) names, with roomy cells so marriage
// links and child drop-lines read clearly — like a conventional 家系図.
export const CELL_W = 118;
export const CELL_H = 236;
export const BOX_W = 64;
export const BOX_H = 152;

// relatives-tree returns coordinates in a grid where a node occupies 2 units,
// so one unit maps to half a cell.
const UNIT_X = CELL_W / 2;
const UNIT_Y = CELL_H / 2;

// Offset to center the visible box inside its cell.
const OFFSET_X = (CELL_W - BOX_W) / 2;
const OFFSET_Y = (CELL_H - BOX_H) / 2;

export interface PositionedNode {
  id: string;
  person: Person;
  /** Top-left of the visible box (centered in its cell), in pixels. */
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

export function computeLayout(
  tree: FamilyTree,
  rootId?: string,
): Layout | LayoutError {
  if (tree.persons.length === 0) {
    return { error: '人物が登録されていません。' };
  }

  const root = rootId ?? pickRootId(tree);
  if (!root) return { error: 'ルートとなる人物を決められませんでした。' };

  const personById = new Map(tree.persons.map((p) => [p.id, p]));
  const nodes = toRelativesNodes(tree);

  let result: ReturnType<typeof calcTree>;
  try {
    result = calcTree(nodes, { rootId: root });
  } catch (e) {
    // relatives-tree throws on inconsistent graphs (e.g. a relation that points
    // to a missing / non-reciprocal node). Surface it instead of crashing.
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `家系図の計算に失敗しました: ${msg}` };
  }

  const positioned: PositionedNode[] = result.nodes
    .filter((n) => personById.has(n.id))
    .map((n) => ({
      id: n.id,
      person: personById.get(n.id)!,
      left: n.left * UNIT_X + OFFSET_X,
      top: n.top * UNIT_Y + OFFSET_Y,
    }));

  // Connectors are drawn on the cell grid (through cell centers), which matches
  // the vertical/horizontal center of each centered box.
  const connectors: Segment[] = result.connectors.map(([x1, y1, x2, y2]) => ({
    x1: x1 * UNIT_X,
    y1: y1 * UNIT_Y,
    x2: x2 * UNIT_X,
    y2: y2 * UNIT_Y,
  }));

  return {
    rootId: root,
    width: result.canvas.width * UNIT_X,
    height: result.canvas.height * UNIT_Y,
    nodes: positioned,
    connectors,
  };
}

export function isLayoutError(l: Layout | LayoutError): l is LayoutError {
  return 'error' in l;
}
