import { useMemo } from 'react';
import type { Constantes } from '../../shared/types.ts';
import { useObs } from '../app/context.tsx';
import { Area, Card, Field, Num, Seg } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { BlockView, ResumeAppareil } from '../ui/clinique.tsx';
import { APPAREIL_BY_ID, ETAT_GENERAL } from '../knowledge/appareils.ts';
import { FIELDS, FINDINGS } from '../knowledge/registry.ts';
import { CONSTANTES_DEF, alertesConstantes, erreursSaisie } from '../knowledge/constantes.ts';
import { buildContext } from '../engine/context.ts';
import { classeIMC, fmtNum, imc, num, pam, surfaceCorporelle } from '../engine/calc.ts';
import { liste } from '../engine/fr.ts';
import { resumeAppareil } from '../engine/examen.ts';
import { navigate } from '../app/router.ts';
import { ModuleHeader } from './common.tsx';

export function Examen({ sub, obsId }: { sub: string; obsId: number }) {
  if (sub === 'general' || !APPAREIL_BY_ID[sub]) return <General obsId={obsId} />;
  return <Appareil appId={sub} />;
}

function Constantes() {
  const { data, update, readOnly } = useObs();
  const c = data.constantes;
  const set = (k: keyof Constantes, v: string) => update((d) => { d.constantes[k] = v; });
  const alertes = [...erreursSaisie(c), ...alertesConstantes(c)];
  const parChamp = (k: string) => alertes.filter((a) => a.champ === k);
  const p = num(c.poids);
  const t = num(c.taille);
  const bmi = imc(p, t);
  const m = pam(num(c.pas), num(c.pad));
  const sc = surfaceCorporelle(p, t);
  const cls = (k: string) => { const a = parChamp(k); return a.some((x) => x.niveau === 'critique') ? 'crit' : a.some((x) => x.niveau === 'attention') ? 'warn' : ''; };
  return (
    <Card title="Constantes vitales et paramètres anthropométriques" sub="Valeurs signalées si hors normes, sans interprétation diagnostique.">
      <div className="grid g4">
        <Field label="Heure de mesure"><input type="time" value={c.heure} onChange={(e) => set('heure', e.target.value)} disabled={readOnly} aria-label="Heure de mesure" /></Field>
        {CONSTANTES_DEF.map((def) => {
          if (def.id === 'glycemie') {
            return (
              <Field key={def.id} label={def.label} help={`Réf. ${c.glycemieUnite === 'mmol/L' ? '3,9 – 6,1 mmol/L à jeun' : def.ref}`}>
                <div className="row nowrap">
                  <Num value={c.glycemie} onChange={(v) => set('glycemie', v)} disabled={readOnly} className={cls('glycemie')} aria-label="Glycémie capillaire" />
                  <select value={c.glycemieUnite || 'g/L'} onChange={(e) => set('glycemieUnite', e.target.value)} disabled={readOnly} style={{ width: 92 }} aria-label="Unité de glycémie">
                    <option>g/L</option><option>mmol/L</option><option>mg/dL</option>
                  </select>
                </div>
              </Field>
            );
          }
          if (def.id === 'spo2') {
            return (
              <Field key={def.id} label={def.label} help={`Réf. ${def.ref}`}>
                <Num value={c.spo2} unit="%" onChange={(v) => set('spo2', v)} disabled={readOnly} className={cls('spo2')} aria-label="SpO2" />
                <Seg value={c.o2} options={[{ v: 'aa', l: 'Air ambiant' }, { v: 'o2', l: 'Sous O₂' }]} onChange={(v) => set('o2', v)} disabled={readOnly} />
                {c.o2 === 'o2' && <Num value={c.o2Debit} unit="L/min" onChange={(v) => set('o2Debit', v)} disabled={readOnly} aria-label="Débit d’oxygène" />}
              </Field>
            );
          }
          return (
            <Field key={def.id} label={def.label} help={def.ref ? `Réf. ${def.ref}` : undefined}>
              <Num value={c[def.id]} unit={def.unit} onChange={(v) => set(def.id, v)} disabled={readOnly} className={cls(def.id)} aria-label={def.label} />
            </Field>
          );
        })}
      </div>
      <div className="row mt12 gap16">
        <span className="badge primary">IMC : {bmi !== null ? `${fmtNum(bmi)} kg/m² — ${classeIMC(bmi)}` : '—'}</span>
        <span className="badge primary">PAM : {m !== null ? `${Math.round(m)} mmHg` : '—'}</span>
        <span className="badge primary">Surface corporelle : {sc !== null ? `${fmtNum(sc, 2)} m²` : '—'}</span>
      </div>
      <Field label="Autres paramètres" className="mt12"><Area rows={2} value={c.autres} onChange={(v) => set('autres', v)} placeholder="ex. PA couché/debout, tour de taille, IPS…" disabled={readOnly} /></Field>
      {alertes.length > 0 && (
        <div className="col mt12">
          {alertes.map((a, i) => (
            <div key={i} className={`alert ${a.niveau === 'critique' ? 'danger' : a.niveau === 'attention' ? 'warn' : 'info'}`}><Icon name={a.niveau === 'info' ? 'info' : 'alert'} className="alert-ico" />{a.message}</div>
          ))}
          <div className="small faint">Signalement automatique destiné à attirer l’attention ; il ne remplace pas l’évaluation médicale.</div>
        </div>
      )}
    </Card>
  );
}

