/** Modèle de document généré (indépendant du format de sortie : écran, PDF, Word, texte). */

export type DocNode =
  | { t: 'p'; label?: string; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][]; caption?: string };

export interface DocSection {
  id: string;
  title: string;
  level: 1 | 2;
  nodes: DocNode[];
  /** Texte brut généré (avant modification manuelle) */
  generated: string;
  /** La section a été modifiée manuellement */
  edited: boolean;
  /** Les données ont changé depuis la modification manuelle */
  stale: boolean;
  /** Section sans contenu clinique (non renseignée) */
  vide: boolean;
}

export interface GeneratedDoc {
  format: 'complet' | 'standard' | 'court';
  titre: string;
  sections: DocSection[];
}

export function nodeToText(n: DocNode): string {
  if (n.t === 'p') return n.label ? `${n.label} : ${n.text}` : n.text;
  if (n.t === 'ul') return n.items.map((i) => `- ${i}`).join('\n');
  const lines = [n.head.join(' | '), ...n.rows.map((r) => r.join(' | '))];
  return (n.caption ? `${n.caption}\n` : '') + lines.join('\n');
}

export function nodesToText(nodes: DocNode[]): string {
  return nodes.map(nodeToText).join('\n\n');
}

/** Relit un texte modifié manuellement en nœuds (paragraphes, listes, tableaux). */
export function textToNodes(text: string): DocNode[] {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: DocNode[] = [];
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => /^[-•]\s/.test(l))) {
      out.push({ t: 'ul', items: lines.map((l) => l.replace(/^[-•]\s+/, '')) });
      continue;
    }
    const pipeLines = lines.filter((l) => (l.match(/\|/g) ?? []).length >= 1);
    if (lines.length >= 2 && pipeLines.length >= lines.length - 1 && pipeLines.length >= 2) {
      const caption = pipeLines.length === lines.length - 1 && !lines[0].includes('|') ? lines[0] : undefined;
      const rows = (caption ? lines.slice(1) : lines).map((l) => l.split('|').map((c) => c.trim()));
      out.push({ t: 'table', head: rows[0], rows: rows.slice(1), caption });
      continue;
    }
    for (const l of lines) {
      const m = /^([^:\n]{2,60}?) : (.+)$/.exec(l);
      if (m && !/[.!?]/.test(m[1])) out.push({ t: 'p', label: m[1], text: m[2] });
      else out.push({ t: 'p', text: l });
    }
  }
  return out;
}

/** Texte brut complet (copie dans le presse-papiers) */
export function docToText(doc: GeneratedDoc, entete?: string): string {
  const parts: string[] = [];
  if (entete) parts.push(entete);
  parts.push(doc.titre.toUpperCase());
  for (const s of doc.sections) {
    const titre = s.level === 1 ? `\n${s.title.toUpperCase()}` : `\n${s.title}`;
    parts.push(titre);
    if (s.nodes.length) parts.push(nodesToText(s.nodes));
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
