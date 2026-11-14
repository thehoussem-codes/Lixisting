import { useMemo, useState } from 'react';
import type { ObservationFull } from '../../shared/types.ts';
import { useObs, useSession, useToast } from '../app/context.tsx';
import { api, ApiError } from '../app/api.ts';
import { Area, Modal } from '../ui/controls.tsx';
import { Icon } from '../ui/icons.tsx';
import { bilan } from '../engine/completude.ts';
import { generate } from '../engine/generate.ts';
import { navigate } from '../app/router.ts';

/** Validation finale de l'observation par le médecin. */
export function ValidationDialog({ onClose }: { onClose: () => void }) {
  const { data, store } = useObs();
  const session = useSession();
  const toast = useToast();
  const b = useMemo(() => bilan(data), [data]);
  const doc = useMemo(() => generate(data, 'standard'), [data]);
  const nonVerif = doc.sections.filter((s) => s.nodes.length && !data.redaction.verifies[s.id]);
  const stale = doc.sections.filter((s) => s.stale);
  const manquants = b.verifs.filter((v) => v.niveau === 'indispensable' && !v.ok);
  const critiques = b.incoherences.filter((i) => i.gravite === 'critique');
  const [atteste, setAtteste] = useState(false);
  const [justif, setJustif] = useState('');
  const [busy, setBusy] = useState(false);
  const justifRequise = manquants.length > 0 || critiques.length > 0 || nonVerif.length > 0;
  const go = (path: string) => { onClose(); navigate(`/obs/${store.state.full.id}/${path}`); };

  const valider = async () => {
    setBusy(true);
    try {
      await store.flush();
      const full = await api<ObservationFull>(`/observations/${store.state.full.id}/validate`, { method: 'POST', body: { attestation: true, justification: justif.trim() || undefined, rev: store.state.rev } });
      store.setFull(full);
      toast('Observation validée.');
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Échec de la validation.', true);
    } finally {
      setBusy(false);
    }
  };

  if (!session.canValidate) {
    return (
      <Modal title="Validation finale" onClose={onClose} footer={<button className="btn" onClick={onClose}>Fermer</button>}>
        <div className="alert info"><Icon name="lock" className="alert-ico" />La validation finale est réservée aux comptes « médecin » ou « administrateur ». Faites relire et valider l’observation par un médecin senior.</div>
      </Modal>
    );
  }

  return (
    <Modal title="Validation finale de l’observation" large onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Annuler</button>
      <button className="btn primary" disabled={!atteste || busy || (justifRequise && justif.trim().length < 5)} onClick={valider}><Icon name="checkCircle" />Valider l’observation</button>
    </>}>
      <div className="stack">
        <div className="row"><div className="ring" style={{ ['--v' as string]: b.global }} data-v={`${b.global}%`} /><div><strong>Complétude globale : {b.global} %</strong><div className="small muted">{manquants.length} information(s) indispensable(s) manquante(s) · {b.incoherences.length} incohérence(s) · {nonVerif.length} paragraphe(s) non vérifié(s)</div></div></div>
        {critiques.length > 0 && (
          <div className="alert danger"><Icon name="alert" className="alert-ico" /><div><strong>Incohérences critiques</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{critiques.map((c) => <li key={c.id}>{c.message}</li>)}</ul></div></div>
        )}
        {manquants.length > 0 && (
          <div className="alert warn"><Icon name="alert" className="alert-ico" /><div><strong>Informations indispensables manquantes</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{manquants.map((m) => <li key={m.id}><button className="btn ghost xs" style={{ height: 'auto', padding: 0, color: 'var(--primary)' }} onClick={() => go(m.module === 'examen' ? `examen/${m.cible && m.cible !== 'constantes' && m.cible !== 'eg' ? m.cible : 'general'}` : m.module)}>{m.libelle}</button>{m.detail ? ` — ${m.detail}` : ''}</li>)}</ul>
          </div></div>
        )}
        {stale.length > 0 && <div className="alert warn"><Icon name="alert" className="alert-ico" />{stale.length} paragraphe(s) modifié(s) manuellement alors que les données ont changé depuis : à relire.</div>}
        {nonVerif.length > 0 && <div className="alert info"><Icon name="info" className="alert-ico" /><div>Paragraphes non cochés « vérifié » : {nonVerif.map((s) => s.title).join(', ')}.</div></div>}
        {justifRequise && (
          <div className="field"><label className="lbl">Justification (requise : éléments manquants, incohérences ou paragraphes non vérifiés)</label><Area rows={2} value={justif} onChange={setJustif} placeholder="ex. examen génital non indiqué ; ECG demandé, résultat à venir" /></div>
        )}
        <label className="check" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={atteste} onChange={(e) => setAtteste(e.target.checked)} style={{ marginTop: 3 }} />
          <span>J’atteste avoir relu l’intégralité de l’observation, vérifié chaque paragraphe et les données saisies, et j’en valide le contenu médical sous ma responsabilité ({session.user.nom}).</span>
        </label>
      </div>
    </Modal>
  );
}
