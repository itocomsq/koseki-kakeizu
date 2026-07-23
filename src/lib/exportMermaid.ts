// Mermaid text export. Mermaid has no native genealogy layout, so we model each
// marriage as a tiny junction node: partners link into the junction, children
// hang below it. This is the lightweight "share as text" output; the SVG is the
// polished one.

import type { FamilyTree } from '../types/koseki';
import { fullName } from '../types/koseki';

// Mermaid node ids must be simple identifiers; map our ids onto safe ones.
function safeId(prefix: string, id: string): string {
  return prefix + id.replace(/[^A-Za-z0-9_]/g, '_');
}

function label(name: string, dates: string): string {
  // Escape double quotes for the "..." label form.
  const text = dates ? `${name}<br/>${dates}` : name;
  return `"${text.replace(/"/g, '&quot;')}"`;
}

export function exportMermaid(tree: FamilyTree): string {
  const out: string[] = ['flowchart TD'];

  for (const p of tree.persons) {
    const dates = [p.birth?.iso ?? p.birth?.raw, p.death?.iso ?? p.death?.raw]
      .filter(Boolean)
      .join(' – ');
    out.push(`  ${safeId('P', p.id)}[${label(fullName(p), dates)}]`);
  }

  tree.unions.forEach((u, i) => {
    const partners = u.partnerIds.map((id) => safeId('P', id));

    if (u.childIds.length > 0) {
      const j = safeId('U', u.id || String(i));
      out.push(`  ${j}(( ))`);
      for (const partner of partners) {
        out.push(`  ${partner} --- ${j}`);
      }
      for (const c of u.childIds) {
        out.push(`  ${j} --> ${safeId('P', c)}`);
      }
    } else if (partners.length === 2) {
      // Childless couple: just link the partners.
      out.push(`  ${partners[0]} --- ${partners[1]}`);
    }
  });

  return out.join('\n');
}
