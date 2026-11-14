import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormatObs, Preferences } from '../../shared/types.ts';
import { useObs, useSession, useToast } from '../app/context.tsx';
import { api, MODE_LOCAL } from '../app/api.ts';
import { useObsStore } from '../app/store.ts';
import { Area, Card, Modal } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { generate } from '../engine/generate.ts';
import { nodesToText, type DocSection, type GeneratedDoc } from '../engine/doc.ts';
import { empreinte } from '../engine/fr.ts';
import { exportPDF, exportTexte, exportWord, enteteTexte, type ExportMeta } from '../export/exports.ts';
import { DocNodeView, DocView, ModuleHeader } from './common.tsx';
import { ValidationDialog } from './Validation.tsx';
import { EditeurModele } from '../pages/Admin.tsx';
import type { Observation, TemplateContent } from '../../shared/types.ts';

/** Extrait la structure réutilisable d'une observation (jamais les constatations cliniques). */
function structureModele(o: Observation): TemplateContent {
  return {
    motif: { principal: o.motif.principal, caractere: o.motif.caractere },
    service: o.admission.service || undefined,
    symptomes: o.hdm.symptomes.map((s) => ({ type: s.type, principal: s.principal, libelle: s.libelle })),
    appareilsNonPertinents: Object.entries(o.appareils).filter(([, a]) => a.statut === 'na').map(([k]) => k),
    scores: Object.entries(o.scores).filter(([, v]) => v.inclure).map(([k]) => k),
    examensDemandes: o.cat.examensDemandes,
    surveillance: o.cat.surveillance,
    mesures: o.cat.mesures,
    differentiels: o.discussion.differentiels.map((d) => d.diagnostic).filter(Boolean),
  };
}
import { ageLabel, fmtDate } from '../engine/calc.ts';

export const FORMATS: { id: FormatObs; l: string; d: string }[] = [
  { id: 'complet', l: 'Observation complète détaillée', d: 'Toutes les rubriques, blocs d’examen détaillés, éléments non recherchés mentionnés, tableaux.' },
  { id: 'standard', l: 'Observation standard hospitalière', d: 'Rédaction fluide et compacte, appareils non examinés regroupés.' },
  { id: 'court', l: 'Synthèse médicale courte', d: 'Identité, synthèse clinique, diagnostic et conduite à tenir.' },
];

export function usePreferences(): Preferences {
  const [p, setP] = useState<Preferences>({ etablissement: '', service: '', enTete: '', signature: '' });
  useEffect(() => { api<Preferences>('/preferences').then(setP).catch(() => {}); }, []);
  return p;
}

