import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type { FamilyTree, Person, Union } from './types/koseki';
import { emptyTree, fullName } from './types/koseki';
import { sampleTree } from './data/sample';
import { computeLayout, isLayoutError } from './lib/layout';
import { exportSvg } from './lib/exportSvg';
import { exportMermaid } from './lib/exportMermaid';
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
  const [rootId, setRootId] = useState<string | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [showMermaid, setShowMermaid] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, exportJson(tree));
    } catch {
      /* quota / private mode — ignore */
    }
  }, [tree]);

  const layout = useMemo(() => computeLayout(tree, rootId), [tree, rootId]);

  const notify = (msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 3000);
  };

  // Callbacks that create a person also select the new one for editing.
  const applyNew = (result: ops.TreeAndId) => {
    setTree(result.tree);
    setSelectedId(result.newId);
  };

  const actions: EditorActions = {
    updatePerson: (id: string, patch: Partial<Person>) =>
      setTree(ops.updatePerson(tree, id, patch)),
    deletePerson: (id: string) => {
      setTree(ops.deletePerson(tree, id));
      if (selectedId === id) setSelectedId(undefined);
    },
    addStandalone: () => applyNew(ops.addStandalone(tree)),
    addParent: (id: string) => applyNew(ops.addNewParent(tree, id)),
    addSpouse: (id: string) => applyNew(ops.addNewSpouse(tree, id)),
    addSibling: (id: string) => applyNew(ops.addNewSibling(tree, id)),
    addChild: (id: string, unionId?: string) => applyNew(ops.addNewChild(tree, id, unionId)),
    canAddParent: (id: string) => ops.canAddParent(tree, id),
    linkSpouse: (id: string, spouseId: string) =>
      setTree(ops.linkExistingSpouse(tree, id, spouseId)),
    linkChild: (unionId: string, childId: string) =>
      setTree(ops.linkExistingChild(tree, unionId, childId)),
    updateUnion: (id: string, patch: Partial<Union>) =>
      setTree(ops.updateUnion(tree, id, patch)),
    deleteUnion: (id: string) => setTree(ops.deleteUnion(tree, id)),
    removeChild: (unionId: string, childId: string) =>
      setTree(ops.removeChild(tree, unionId, childId)),
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseTree(String(reader.result));
      if (res.ok) {
        setTree(res.tree);
        setSelectedId(undefined);
        setRootId(undefined);
        notify('JSON を読み込みました。');
      } else {
        notify(`読み込み失敗: ${res.error}`);
      }
    };
    reader.readAsText(file);
  };

  const downloadSvg = () => {
    if (isLayoutError(layout)) return notify(layout.error);
    downloadText('kakeizu.svg', exportSvg(layout, tree), 'image/svg+xml;charset=utf-8');
  };
  const downloadJson = () =>
    downloadText('kakeizu.json', exportJson(tree), 'application/json;charset=utf-8');

  const mermaidText = useMemo(() => exportMermaid(tree), [tree]);

  const clampZoom = (z: number) => Math.min(2, Math.max(0.3, Math.round(z * 100) / 100));

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <strong>戸籍 → 家系図</strong>
          <span className="sub">ローカル完結・データは外部送信されません</span>
        </div>
        <div className="actions">
          <button type="button" onClick={() => fileRef.current?.click()}>JSON 読込</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }} />
          <button type="button" onClick={downloadJson}>JSON 保存</button>
          <button type="button" onClick={downloadSvg}>SVG 書き出し</button>
          <button type="button" onClick={() => setShowMermaid((v) => !v)}>Mermaid</button>
          <span className="spacer" />
          <label className="root-select">ルート
            <select value={rootId ?? (isLayoutError(layout) ? '' : layout.rootId)}
              onChange={(e) => setRootId(e.target.value || undefined)}>
              {tree.persons.map((p) => (
                <option key={p.id} value={p.id}>{fullName(p)}</option>
              ))}
            </select>
          </label>
          <button type="button"
            onClick={() => {
              setTree(sampleTree);
              setSelectedId(undefined);
              setRootId(undefined);
              notify('サンプルを読み込みました。');
            }}>サンプル</button>
          <button type="button" className="danger"
            onClick={() => {
              if (confirm('すべての人物・関係を消去します。よろしいですか？')) {
                setTree(emptyTree());
                setSelectedId(undefined);
                setRootId(undefined);
              }
            }}>全消去</button>
        </div>
      </header>

      {message && <div className="toast">{message}</div>}

      {showMermaid && (
        <div className="mermaid-panel">
          <div className="mermaid-head">
            <span>Mermaid テキスト（mermaid.live などに貼り付け）</span>
            <button type="button"
              onClick={() => {
                navigator.clipboard?.writeText(mermaidText);
                notify('Mermaid をコピーしました。');
              }}>コピー</button>
            <button type="button" onClick={() => downloadText('kakeizu.mmd', mermaidText)}>.mmd 保存</button>
            <button type="button" className="link" onClick={() => setShowMermaid(false)}>閉じる</button>
          </div>
          <textarea readOnly value={mermaidText} spellCheck={false} />
        </div>
      )}

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
              canAddParent={actions.canAddParent}
            />
          )}
        </section>
        <aside className="editor-pane">
          <Editor
            tree={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            actions={actions}
          />
        </aside>
      </main>
    </div>
  );
}
