import { useMemo, useState } from 'react';
import { useObs } from '../app/context.tsx';
import { Card } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { bilan, type Verif } from '../engine/completude.ts';
import { navigate } from '../app/router.ts';
import { MODULES, ModuleHeader } from './common.tsx';

const NIVEAUX: { id: Verif['niveau']; titre: string; cls: string }[] = [
  { id: 'indispensable', titre: 'Informations indispensables', cls: 'danger' },
  { id: 'recommande', titre: 'Informations recommandées', cls: 'warn' },
  { id: 'non_pertinent', titre: 'Non pertinentes dans ce contexte', cls: '' },
];

export function Completude({ obsId }: { obsId: number }) {
  const { data } = useObs();
  const b = useMemo(() => bilan(data), [data]);
  const [tout, setTout] = useState(false);
  const lien = (v: Verif) => {
    if (v.module === 'examen') return `/obs/${obsId}/examen/${v.cible && v.cible !== 'constantes' && v.cible !== 'eg' ? v.cible : 'general'}`;
    return `/obs/${obsId}/${v.module}`;
  };
  const nomModule = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;
  return (
    <div className="stack">
      <ModuleHeader title="Contrôle de complétude" desc="Vérification automatique avant finalisation : éléments manquants classés par importance, incohérences entre les données, constantes à signaler et rappels contextuels.">
        <label className="check small"><input type="checkbox" checked={tout} onChange={(e) => setTout(e.target.checked)} />Afficher aussi les éléments complets</label>
      </ModuleHeader>
      <Card>
        <div className="row gap16">
          <div className="ring" style={{ ['--v' as string]: b.global, width: 64, height: 64, fontSize: 14 }} data-v={`${b.global}%`} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>Complétude globale : {b.global} %</strong>
            <div className="small muted">{b.manquantsIndispensables} indispensable(s) manquant(s) · {b.verifs.filter((v) => v.niveau === 'recommande' && !v.ok).length} recommandé(s) manquant(s) · {b.incoherences.length} incohérence(s) · {b.alertes.filter((a) => a.niveau !== 'info').length} constante(s) à signaler</div>
          </div>
        </div>
        <div className="grid g4 mt12">
          {MODULES.filter((m) => m.progress).map((m) => (
            <button key={m.id} className="btn ghost" style={{ justifyContent: 'flex-start', height: 'auto', padding: 6 }} onClick={() => navigate(`/obs/${obsId}/${m.id}${m.subs ? '/general' : ''}`)}>
              <div style={{ width: '100%' }}><div className="row small"><span style={{ flex: 1, textAlign: 'left' }}>{m.label}</span><strong>{b.progression[m.progress as keyof typeof b.progression]}%</strong></div>
                <div className={`progress mt8 ${b.progression[m.progress as keyof typeof b.progression] === 100 ? 'ok' : ''}`}><span style={{ width: `${b.progression[m.progress as keyof typeof b.progression]}%` }} /></div></div>
            </button>
          ))}
        </div>
      </Card>

      {b.incoherences.length > 0 && (
        <Card title={`Incohérences détectées (${b.incoherences.length})`}>
          <div className="col">{b.incoherences.map((i) => (
            <div key={i.id} className={`alert ${i.gravite === 'critique' ? 'danger' : 'warn'}`}><Icon name="alert" className="alert-ico" /><div style={{ flex: 1 }}>{i.message}</div><button className="btn xs" onClick={() => navigate(`/obs/${obsId}/${i.module === 'examen' ? 'examen/general' : i.module}`)}>Corriger</button></div>
          ))}</div>
        </Card>
      )}

      {NIVEAUX.map((n) => {
        const list = b.verifs.filter((v) => v.niveau === n.id && (tout || !v.ok));
        if (!list.length) return null;
        return (
          <Card key={n.id} title={`${n.titre} (${list.filter((v) => !v.ok).length} manquant${list.filter((v) => !v.ok).length > 1 ? 's' : ''})`}>
            <div className="col" style={{ gap: 2 }}>
              {list.map((v) => (
                <a key={v.id} className="list-item" href={`#${lien(v)}`} style={{ padding: '8px 10px' }}>
                  <Icon name={v.ok ? 'checkCircle' : n.id === 'non_pertinent' ? 'info' : 'alert'} className="" size={16} />
                  <div style={{ flex: 1 }}><div style={{ color: v.ok ? 'var(--ok)' : undefined }}>{v.libelle}</div>{v.detail && <div className="small muted">{v.detail}</div>}</div>
                  <span className="badge outline">{nomModule(v.module)}</span>
                  {!v.ok && n.cls && <span className={`badge ${n.cls}`}>{n.id === 'indispensable' ? 'indispensable' : 'recommandé'}</span>}
                </a>
              ))}
            </div>
          </Card>
        );
      })}

      {b.alertes.length > 0 && (
        <Card title="Constantes à signaler" sub="Signalement automatique, sans interprétation diagnostique.">
          <div className="col">{b.alertes.map((a, i) => <div key={i} className={`alert ${a.niveau === 'critique' ? 'danger' : a.niveau === 'attention' ? 'warn' : 'info'}`}><Icon name="alert" className="alert-ico" />{a.message}</div>)}</div>
        </Card>
      )}

      {b.rappels.map((r) => (
        <Card key={r.symptome} title={`Rappels contextuels — ${r.titre}`} className="rappel">
          <div className="grid g2">
            <div>
              <h4 className="small mb8">Éléments d’examen à documenter</h4>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {r.items.filter((i) => i.fait !== null).map((i) => <li key={i.texte} className="small" style={{ color: i.fait ? 'var(--ok)' : undefined }}>{i.fait ? '✓' : '○'} {i.texte}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="small mb8">Rappels</h4>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{r.items.filter((i) => i.fait === null).map((i) => <li key={i.texte}>{i.texte}</li>)}</ul>
              {r.drapeaux.length > 0 && <><h4 className="small mb8 mt12" style={{ color: 'var(--danger)' }}>Drapeaux rouges</h4><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{r.drapeaux.map((x) => <li key={x}>{x}</li>)}</ul></>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