export function Redaction() {
  const { data, update, readOnly, store } = useObs();
  const st = useObsStore(store);
  const session = useSession();
  const toast = useToast();
  const prefs = usePreferences();
  const [format, setFormat] = useState<FormatObs>(() => (sessionStorage.getItem('obs-format') as FormatObs) || 'standard');
  const [mode, setMode] = useState<'edition' | 'apercu'>('edition');
  const [valider, setValider] = useState(false);
  const [exportAsk, setExportAsk] = useState<null | 'pdf' | 'word' | 'print'>(null);
  const [printing, setPrinting] = useState(false);
  const [modele, setModele] = useState(false);
  const doc = useMemo(() => generate(data, format), [data, format]);
  const meta: ExportMeta = { obs: { ...st.full, data }, prefs, auteur: session.user.nom };
  useEffect(() => { try { sessionStorage.setItem('obs-format', format); } catch { /* ignoré */ } }, [format]);
  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => { window.print(); setPrinting(false); }, 80);
    return () => clearTimeout(t);
  }, [printing]);

  const verifiables = doc.sections.filter((s) => s.nodes.length > 0);
  const nbVerif = verifiables.filter((s) => data.redaction.verifies[s.id]).length;
  const journal = (action: string) => api(`/observations/${st.full.id}/journal`, { method: 'POST', body: { action } }).catch(() => {});

  const lancer = async (k: 'pdf' | 'word' | 'print') => {
    setExportAsk(null);
    await store.flush();
    try {
      if (k === 'pdf') { await exportPDF(doc, meta, format); journal('export_pdf'); toast('PDF généré.'); }
      else if (k === 'word') { await exportWord(doc, meta, format); journal('export_word'); toast('Document Word généré.'); }
      else { journal('impression'); setPrinting(true); }
    } catch (e) {
      console.error(e);
      toast(`Échec de l’export : ${(e as Error).message}`, true);
    }
  };
  const demander = (k: 'pdf' | 'word' | 'print') => (st.full.statut === 'validee' ? void lancer(k) : setExportAsk(k));
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(exportTexte(doc, meta));
      journal('copie');
      toast('Texte copié dans le presse-papiers.');
    } catch {
      toast('Copie impossible (autorisation du navigateur).', true);
    }
  };

  return (
    <div className="stack">
      <ModuleHeader title="Rédaction et export" desc="Observation générée automatiquement à partir des données saisies. Chaque paragraphe peut être vérifié et corrigé ; une validation finale précède l’export définitif.">
        <div className="row">
          {!readOnly && <button className="btn" onClick={() => setModele(true)} title="Enregistrer la structure de cette observation comme modèle réutilisable"><Icon name="template" />Modèle</button>}
          <button className="btn" onClick={copier}><Icon name="copy" />Copier</button>
          {!MODE_LOCAL && <button className="btn" onClick={() => demander('print')}><Icon name="print" />Imprimer</button>}
          <button className="btn" onClick={() => demander('word')}><Icon name="doc" />Word</button>
          <button className="btn" onClick={() => demander('pdf')}><Icon name="download" />PDF</button>
          {!readOnly && <button className="btn primary" onClick={() => setValider(true)}><Icon name="checkCircle" />Valider</button>}
        </div>
      </ModuleHeader>

      <div className={`alert ${st.full.statut === 'validee' ? 'ok' : 'warn'}`}>
        <Icon name={st.full.statut === 'validee' ? 'checkCircle' : 'alert'} className="alert-ico" />
        <div>{st.full.statut === 'validee' ? <>Observation <strong>validée</strong> par {st.full.validePar} le {st.full.valideLe ? new Date(st.full.valideLe).toLocaleString('fr-FR') : ''}. Toute modification la repasse en brouillon.</> : <>Observation en <strong>brouillon</strong> : les exports porteront la mention « BROUILLON — non validée ». {nbVerif}/{verifiables.length} paragraphes vérifiés.</>}</div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="col">
            <div className="tabs" style={{ marginBottom: 0 }}>
              {FORMATS.map((f) => <button key={f.id} className={format === f.id ? 'on' : ''} onClick={() => setFormat(f.id)} title={f.d}>{f.l}</button>)}
            </div>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={mode === 'edition' ? 'on' : ''} onClick={() => setMode('edition')}>Vérification</button>
              <button className={mode === 'apercu' ? 'on' : ''} onClick={() => setMode('apercu')}>Aperçu du document</button>
            </div>
          </div>
          <p className="small muted mt8">{FORMATS.find((f) => f.id === format)?.d}</p>
        </div>
      </div>

      {mode === 'apercu' ? (
        <Card><Entete meta={meta} doc={doc} /></Card>
      ) : (
        <div>
          {doc.sections.map((s) => <SectionEdit key={s.id} s={s} format={format} readOnly={readOnly} verifie={!!data.redaction.verifies[s.id]}
            onVerif={(v) => update((d) => { d.redaction.verifies[s.id] = v; })}
            onSave={(text) => update((d) => { const o = (d.redaction.overrides[format] ??= {}); o[s.id] = { text, base: empreinte(s.generated) }; })}
            onReset={() => update((d) => { delete d.redaction.overrides[format]?.[s.id]; })} />)}
        </div>
      )}

      {valider && <ValidationDialog onClose={() => setValider(false)} />}
      {modele && <EditeurModele onClose={() => setModele(false)} onDone={() => { setModele(false); toast('Modèle enregistré (structure uniquement, sans constatation clinique).'); }} initial={structureModele(data)} />}
      {exportAsk && (
        <Modal title="Observation non validée" onClose={() => setExportAsk(null)} footer={<>
          <button className="btn" onClick={() => setExportAsk(null)}>Annuler</button>
          <button className="btn" onClick={() => void lancer(exportAsk)}>Exporter le brouillon</button>
          {!readOnly && session.canValidate && <button className="btn primary" onClick={() => { setExportAsk(null); setValider(true); }}>Valider d’abord</button>}
        </>}>
          <p>Cette observation n’a pas encore fait l’objet de la <strong>validation finale</strong>. Le document exporté portera la mention <strong>« BROUILLON — non validée par le médecin »</strong>.</p>
        </Modal>
      )}
      {printing && createPortal(<div className="print-root"><Entete meta={meta} doc={doc} /></div>, document.body)}
    </div>
  );
}

