// Canonical data model for koseki-based genealogy.
// This is the source of truth. All rendering / export derives from it.
//
// Design notes:
// - A `Union` (夫婦/婚姻) is the unit that connects two partners and their children.
//   Children point to their parents *only* through the union that lists them
//   (see `Union.childIds`), so parent/sibling relations are always derived, never
//   stored redundantly on `Person`.
// - `Register` (戸籍そのもの) is optional and exists purely for traceability:
//   which document a fact came from, and how registers chain across generations
//   via `previousRegisterId` (従前戸籍 / 改製・転籍の連鎖).

export type Sex = 'male' | 'female' | 'unknown';

/**
 * A date as it appears in a koseki. Japanese registers use era dates
 * (e.g. 大正九年三月十五日), so we keep both the original text and a
 * best-effort normalized ISO value. Either field may be missing/partial.
 */
export interface DateInfo {
  /** Original text, e.g. "大正九年三月十五日". */
  raw?: string;
  /** Normalized, possibly partial: "1920-03-15", "1920-03", or "1920". */
  iso?: string;
}

export interface Person {
  id: string;
  /** 氏 */
  familyName?: string;
  /** 名 */
  givenName?: string;
  /** 氏のふりがな */
  familyNameKana?: string;
  /** 名のふりがな */
  givenNameKana?: string;
  sex: Sex;
  birth?: DateInfo;
  death?: DateInfo;
  /** 出生地 / 本籍地など */
  birthPlace?: string;
  /** 続柄 as written in the register, e.g. "長男", "二女", "妻". Free text on purpose. */
  relationInRegister?: string;
  note?: string;
}

export type UnionType = 'married' | 'divorced' | 'unknown';

/** A marriage / partnership linking partners and their children. */
export interface Union {
  id: string;
  /** Usually two partner ids. Kept as an array to stay flexible. */
  partnerIds: string[];
  type?: UnionType;
  marriageDate?: DateInfo;
  /** Children born to / recorded under this union. Source of truth for parentage. */
  childIds: string[];
}

/** A physical koseki document. Optional; used for provenance and lineage chaining. */
export interface Register {
  id: string;
  /** 本籍 */
  honseki?: string;
  /** 筆頭者 (person id) */
  headId?: string;
  /** 改製 / 転籍 など、この戸籍が作られた理由 */
  createdReason?: string;
  /** 従前戸籍 (previous register id) — the key to tracing lineage across documents. */
  previousRegisterId?: string;
  /** People recorded in this register. */
  memberIds: string[];
}

export interface FamilyTree {
  /** Schema version, for forward-compatible import/export. */
  version: 1;
  meta?: {
    title?: string;
    createdAt?: string;
    note?: string;
  };
  persons: Person[];
  unions: Union[];
  registers?: Register[];
}

/** A convenient empty document. */
export function emptyTree(): FamilyTree {
  return { version: 1, persons: [], unions: [] };
}

/** Display helper: full name, tolerant of missing parts. */
export function fullName(p: Pick<Person, 'familyName' | 'givenName'>): string {
  const name = `${p.familyName ?? ''} ${p.givenName ?? ''}`.trim();
  return name.length > 0 ? name : '(名前未設定)';
}

/** Display helper: full furigana reading, or '' if none recorded. */
export function fullNameKana(
  p: Pick<Person, 'familyNameKana' | 'givenNameKana'>,
): string {
  return `${p.familyNameKana ?? ''} ${p.givenNameKana ?? ''}`.trim();
}

/** Split an ISO date (possibly partial) into year / month / day strings. */
export function dateParts(d?: DateInfo): { y: string; m: string; day: string } {
  const [y = '', m = '', day = ''] = (d?.iso ?? '').split('-');
  return { y, m, day };
}

/** Build an ISO (possibly partial) date from parts; empty trailing parts drop off. */
export function isoFromParts(y: string, m: string, day: string): string {
  const yy = y.trim();
  if (!yy) return '';
  const mm = m.trim();
  if (!mm) return yy;
  const pad = (s: string) => s.padStart(2, '0');
  const dd = day.trim();
  return dd ? `${yy}-${pad(mm)}-${pad(dd)}` : `${yy}-${pad(mm)}`;
}

/** Display an ISO (possibly partial) date as "1950.3.15"; falls back to raw text. */
export function formatDate(d?: DateInfo): string {
  if (!d) return '';
  if (d.iso) {
    const { y, m, day } = dateParts(d);
    return [y, m && String(Number(m)), day && String(Number(day))]
      .filter((s) => s !== '' && s !== undefined)
      .join('.');
  }
  return d.raw ?? '';
}
