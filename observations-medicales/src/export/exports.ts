/**
 * Exports de l'observation : PDF (pdfmake), Word (.docx) et texte brut.
 * Les bibliothèques sont chargées à la demande pour alléger l'application.
 */
import type { ObservationFull, Preferences } from '../../shared/types.ts';
import type { DocNode, GeneratedDoc } from '../engine/doc.ts';
import { docToText } from '../engine/doc.ts';
import { ageLabel, fmtDate } from '../engine/calc.ts';

export interface ExportMeta {
  obs: ObservationFull;
  prefs: Preferences;
  auteur: string;
}

function patientLigne(m: ExportMeta): string {
  const id = m.obs.data.identite;
  const age = ageLabel(id.dateNaissance, m.obs.data.admission.date?.slice(0, 10));
  return [`${id.nom.toUpperCase()} ${id.prenom}`.trim(), id.dateNaissance && `né(e) le ${fmtDate(id.dateNaissance)}${age ? ` (${age})` : ''}`, id.ipp && `IPP ${id.ipp}`].filter(Boolean).join(' — ');
}

function statutLigne(m: ExportMeta): string {
  if (m.obs.statut === 'validee' && m.obs.valideLe) {
    return `Observation validée par ${m.obs.validePar ?? 'le médecin'} le ${new Date(m.obs.valideLe).toLocaleString('fr-FR')}`;
  }
  return 'BROUILLON — observation non validée par le médecin';
}

