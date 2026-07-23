// JSON import / export + browser download helpers.
// Import is validated defensively: the file comes from the user's disk and we
// never want a malformed file to crash the app.

import type { FamilyTree, Person, Sex, Union } from '../types/koseki';

export function exportJson(tree: FamilyTree): string {
  return JSON.stringify(tree, null, 2);
}

type ParseResult = { ok: true; tree: FamilyTree } | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asSex(v: unknown): Sex {
  return v === 'male' || v === 'female' || v === 'unknown' ? v : 'unknown';
}

function parsePerson(v: unknown, index: number): Person {
  if (!isObject(v) || typeof v.id !== 'string') {
    throw new Error(`persons[${index}] に文字列の id がありません。`);
  }
  return {
    id: v.id,
    familyName: typeof v.familyName === 'string' ? v.familyName : undefined,
    givenName: typeof v.givenName === 'string' ? v.givenName : undefined,
    familyNameKana: typeof v.familyNameKana === 'string' ? v.familyNameKana : undefined,
    givenNameKana: typeof v.givenNameKana === 'string' ? v.givenNameKana : undefined,
    sex: asSex(v.sex),
    birth: isObject(v.birth) ? (v.birth as Person['birth']) : undefined,
    death: isObject(v.death) ? (v.death as Person['death']) : undefined,
    birthPlace: typeof v.birthPlace === 'string' ? v.birthPlace : undefined,
    relationInRegister:
      typeof v.relationInRegister === 'string' ? v.relationInRegister : undefined,
    note: typeof v.note === 'string' ? v.note : undefined,
  };
}

function parseUnion(v: unknown, index: number): Union {
  if (!isObject(v) || typeof v.id !== 'string') {
    throw new Error(`unions[${index}] に文字列の id がありません。`);
  }
  const partnerIds = Array.isArray(v.partnerIds)
    ? v.partnerIds.filter((x): x is string => typeof x === 'string')
    : [];
  const childIds = Array.isArray(v.childIds)
    ? v.childIds.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: v.id,
    partnerIds,
    childIds,
    type:
      v.type === 'married' || v.type === 'divorced' || v.type === 'unknown'
        ? v.type
        : undefined,
    marriageDate: isObject(v.marriageDate)
      ? (v.marriageDate as Union['marriageDate'])
      : undefined,
  };
}

export function parseTree(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON として読み込めませんでした。' };
  }
  if (!isObject(raw)) {
    return { ok: false, error: 'トップレベルがオブジェクトではありません。' };
  }
  if (!Array.isArray(raw.persons) || !Array.isArray(raw.unions)) {
    return { ok: false, error: 'persons / unions 配列が見つかりません。' };
  }
  try {
    const persons = raw.persons.map(parsePerson);
    const unions = raw.unions.map(parseUnion);

    // Referential sanity check: relations must point at known people.
    const ids = new Set(persons.map((p) => p.id));
    for (const u of unions) {
      for (const id of [...u.partnerIds, ...u.childIds]) {
        if (!ids.has(id)) {
          return {
            ok: false,
            error: `union "${u.id}" が存在しない人物 "${id}" を参照しています。`,
          };
        }
      }
    }

    const tree: FamilyTree = {
      version: 1,
      meta: isObject(raw.meta) ? (raw.meta as FamilyTree['meta']) : undefined,
      persons,
      unions,
      registers: Array.isArray(raw.registers)
        ? (raw.registers as FamilyTree['registers'])
        : undefined,
    };
    return { ok: true, tree };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function downloadText(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
