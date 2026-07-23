// Transform our canonical FamilyTree into the graph shape that
// `relatives-tree` expects (fully reciprocal parents/children/siblings/spouses).
//
// We never store parent/sibling links on Person; they are derived here from the
// set of Unions, which guarantees the relations are reciprocal and consistent.

import type { Node, Relation, Gender, RelType } from 'relatives-tree/lib/types';
import type { FamilyTree, Person, Union } from '../types/koseki';

// NOTE: relatives-tree exports `Gender`/`RelType` as `declare const enum`, which
// have no runtime representation under esbuild/Vite. So we use plain string
// literals (the enum's underlying values) and cast to the type.
const GENDER = {
  male: 'male' as Gender,
  female: 'female' as Gender,
};
const REL = {
  blood: 'blood' as RelType,
  married: 'married' as RelType,
  divorced: 'divorced' as RelType,
};

function rel(id: string, type: RelType): Relation {
  return { id, type };
}

function genderOf(p: Person): Gender {
  // relatives-tree only understands male/female; it affects spouse placement
  // only. 'unknown' falls back to male purely for layout purposes.
  return p.sex === 'female' ? GENDER.female : GENDER.male;
}

/** The union (if any) that lists `personId` as a child — i.e. their parents. */
function parentUnionOf(personId: string, unions: Union[]): Union | undefined {
  return unions.find((u) => u.childIds.includes(personId));
}

export function toRelativesNodes(tree: FamilyTree): Node[] {
  const { persons, unions } = tree;

  return persons.map((person) => {
    const parentUnion = parentUnionOf(person.id, unions);

    const parents: Relation[] = parentUnion
      ? parentUnion.partnerIds.map((id) => rel(id, REL.blood))
      : [];

    const siblings: Relation[] = parentUnion
      ? parentUnion.childIds
          .filter((id) => id !== person.id)
          .map((id) => rel(id, REL.blood))
      : [];

    // Unions this person is a partner in.
    const ownUnions = unions.filter((u) => u.partnerIds.includes(person.id));

    const spouses: Relation[] = ownUnions.flatMap((u) =>
      u.partnerIds
        .filter((id) => id !== person.id)
        .map((id) => rel(id, u.type === 'divorced' ? REL.divorced : REL.married)),
    );

    const children: Relation[] = ownUnions.flatMap((u) =>
      u.childIds.map((id) => rel(id, REL.blood)),
    );

    return {
      id: person.id,
      gender: genderOf(person),
      parents,
      siblings,
      spouses,
      children,
    };
  });
}

/**
 * Pick a sensible root for layout: the ancestor with the most descendants who
 * has no parents recorded. Falls back to the first person.
 */
export function pickRootId(tree: FamilyTree): string | undefined {
  if (tree.persons.length === 0) return undefined;

  const hasParents = (id: string) =>
    tree.unions.some((u) => u.childIds.includes(id));

  const roots = tree.persons.filter((p) => !hasParents(p.id));
  const candidates = roots.length > 0 ? roots : tree.persons;

  // Count reachable descendants to prefer the "main" ancestor.
  const descendantCount = (id: string): number => {
    const seen = new Set<string>();
    const walk = (pid: string) => {
      for (const u of tree.unions) {
        if (!u.partnerIds.includes(pid)) continue;
        for (const c of u.childIds) {
          if (!seen.has(c)) {
            seen.add(c);
            walk(c);
          }
        }
      }
    };
    walk(id);
    return seen.size;
  };

  return candidates
    .slice()
    .sort((a, b) => descendantCount(b.id) - descendantCount(a.id))[0].id;
}
