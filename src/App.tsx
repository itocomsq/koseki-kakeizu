import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import './App.css';
import type { FamilyTree, Union } from './types/koseki';
import { emptyTree } from './types/koseki';
import { sampleTree } from './data/sample';
import { computeLayout, isLayoutError } from './lib/layout';
import { exportSvg } from './lib/exportSvg';
import { exportJson, parseTree, downloadText } from './lib/io';
import * as ops from './lib/ops';
import type { EditorActions } from './lib/actions';
import { TreeView } from './components/TreeView';
import { Editor } from './components/Editor';

const STORAGE_KEY = 'koseki-kakeizu:tree';

function loadInitial(): FamilyTree {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const res = parseTree(raw);
      if (res.ok) return res.tree;
    }
  } catch {
    /* ignore */
  }
  return sampleTree;
}

export default function App() {
  const [tree, setTree] = useState<FamilyTree>(loadInitial);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [editorWidth, setEditorWidth] = useState(420);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, exportJson(tree));
    } catch {
      /* quota / private mode — ignore */
    }
  }, [tree]);

  const layout = useMemo(() => computeLayout(tree), [tree]);

  const notify = (msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const applyNew = (result: ops.TreeAndId) => {
    setTree(result.tree);
    setSelectedId(result.newId);
  };

  const actions: EditorActions = {
    updatePerson: (id, patch) => setTree(ops.updatePerson(tree, id, patch)),
    deletePerson: (id) => {
      setTree(ops.deletePerson(tree, id));
      if (selectedId === id) setSelectedId(undefined);
    },
    addStandalone: () => applyNew(ops.addStandalone(tree)),
    addParent: (id) => applyNew(ops.addNewParent(tree, id)),
    addSpouse: (id) => applyNew(ops.addNewSpouse(tree, id)),
    addSibling: (id) => applyNew(ops.addNewSibling(tree, id)),
    addChild: (id, unionId) => applyNew(ops.addNewChild(tree, id, unionId)),
    canAddParent: (id) => ops.canAddParent(tree, id),
    linkSpouse: (id, spouseId) => setTree(ops.linkExistingSpouse(tree, id, spouseId)),
    linkChild: (unionId, childId) => setTree(ops.linkExistingChild(tree, unionId, childId)),
    updateUnion: (id: string, patch: Partial<Union>) => setTree(ops.updateUnion(tree, id, patch)),
    deleteUnion: (id) => setTree(ops.deleteUnion(tree, id)),
    removeChild: (unionId, childId) => setTree(ops.removeChild(tree, unionId, childId)),
  };

  const setTitle = (title: string) =>
    setTree({ ...tree, meta: { ...tree.meta, title } });

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseTree(String(reader.result));
      if (res.ok) {
        setTree(res.tree);
        setSelectedId(undefined);
        notify('家系図データを読み込みました。');
      } else {
        notify(`読み込み失敗: ${res.error}`);
      }
    };
    reader.readAsText(file);
  };

  const downloadJson = () =>
    downloadText('家系図データ.json', exportJson(tree), 'application/json;charset=utf-8');

  // Save the tree as a PNG image (rendered from the same SVG one-pager).
  const downloadImage = () => {
    if (isLayoutError(layout)) return notify(layout.error);
    const svg = exportSvg(layout, tree);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const scale = 2; // crisp output
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return notify('画像の生成に失敗しました。');
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return notify('画像の生成に失敗しました。');
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = '家系図.png';
        a.click();
        URL.revokeObjectURL(u);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      notify('画像の生成に失敗しました。');
    };
    img.src = url;
  };

  const clampZoom = (z: number) => Math.min(2, Math.max(0.3, Math.round(z * 100) / 100));

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = editorWidth;
    const onMove = (ev: PointerEvent) => {
      setEditorWidth(Math.min(760, Math.max(300, startW + (startX - ev.clientX))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <input
            className="title-input"
            value={tree.meta?.title ?? ''}
            placeholder="（家系図のタイトルを入力）"
            aria-label="家系図のタイトル"
            onChange={(e) => setTitle(e.target.value)}
          />
          <span className="sub">ローカル完結・データは外部送信されません</span>
        </div>
        <div className="actions">
          <button type="button" onClick={() => fileRef.current?.click()}>家系図データを開く</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }} />
          <button type="button" onClick={downloadJson}>家系図データを保存</button>
          <button type="button" onClick={downloadImage}>画像保存</button>
          <span className="spacer" />
          <button type="button" className="danger"
            onClick={() => {
              if (confirm('すべての人物・関係を消去します。よろしいですか？')) {
                setTree(emptyTree());
                setSelectedId(undefined);
              }
            }}>全消去</button>
        </div>
      </header>

      {message && <div className="toast">{message}</div>}

      <main className="workspace">
        <section className="tree-pane">
          <div className="zoom-bar">
            <button type="button" onClick={() => setZoom((z) => clampZoom(z - 0.1))} title="縮小">−</button>
            <button type="button" className="zoom-val" onClick={() => setZoom(1)} title="100%に戻す">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => setZoom((z) => clampZoom(z + 0.1))} title="拡大">＋</button>
          </div>
          {isLayoutError(layout) ? (
            <div className="placeholder">{layout.error}</div>
          ) : (
            <TreeView
              layout={layout}
              zoom={zoom}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onZoom={(delta) => setZoom((z) => clampZoom(z + delta))}
              onAddParent={actions.addParent}
              onAddSpouse={actions.addSpouse}
              onAddSibling={actions.addSibling}
              onAddChild={actions.addChild}
              onDelete={actions.deletePerson}
              canAddParent={actions.canAddParent}
            />
          )}
        </section>
        <div className="resizer" onPointerDown={startResize} title="ドラッグで幅を調整" />
        <aside className="editor-pane" style={{ width: editorWidth }}>
          <Editor tree={tree} selectedId={selectedId} onSelect={setSelectedId} actions={actions} />
        </aside>
      </main>
    </div>
  );
}
