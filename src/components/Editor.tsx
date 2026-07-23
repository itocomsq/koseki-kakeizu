import { useMemo } from 'react';
import type { DateInfo, FamilyTree, Person, Sex, UnionType } from '../types/koseki';
import { fullName, dateParts, isoFromParts } from '../types/koseki';
import type { EditorActions } from '../lib/actions';

interface Props {
  tree: FamilyTree;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  actions: EditorActions;
}

const SEX_LABEL: Record<Sex, string> = { male: '男', female: '女', unknown: '不明' };
const UNION_LABEL: Record<UnionType, string> = {
  married: '婚姻',
  divorced: '離婚',
  unknown: '不明',
};

export function Editor({ tree, selectedId, onSelect, actions }: Props) {
  const selected = tree.persons.find((p) => p.id === selectedId);

  const personName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of tree.persons) map.set(p.id, fullName(p));
    return map;
  }, [tree.persons]);

  return (
    <div className="editor">
      <div className="editor-section">
        <div className="editor-head">
          <h2>人物一覧 ({tree.persons.length})</h2>
          <button type="button" onClick={actions.addStandalone} title="どこにもつながらない人物を作成">
            ＋ 単独で追加
          </button>
        </div>
        <p className="muted small">
          人物を選ぶと、家系図上（上=親／左右=配偶者／下=子）とここの「＋」で家族を増やせます。
        </p>
        <ul className="person-list">
          {tree.persons.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={p.id === selectedId ? 'selected' : ''}
                onClick={() => onSelect(p.id)}
              >
                <span className={`dot sex-${p.sex}`} />
                {fullName(p)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <PersonDetail
          key={selected.id}
          tree={tree}
          person={selected}
          personName={personName}
          actions={actions}
          onSelect={onSelect}
        />
      ) : (
        <div className="editor-section muted">
          人物を選ぶと、ここで編集と家族の追加ができます。
        </div>
      )}
    </div>
  );
}

