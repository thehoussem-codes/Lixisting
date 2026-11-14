import { useMemo, useState } from 'react';
import type { SymptomEntry } from '../../shared/types.ts';
import { uid } from '../../shared/defaults.ts';
import { useObs } from '../app/context.tsx';
import { Area, Card, Chips, Field, Hint, Modal, Num, Select, Seg, Text, YNInput } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { Finding } from '../ui/clinique.tsx';
import { CATEGORIES_SYMPTOMES, SYMPTOMES, SYMPTOME_BY_ID, type Question, type SymptomDef } from '../knowledge/symptomes.ts';
import { FINDINGS } from '../knowledge/registry.ts';
import { SYMPTOME_SIGNE, redigerHDM } from '../engine/hdm.ts';
import { patient } from '../engine/fr.ts';
import { ModuleHeader } from './common.tsx';

const GROUPES: { id: Question['group']; titre: string }[] = [
  { id: 'chrono', titre: 'Chronologie' },
  { id: 'caract', titre: 'Caractéristiques sémiologiques' },
  { id: 'specifique', titre: 'Questions spécifiques' },
  { id: 'facteurs', titre: 'Facteurs déclenchants, aggravants, calmants' },
  { id: 'retentissement', titre: 'Retentissement et traitements essayés' },
];

