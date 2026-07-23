import type { WheelEvent } from 'react';
import { BOX_W, BOX_H, type Layout } from '../lib/layout';
import { fullName, formatDate, type Person } from '../types/koseki';

/** One name part: kanji with ruby furigana, or — when no kanji is recorded —
 * the reading shown on its own in a muted "kana-only" style so it's clearly
 * just a reading. */
function NamePart({ kanji, kana }: { kanji?: string; kana?: string }) {
  if (kanji) {
    return (
      <ruby>
        {kanji}
        {kana && <rt>{kana}</rt>}
      </ruby>
    );
  }
  if (kana) return <span className="kana-only">{kana}</span>;
  return null;
}

/** Name with furigana as ruby (renders correctly in vertical writing mode). */
function NameWithRuby({ person }: { person: Person }) {
  const { familyName, givenName, familyNameKana, givenNameKana } = person;
  if (!familyName && !givenName && !familyNameKana && !givenNameKana) {
    return <>{fullName(person)}</>;
  }
  return (
    <>
      <NamePart kanji={familyName} kana={familyNameKana} />
      <NamePart kanji={givenName} kana={givenNameKana} />
    </>
  );
}

interface Props {
  layout: Layout;
  zoom: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  onZoom: (delta: number) => void;
  onAddParent: (id: string) => void;
  onAddSpouse: (id: string) => void;
  onAddSibling: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  canAddParent: (id: string) => boolean;
}

const PAD = 40;
const BTN = 24; // add-button height
const PILL = 40; // add-button width

/**
 * Interactive HTML view. Rendered from the same Layout the SVG export uses.
 * The selected person gets inline "+" buttons (親 above, 配偶者 left/right,
 * 子 below) so the tree can be grown directly on the canvas.
 */
export function TreeView(props: Props) {
  const { layout, zoom, selectedId, onSelect, onZoom, canAddParent } = props;
  const width = layout.width + PAD * 2;
  const height = layout.height + PAD * 2;

  const handleWheel = (e: WheelEvent) => {
    // Ctrl/⌘ + wheel = zoom (matches typical map/diagram UX).
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onZoom(e.deltaY < 0 ? 0.1 : -0.1);
    }
  };

  const selected = layout.nodes.find((n) => n.id === selectedId);

  return (
    <div className="tree-scroll" onWheel={handleWheel}>
      <div className="tree-zoom" style={{ width: width * zoom, height: height * zoom }}>
        <div
          className="tree-canvas"
          style={{ width, height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <svg className="tree-connectors" width={width} height={height}>
            {layout.connectors.map((c, i) => (
              <line key={i} x1={c.x1 + PAD} y1={c.y1 + PAD} x2={c.x2 + PAD} y2={c.y2 + PAD} />
            ))}
          </svg>

          {layout.nodes.map((n) => {
            const p = n.person;
            const birth = formatDate(p.birth);
            const death = formatDate(p.death);
            return (
              <button
                key={n.id}
                type="button"
                className={`node sex-${p.sex}${n.id === selectedId ? ' selected' : ''}`}
                style={{ left: n.left + PAD, top: n.top + PAD, width: BOX_W, height: BOX_H }}
                onClick={() => onSelect(n.id)}
              >
                {p.relationInRegister && <span className="node-rel">{p.relationInRegister}</span>}
                <span className="node-name"><NameWithRuby person={p} /></span>
                {(birth || death) && (
                  <span className="node-dates">
                    {birth && <span>{birth}</span>}
                    {death && <span>没{death}</span>}
                  </span>
                )}
              </button>
            );
          })}

          {selected && (
            <>
              <AddButtons
                left={selected.left + PAD}
                top={selected.top + PAD}
                showParent={canAddParent(selected.id)}
                onParent={() => props.onAddParent(selected.id)}
                onSpouse={() => props.onAddSpouse(selected.id)}
                onSibling={() => props.onAddSibling(selected.id)}
                onChild={() => props.onAddChild(selected.id)}
              />
              <button
                type="button"
                className="node-delete"
                title="この人物を削除"
                aria-label="この人物を削除"
                style={{ left: selected.left + PAD + BOX_W - 11, top: selected.top + PAD - 11 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`「${fullName(selected.person)}」を削除しますか？`)) {
                    props.onDelete(selected.id);
                  }
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddButtons(props: {
  left: number;
  top: number;
  showParent: boolean;
  onParent: () => void;
  onSpouse: () => void;
  onSibling: () => void;
  onChild: () => void;
}) {
  const { left, top } = props;
  const cx = left + BOX_W / 2 - PILL / 2;
  const cy = top + BOX_H / 2 - BTN / 2;
  return (
    <>
      {props.showParent && (
        <AddBtn text="親" label="親を追加" style={{ left: cx, top: top - BTN - 6 }} onClick={props.onParent} />
      )}
      {/* left = sibling, right = spouse (the two "side" patterns) */}
      <AddBtn text="兄弟" label="兄弟姉妹を追加" style={{ left: left - PILL - 6, top: cy }} onClick={props.onSibling} />
      <AddBtn text="配偶" label="配偶者を追加" style={{ left: left + BOX_W + 6, top: cy }} onClick={props.onSpouse} />
      <AddBtn text="子" label="子を追加" style={{ left: cx, top: top + BOX_H + 6 }} onClick={props.onChild} />
    </>
  );
}

function AddBtn(props: {
  text: string;
  label: string;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="add-btn"
      title={props.label}
      aria-label={props.label}
      style={{ ...props.style, height: BTN }}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      ＋{props.text}
    </button>
  );
}
