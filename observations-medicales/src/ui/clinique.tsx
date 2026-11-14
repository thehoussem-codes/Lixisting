/** Composants cliniques : signe (tri-état), champ d'examen, tableaux spécialisés, bloc d'appareil. */
import { memo, useState } from 'react';
import type { Draft } from 'immer';
import type { FindingVal, FState, Observation } from '../../shared/types.ts';
import { uid } from '../../shared/defaults.ts';
import { FIELDS, FINDINGS } from '../knowledge/registry.ts';
import type { AppareilDef, BlockDef, FieldDef, FindingDef } from '../knowledge/types.ts';
import {
  AIRES_GANGLIONNAIRES, APPAREIL_BY_ID, ARTICULATIONS, BABINSKI_VALEURS, LESIONS_TYPES, MRC_AIDE, MRC_SEGMENTS, MRC_VALEURS,
  NERFS_CRANIENS, NERFS_VALEURS, POULS_ARTERES, POULS_VALEURS, ROT_LISTE, ROT_VALEURS, SIGNES_ARTICULAIRES,
} from '../knowledge/appareils.ts';
import { useObs } from '../app/context.tsx';
import { Area, Chips, Confirm, Field, Hint, Num, Select, Seg, Suggest, Text, Tri } from './controls.tsx';
import { Icon } from './icons.tsx';
import { NR, resumeAppareil } from '../engine/examen.ts';
import { liste } from '../engine/fr.ts';

/* ------------------------------------------------------------------ */
/* Signe                                                                */
/* ------------------------------------------------------------------ */

interface FindingRowProps {
  def: FindingDef;
  val: FindingVal | undefined;
  sexe: string;
  focus?: boolean;
  partageAvec?: string;
  readOnly: boolean;
  update: (fn: (d: Draft<Observation>) => void) => void;
}

export const FindingRow = memo(function FindingRow({ def, val, sexe, focus, partageAvec, readOnly, update }: FindingRowProps) {
  const sexeNA = !!def.sex && !!sexe && def.sex !== sexe;
  const s = sexeNA ? 'na' : val?.s;
  const set = (fn: (v: FindingVal) => void) =>
    update((d) => {
      const cur = d.findings[def.id] ?? {};
      fn(cur);
      if (cur.s === undefined && !cur.d && !Object.values(cur.x ?? {}).some(Boolean)) delete d.findings[def.id];
      else d.findings[def.id] = cur;
    });
  return (
    <div className={`frow st-${s ?? 'none'} ${focus ? 'focus' : ''}`} data-finding={def.id}>
      <div className="flabel">
        <span>{def.label}</span>
        <Hint text={def.hint} />
        {focus && !s && <span className="badge warn" title="Élément à rechercher compte tenu de la symptomatologie">à rechercher</span>}
        {partageAvec && <span className="badge outline" title="État partagé : toute modification est reportée dans l’autre rubrique">partagé · {partageAvec}</span>}
        {sexeNA && <span className="badge">non applicable ({sexe === 'M' ? 'homme' : 'femme'})</span>}
      </div>
      <Tri label={def.label} value={s} disabled={readOnly || sexeNA} onChange={(v: FState | undefined) => set((c) => { c.s = v; })} />
      {s === 'p' && (
        <div className="fdetails">
          {(def.details ?? []).map((dt) => (
            <Field key={dt.id} label={dt.label}>
              {dt.type === 'select' ? (
                <Select value={val?.x?.[dt.id] ?? ''} options={dt.options ?? []} disabled={readOnly} onChange={(v) => set((c) => { c.x = { ...(c.x ?? {}), [dt.id]: v }; })} aria-label={`${def.label} – ${dt.label}`} />
              ) : dt.type === 'number' ? (
                <Num value={val?.x?.[dt.id] ?? ''} unit={dt.unit} disabled={readOnly} onChange={(v) => set((c) => { c.x = { ...(c.x ?? {}), [dt.id]: v }; })} aria-label={`${def.label} – ${dt.label}`} />
              ) : (
                <Text value={val?.x?.[dt.id] ?? ''} disabled={readOnly} onChange={(v) => set((c) => { c.x = { ...(c.x ?? {}), [dt.id]: v }; })} aria-label={`${def.label} – ${dt.label}`} />
              )}
            </Field>
          ))}
          <Field label="Précision libre">
            <Text value={val?.d ?? ''} disabled={readOnly} onChange={(v) => set((c) => { c.d = v; })} placeholder="ex. côté, siège, caractère…" aria-label={`${def.label} – précision`} />
          </Field>
        </div>
      )}
    </div>
  );
});