export function HDM() {
  const { data, update, readOnly } = useObs();
  const [picker, setPicker] = useState(false);
  const h = data.hdm;
  const ajouter = (def: SymptomDef) => {
    update((d) => {
      d.hdm.symptomes.push({ uid: uid(), type: def.id, principal: d.hdm.symptomes.length === 0, libelle: '', a: {} });
      const signe = SYMPTOME_SIGNE[def.id];
      if (signe && !d.findings[signe]?.s) d.findings[signe] = { ...(d.findings[signe] ?? {}), s: 'p' };
      if (!d.motif.principal && d.hdm.symptomes.length === 1) d.motif.principal = def.label;
    });
    setPicker(false);
  };
  const apercu = useMemo(() => redigerHDM({ obs: data, pt: patient(data.identite.sexe), written: new Set(), complet: false }), [data]);
  return (
    <div className="stack">
      <ModuleHeader title="Histoire de la maladie" desc="Assistant d’interrogatoire : ajoutez le symptôme principal puis les symptômes associés. Chaque symptôme ouvre une analyse sémiologique adaptée (approche OPQRST pour la douleur).">
        {!readOnly && <button className="btn primary" onClick={() => setPicker(true)}><Icon name="plus" />Ajouter un symptôme</button>}
      </ModuleHeader>

      {h.symptomes.length === 0 && (
        <Card>
          <div className="empty">
            <p>Aucun symptôme analysé.</p>
            {!readOnly && <button className="btn primary mt12" onClick={() => setPicker(true)}><Icon name="plus" />Choisir le symptôme principal</button>}
          </div>
        </Card>
      )}

      {h.symptomes.map((s) => <SymptomeCard key={s.uid} s={s} />)}

      <Card title="Traitements reçus avant l’admission" actions={
        <Seg value={h.traitementsAvant.s ?? ''} disabled={readOnly} options={[{ v: 'p', l: 'Oui' }, { v: 'a', l: 'Aucun' }, { v: 'nr', l: 'Non recherché' }]}
          onChange={(v) => update((d) => { d.hdm.traitementsAvant.s = (v || undefined) as 'p' | 'a' | 'nr' | undefined; if (v === 'p' && !d.hdm.traitementsAvant.entries.length) d.hdm.traitementsAvant.entries.push({ uid: uid(), nom: '', type: '', efficacite: '', tolerance: '', observance: '' }); })} />}>
        {h.traitementsAvant.s === 'p' ? (
          <div className="col">
            {h.traitementsAvant.entries.map((t) => {
              const set = (k: string, v: string) => update((d) => { const x = d.hdm.traitementsAvant.entries.find((y) => y.uid === t.uid); if (x) (x as unknown as Record<string, string>)[k] = v; });
              return (
                <div key={t.uid} className="grid g4" style={{ alignItems: 'end' }}>
                  <Field label="Traitement (nom, dose)" className="span2"><Text value={t.nom} onChange={(v) => set('nom', v)} disabled={readOnly} /></Field>
                  <Field label="Type"><Select value={t.type} options={['automédication', 'prescrit']} onChange={(v) => set('type', v)} disabled={readOnly} /></Field>
                  <Field label="Efficacité"><Select value={t.efficacite} options={['efficace', 'partiellement efficace', 'inefficace']} onChange={(v) => set('efficacite', v)} disabled={readOnly} /></Field>
                  <Field label="Tolérance"><Select value={t.tolerance} options={['bonne', 'effets indésirables']} onChange={(v) => set('tolerance', v)} disabled={readOnly} /></Field>
                  <Field label="Observance"><Select value={t.observance} options={['bonne', 'partielle', 'mauvaise']} onChange={(v) => set('observance', v)} disabled={readOnly} /></Field>
                  <div>{!readOnly && <button className="btn ghost sm" onClick={() => update((d) => { d.hdm.traitementsAvant.entries = d.hdm.traitementsAvant.entries.filter((x) => x.uid !== t.uid); })}><Icon name="trash" size={14} />Retirer</button>}</div>
                </div>
              );
            })}
            {!readOnly && <div><button className="btn sm" onClick={() => update((d) => { d.hdm.traitementsAvant.entries.push({ uid: uid(), nom: '', type: '', efficacite: '', tolerance: '', observance: '' }); })}><Icon name="plus" size={14} />Ajouter</button></div>}
          </div>
        ) : <p className="muted">{h.traitementsAvant.s === 'a' ? 'Aucun traitement avant l’admission.' : h.traitementsAvant.s === 'nr' ? 'Non recherché.' : 'Non renseigné.'}</p>}
      </Card>

      <Card title="Parcours avant l’admission et récit complémentaire">
        <div className="grid g2">
          <Field label="Parcours de soins (consultations, urgences, transfert)"><Area rows={3} value={h.parcours} onChange={(v) => update((d) => { d.hdm.parcours = v; })} disabled={readOnly} /></Field>
          <Field label="Récit libre complémentaire" help="Repris tel quel à la fin de l’histoire de la maladie."><Area rows={3} value={h.recit} onChange={(v) => update((d) => { d.hdm.recit = v; })} disabled={readOnly} /></Field>
        </div>
      </Card>

      <Card title="Synthèse rédigée de l’histoire de la maladie" sub="Générée automatiquement à partir des réponses ; modifiable dans « Rédaction et export ».">
        <div className="doc">{apercu.length ? apercu.map((p, i) => <p key={i}>{p}</p>) : <p className="vide">Aucune donnée.</p>}</div>
      </Card>

      {picker && (
        <Modal title="Ajouter un symptôme" onClose={() => setPicker(false)} large>
          {CATEGORIES_SYMPTOMES.map((cat) => (
            <div key={cat} className="mb8">
              <h4 className="mb8 muted">{cat}</h4>
              <div className="chips mb8">
                {SYMPTOMES.filter((s) => s.categorie === cat).map((s) => (
                  <button key={s.id} className="chip" onClick={() => ajouter(s)}>{s.label}</button>
                ))}
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

function SymptomeCard({ s }: { s: SymptomEntry }) {
  const { data, update, readOnly } = useObs();
  const def = SYMPTOME_BY_ID[s.type];
  const [rappels, setRappels] = useState(true);
  if (!def) return null;
  const setA = (k: string, v: string | string[] | undefined) => update((d) => {
    const x = d.hdm.symptomes.find((y) => y.uid === s.uid);
    if (!x) return;
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete x.a[k];
    else x.a[k] = v;
  });
  const sexe = data.identite.sexe;
  const assoc = def.associes.filter((f) => FINDINGS[f] && f !== SYMPTOME_SIGNE[s.type] && (!FINDINGS[f].sex || !sexe || FINDINGS[f].sex === sexe));
  const nbAssoc = assoc.filter((f) => data.findings[f]?.s).length;
  return (
    <section className="card" id={`sym-${s.uid}`}>
      <div className="card-h">
        <h3>
          {def.id === 'autre' ? <Text value={s.libelle} placeholder="Libellé du symptôme" onChange={(v) => update((d) => { const x = d.hdm.symptomes.find((y) => y.uid === s.uid); if (x) x.libelle = v; })} disabled={readOnly} /> : def.label}
        </h3>
        {def.douleur && <span className="badge present">analyse de la douleur</span>}
        <label className="check small"><input type="radio" name="principal" checked={s.principal} disabled={readOnly} onChange={() => update((d) => { d.hdm.symptomes.forEach((x) => { x.principal = x.uid === s.uid; }); })} /> Symptôme principal</label>
        {!readOnly && <button className="btn ghost sm icon" aria-label="Retirer le symptôme" onClick={() => update((d) => { d.hdm.symptomes = d.hdm.symptomes.filter((x) => x.uid !== s.uid); if (d.hdm.symptomes.length && !d.hdm.symptomes.some((x) => x.principal)) d.hdm.symptomes[0].principal = true; })}><Icon name="trash" size={15} /></button>}
      </div>
      <div className="card-b stack">
        {GROUPES.map((g) => {
          const qs = def.questions.filter((q) => q.group === g.id && (!q.sex || !sexe || q.sex === sexe));
          if (!qs.length) return null;
          return (
            <div key={g.id}>
              <h4 className="mb8" style={{ color: 'var(--primary)' }}>{g.titre}</h4>
              <div className="grid g2">
                {qs.map((q) => <QuestionInput key={q.id} q={q} v={s.a[q.id]} onChange={(v) => setA(q.id, v)} readOnly={readOnly} />)}
              </div>
            </div>
          );
        })}
        <div>
          <h4 className="mb8" style={{ color: 'var(--primary)' }}>Signes associés à rechercher <span className="badge">{nbAssoc}/{assoc.length}</span>
            <Hint text="État partagé avec l’interrogatoire fonctionnel des appareils : renseigner un signe ici le renseigne aussi dans l’examen clinique." /></h4>
          <div className="flist">{assoc.map((f) => <Finding key={f} id={f} ici="hdm" />)}</div>
        </div>
        <div className="card flat rappel" style={{ padding: 12 }}>
          <div className="row"><strong><Icon name="alert" size={15} /> Rappels sémiologiques — {def.label}</strong><span className="spacer" /><button className="btn ghost xs" onClick={() => setRappels(!rappels)}>{rappels ? 'Masquer' : 'Afficher'}</button></div>
          {rappels && (
            <div className="grid g3 mt8">
              <div><div className="small" style={{ fontWeight: 700 }}>À faire / rechercher</div><ul className="small" style={{ paddingLeft: 18, margin: '4px 0' }}>{def.rappels.map((r) => <li key={r}>{r}</li>)}</ul></div>
              <div><div className="small" style={{ fontWeight: 700, color: 'var(--danger)' }}>Drapeaux rouges</div><ul className="small" style={{ paddingLeft: 18, margin: '4px 0' }}>{def.drapeaux.length ? def.drapeaux.map((r) => <li key={r}>{r}</li>) : <li className="faint">—</li>}</ul></div>
              <div><div className="small" style={{ fontWeight: 700 }}>Diagnostics graves à ne pas manquer</div><ul className="small" style={{ paddingLeft: 18, margin: '4px 0' }}>{def.aNePasManquer.length ? def.aNePasManquer.map((r) => <li key={r}>{r}</li>) : <li className="faint">—</li>}</ul></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QuestionInput({ q, v, onChange, readOnly }: { q: Question; v: string | string[] | undefined; onChange: (v: string | string[] | undefined) => void; readOnly: boolean }) {
  const str = typeof v === 'string' ? v : '';
  const full = q.type === 'multi' || (q.type === 'select' && (q.options?.join('').length ?? 0) > 120);
  let input: React.ReactNode;
  switch (q.type) {
    case 'date': input = <Text type="date" value={str} onChange={onChange} disabled={readOnly} aria-label={q.label} />; break;
    case 'time': input = <Text type="time" value={str} onChange={onChange} disabled={readOnly} aria-label={q.label} />; break;
    case 'number': input = <div style={{ maxWidth: 200 }}><Num value={str} unit={q.unit} onChange={onChange} disabled={readOnly} aria-label={q.label} /></div>; break;
    case 'eva':
      input = (
        <div className="row nowrap">
          <input type="range" min={0} max={10} step={1} value={str === '' ? 0 : Number(str)} onChange={(e) => onChange(e.target.value)} disabled={readOnly} aria-label={q.label} style={{ flex: 1, opacity: str === '' ? 0.4 : 1 }} />
          <strong style={{ minWidth: 44 }}>{str === '' ? '—' : `${str}/10`}</strong>
          {str !== '' && <button type="button" className="btn ghost xs" onClick={() => onChange(undefined)}>effacer</button>}
        </div>
      ); break;
    case 'yn': input = <YNInput label={q.label} value={str} onChange={(x) => onChange(x)} disabled={readOnly} />; break;
    case 'multi': input = <Chips value={Array.isArray(v) ? v : []} options={q.options ?? []} onChange={onChange} disabled={readOnly} />; break;
    case 'select': input = (q.options?.length ?? 0) <= 6 ? <Seg value={str} options={q.options ?? []} onChange={onChange} disabled={readOnly} /> : <Select value={str} options={q.options ?? []} onChange={onChange} disabled={readOnly} aria-label={q.label} />; break;
    default: input = <Text value={str} onChange={onChange} placeholder={q.placeholder} disabled={readOnly} aria-label={q.label} />;
  }
  const rempli = Array.isArray(v) ? v.length > 0 : str !== '';
  return (
    <Field label={<>{q.label}{q.essentiel && !rempli && <span className="badge warn">essentiel</span>}</>} hint={q.hint} className={full ? 'spanall' : ''}>
      {input}
    </Field>
  );
}
