import { useMemo } from 'react';
import { useObs } from '../app/context.tsx';
import { Area, Card } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { generate } from '../engine/generate.ts';
import { navigate } from '../app/router.ts';
import { DocNodeView, ModuleHeader } from './common.tsx';

export function Synthese({ obsId }: { obsId: number }) {
  const { data, update, readOnly } = useObs();
  const doc = useMemo(() => generate(data, 'standard'), [data]);
  const s = doc.sections.find((x) => x.id === 'synthese');
  return (
    <div className="stack">
      <ModuleHeader title="Synthèse clinique" desc="Générée automatiquement : identité et terrain, motif, histoire résumée, signes fonctionnels et physiques positifs, négatifs pertinents, constantes anormales et résultats significatifs.">
        <button className="btn" onClick={() => navigate(`/obs/${obsId}/redaction`)}><Icon name="edit" />Modifier le texte</button>
      </ModuleHeader>
      <Card title="Synthèse générée" sub={s?.edited ? 'Texte modifié manuellement dans la rédaction.' : 'Mise à jour en temps réel.'}>
        <div className="doc">{s?.nodes.map((n, i) => <DocNodeView key={i} n={n} />)}</div>
        {s?.stale && <div className="alert warn mt12"><Icon name="alert" className="alert-ico" />Les données ont changé depuis la modification manuelle : vérifiez le texte dans la rédaction.</div>}
      </Card>
      <Card title="Complément de synthèse (facultatif)" sub="Ajouté à la fin de la synthèse générée.">
        <Area rows={3} value={data.syntheseNote} onChange={(v) => update((d) => { d.syntheseNote = v; })} disabled={readOnly} aria-label="Complément de synthèse" />
      </Card>
      <label className="check"><input type="checkbox" checked={!!data.redaction.verifies.synthese} disabled={readOnly} onChange={(e) => update((d) => { d.redaction.verifies.synthese = e.target.checked; })} /> J’ai relu et vérifié la synthèse</label>
    </div>
  );
}