/** Raccourci : signe par identifiant, lié à l'observation courante */
export function Finding({ id, focus, ici }: { id: string; focus?: boolean; ici?: string }) {
  const { data, update, readOnly } = useObs();
  const def = FINDINGS[id];
  if (!def) return null;
  const partage = ici && def.home !== ici ? (APPAREIL_BY_ID[def.home]?.short ?? (def.home === 'hdm' ? 'HDM' : def.home)) : undefined;
  return <FindingRow def={def} val={data.findings[id]} sexe={data.identite.sexe} focus={focus} partageAvec={partage} readOnly={readOnly} update={update} />;
}

/* ------------------------------------------------------------------ */
/* Champ d'examen                                                       */
/* ------------------------------------------------------------------ */

export function FieldRow({ def, focus, partageAvec }: { def: FieldDef; focus?: boolean; partageAvec?: string }) {
  const { data, update, readOnly } = useObs();
  const v = data.fields[def.id] ?? '';
  const sexe = data.identite.sexe;
  if (def.sex && sexe && def.sex !== sexe) return null;
  const set = (x: string) => update((d) => { if (x) d.fields[def.id] = x; else delete d.fields[def.id]; });
  const opts = def.options ?? [];
  const court = opts.length <= 7 && opts.join('').length < 160;
  const anormal = v && v !== NR && (def.type === 'select') && !(def.nl ?? []).includes(v);
  return (
    <div className={`frow ${anormal ? 'st-p' : v && v !== NR ? 'st-a' : v === NR ? 'st-nr' : ''} ${focus ? 'focus' : ''}`} data-field={def.id}>
      <div className="flabel" style={{ gridColumn: '1 / -1' }}>
        <span>{def.label}</span>
        <Hint text={def.hint} />
        {focus && !v && <span className="badge warn">à rechercher</span>}
        {partageAvec && <span className="badge outline">partagé · {partageAvec}</span>}
        <span className="spacer" />
        {def.type !== 'text' && (
          <button type="button" className={`chip nr ${v === NR ? 'on' : ''}`} disabled={readOnly} onClick={() => set(v === NR ? '' : NR)} title="Non recherché / non évalué">NR</button>
        )}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        {def.type === 'select' ? (
          court ? <Seg value={v === NR ? '' : v} options={opts} onChange={set} disabled={readOnly} /> : <Select value={v === NR ? '' : v} options={opts} onChange={set} disabled={readOnly} aria-label={def.label} />
        ) : def.type === 'number' ? (
          <div style={{ maxWidth: 220 }}><Num value={v === NR ? '' : v} unit={def.unit} onChange={set} disabled={readOnly} aria-label={def.label} /></div>
        ) : (
          <Text value={v === NR ? '' : v} onChange={set} disabled={readOnly} placeholder={def.placeholder} aria-label={def.label} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tableaux spécialisés                                                 */
/* ------------------------------------------------------------------ */

function Pouls() {
  const { data, update, readOnly } = useObs();
  const p = data.specials.pouls;
  const set = (k: string, v: string) => update((d) => { if (v) d.specials.pouls[k] = v; else delete d.specials.pouls[k]; });
  return (
    <div className="card flat soft" style={{ padding: 10 }}>
      <div className="row mb8"><strong>Pouls périphériques</strong><span className="spacer" />
        <button type="button" className="btn xs" disabled={readOnly} onClick={() => update((d) => { for (const [k] of POULS_ARTERES) for (const c of ['d', 'g']) if (!d.specials.pouls[`${k}_${c}`]) d.specials.pouls[`${k}_${c}`] = 'perçu'; })} title="Renseigner « perçu » pour les pouls non encore renseignés (après palpation effective)">Tous les pouls non renseignés : perçus</button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Artère</th><th>Droit</th><th>Gauche</th></tr></thead>
          <tbody>
            {POULS_ARTERES.map(([k, l]) => (
              <tr key={k}>
                <td>{l}</td>
                {(['d', 'g'] as const).map((c) => (
                  <td key={c}><Select value={p[`${k}_${c}`] ?? ''} options={POULS_VALEURS} onChange={(v) => set(`${k}_${c}`, v)} disabled={readOnly} placeholder="—" aria-label={`Pouls ${l} ${c === 'd' ? 'droit' : 'gauche'}`} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaBras() {
  const { data, update, readOnly } = useObs();
  return (
    <div className="grid g2" style={{ padding: '6px 10px' }}>
      <Field label="PA bras droit (mmHg)" hint="Mesure aux deux bras si douleur thoracique, suspicion de dissection ou d’artériopathie. Différence > 20 mmHg significative.">
        <Text value={data.specials.paBras.droit} onChange={(v) => update((d) => { d.specials.paBras.droit = v; })} placeholder="ex. 135/80" disabled={readOnly} />
      </Field>
      <Field label="PA bras gauche (mmHg)">
        <Text value={data.specials.paBras.gauche} onChange={(v) => update((d) => { d.specials.paBras.gauche = v; })} placeholder="ex. 130/78" disabled={readOnly} />
      </Field>
    </div>
  );
}

function ListeEditable<T extends { uid: string }>({ titre, items, vide, onAdd, onRemove, render }: { titre: string; items: T[]; vide: string; onAdd: () => void; onRemove: (uid: string) => void; render: (it: T) => React.ReactNode }) {
  const { readOnly } = useObs();
  return (
    <div className="card flat soft" style={{ padding: 10 }}>
      <div className="row mb8"><strong>{titre}</strong><span className="spacer" /><button type="button" className="btn xs" onClick={onAdd} disabled={readOnly}><Icon name="plus" size={13} />Ajouter</button></div>
      {items.length === 0 && <div className="faint small">{vide}</div>}
      <div className="col">
        {items.map((it) => (
          <div key={it.uid} className="row nowrap" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{render(it)}</div>
            <button type="button" className="btn ghost sm icon" onClick={() => onRemove(it.uid)} disabled={readOnly} aria-label="Supprimer la ligne"><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Souffles() {
  const { data, update, readOnly } = useObs();
  const upd = (u: string, k: string, v: string) => update((d) => { const s = d.specials.souffles.find((x) => x.uid === u); if (s) (s as unknown as Record<string, string>)[k] = v; });
  return (
    <ListeEditable titre="Description des souffles" items={data.specials.souffles} vide="Aucun souffle décrit."
      onAdd={() => update((d) => { d.specials.souffles.push({ uid: uid(), temps: '', foyer: '', intensite: '', irradiation: '', caractere: '' }); if (d.findings.souffle_cardiaque?.s !== 'p') d.findings.souffle_cardiaque = { s: 'p' }; })}
      onRemove={(u) => update((d) => { d.specials.souffles = d.specials.souffles.filter((x) => x.uid !== u); })}
      render={(s) => (
        <div className="grid g3">
          <Field label="Temps"><Select value={s.temps} options={['systolique', 'diastolique', 'systolo-diastolique', 'continu']} onChange={(v) => upd(s.uid, 'temps', v)} disabled={readOnly} /></Field>
          <Field label="Foyer"><Select value={s.foyer} options={['aortique', 'pulmonaire', 'tricuspide', 'mitral', 'endapexien', 'mésocardiaque']} onChange={(v) => upd(s.uid, 'foyer', v)} disabled={readOnly} /></Field>
          <Field label="Intensité (/6)"><Select value={s.intensite} options={['1', '2', '3', '4', '5', '6']} onChange={(v) => upd(s.uid, 'intensite', v)} disabled={readOnly} /></Field>
          <Field label="Irradiation"><Suggest value={s.irradiation} suggestions={['vers l’aisselle', 'vers les vaisseaux du cou', 'le long du bord gauche du sternum', 'en rayon de roue', 'sans irradiation']} onChange={(v) => upd(s.uid, 'irradiation', v)} /></Field>
          <Field label="Timbre / caractère" className="span2"><Suggest value={s.caractere} suggestions={['rude, râpeux', 'doux, en jet de vapeur', 'humé, aspiratif', 'roulement', 'holosystolique', 'protomésosystolique']} onChange={(v) => upd(s.uid, 'caractere', v)} /></Field>
        </div>
      )} />
  );
}

function MRC() {
  const { data, update, readOnly } = useObs();
  const m = data.specials.mrc;
  return (
    <div className="card flat soft" style={{ padding: 10 }}>
      <div className="row mb8"><strong>Force musculaire (échelle MRC 0 à 5)</strong><Hint text={Object.entries(MRC_AIDE).map(([k, v]) => `${k} : ${v}`).join(' — ')} /></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Segment</th><th>Droit</th><th>Gauche</th></tr></thead>
        <tbody>{MRC_SEGMENTS.map(([k, l]) => (
          <tr key={k}><td>{l}</td>{(['d', 'g'] as const).map((c) => (
            <td key={c}><Select value={m[`${k}_${c}`] ?? ''} placeholder="—" options={MRC_VALEURS.map((v) => ({ v, l: v === 'NE' ? 'NE' : `${v}/5` }))} onChange={(v) => update((d) => { if (v) d.specials.mrc[`${k}_${c}`] = v; else delete d.specials.mrc[`${k}_${c}`]; })} disabled={readOnly} aria-label={`MRC ${l} ${c}`} /></td>
          ))}</tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function ROT() {
  const { data, update, readOnly } = useObs();
  const r = data.specials.rot;
  const set = (k: string, v: string) => update((d) => { if (v) d.specials.rot[k] = v; else delete d.specials.rot[k]; });
  return (
    <div className="card flat soft" style={{ padding: 10 }}>
      <div className="row mb8"><strong>Réflexes ostéotendineux et cutanés plantaires</strong></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Réflexe</th><th>Droit</th><th>Gauche</th></tr></thead>
        <tbody>
          {ROT_LISTE.map(([k, l]) => (
            <tr key={k}><td>{l}</td>{(['d', 'g'] as const).map((c) => <td key={c}><Select value={r[`${k}_${c}`] ?? ''} placeholder="—" options={ROT_VALEURS} onChange={(v) => set(`${k}_${c}`, v)} disabled={readOnly} aria-label={`${l} ${c}`} /></td>)}</tr>
          ))}
          <tr><td>Cutané plantaire</td>{(['d', 'g'] as const).map((c) => <td key={c}><Select value={r[`babinski_${c}`] ?? ''} placeholder="—" options={BABINSKI_VALEURS} onChange={(v) => set(`babinski_${c}`, v)} disabled={readOnly} aria-label={`Cutané plantaire ${c}`} /></td>)}</tr>
        </tbody>
      </table></div>
    </div>
  );
}

function Nerfs() {
  const { data, update, readOnly } = useObs();
  const n = data.specials.nerfs;
  return (
    <div className="card flat soft" style={{ padding: 10 }}>
      <div className="row mb8"><strong>Nerfs crâniens</strong></div>
      <div className="col">
        {NERFS_CRANIENS.map(([k, l]) => (
          <div key={k} className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) auto minmax(0, 1fr)', alignItems: 'center' }}>
            <span>{l}</span>
            <Seg value={n[k]?.s ?? ''} options={NERFS_VALEURS} disabled={readOnly} onChange={(v) => update((d) => { d.specials.nerfs[k] = { ...(d.specials.nerfs[k] ?? {}), s: v || undefined }; })} />
            {n[k]?.s === 'anormal' ? <Text value={n[k]?.d ?? ''} placeholder="Description de l’atteinte" onChange={(v) => update((d) => { d.specials.nerfs[k] = { ...(d.specials.nerfs[k] ?? {}), d: v }; })} disabled={readOnly} /> : <span />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Adenopathies() {
  const { data, update, readOnly } = useObs();
  const upd = (u: string, k: string, v: string) => update((d) => { const s = d.specials.adenopathies.find((x) => x.uid === u); if (s) (s as unknown as Record<string, string>)[k] = v; });
  return (
    <div className="col">
      <Field label="Aires ganglionnaires examinées" hint="Indiquer les aires effectivement palpées : seules celles-ci seront rédigées comme « libres ».">
        <Chips value={data.specials.airesExaminees} options={AIRES_GANGLIONNAIRES} onChange={(v) => update((d) => { d.specials.airesExaminees = v; })} disabled={readOnly} />
      </Field>
      <ListeEditable titre="Adénopathies palpées" items={data.specials.adenopathies} vide="Aucune adénopathie décrite."
        onAdd={() => update((d) => { d.specials.adenopathies.push({ uid: uid(), aire: '', cote: '', taille: '', consistance: '', mobilite: '', sensibilite: '', autre: '' }); d.findings.adenopathies = { ...(d.findings.adenopathies ?? {}), s: 'p' }; })}
        onRemove={(u) => update((d) => { d.specials.adenopathies = d.specials.adenopathies.filter((x) => x.uid !== u); })}
        render={(a) => (
          <div className="grid g4">
            <Field label="Aire"><Suggest value={a.aire} suggestions={['cervicale', 'sous-mandibulaire', 'sus-claviculaire', 'axillaire', 'épitrochléenne', 'inguinale', 'poplitée']} onChange={(v) => upd(a.uid, 'aire', v)} /></Field>
            <Field label="Côté"><Select value={a.cote} options={['droite', 'gauche', 'bilatérale']} onChange={(v) => upd(a.uid, 'cote', v)} disabled={readOnly} /></Field>
            <Field label="Taille (cm)"><Num value={a.taille} onChange={(v) => upd(a.uid, 'taille', v)} disabled={readOnly} /></Field>
            <Field label="Consistance"><Select value={a.consistance} options={['molle', 'élastique', 'ferme', 'dure', 'fluctuante']} onChange={(v) => upd(a.uid, 'consistance', v)} disabled={readOnly} /></Field>
            <Field label="Mobilité"><Select value={a.mobilite} options={['mobile', 'fixée aux plans profonds', 'adhérente à la peau']} onChange={(v) => upd(a.uid, 'mobilite', v)} disabled={readOnly} /></Field>
            <Field label="Sensibilité"><Select value={a.sensibilite} options={['indolore', 'sensible', 'inflammatoire']} onChange={(v) => upd(a.uid, 'sensibilite', v)} disabled={readOnly} /></Field>
            <Field label="Autre" className="span2"><Text value={a.autre} onChange={(v) => upd(a.uid, 'autre', v)} disabled={readOnly} /></Field>
          </div>
        )} />
    </div>
  );
}

function Articulations() {
  const { data, update, readOnly } = useObs();
  const upd = (u: string, fn: (a: Draft<Observation>['specials']['articulations'][number]) => void) => update((d) => { const s = d.specials.articulations.find((x) => x.uid === u); if (s) fn(s); });
  return (
    <ListeEditable titre="Articulations atteintes" items={data.specials.articulations} vide="Aucune articulation atteinte décrite."
      onAdd={() => update((d) => { d.specials.articulations.push({ uid: uid(), articulation: '', cote: '', signes: [], amplitude: '', detail: '' }); })}
      onRemove={(u) => update((d) => { d.specials.articulations = d.specials.articulations.filter((x) => x.uid !== u); })}
      render={(a) => (
        <div className="grid g3">
          <Field label="Articulation"><Suggest value={a.articulation} suggestions={ARTICULATIONS} onChange={(v) => upd(a.uid, (x) => { x.articulation = v; })} /></Field>
          <Field label="Côté"><Suggest value={a.cote} suggestions={['droit', 'gauche', 'bilatéral']} onChange={(v) => upd(a.uid, (x) => { x.cote = v; })} /></Field>
          <Field label="Amplitudes"><Text value={a.amplitude} placeholder="ex. flexion limitée à 90°" onChange={(v) => upd(a.uid, (x) => { x.amplitude = v; })} disabled={readOnly} /></Field>
          <Field label="Signes" className="spanall"><Chips value={a.signes} options={SIGNES_ARTICULAIRES} onChange={(v) => upd(a.uid, (x) => { x.signes = v; })} disabled={readOnly} /></Field>
          <Field label="Précision" className="spanall"><Text value={a.detail} onChange={(v) => upd(a.uid, (x) => { x.detail = v; })} disabled={readOnly} /></Field>
        </div>
      )} />
  );
}

function Lesions() {
  const { data, update, readOnly } = useObs();
  const upd = (u: string, k: string, v: string) => update((d) => { const s = d.specials.lesions.find((x) => x.uid === u); if (s) (s as unknown as Record<string, string>)[k] = v; });
  return (
    <ListeEditable titre="Lésions cutanées élémentaires" items={data.specials.lesions} vide="Aucune lésion décrite."
      onAdd={() => update((d) => { d.specials.lesions.push({ uid: uid(), type: '', localisation: '', taille: '', description: '' }); d.findings.lesions_cutanees = { ...(d.findings.lesions_cutanees ?? {}), s: 'p' }; })}
      onRemove={(u) => update((d) => { d.specials.lesions = d.specials.lesions.filter((x) => x.uid !== u); })}
      render={(l) => (
        <div className="grid g4">
          <Field label="Type"><Select value={l.type} options={LESIONS_TYPES} onChange={(v) => upd(l.uid, 'type', v)} disabled={readOnly} /></Field>
          <Field label="Localisation"><Text value={l.localisation} placeholder="ex. des membres inférieurs" onChange={(v) => upd(l.uid, 'localisation', v)} disabled={readOnly} /></Field>
          <Field label="Taille"><Text value={l.taille} onChange={(v) => upd(l.uid, 'taille', v)} disabled={readOnly} /></Field>
          <Field label="Description"><Text value={l.description} placeholder="couleur, bords, vitropression…" onChange={(v) => upd(l.uid, 'description', v)} disabled={readOnly} /></Field>
        </div>
      )} />
  );
}

const SPECIAUX: Record<string, () => React.ReactNode> = {
  pouls: Pouls, paBras: PaBras, souffles: Souffles, mrc: MRC, rot: ROT, nerfs: Nerfs, adenopathies: Adenopathies, articulations: Articulations, lesions: Lesions,
};

/* ------------------------------------------------------------------ */
/* Bloc d'examen                                                        */
/* ------------------------------------------------------------------ */

export function BlockView({ app, block, focus }: { app: AppareilDef; block: BlockDef; focus: Set<string> }) {
  const { data, update, readOnly } = useObs();
  const [confirm, setConfirm] = useState(false);
  const sexe = data.identite.sexe;
  const ids = block.items.filter((i) => i.kind === 'f' || (i.kind === 'ref' && FINDINGS[i.id])).map((i) => i.id);
  const nonRens = ids.filter((id) => !data.findings[id]?.s && !(FINDINGS[id].sex && sexe && FINDINGS[id].sex !== sexe));
  return (
    <div className="card" id={`bloc-${block.id}`}>
      <div className="card-h">
        <h3>{block.title}{block.siIndique && <span className="badge warn" style={{ marginLeft: 8 }}>si indiqué</span>}</h3>
        <Hint text={block.hint} />
        {nonRens.length > 0 && !readOnly && (
          <button type="button" className="btn xs" onClick={() => setConfirm(true)} title="À n’utiliser que si chacun de ces éléments a effectivement été recherché">
            {nonRens.length} non renseigné{nonRens.length > 1 ? 's' : ''} → absents
          </button>
        )}
      </div>
      <div className="card-b">
        <div className="flist">
          {block.items.map((it, i) => {
            if (it.kind === 'sp') { const C = SPECIAUX[it.id]; return <div key={`sp${i}`} style={{ margin: '6px 0' }}><C /></div>; }
            if (FINDINGS[it.id]) return <Finding key={it.id} id={it.id} focus={focus.has(it.id)} ici={app.id} />;
            if (FIELDS[it.id]) {
              const fd = FIELDS[it.id];
              const partage = fd.home !== app.id ? APPAREIL_BY_ID[fd.home]?.short : undefined;
              return <FieldRow key={it.id} def={fd} focus={focus.has(it.id)} partageAvec={partage} />;
            }
            return null;
          })}
        </div>
        <Field label="Autres constatations / précisions" className="mt8">
          <Area rows={2} value={data.appareils[app.id]?.notes?.[block.id] ?? ''} disabled={readOnly}
            onChange={(v) => update((d) => { const a = (d.appareils[app.id] ??= { notes: {}, conclusion: '' }); a.notes[block.id] = v; })}
            placeholder="Texte libre repris tel quel dans l’observation" aria-label={`Précisions ${block.title}`} />
        </Field>
      </div>
      {confirm && (
        <Confirm
          text={<>
            <p>Marquer comme <strong>absents après recherche</strong> les {nonRens.length} éléments non renseignés de « {block.title} » ?</p>
            <p className="muted mt8">Cette action atteste que chacun a été <strong>effectivement recherché</strong>. Les éléments non recherchés doivent rester non renseignés ou être marqués « NR ».</p>
            <p className="small faint mt8">{liste(nonRens.map((id) => FINDINGS[id].label.toLowerCase()))}.</p>
          </>}
          yes="Je confirme les avoir recherchés"
          onNo={() => setConfirm(false)}
          onYes={() => { update((d) => { for (const id of nonRens) d.findings[id] = { ...(d.findings[id] ?? {}), s: 'a' }; }); setConfirm(false); }} />
      )}
    </div>
  );
}

/** Résumé en direct des signes positifs / négatifs d'un appareil */
export function ResumeAppareil({ appId }: { appId: string }) {
  const { data } = useObs();
  const r = resumeAppareil(data, appId);
  return (
    <div className="grid g3">
      <div><div className="small" style={{ fontWeight: 700, color: 'var(--present)' }}>Signes positifs ({r.positifs.length})</div><div className="small mt8">{r.positifs.length ? liste(r.positifs) : <span className="faint">Aucun</span>}</div></div>
      <div><div className="small" style={{ fontWeight: 700, color: 'var(--absent)' }}>Négatifs / normaux ({r.negatifs.length})</div><div className="small mt8">{r.negatifs.length ? liste(r.negatifs) : <span className="faint">Aucun</span>}</div></div>
      <div><div className="small" style={{ fontWeight: 700, color: 'var(--nr)' }}>Non recherchés ({r.nr.length})</div><div className="small mt8">{r.nr.length ? liste(r.nr) : <span className="faint">Aucun</span>}</div><div className="small faint mt8">{r.renseignes}/{r.total} éléments renseignés</div></div>
    </div>
  );
}
