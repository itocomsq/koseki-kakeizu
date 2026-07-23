// Short, collision-resistant-enough ids for a single-user local editor.
let counter = 0;

export function newId(prefix: 'p' | 'u' | 'r'): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${counter}${rand}`;
}
