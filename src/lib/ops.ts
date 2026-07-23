// Pure tree operations. Each returns a new FamilyTree (and, where a person is
// created, its id) so the same logic can be driven from the side editor and
// from the inline "+" buttons on the canvas.

import type { FamilyTree, Person, Union } from '../types/koseki';
import { newId } from './ids';

export interface TreeAndId {
  tree: FamilyTree;
  newId: string;
}

function makePerson(patch: Partial<Person> = {}): Person {
  return { id: newId('p'), sex: 'unknown', ...patch };
}

const parentUnionOf = (tree: FamilyTree, id: string) =>
  tree.unions.find((u) => u.childIds.includes(id));
const unionsAsPartner = (tree: FamilyTree, id: string) =>
  tree.unions.filter((u) => u.partnerIds.includes(id));

export function addStandalone(tree: FamilyTree): TreeAndId {
  const p = makePerson();
  return { tree: { ...tree, persons: [...tree.persons, p] }, newId: p.id };
}

export function updatePerson(
  tree: FamilyTree,
  id: string,
  patch: Partial<Person>,
): FamilyTree {
  return {
    ...tree,
    persons: tree.persons.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

export function deletePerson(tree: FamilyTree, id: string): FamilyTree {
  const unions = tree.unions
    .map((u) => ({
      ...u,
      partnerIds: u.partnerIds.filter((x) => x !== id),
      childIds: u.childIds.filter((x) => x !== id),
    }))
    .filter((u) => u.partnerIds.length + u.childIds.length >= 2 || u.childIds.length > 0);
  return {
    ...tree,
    persons: tree.persons.filter((p) => p.id !== id),
    unions,
  };
}

/** True when a new parent may still be added (fewer than two parents recorded). */
export function canAddParent(tree: FamilyTree, childId: string): boolean {
  const u = parentUnionOf(tree, childId);
  return !u || u.partnerIds.length < 2;
}

export function addNewParent(tree: FamilyTree, childId: string): TreeAndId {
  const child = tree.persons.find((p) => p.id === childId);
  const parent = makePerson({ familyName: child?.familyName });
  const existing = parentUnionOf(tree, childId);
  const unions: Union[] = existing
    ? tree.unions.map((u) =>
        u.id === existing.id ? { ...u, partnerIds: [...u.partnerIds, parent.id] } : u,
      )
    : [
        ...tree.unions,
        { id: newId('u'), partnerIds: [parent.id], childIds: [childId], type: 'married' },
      ];
  return { tree: { ...tree, persons: [...tree.persons, parent], unions }, newId: parent.id };
}

export function addNewSibling(tree: FamilyTree, personId: string): TreeAndId {
  const person = tree.persons.find((p) => p.id === personId);
  const sibling = makePerson({ familyName: person?.familyName });
  const existing = parentUnionOf(tree, personId);

  if (existing) {
    const unions = tree.unions.map((u) =>
      u.id === existing.id ? { ...u, childIds: [...u.childIds, sibling.id] } : u,
    );
    return { tree: { ...tree, persons: [...tree.persons, sibling], unions }, newId: sibling.id };
  }

  // No parents yet. Siblings need a shared parent to be laid out, so we create a
  // placeholder parent (name blank, editable later) that both share.
  const placeholderParent = makePerson({ familyName: person?.familyName });
  return {
    tree: {
      ...tree,
      persons: [...tree.persons, placeholderParent, sibling],
      unions: [
        ...tree.unions,
        {
          id: newId('u'),
          partnerIds: [placeholderParent.id],
          childIds: [personId, sibling.id],
          type: 'married',
        },
      ],
    },
    newId: sibling.id,
  };
}

/** A union where `personId` is the only partner (e.g. from "add child" with no
 * spouse yet). Adding a spouse should fill this in rather than create a new
 * union, otherwise existing children get stranded and disappear from the tree. */
function soleUnionOf(tree: FamilyTree, personId: string): Union | undefined {
  return tree.unions.find(
    (u) => u.partnerIds.length === 1 && u.partnerIds[0] === personId,
  );
}

export function addNewSpouse(tree: FamilyTree, personId: string): TreeAndId {
  const spouse = makePerson();
  const sole = soleUnionOf(tree, personId);
  const unions: Union[] = sole
    ? tree.unions.map((u) =>
        u.id === sole.id ? { ...u, partnerIds: [...u.partnerIds, spouse.id] } : u,
      )
    : [
        ...tree.unions,
        { id: newId('u'), partnerIds: [personId, spouse.id], type: 'married', childIds: [] },
      ];
  return { tree: { ...tree, persons: [...tree.persons, spouse], unions }, newId: spouse.id };
}

export function addNewChild(
  tree: FamilyTree,
  personId: string,
  unionId?: string,
): TreeAndId {
  const parent = tree.persons.find((p) => p.id === personId);
  const child = makePerson({ familyName: parent?.familyName });
  // A spouse is not required to record a child (single-parent union allowed).
  const target = unionId
    ? tree.unions.find((u) => u.id === unionId)
    : unionsAsPartner(tree, personId)[0];
  const unions: Union[] = target
    ? tree.unions.map((u) =>
        u.id === target.id ? { ...u, childIds: [...u.childIds, child.id] } : u,
      )
    : [
        ...tree.unions,
        { id: newId('u'), partnerIds: [personId], childIds: [child.id], type: 'married' },
      ];
  return { tree: { ...tree, persons: [...tree.persons, child], unions }, newId: child.id };
}

export function linkExistingSpouse(
  tree: FamilyTree,
  personId: string,
  spouseId: string,
): FamilyTree {
  const sole = soleUnionOf(tree, personId);
  if (sole) {
    return {
      ...tree,
      unions: tree.unions.map((u) =>
        u.id === sole.id ? { ...u, partnerIds: [...u.partnerIds, spouseId] } : u,
      ),
    };
  }
  return {
    ...tree,
    unions: [
      ...tree.unions,
      { id: newId('u'), partnerIds: [personId, spouseId], type: 'married', childIds: [] },
    ],
  };
}

/** A person has at most one parent-union; strip them from any other first. */
export function linkExistingChild(
  tree: FamilyTree,
  unionId: string,
  childId: string,
): FamilyTree {
  return {
    ...tree,
    unions: tree.unions.map((u) => {
      if (u.id === unionId) {
        return u.childIds.includes(childId)
          ? u
          : { ...u, childIds: [...u.childIds, childId] };
      }
      return { ...u, childIds: u.childIds.filter((c) => c !== childId) };
    }),
  };
}

export function updateUnion(
  tree: FamilyTree,
  id: string,
  patch: Partial<Union>,
): FamilyTree {
  return { ...tree, unions: tree.unions.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}

export function deleteUnion(tree: FamilyTree, id: string): FamilyTree {
  return { ...tree, unions: tree.unions.filter((u) => u.id !== id) };
}

export function removeChild(
  tree: FamilyTree,
  unionId: string,
  childId: string,
): FamilyTree {
  return {
    ...tree,
    unions: tree.unions.map((u) =>
      u.id === unionId ? { ...u, childIds: u.childIds.filter((c) => c !== childId) } : u,
    ),
  };
}