function PersonDetail(props: {
  tree: FamilyTree;
  person: Person;
  personName: Map<string, string>;
  actions: EditorActions;
  onSelect: (id: string) => void;
}) {
  const { person, tree, actions } = props;
  const change = (patch: Partial<Person>) => actions.updatePerson(person.id, patch);

  const myUnions = tree.unions.filter((u) => u.partnerIds.includes(person.id));
  const parentUnion = tree.unions.find((u) => u.childIds.includes(person.id));
  const canAddParent = actions.canAddParent(person.id);

  return (
    <div className="editor-section detail">
      <div className="editor-head">
        <h2>{fullName(person)} を編集</h2>
        <button type="button" className="danger" onClick={() => actions.deletePerson(person.id)}>
          削除
        </button>
      </div>

      <div className="add-family">
        {canAddParent && (
          <button type="button" onClick={() => actions.addParent(person.id)}>＋ 父母</button>
        )}
        <button type="button" onClick={() => actions.addSibling(person.id)}>＋ 兄弟姉妹</button>
        <button type="button" onClick={() => actions.addSpouse(person.id)}>＋ 配偶者</button>
        <button type="button" onClick={() => actions.addChild(person.id)}>＋ 子</button>
      </div>

      <div className="grid2">
        <label>氏
          <input value={person.familyName ?? ''} onChange={(e) => change({ familyName: e.target.value })} />
        </label>
        <label>名
          <input value={person.givenName ?? ''} onChange={(e) => change({ givenName: e.target.value })} />
        </label>
        <label>性別
          <select value={person.sex} onChange={(e) => change({ sex: e.target.value as Sex })}>
            {(['male', 'female', 'unknown'] as Sex[]).map((s) => (
              <option key={s} value={s}>{SEX_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label>続柄
          <input value={person.relationInRegister ?? ''} placeholder="長男 / 妻 など"
            onChange={(e) => change({ relationInRegister: e.target.value })} />
        </label>

        <div className="span2 datefield">
          <span className="datefield-label">生年月日</span>
          <DateFields value={person.birth} onChange={(birth) => change({ birth })} />
        </div>
        <div className="span2 datefield">
          <span className="datefield-label">没年月日</span>
          <DateFields value={person.death} onChange={(death) => change({ death })} />
        </div>

        <label className="span2">生年月日 原文（戸籍の元号表記）
          <input value={person.birth?.raw ?? ''} placeholder="大正9年3月15日 など"
            onChange={(e) => change({ birth: { ...person.birth, raw: e.target.value } })} />
        </label>
        <label className="span2">備考
          <input value={person.note ?? ''} onChange={(e) => change({ note: e.target.value })} />
        </label>
      </div>

      {/* Parents */}
      <h3>親</h3>
      {parentUnion ? (
        <p className="rel-line">
          {parentUnion.partnerIds.map((id) => props.personName.get(id) ?? '?').join(' ・ ')}
          <button type="button" className="link" onClick={() => actions.removeChild(parentUnion.id, person.id)}>
            親子を解除
          </button>
        </p>
      ) : (
        <p className="muted small">未設定。「＋父・母」で追加できます。</p>
      )}

      {/* Spouses & children */}
      <h3>配偶者・子</h3>
      {myUnions.length === 0 && <p className="muted small">未設定。「＋配偶者」または「＋子」で追加できます。</p>}
      {myUnions.map((u) => {
        const spouseIds = u.partnerIds.filter((id) => id !== person.id);
        return (
          <div key={u.id} className="union-card">
            <div className="union-head">
              <span>配偶者: {spouseIds.length > 0
                ? spouseIds.map((id) => props.personName.get(id) ?? '?').join(', ')
                : '（なし）'}</span>
              <select value={u.type ?? 'married'}
                onChange={(e) => actions.updateUnion(u.id, { type: e.target.value as UnionType })}>
                {(['married', 'divorced', 'unknown'] as UnionType[]).map((t) => (
                  <option key={t} value={t}>{UNION_LABEL[t]}</option>
                ))}
              </select>
              <button type="button" className="link danger" onClick={() => actions.deleteUnion(u.id)}>解除</button>
            </div>
            <div className="children">
              <strong>子:</strong>
              {u.childIds.length === 0 && <span className="muted"> なし</span>}
              {u.childIds.map((cid) => (
                <span key={cid} className="chip">
                  <button type="button" className="link" onClick={() => props.onSelect(cid)}>
                    {props.personName.get(cid) ?? '?'}
                  </button>
                  <button type="button" className="chip-x" title="この子を外す"
                    onClick={() => actions.removeChild(u.id, cid)}>×</button>
                </span>
              ))}
              <button type="button" className="link" onClick={() => actions.addChild(person.id, u.id)}>
                ＋ 子を追加
              </button>
            </div>
          </div>
        );
      })}

      {/* Secondary: link people that already exist */}
      <details className="link-existing">
        <summary>既存の人物とつなぐ</summary>
        <div className="link-existing-body">
          <PickPerson label="配偶者にする…" tree={tree}
            exclude={[person.id, ...myUnions.flatMap((u) => u.partnerIds)]}
            onPick={(id) => actions.linkSpouse(person.id, id)} />
          {myUnions.map((u) => (
            <PickPerson key={u.id} label="この夫婦の子にする…" tree={tree}
              exclude={[person.id, ...u.partnerIds, ...u.childIds]}
              onPick={(id) => actions.linkChild(u.id, id)} />
          ))}
        </div>
      </details>
    </div>
  );
}

function DateFields(props: { value?: DateInfo; onChange: (d: DateInfo) => void }) {
  const { y, m, day } = dateParts(props.value);
  const set = (ny: string, nm: string, nd: string) =>
    props.onChange({ ...props.value, iso: isoFromParts(ny, nm, nd) });
  return (
    <div className="ymd">
      <input className="y" inputMode="numeric" placeholder="年" value={y}
        onChange={(e) => set(e.target.value, m, day)} />
      <span>年</span>
      <input className="md" inputMode="numeric" placeholder="月" value={m}
        onChange={(e) => set(y, e.target.value, day)} />
      <span>月</span>
      <input className="md" inputMode="numeric" placeholder="日" value={day}
        onChange={(e) => set(y, m, e.target.value)} />
      <span>日</span>
    </div>
  );
}

function PickPerson(props: {
  label: string;
  tree: FamilyTree;
  exclude: string[];
  onPick: (id: string) => void;
}) {
  const options = props.tree.persons.filter((p) => !props.exclude.includes(p.id));
  return (
    <select className="pick" value="" onChange={(e) => { if (e.target.value) props.onPick(e.target.value); }}>
      <option value="">{props.label}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>{fullName(p)}</option>
      ))}
    </select>
  );
}
