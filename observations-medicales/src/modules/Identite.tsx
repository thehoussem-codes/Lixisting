import { useObs } from '../app/context.tsx';
import { MODE_LOCAL } from '../app/api.ts';
import { Card, Field, Seg, Select, Suggest, Text } from '../ui/controls.tsx';
import { ageLabel, parseDate } from '../engine/calc.ts';
import { FIABILITES, INFORMATEURS, MODES_ADMISSION, SERVICES, SITUATIONS_FAMILIALES } from '../knowledge/antecedents.ts';
import { ModuleHeader } from './common.tsx';

export function Identite() {
  const { data, update, readOnly } = useObs();
  const id = data.identite;
  const ad = data.admission;
  const setId = (k: keyof typeof id, v: string) => update((d) => { (d.identite as unknown as Record<string, unknown>)[k] = v; });
  const setAd = (k: keyof typeof ad, v: string) => update((d) => { (d.admission as unknown as Record<string, unknown>)[k] = v; });
  const age = ageLabel(id.dateNaissance, ad.date?.slice(0, 10));
  const naiss = parseDate(id.dateNaissance);
  const naissInvalide = !!id.dateNaissance && (!naiss || naiss.getTime() > Date.now());
  const telInvalide = !!id.telephone && !/^[+\d][\d\s().-]{5,}$/.test(id.telephone);
  return (
    <div className="stack">
      <ModuleHeader title="État civil et identification" desc={`Identité du patient, conditions d’admission et qualité des informations recueillies. ${MODE_LOCAL ? 'Version de démonstration : données conservées dans ce navigateur uniquement.' : 'Les données d’identité sont chiffrées sur le serveur.'}`} />
      <Card title="Identité du patient">
        <div className="grid g3">
          <Field label="Nom" required htmlFor="nom"><Text id="nom" value={id.nom} onChange={(v) => setId('nom', v)} disabled={readOnly} /></Field>
          <Field label="Prénom" required htmlFor="prenom"><Text id="prenom" value={id.prenom} onChange={(v) => setId('prenom', v)} disabled={readOnly} /></Field>
          <Field label="Identifiant (IPP / n° de dossier)"><Text value={id.ipp} onChange={(v) => setId('ipp', v)} disabled={readOnly} /></Field>
          <Field label="Date de naissance" required help={naissInvalide ? <span style={{ color: 'var(--danger)' }}>Date invalide ou future.</span> : age ? <>Âge calculé : <strong>{age}</strong></> : 'L’âge est calculé automatiquement.'}>
            <Text type="date" value={id.dateNaissance} onChange={(v) => setId('dateNaissance', v)} disabled={readOnly} className={naissInvalide ? 'invalid' : ''} aria-label="Date de naissance" />
          </Field>
          <Field label="Sexe" required>
            <Seg value={id.sexe} options={[{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }]} onChange={(v) => setId('sexe', v)} disabled={readOnly} />
          </Field>
          <Field label="Situation familiale"><Select value={id.situationFamiliale} options={SITUATIONS_FAMILIALES} onChange={(v) => setId('situationFamiliale', v)} disabled={readOnly} /></Field>
          <Field label="Profession"><Text value={id.profession} onChange={(v) => setId('profession', v)} disabled={readOnly} /></Field>
          <Field label="Origine géographique" hint="Utile si pertinente (zones d’endémie, pathologies géographiques)."><Text value={id.origine} onChange={(v) => setId('origine', v)} disabled={readOnly} /></Field>
          <Field label="Téléphone" help={telInvalide ? <span style={{ color: 'var(--danger)' }}>Format de numéro inhabituel.</span> : undefined}><Text type="tel" value={id.telephone} onChange={(v) => setId('telephone', v)} disabled={readOnly} className={telInvalide ? 'invalid' : ''} /></Field>
          <Field label="Adresse" className="spanall"><Text value={id.adresse} onChange={(v) => setId('adresse', v)} disabled={readOnly} /></Field>
        </div>
      </Card>
      <Card title="Personne à prévenir">
        <div className="grid g3">
          <Field label="Nom"><Text value={id.personnePrevenir.nom} onChange={(v) => update((d) => { d.identite.personnePrevenir.nom = v; })} disabled={readOnly} /></Field>
          <Field label="Lien"><Suggest value={id.personnePrevenir.lien} suggestions={['conjoint(e)', 'épouse', 'époux', 'fils', 'fille', 'père', 'mère', 'frère', 'sœur', 'ami(e)', 'tuteur']} onChange={(v) => update((d) => { d.identite.personnePrevenir.lien = v; })} /></Field>
          <Field label="Téléphone"><Text type="tel" value={id.personnePrevenir.telephone} onChange={(v) => update((d) => { d.identite.personnePrevenir.telephone = v; })} disabled={readOnly} /></Field>
        </div>
      </Card>
      <Card title="Admission">
        <div className="grid g3">
          <Field label="Date et heure d’admission" required><Text type="datetime-local" value={ad.date} onChange={(v) => setAd('date', v)} disabled={readOnly} aria-label="Date et heure d’admission" /></Field>
          <Field label="Service d’hospitalisation"><Suggest value={ad.service} suggestions={SERVICES} onChange={(v) => setAd('service', v)} /></Field>
          <Field label="Médecin responsable"><Text value={ad.medecin} onChange={(v) => setAd('medecin', v)} disabled={readOnly} /></Field>
          <Field label="Mode d’admission" className="span2"><Seg value={ad.mode} options={MODES_ADMISSION} onChange={(v) => setAd('mode', v)} disabled={readOnly} /></Field>
          <Field label="Provenance"><Text value={ad.provenance} onChange={(v) => setAd('provenance', v)} placeholder="ex. domicile, autre hôpital" disabled={readOnly} /></Field>
        </div>
      </Card>
      <Card title="Recueil des informations">
        <div className="grid g2">
          <Field label="Qualité de l’informateur">
            <div className="chips">
              {INFORMATEURS.map((x) => {
                const on = ad.informateurs.includes(x);
                return <button type="button" key={x} className={`chip ${on ? 'on' : ''}`} disabled={readOnly} onClick={() => update((d) => { d.admission.informateurs = on ? d.admission.informateurs.filter((y) => y !== x) : [...d.admission.informateurs, x]; })}>{x}</button>;
              })}
            </div>
          </Field>
          <Field label="Fiabilité des informations recueillies">
            <Seg value={ad.fiabilite} options={FIABILITES} onChange={(v) => setAd('fiabilite', v)} disabled={readOnly} />
          </Field>
          <Field label="Précision sur la fiabilité" className="spanall"><Text value={ad.fiabiliteDetail} onChange={(v) => setAd('fiabiliteDetail', v)} placeholder="ex. patient confus, barrière linguistique, interprète présent" disabled={readOnly} /></Field>
        </div>
      </Card>
    </div>
  );
}