function General({ obsId }: { obsId: number }) {
  const { data } = useObs();
  const ctx = useMemo(() => buildContext(data), [data]);
  return (
    <div className="stack">
      <ModuleHeader title="État général et constantes" desc="État de conscience, signes généraux, constantes vitales et paramètres anthropométriques.">
        <button className="btn" onClick={() => navigate(`/obs/${obsId}/scores`)}><Icon name="scale" />Scores (Glasgow…)</button>
      </ModuleHeader>
      <Constantes />
      {ETAT_GENERAL.blocks.map((b) => <BlockView key={b.id} app={ETAT_GENERAL} block={b} focus={ctx.focus} />)}
    </div>
  );
}

function Appareil({ appId }: { appId: string }) {
  const { data, update, readOnly } = useObs();
  const app = APPAREIL_BY_ID[appId];
  const ctx = useMemo(() => buildContext(data), [data]);
  const st = data.appareils[appId]?.statut ?? '';
  const prioritaire = ctx.appareilsPrioritaires.has(appId);
  const focusIci = [...ctx.focus].filter((f) => app.blocks.some((b) => b.items.some((i) => i.id === f)));
  const proposer = () => {
    const r = resumeAppareil(data, appId);
    const parts: string[] = [];
    if (r.positifs.length) parts.push(`${app.redac} retrouvant ${liste(r.positifs)}`);
    else if (r.negatifs.length) parts.push(`${app.redac} sans anomalie parmi les éléments recherchés`);
    if (r.positifs.length && r.negatifs.length) parts.push(`sans ${liste(r.negatifs.slice(0, 6))}`);
    if (!parts.length) return;
    update((d) => { const a = (d.appareils[appId] ??= { notes: {}, conclusion: '' }); a.conclusion = parts.join(', ') + '.'; });
  };
  return (
    <div className="stack">
      <ModuleHeader title={app.title} desc={prioritaire ? 'Appareil prioritaire compte tenu de la symptomatologie analysée.' : undefined}>
        <Seg value={st === '' ? 'ex' : st} disabled={readOnly} options={[{ v: 'ex', l: 'À examiner / examiné' }, { v: 'nr', l: 'Non examiné' }, { v: 'na', l: 'Non pertinent' }]}
          onChange={(v) => update((d) => { const a = (d.appareils[appId] ??= { notes: {}, conclusion: '' }); a.statut = v === 'nr' || v === 'na' ? v : ''; })} />
      </ModuleHeader>
      {app.avertissement && <div className="alert warn"><Icon name="shield" className="alert-ico" />{app.avertissement}</div>}
      {focusIci.length > 0 && st === '' && (
        <div className="alert info"><Icon name="info" className="alert-ico" /><div>Éléments à rechercher en priorité (encadrés en pointillés) : {liste(focusIci.map((f) => (data.findings[f]?.s || data.fields[f] ? `${labelOf(f)} ✓` : labelOf(f))))}.</div></div>
      )}
      {st === '' ? (
        <>
          {app.blocks.map((b) => <BlockView key={b.id} app={app} block={b} focus={ctx.focus} />)}
          <Card title="Synthèse de l’appareil"><ResumeAppareil appId={appId} /></Card>
          <Card title="Conclusion de l’examen" actions={!readOnly && <button className="btn sm" onClick={proposer}><Icon name="sparkle" size={14} />Proposer à partir des signes saisis</button>}>
            <Area rows={2} value={data.appareils[appId]?.conclusion ?? ''} disabled={readOnly} onChange={(v) => update((d) => { const a = (d.appareils[appId] ??= { notes: {}, conclusion: '' }); a.conclusion = v; })} aria-label="Conclusion" />
          </Card>
        </>
      ) : (
        <Card><p className="muted">{st === 'nr' ? 'Appareil déclaré non examiné : il sera mentionné comme tel dans l’observation.' : 'Appareil déclaré non pertinent dans ce contexte : il sera mentionné comme non examiné.'}</p></Card>
      )}
    </div>
  );
}

function labelOf(id: string) {
  return (FINDINGS[id]?.label ?? FIELDS[id]?.label ?? id).toLowerCase();
}
