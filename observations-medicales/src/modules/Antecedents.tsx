import { useState } from 'react';
import type { Draft } from 'immer';
import type { AtcdEntry, FState, Observation, YN } from '../../shared/types.ts';
import { uid } from '../../shared/defaults.ts';
import { useObs } from '../app/context.tsx';
import { Card, Field, Hint, Num, Select, Seg, Suggest, Text, Tri, YNInput } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { ATCD_FAMILIAUX, ATCD_MEDICAUX, LIENS_PARENTE, OBSERVANCES, REACTIONS_ALLERGIE, TYPES_ALLERGIE, VOIES } from '../knowledge/antecedents.ts';
import { MEDICAMENTS } from '../knowledge/medicaments.ts';
import { fmtNum, num, paquetsAnnees } from '../engine/calc.ts';
import { ModuleHeader } from './common.tsx';

type Upd = (fn: (d: Draft<Observation>) => void) => void;

const TABS = [
  { id: 'medicaux', l: 'Médicaux' },
  { id: 'chirurgicaux', l: 'Chirurgicaux' },
  { id: 'gyneco', l: 'Gynéco-obstétricaux' },
  { id: 'familiaux', l: 'Familiaux' },
  { id: 'toxiques', l: 'Habitudes de vie' },
  { id: 'allergies', l: 'Allergies' },
  { id: 'traitements', l: 'Traitements habituels' },
];

export function Antecedents() {
  const { data } = useObs();
  const [tab, setTab] = useState('medicaux');
  const tabs = TABS.filter((t) => t.id !== 'gyneco' || data.identite.sexe !== 'M');
  return (
    <div>
      <ModuleHeader title="Antécédents" desc="Pour chaque rubrique, distinguer explicitement : présent, absent après recherche, non recherché. Une rubrique laissée vide reste « non renseignée »." />
      <div className="tabs" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.l}</button>)}
      </div>
      {tab === 'medicaux' && <Medicaux />}
      {tab === 'chirurgicaux' && <Chirurgicaux />}
      {tab === 'gyneco' && <Gyneco />}
      {tab === 'familiaux' && <Familiaux />}
      {tab === 'toxiques' && <Toxiques />}
      {tab === 'allergies' && <Allergies />}
      {tab === 'traitements' && <Traitements />}
    </div>
  );
}

