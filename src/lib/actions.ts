import type { Person, Union } from '../types/koseki';

/** Editing actions shared by the side editor and the canvas "+" buttons. */
export interface EditorActions {
  updatePerson(id: string, patch: Partial<Person>): void;
  deletePerson(id: string): void;
  addStandalone(): void;
  addParent(id: string): void;
  addSpouse(id: string): void;
  addSibling(id: string): void;
  addChild(id: string, unionId?: string): void;
  canAddParent(id: string): boolean;
  linkSpouse(id: string, spouseId: string): void;
  linkChild(unionId: string, childId: string): void;
  updateUnion(id: string, patch: Partial<Union>): void;
  deleteUnion(id: string): void;
  removeChild(unionId: string, childId: string): void;
}