function Entete({ meta, doc }: { meta: ExportMeta; doc: GeneratedDoc }) {
  const id = meta.obs.data.identite;
  const age = ageLabel(id.dateNaissance, meta.obs.data.admission.date?.slice(0, 10));
  const tete = enteteTexte(meta);
  return (
    <DocView doc={doc} entete={
      <div style={{ fontFamily: 'var(--font)', marginBottom: 10 }}>
        {tete && <div className="small" style={{ whiteSpace: 'pre-line', color: 'var(--text-2)' }}>{tete}</div>}
        <div className="small" style={{ textAlign: 'center', marginTop: 6 }}>{id.nom.toUpperCase()} {id.prenom}{id.dateNaissance ? ` — né(e) le ${fmtDate(id.dateNaissance)}${age ? ` (${age})` : ''}` : ''}{id.ipp ? ` — IPP ${id.ipp}` : ''}</div>
        {meta.obs.statut !== 'validee' && <div className="small" style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: 700 }}>BROUILLON — observation non validée</div>}
        {meta.obs.statut === 'validee' && meta.obs.valideLe && <div className="small" style={{ textAlign: 'center', color: 'var(--ok)' }}>Validée par {meta.obs.validePar} le {new Date(meta.obs.valideLe).toLocaleString('fr-FR')}</div>}
      </div>
    } />
  );
}

function SectionEdit({ s, format, readOnly, verifie, onVerif, onSave, onReset }: { s: DocSection; format: FormatObs; readOnly: boolean; verifie: boolean; onVerif: (v: boolean) => void; onSave: (t: string) => void; onReset: () => void }) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  if (s.level === 1 && s.nodes.length === 0) {
    return <h3 style={{ margin: '18px 0 8px', color: 'var(--primary)' }}>{s.title}</h3>;
  }
  void format;
  return (
    <div className={`sec-edit lvl${s.level} ${verifie ? 'verified' : ''}`} id={`sec-${s.id}`}>
      <div className="sec-h">
        <h4>{s.title}</h4>
        {s.edited && <span className="badge primary">modifié manuellement</span>}
        {s.stale && <span className="badge warn" title="Les données saisies ont changé depuis la modification manuelle">données modifiées depuis</span>}
        {s.vide && <span className="badge">non renseigné</span>}
        {!readOnly && !edit && <button className="btn xs" onClick={() => { setTxt(nodesToText(s.nodes)); setEdit(true); }}><Icon name="edit" size={12} />Modifier</button>}
        {!readOnly && s.edited && !edit && <button className="btn xs" onClick={onReset} title="Revenir au texte généré automatiquement"><Icon name="refresh" size={12} />Texte généré</button>}
        <label className="check small"><input type="checkbox" checked={verifie} disabled={readOnly} onChange={(e) => onVerif(e.target.checked)} />Vérifié</label>
      </div>
      <div className="sec-b">
        {edit ? (
          <div className="col">
            <Area rows={Math.min(18, Math.max(4, txt.split('\n').length + 2))} value={txt} onChange={setTxt} aria-label={`Texte de la section ${s.title}`} />
            <div className="small faint">Lignes commençant par « - » : liste. « Libellé : texte » : libellé en gras. Paragraphes séparés par une ligne vide.</div>
            <div className="row"><span className="spacer" /><button className="btn sm" onClick={() => setEdit(false)}>Annuler</button><button className="btn sm primary" onClick={() => { onSave(txt); setEdit(false); }}>Enregistrer le texte</button></div>
          </div>
        ) : (
          <div className="doc">{s.nodes.map((n, i) => <DocNodeView key={i} n={n} />)}</div>
        )}
        {s.stale && !edit && (
          <details className="small mt8"><summary>Voir le texte régénéré à partir des données actuelles</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{s.generated}</pre></details>
        )}
      </div>
    </div>
  );
}