/* ---------------- Médicaux ---------------- */
function Medicaux() {
  const { data, update, readOnly } = useObs();
  const a = data.atcd;
  return (
    <div className="stack">
      <div className="alert info"><Icon name="info" className="alert-ico" /><div>Pour chaque pathologie : <strong>Présent</strong> (puis détailler), <strong>Absent</strong> (recherché et absent), <strong>NR</strong> (non recherché). Préciser date de diagnostic, traitement, suivi, complications et évolution.</div></div>
      <label className="check"><input type="checkbox" checked={a.medicauxAucun} disabled={readOnly} onChange={(e) => update((d) => { d.atcd.medicauxAucun = e.target.checked; })} /> Aucun antécédent médical (recherche effectuée)</label>
      {ATCD_MEDICAUX.map((cat) => {
        const v = a.medicaux[cat.id];
        return (
          <div key={cat.id} className={`card ${v?.s === 'p' ? '' : 'flat'}`}>
            <div className="card-h" style={{ borderBottom: v?.s === 'p' ? undefined : 0 }}>
              <h3 style={{ fontWeight: 600 }}>{cat.label} <Hint text={cat.hint} /></h3>
              <Tri compact label={cat.label} value={v?.s} disabled={readOnly} onChange={(s) => update((d) => {
                const c = (d.atcd.medicaux[cat.id] ??= { entries: [] });
                c.s = s as 'p' | 'a' | 'nr' | undefined;
                if (s === 'p' && c.entries.length === 0) c.entries.push(nouvelleEntree(cat.id === 'autres' ? '' : ''));
                if (!s && !c.entries.some((e) => e.nom || e.traitement)) delete d.atcd.medicaux[cat.id];
              })} />
            </div>
            {v?.s === 'p' && (
              <div className="card-b col">
                {v.entries.map((e) => <EntreeAtcd key={e.uid} catId={cat.id} e={e} suggestions={cat.suggestions} update={update} readOnly={readOnly} />)}
                {!readOnly && <div><button className="btn sm" onClick={() => update((d) => { d.atcd.medicaux[cat.id].entries.push(nouvelleEntree('')); })}><Icon name="plus" size={14} />Ajouter une pathologie</button></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function nouvelleEntree(nom: string): AtcdEntry {
  return { uid: uid(), nom, date: '', traitement: '', suivi: '', complications: '', evolution: '' };
}

function EntreeAtcd({ catId, e, suggestions, update, readOnly }: { catId: string; e: AtcdEntry; suggestions: string[]; update: Upd; readOnly: boolean }) {
  const set = (k: keyof AtcdEntry, v: string) => update((d) => { const x = d.atcd.medicaux[catId].entries.find((y) => y.uid === e.uid); if (x) (x as unknown as Record<string, string>)[k] = v; });
  return (
    <div className="card flat soft" style={{ padding: 10 }}>
      <div className="grid g3">
        <Field label="Pathologie" className="span2"><Suggest value={e.nom} suggestions={suggestions} onChange={(v) => set('nom', v)} placeholder="Pathologie précise" /></Field>
        <Field label="Date de diagnostic" help="Date ou année"><Text value={e.date} onChange={(v) => set('date', v)} placeholder="ex. 2018" disabled={readOnly} /></Field>
        <Field label="Traitement"><Text value={e.traitement} onChange={(v) => set('traitement', v)} disabled={readOnly} /></Field>
        <Field label="Suivi"><Text value={e.suivi} onChange={(v) => set('suivi', v)} disabled={readOnly} /></Field>
        <Field label="Complications"><Text value={e.complications} onChange={(v) => set('complications', v)} disabled={readOnly} /></Field>
        <Field label="Évolution" className="span2"><Text value={e.evolution} onChange={(v) => set('evolution', v)} disabled={readOnly} /></Field>
        <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          {!readOnly && <button className="btn ghost sm" onClick={() => update((d) => { const c = d.atcd.medicaux[catId]; c.entries = c.entries.filter((x) => x.uid !== e.uid); })}><Icon name="trash" size={14} />Retirer</button>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Chirurgicaux ---------------- */
function StatutRubrique({ value, onChange, labels }: { value?: 'p' | 'a' | 'nr'; onChange: (v: 'p' | 'a' | 'nr' | undefined) => void; labels: [string, string, string] }) {
  const { readOnly } = useObs();
  return <Seg value={value ?? ''} disabled={readOnly} options={[{ v: 'p', l: labels[0] }, { v: 'a', l: labels[1] }, { v: 'nr', l: labels[2] }]} onChange={(v) => onChange((v || undefined) as 'p' | 'a' | 'nr' | undefined)} />;
}

function Chirurgicaux() {
  const { data, update, readOnly } = useObs();
  const c = data.atcd.chirurgicaux;
  const set = (u: string, k: string, v: string) => update((d) => { const x = d.atcd.chirurgicaux.entries.find((y) => y.uid === u); if (x) (x as unknown as Record<string, string>)[k] = v; });
  return (
    <Card title="Antécédents chirurgicaux" actions={<StatutRubrique value={c.s} labels={['Antécédents présents', 'Aucun', 'Non recherchés']} onChange={(v) => update((d) => { d.atcd.chirurgicaux.s = v; if (v === 'p' && !d.atcd.chirurgicaux.entries.length) d.atcd.chirurgicaux.entries.push({ uid: uid(), intervention: '', date: '', indication: '', complications: '' }); })} />}>
      {c.s === 'p' ? (
        <div className="col">
          {c.entries.map((e) => (
            <div key={e.uid} className="card flat soft" style={{ padding: 10 }}>
              <div className="grid g4">
                <Field label="Intervention" className="span2"><Text value={e.intervention} onChange={(v) => set(e.uid, 'intervention', v)} disabled={readOnly} /></Field>
                <Field label="Date"><Text value={e.date} onChange={(v) => set(e.uid, 'date', v)} placeholder="année" disabled={readOnly} /></Field>
                <Field label="Indication"><Text value={e.indication} onChange={(v) => set(e.uid, 'indication', v)} disabled={readOnly} /></Field>
                <Field label="Complications éventuelles" className="span3"><Text value={e.complications} onChange={(v) => set(e.uid, 'complications', v)} disabled={readOnly} /></Field>
                <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>{!readOnly && <button className="btn ghost sm" onClick={() => update((d) => { d.atcd.chirurgicaux.entries = d.atcd.chirurgicaux.entries.filter((x) => x.uid !== e.uid); })}><Icon name="trash" size={14} />Retirer</button>}</div>
              </div>
            </div>
          ))}
          {!readOnly && <div><button className="btn sm" onClick={() => update((d) => { d.atcd.chirurgicaux.entries.push({ uid: uid(), intervention: '', date: '', indication: '', complications: '' }); })}><Icon name="plus" size={14} />Ajouter une intervention</button></div>}
        </div>
      ) : <p className="muted">{c.s === 'a' ? 'Aucun antécédent chirurgical.' : c.s === 'nr' ? 'Non recherchés.' : 'Non renseignés.'}</p>}
    </Card>
  );
}

/* ---------------- Gynéco-obstétricaux ---------------- */
function Gyneco() {
  const { data, update, readOnly } = useObs();
  const g = data.atcd.gyneco;
  const set = (k: keyof typeof g, v: string) => update((d) => { (d.atcd.gyneco as unknown as Record<string, string>)[k] = v; });
  return (
    <div className="stack">
      {data.identite.sexe === '' && <div className="alert warn"><Icon name="alert" className="alert-ico" />Sexe non renseigné dans l’état civil.</div>}
      <Card title="Grossesse" sub="Statut indispensable chez la femme en âge de procréer (imagerie irradiante, médicaments).">
        <div className="grid g2">
          <Field label="Statut de grossesse"><Seg value={g.grossesse} options={[{ v: 'exclue', l: 'Exclue' }, { v: 'possible', l: 'Possible' }, { v: 'en_cours', l: 'En cours' }, { v: 'nr', l: 'Non vérifié' }]} onChange={(v) => set('grossesse', v)} disabled={readOnly} /></Field>
          {g.grossesse === 'en_cours' && <Field label="Terme"><Text value={g.termeGrossesse} onChange={(v) => set('termeGrossesse', v)} placeholder="ex. 24 SA" disabled={readOnly} /></Field>}
        </div>
      </Card>
      <Card title="Antécédents obstétricaux">
        <div className="grid g4">
          <Field label="Gestité (G)"><Num value={g.gestite} onChange={(v) => set('gestite', v)} disabled={readOnly} /></Field>
          <Field label="Parité (P)"><Num value={g.parite} onChange={(v) => set('parite', v)} disabled={readOnly} /></Field>
          <Field label="Accouchements voie basse"><Num value={g.accouchementsVB} onChange={(v) => set('accouchementsVB', v)} disabled={readOnly} /></Field>
          <Field label="Césariennes"><Num value={g.cesariennes} onChange={(v) => set('cesariennes', v)} disabled={readOnly} /></Field>
          <Field label="Fausses couches"><Num value={g.faussesCouches} onChange={(v) => set('faussesCouches', v)} disabled={readOnly} /></Field>
          <Field label="IVG"><Num value={g.ivg} onChange={(v) => set('ivg', v)} disabled={readOnly} /></Field>
        </div>
      </Card>
      <Card title="Cycles, ménopause, contraception">
        <div className="grid g3">
          <Field label="Ménopause"><Seg value={g.menopause} options={[{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non' }]} onChange={(v) => set('menopause', v)} disabled={readOnly} /></Field>
          {g.menopause === 'oui' ? (
            <>
              <Field label="Âge de la ménopause"><Num value={g.ageMenopause} unit="ans" onChange={(v) => set('ageMenopause', v)} disabled={readOnly} /></Field>
              <Field label="Traitement hormonal substitutif"><Text value={g.ths} onChange={(v) => set('ths', v)} disabled={readOnly} /></Field>
            </>
          ) : (
            <>
              <Field label="Date des dernières règles"><Text type="date" value={g.ddr} onChange={(v) => set('ddr', v)} disabled={readOnly} aria-label="Date des dernières règles" /></Field>
              <Field label="Cycles"><Suggest value={g.cycles} suggestions={['réguliers', 'irréguliers', 'aménorrhée']} onChange={(v) => set('cycles', v)} /></Field>
            </>
          )}
          <Field label="Contraception"><Suggest value={g.contraception} suggestions={['aucune', 'œstroprogestative', 'microprogestative', 'DIU au cuivre', 'DIU hormonal', 'implant', 'préservatif']} onChange={(v) => set('contraception', v)} /></Field>
          <Field label="Antécédents gynécologiques" className="span2"><Text value={g.atcdGyneco} onChange={(v) => set('atcdGyneco', v)} placeholder="frottis, mammographie, pathologies…" disabled={readOnly} /></Field>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Familiaux ---------------- */
function Familiaux() {
  const { data, update, readOnly } = useObs();
  const f = data.atcd.familiaux;
  const set = (u: string, k: string, v: string) => update((d) => { const x = d.atcd.familiaux.entries.find((y) => y.uid === u); if (x) (x as unknown as Record<string, string>)[k] = v; });
  return (
    <div className="stack">
      <Card title="Antécédents familiaux" actions={<StatutRubrique value={f.s} labels={['Présents', 'Aucun notable', 'Non recherchés']} onChange={(v) => update((d) => { d.atcd.familiaux.s = v; })} />}>
        <div className="flist">
          {ATCD_FAMILIAUX.map((c) => (
            <div key={c.id} className={`frow st-${f.cats[c.id] ?? 'none'}`}>
              <div className="flabel">{c.label}<Hint text={c.hint} /></div>
              <Tri compact label={c.label} value={f.cats[c.id]} disabled={readOnly} onChange={(v: FState | undefined) => update((d) => {
                if (v) d.atcd.familiaux.cats[c.id] = v; else delete d.atcd.familiaux.cats[c.id];
                if (v === 'p') { d.atcd.familiaux.s = 'p'; if (!d.atcd.familiaux.entries.some((e) => e.cat === c.id)) d.atcd.familiaux.entries.push({ uid: uid(), cat: c.id, pathologie: c.id === 'autres' ? '' : c.label.replace(/s$/, ''), lien: '', age: '' }); }
              })} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Détail (pathologie, lien de parenté, âge de survenue)" actions={!readOnly && <button className="btn sm" onClick={() => update((d) => { d.atcd.familiaux.entries.push({ uid: uid(), cat: 'autres', pathologie: '', lien: '', age: '' }); d.atcd.familiaux.s = 'p'; })}><Icon name="plus" size={14} />Ajouter</button>}>
        {f.entries.length === 0 && <p className="faint">Aucun antécédent familial détaillé.</p>}
        <div className="col">
          {f.entries.map((e) => (
            <div key={e.uid} className="grid g4" style={{ alignItems: 'end' }}>
              <Field label="Pathologie" className="span2"><Text value={e.pathologie} onChange={(v) => set(e.uid, 'pathologie', v)} disabled={readOnly} /></Field>
              <Field label="Lien de parenté"><Suggest value={e.lien} suggestions={LIENS_PARENTE} onChange={(v) => set(e.uid, 'lien', v)} /></Field>
              <div className="row nowrap"><Field label="Âge de survenue"><Num value={e.age} unit="ans" onChange={(v) => set(e.uid, 'age', v)} disabled={readOnly} /></Field>
                {!readOnly && <button className="btn ghost sm icon" style={{ marginTop: 18 }} aria-label="Retirer" onClick={() => update((d) => { d.atcd.familiaux.entries = d.atcd.familiaux.entries.filter((x) => x.uid !== e.uid); })}><Icon name="trash" size={14} /></button>}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Toxiques ---------------- */
function Toxiques() {
  const { data, update, readOnly } = useObs();
  const t = data.atcd.toxiques;
  const set = (k: keyof typeof t, v: string) => update((d) => { (d.atcd.toxiques as unknown as Record<string, unknown>)[k] = v; });
  const pa = paquetsAnnees(num(t.cigJour), num(t.tabacAnnees));
  const detaScore = Object.values(t.deta).filter((x) => x === 'oui').length;
  return (
    <div className="stack">
      <Card title="Tabac">
        <div className="grid g4">
          <Field label="Statut tabagique" className="spanall"><Seg value={t.tabac} options={[{ v: 'non', l: 'Non-fumeur' }, { v: 'actif', l: 'Actif' }, { v: 'sevre', l: 'Sevré' }, { v: 'passif', l: 'Passif' }, { v: 'nr', l: 'Non recherché' }]} onChange={(v) => set('tabac', v)} disabled={readOnly} /></Field>
          {(t.tabac === 'actif' || t.tabac === 'sevre') && (
            <>
              <Field label="Cigarettes par jour"><Num value={t.cigJour} onChange={(v) => set('cigJour', v)} disabled={readOnly} min={0} max={200} /></Field>
              <Field label="Durée (années)"><Num value={t.tabacAnnees} onChange={(v) => set('tabacAnnees', v)} disabled={readOnly} min={0} max={90} /></Field>
              <Field label="Paquets-années" help={pa !== null ? <>Calculé : <strong>{fmtNum(pa)} PA</strong> (cig/j ÷ 20 × années)</> : 'Saisie directe ou calcul automatique'}>
                <Num value={t.paquetsAnnees} onChange={(v) => set('paquetsAnnees', v)} disabled={readOnly} placeholder={pa !== null ? fmtNum(pa) : ''} />
              </Field>
              {t.tabac === 'sevre' && <Field label="Date / année d’arrêt"><Text value={t.tabacArret} onChange={(v) => set('tabacArret', v)} disabled={readOnly} /></Field>}
            </>
          )}
          <Field label="Autre (chicha, tabac à chiquer…)" className="spanall"><Text value={t.tabacAutre} onChange={(v) => set('tabacAutre', v)} disabled={readOnly} /></Field>
        </div>
      </Card>
      <Card title="Alcool">
        <div className="grid g3">
          <Field label="Consommation" className="spanall"><Seg value={t.alcool} options={[{ v: 'non', l: 'Aucune' }, { v: 'occasionnel', l: 'Occasionnelle' }, { v: 'regulier', l: 'Régulière' }, { v: 'sevre', l: 'Sevré' }, { v: 'nr', l: 'Non recherchée' }]} onChange={(v) => set('alcool', v)} disabled={readOnly} /></Field>
          {(t.alcool === 'occasionnel' || t.alcool === 'regulier') && (
            <>
              <Field label="Verres standard / jour" help={num(t.alcoolVerresJour) !== null ? `≈ ${Math.round((num(t.alcoolVerresJour) ?? 0) * 10)} g d’alcool par jour` : '1 verre standard ≈ 10 g d’alcool'}><Num value={t.alcoolVerresJour} onChange={(v) => set('alcoolVerresJour', v)} disabled={readOnly} /></Field>
              <Field label="Précisions" className="span2"><Text value={t.alcoolDetail} onChange={(v) => set('alcoolDetail', v)} disabled={readOnly} /></Field>
              <Field label={`Questionnaire DETA (${detaScore}/4)`} className="spanall" hint="≥ 2 réponses positives : mésusage probable.">
                <div className="col">
                  {([['d', 'Besoin de Diminuer ?'], ['e', 'Remarques de l’Entourage ?'], ['t', 'Impression de boire Trop ?'], ['a', 'Alcool le matin ?']] as const).map(([k, l]) => (
                    <div key={k} className="row"><span style={{ minWidth: 240 }}>{l}</span><YNInput label={l} value={t.deta[k]} disabled={readOnly} onChange={(v: YN | undefined) => update((d) => { d.atcd.toxiques.deta[k] = v; })} /></div>
                  ))}
                </div>
              </Field>
            </>
          )}
        </div>
      </Card>
      <Card title="Autres habitudes et expositions">
        <div className="grid g2">
          <Field label="Substances psychoactives"><Seg value={t.substances} options={[{ v: 'non', l: 'Aucune' }, { v: 'oui', l: 'Oui' }, { v: 'nr', l: 'Non recherché' }]} onChange={(v) => set('substances', v)} disabled={readOnly} /></Field>
          {t.substances === 'oui' && <Field label="Lesquelles, fréquence, voie"><Text value={t.substancesDetail} onChange={(v) => set('substancesDetail', v)} disabled={readOnly} /></Field>}
          <Field label="Exposition professionnelle" hint="Amiante, silice, solvants, poussières, agents biologiques…"><Text value={t.expoPro} onChange={(v) => set('expoPro', v)} disabled={readOnly} /></Field>
          <Field label="Expositions environnementales" hint="Animaux, eau de puits, voyages, habitat…"><Text value={t.expoEnv} onChange={(v) => set('expoEnv', v)} disabled={readOnly} /></Field>
          <Field label="Activité physique"><Suggest value={t.activitePhysique} suggestions={['sédentaire', 'activité physique régulière', 'activité physique occasionnelle', 'sportif']} onChange={(v) => set('activitePhysique', v)} /></Field>
          <Field label="Habitudes alimentaires"><Text value={t.alimentation} onChange={(v) => set('alimentation', v)} disabled={readOnly} /></Field>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Allergies ---------------- */
function Allergies() {
  const { data, update, readOnly } = useObs();
  const a = data.atcd.allergies;
  const set = (u: string, k: string, v: string) => update((d) => { const x = d.atcd.allergies.entries.find((y) => y.uid === u); if (x) (x as unknown as Record<string, string>)[k] = v; });
  return (
    <Card title="Allergies" actions={<Seg value={a.statut} disabled={readOnly} options={[{ v: 'aucune', l: 'Aucune allergie connue' }, { v: 'presentes', l: 'Allergies présentes' }, { v: 'non_verifiees', l: 'Non vérifiées' }]} onChange={(v) => update((d) => { d.atcd.allergies.statut = v as typeof a.statut; if (v === 'presentes' && !d.atcd.allergies.entries.length) d.atcd.allergies.entries.push({ uid: uid(), type: 'Médicament', agent: '', reaction: '', date: '', documentee: '' }); })} />}>
      {a.statut === 'presentes' ? (
        <div className="col">
          {a.entries.map((e) => (
            <div key={e.uid} className="card flat soft" style={{ padding: 10 }}>
              <div className="grid g3">
                <Field label="Type"><Select value={e.type} options={TYPES_ALLERGIE} onChange={(v) => set(e.uid, 'type', v)} disabled={readOnly} /></Field>
                <Field label="Agent (médicament, aliment…)"><Suggest value={e.agent} suggestions={e.type === 'Médicament' ? [...MEDICAMENTS, 'Pénicillines', 'Sulfamides', 'AINS', 'Céphalosporines'] : []} onChange={(v) => set(e.uid, 'agent', v)} /></Field>
                <Field label="Nature de la réaction"><Suggest value={e.reaction} suggestions={REACTIONS_ALLERGIE} onChange={(v) => set(e.uid, 'reaction', v)} /></Field>
                <Field label="Date / année"><Text value={e.date} onChange={(v) => set(e.uid, 'date', v)} disabled={readOnly} /></Field>
                <Field label="Documentation"><Select value={e.documentee} options={['documentée (bilan allergologique)', 'non documentée', 'rapportée par le patient']} onChange={(v) => set(e.uid, 'documentee', v)} disabled={readOnly} /></Field>
                <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>{!readOnly && <button className="btn ghost sm" onClick={() => update((d) => { d.atcd.allergies.entries = d.atcd.allergies.entries.filter((x) => x.uid !== e.uid); })}><Icon name="trash" size={14} />Retirer</button>}</div>
              </div>
            </div>
          ))}
          {!readOnly && <div><button className="btn sm" onClick={() => update((d) => { d.atcd.allergies.entries.push({ uid: uid(), type: 'Médicament', agent: '', reaction: '', date: '', documentee: '' }); })}><Icon name="plus" size={14} />Ajouter une allergie</button></div>}
        </div>
      ) : (
        <p className={a.statut === 'non_verifiees' || !a.statut ? '' : 'muted'} style={{ color: a.statut === 'non_verifiees' || !a.statut ? 'var(--warning)' : undefined }}>
          {a.statut === 'aucune' ? 'Aucune allergie connue (recherche effectuée).' : a.statut === 'non_verifiees' ? 'Allergies non vérifiées : à compléter avant toute prescription.' : 'Statut allergique non renseigné.'}
        </p>
      )}
    </Card>
  );
}

/* ---------------- Traitements ---------------- */
function Traitements() {
  const { data, update, readOnly } = useObs();
  const t = data.atcd.traitements;
  const set = (u: string, k: string, v: string) => update((d) => { const x = d.atcd.traitements.entries.find((y) => y.uid === u); if (x) (x as unknown as Record<string, string>)[k] = v; });
  const add = () => update((d) => { d.atcd.traitements.entries.push({ uid: uid(), nom: '', dosage: '', posologie: '', voie: 'per os', frequence: '', observance: '', debut: '' }); d.atcd.traitements.statut = 'liste'; });
  return (
    <Card title="Traitements habituels" actions={<Seg value={t.statut} disabled={readOnly} options={[{ v: 'liste', l: 'Traitement en cours' }, { v: 'aucun', l: 'Aucun traitement' }, { v: 'non_verifies', l: 'Non vérifié' }]} onChange={(v) => update((d) => { d.atcd.traitements.statut = v as typeof t.statut; if (v === 'liste' && !d.atcd.traitements.entries.length) d.atcd.traitements.entries.push({ uid: uid(), nom: '', dosage: '', posologie: '', voie: 'per os', frequence: '', observance: '', debut: '' }); })} />}>
      {t.statut === 'liste' ? (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th style={{ minWidth: 170 }}>Médicament (DCI)</th><th>Dosage</th><th>Posologie</th><th>Voie</th><th>Fréquence</th><th>Observance</th><th>Début</th><th /></tr></thead>
              <tbody>
                {t.entries.map((m) => (
                  <tr key={m.uid}>
                    <td><Suggest value={m.nom} suggestions={MEDICAMENTS} onChange={(v) => set(m.uid, 'nom', v)} ariaLabel="Médicament" /></td>
                    <td><Text value={m.dosage} onChange={(v) => set(m.uid, 'dosage', v)} placeholder="5 mg" disabled={readOnly} aria-label="Dosage" /></td>
                    <td><Text value={m.posologie} onChange={(v) => set(m.uid, 'posologie', v)} placeholder="1 cp" disabled={readOnly} aria-label="Posologie" /></td>
                    <td><Select value={m.voie} options={VOIES} onChange={(v) => set(m.uid, 'voie', v)} disabled={readOnly} aria-label="Voie" /></td>
                    <td><Suggest value={m.frequence} suggestions={['le matin', 'le soir', 'matin et soir', '3 fois par jour', 'si besoin', 'une fois par semaine']} onChange={(v) => set(m.uid, 'frequence', v)} ariaLabel="Fréquence" /></td>
                    <td><Select value={m.observance} options={OBSERVANCES} onChange={(v) => set(m.uid, 'observance', v)} disabled={readOnly} aria-label="Observance" /></td>
                    <td><Text value={m.debut} onChange={(v) => set(m.uid, 'debut', v)} placeholder="année" disabled={readOnly} aria-label="Début" /></td>
                    <td>{!readOnly && <button className="btn ghost sm icon" aria-label="Retirer" onClick={() => update((d) => { d.atcd.traitements.entries = d.atcd.traitements.entries.filter((x) => x.uid !== m.uid); })}><Icon name="trash" size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && <button className="btn sm mt12" onClick={add}><Icon name="plus" size={14} />Ajouter un médicament</button>}
        </>
      ) : (
        <p style={{ color: t.statut === 'non_verifies' || !t.statut ? 'var(--warning)' : undefined }} className={t.statut === 'aucun' ? 'muted' : ''}>
          {t.statut === 'aucun' ? 'Pas de traitement au long cours.' : t.statut === 'non_verifies' ? 'Traitement habituel non vérifié (ordonnance à obtenir).' : 'Traitement habituel non renseigné.'}
        </p>
      )}
    </Card>
  );
}