export function nomFichier(m: ExportMeta, ext: string, format: string): string {
  const id = m.obs.data.identite;
  const base = `observation_${(id.nom || 'patient').replace(/[^\p{L}\d-]+/gu, '_')}_${(m.obs.data.admission.date || '').slice(0, 10)}_${format}`;
  return `${base}.${ext}`;
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function enteteTexte(m: ExportMeta): string {
  return [m.prefs.etablissement, m.prefs.service, m.prefs.enTete].filter((x) => x && x.trim()).join('\n');
}

/* ------------------------------------------------------------------ */
/* Texte                                                                */
/* ------------------------------------------------------------------ */
export function exportTexte(doc: GeneratedDoc, m: ExportMeta): string {
  const tete = [enteteTexte(m), `Patient : ${patientLigne(m)}`, statutLigne(m)].filter(Boolean).join('\n');
  const signature = m.prefs.signature ? `\n\n${m.prefs.signature}` : '';
  return `${docToText(doc, tete + '\n')}${signature}`;
}

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */
export async function exportPDF(doc: GeneratedDoc, m: ExportMeta, format: string): Promise<void> {
  const [{ default: pdfMake }, vfsMod] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const vfs = (vfsMod as unknown as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>);
  (pdfMake as unknown as { vfs: Record<string, string> }).vfs = (vfs as { pdfMake?: { vfs: Record<string, string> } }).pdfMake?.vfs ?? vfs;
  const brouillon = m.obs.statut !== 'validee';
  const content: unknown[] = [];
  const tete = enteteTexte(m);
  if (tete) content.push({ text: tete, style: 'etab' });
  content.push({ text: doc.titre.toUpperCase(), style: 'titre' });
  content.push({ text: patientLigne(m), style: 'patient' });
  if (brouillon) content.push({ text: statutLigne(m), style: 'brouillon' });
  for (const s of doc.sections) {
    content.push({ text: s.title, style: s.level === 1 ? 'h1' : 'h2' });
    for (const n of s.nodes) content.push(pdfNode(n));
  }
  if (m.prefs.signature) content.push({ text: `\n${m.prefs.signature}`, style: 'signature' });
  const def = {
    pageSize: 'A4',
    pageMargins: [42, 56, 42, 48],
    info: { title: `${doc.titre} — ${patientLigne(m)}`, author: m.auteur, subject: 'Observation médicale', creator: 'Observations médicales' },
    header: () => ({ columns: [{ text: m.prefs.etablissement || '', fontSize: 7.5, color: '#666' }, { text: patientLigne(m), fontSize: 7.5, color: '#666', alignment: 'right' }], margin: [42, 22, 42, 0] }),
    footer: (page: number, pages: number) => ({ columns: [{ text: statutLigne(m), fontSize: 7, color: brouillon ? '#b00' : '#555' }, { text: `Page ${page} / ${pages}`, fontSize: 7, color: '#555', alignment: 'right' }], margin: [42, 14, 42, 0] }),
    watermark: brouillon ? { text: 'BROUILLON', color: '#c0352b', opacity: 0.07, bold: true } : undefined,
    content,
    defaultStyle: { fontSize: 9.8, lineHeight: 1.22 },
    styles: {
      etab: { fontSize: 9, color: '#333', margin: [0, 0, 0, 8] },
      titre: { fontSize: 15, bold: true, alignment: 'center', margin: [0, 2, 0, 2], color: '#16365f' },
      patient: { fontSize: 10, alignment: 'center', margin: [0, 0, 0, 4] },
      brouillon: { fontSize: 9, bold: true, color: '#c0352b', alignment: 'center', margin: [0, 0, 0, 6] },
      h1: { fontSize: 11.5, bold: true, color: '#1d5fa8', margin: [0, 12, 0, 4] },
      h2: { fontSize: 10.2, bold: true, color: '#222', margin: [0, 7, 0, 3] },
      signature: { alignment: 'right', italics: true, margin: [0, 16, 0, 0] },
    },
  };
  const nom = nomFichier(m, 'pdf', format);
  await new Promise<void>((resolve) => {
    (pdfMake as unknown as { createPdf: (d: unknown) => { getBlob: (cb: (b: Blob) => void) => void } }).createPdf(def).getBlob((b: Blob) => { telecharger(b, nom); resolve(); });
  });
}

function pdfNode(n: DocNode): unknown {
  if (n.t === 'p') return { text: n.label ? [{ text: `${n.label} : `, bold: true }, n.text] : n.text, alignment: 'justify', margin: [0, 0, 0, 4] };
  if (n.t === 'ul') return { ul: n.items.map((x) => ({ text: x })), margin: [4, 0, 0, 5] };
  const body = [n.head.map((h) => ({ text: h, bold: true, fillColor: '#eef2f7' })), ...n.rows.map((r) => r.map((c) => ({ text: c })))];
  return {
    stack: [
      ...(n.caption ? [{ text: n.caption, bold: true, fontSize: 9, margin: [0, 4, 0, 2] }] : []),
      { table: { headerRows: 1, widths: n.head.map((_, i) => (i === 0 ? '*' : 'auto')), body }, layout: 'lightHorizontalLines', fontSize: 8.6, margin: [0, 0, 0, 6] },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Word                                                                 */
/* ------------------------------------------------------------------ */
export async function exportWord(doc: GeneratedDoc, m: ExportMeta, format: string): Promise<void> {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, Header, Footer, PageNumber, ShadingType } = d;
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  const brouillon = m.obs.statut !== 'validee';
  const tete = enteteTexte(m);
  if (tete) tete.split('\n').forEach((l) => children.push(new Paragraph({ children: [new TextRun({ text: l, size: 18, color: '444444' })] })));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: doc.titre.toUpperCase(), bold: true, size: 30, color: '16365F' })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: patientLigne(m), size: 20 })] }));
  if (brouillon) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: statutLigne(m), bold: true, color: 'C0352B', size: 18 })] }));
  for (const s of doc.sections) {
    children.push(new Paragraph({ heading: s.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, spacing: { before: s.level === 1 ? 240 : 140, after: 80 }, children: [new TextRun({ text: s.title, bold: true, color: s.level === 1 ? '1D5FA8' : '222222', size: s.level === 1 ? 24 : 21 })] }));
    for (const n of s.nodes) {
      if (n.t === 'p') {
        children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 }, children: [...(n.label ? [new TextRun({ text: `${n.label} : `, bold: true, size: 20 })] : []), new TextRun({ text: n.text, size: 20 })] }));
      } else if (n.t === 'ul') {
        n.items.forEach((it) => children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: it, size: 20 })] })));
      } else {
        if (n.caption) children.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: n.caption, bold: true, size: 18 })] }));
        const cell = (t: string, head = false) => new TableCell({
          shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2F7' } : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: head, size: 17 })] })],
        });
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: n.head.map((h) => cell(h, true)) }), ...n.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))] }));
        children.push(new Paragraph({ children: [] }));
      }
    }
  }
  if (m.prefs.signature) children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [new TextRun({ text: m.prefs.signature, italics: true, size: 20 })] }));
  const document = new Document({
    creator: 'Observations médicales',
    title: `${doc.titre} — ${patientLigne(m)}`,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 900, left: 1000, right: 1000 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: patientLigne(m), size: 15, color: '666666' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `${statutLigne(m)} — page `, size: 14, color: brouillon ? 'B00000' : '555555' }), new TextRun({ children: [PageNumber.CURRENT], size: 14 }), new TextRun({ text: ' / ', size: 14 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14 })] })] }) },
      children,
    }],
  });
  const blob = await Packer.toBlob(document);
  telecharger(blob, nomFichier(m, 'docx', format));
}
