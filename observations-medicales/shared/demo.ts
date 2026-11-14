/**
 * Cas de démonstration ENTIÈREMENT FICTIFS (noms, adresses, données cliniques inventés).
 * Destinés à la formation et à la découverte de l'application.
 */
import { emptyObservation, uid } from './defaults.ts';
import type { FState, FindingVal, Observation, PatientIdentity } from './types.ts';

function iso(daysAgo: number, time = '10:00'): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${time ? `T${time}` : ''}`;
}
function day(daysAgo: number): string {
  return iso(daysAgo, '').slice(0, 10);
}

function f(o: Observation, states: Record<string, FState | [FState, Partial<FindingVal>]>) {
  for (const [k, v] of Object.entries(states)) {
    o.findings[k] = Array.isArray(v) ? { s: v[0], ...v[1] } : { s: v };
  }
}

export interface DemoCase {
  identity: PatientIdentity;
  observation: Observation;
  titre: string;
}

/* ------------------------------------------------------------------ */
/* Cas 1 : douleur thoracique                                           */
/* ------------------------------------------------------------------ */
function cas1(): DemoCase {
  const identity: PatientIdentity = {
    ipp: 'DEMO-0001', nom: 'Benali', prenom: 'Karim', dateNaissance: '1968-03-14', sexe: 'M',
    adresse: 'cité fictive des Oliviers, Annaba', telephone: '0600 00 00 01', profession: 'Enseignant', situationFamiliale: 'Marié(e)',
    origine: 'Annaba', personnePrevenir: { nom: 'Leila Benali', lien: 'épouse', telephone: '0600 00 00 02' },
  };
  const o = emptyObservation(identity);
  o.admission = { date: iso(0, '08:40'), service: 'Urgences', medecin: 'Dr A. Démo', mode: 'Urgences', provenance: 'domicile, adressé par la protection civile', informateurs: ['Patient', 'Famille'], fiabilite: 'Bonne', fiabiliteDetail: '' };
  o.motif = { principal: 'Douleur thoracique', secondaires: ['sueurs'], symptomes: 'douleur thoracique constrictive avec sueurs', dateDebut: day(0), circonstances: '', caractere: 'urgent', formulation: '' };
  o.atcd.medicaux = {
    hta: { s: 'p', entries: [{ uid: uid(), nom: 'HTA essentielle', date: '2014', traitement: 'amlodipine 5 mg/j', suivi: 'médecin traitant', complications: '', evolution: 'équilibrée selon le patient' }] },
    diabete: { s: 'p', entries: [{ uid: uid(), nom: 'Diabète de type 2', date: '2018', traitement: 'metformine 1 g × 2/j', suivi: 'irrégulier', complications: 'non connues', evolution: 'dernière HbA1c inconnue' }] },
    avc: { s: 'a', entries: [] },
    tuberculose: { s: 'a', entries: [] },
    cardio: { s: 'a', entries: [] },
    renal: { s: 'a', entries: [] },
  };
  o.atcd.chirurgicaux = { s: 'p', entries: [{ uid: uid(), intervention: 'Appendicectomie', date: '1990', indication: 'appendicite aiguë', complications: '' }] };
  o.atcd.familiaux = { s: 'p', cats: { cv: 'p', diabete: 'a' }, entries: [{ uid: uid(), cat: 'cv', pathologie: 'infarctus du myocarde', lien: 'père', age: '52' }] };
  o.atcd.toxiques = { ...o.atcd.toxiques, tabac: 'actif', cigJour: '20', tabacAnnees: '30', alcool: 'non', substances: 'non', activitePhysique: 'sédentaire', alimentation: 'riche en graisses et en sel' };
  o.atcd.allergies = { statut: 'aucune', entries: [] };
  o.atcd.traitements = { statut: 'liste', entries: [
    { uid: uid(), nom: 'Amlodipine', dosage: '5 mg', posologie: '1 cp', voie: 'per os', frequence: 'le matin', observance: 'bonne', debut: '2014' },
    { uid: uid(), nom: 'Metformine', dosage: '1000 mg', posologie: '1 cp', voie: 'per os', frequence: 'matin et soir', observance: 'partielle', debut: '2018' },
  ] };
  o.hdm.symptomes = [{
    uid: uid(), type: 'dl_thoracique', principal: true, libelle: '',
    a: {
      debut_date: day(0), debut_heure: '06:15', mode_debut: 'brutal', circonstances: 'au repos', evolution: 'aggravation progressive',
      episodes_ant: 'oui', episodes_detail: 'douleurs constrictives brèves à l’effort depuis 3 semaines, cédant au repos',
      evolution_ttt: 'absence d’amélioration sous traitement',
      siege: ['rétrosternale'], irradiation: ['vers la mâchoire', 'vers le membre supérieur gauche'], type: ['constriction (serrement, étau)'],
      intensite: '8', temporalite: 'continue', calmants: ['non calmée par le repos ni les antalgiques usuels'],
      position: 'aucune position antalgique', retentissement_fonctionnel: 'limitant les activités quotidiennes',
      effort: 'survenue au repos', respiration: 'non', position_tc: 'non', palpation: 'non', trinitrine: 'trinitrine non testée', duree_20: 'oui',
      ttt_essayes: 'paracétamol 1 g', ttt_efficacite: 'inefficaces',
    },
  }];
  f(o, {
    douleur_thoracique: 'p', sueurs: ['p', { x: { horaire: 'profuses' } }], nausees: 'p', dyspnee: 'a', palpitations: 'a', syncope: 'a', lipothymie: 'a',
    toux: 'a', fievre: 'a', hemoptysie: 'a', vomissements: 'a', gonflement_mi: 'a', douleur_abdominale: 'nr',
    orthopnee: 'a', claudication: 'a',
    turgescence_jugulaire: 'a', rhj: 'a', omi: 'a', mollet: 'a', b3: 'a', b4: 'a', souffle_cardiaque: 'a', frottement_pericardique: 'a', souffle_carotidien: 'a',
    crepitants: 'a', sibilants: 'a', douleur_paroi: 'a', emphyseme_sc: 'a',
    paleur: 'a', cyanose: 'a', marbrures: 'a', ictere: 'a',
    sensibilite_abdo: 'a', defense: 'a', hepatomegalie: 'a', splenomegalie: 'a', murphy: 'a',
    raideur_nuque: 'a', deficit_moteur: 'a',
  });
  o.fields = {
    conscience: 'conscient', orientation: 'orienté dans le temps et dans l’espace', etat_general: 'conservé', autonomie: 'autonome', hydratation: 'bien hydraté',
    choc_pointe: 'en place (5e espace intercostal gauche, ligne médio-claviculaire)', trc: '< 3 secondes', rythme_cardiaque: 'régulier', b1b2: 'bien perçus',
    type_respi: 'eupnéique', mv: 'bien perçu et symétrique', vv: 'bien transmises et symétriques', percussion_thorax: 'sonorité normale et symétrique',
    abdomen_souple: 'abdomen souple, dépressible et indolore', bha: 'présents et normaux',
    langage: 'normal', pupilles: 'isocores et réactives',
  };
  o.constantes = { ...o.constantes, temperature: '36.9', pas: '158', pad: '92', fc: '104', fr: '20', spo2: '96', o2: 'aa', glycemie: '2.10', glycemieUnite: 'g/L', poids: '86', taille: '174', eva: '8', glasgow: '15', heure: '08:50' };
  o.specials.pouls = { radial_d: 'perçu', radial_g: 'perçu', femoral_d: 'perçu', femoral_g: 'perçu', pedieux_d: 'perçu', pedieux_g: 'perçu', carotidien_d: 'perçu', carotidien_g: 'perçu' };
  o.specials.paBras = { droit: '158/92', gauche: '154/90' };
  o.appareils = {
    cv: { notes: {}, conclusion: 'Examen cardiovasculaire sans signe d’insuffisance cardiaque ni asymétrie tensionnelle significative.' },
    genital: { statut: 'na', notes: {}, conclusion: '' },
    orl: { statut: 'na', notes: {}, conclusion: '' },
  };
  o.examens.ecg = { date: iso(0, '08:48'), realise: 'oui', rythme: 'sinusal régulier', fc: '102', axe: 'normal', pr: '160', qrs: '90', qtc: '430', st: 'sus-décalage de 3 mm en DII, DIII et aVF avec miroir en DI et aVL', ondeT: '', autres: '', interpretation: 'aspect évocateur d’un sus-décalage du segment ST en territoire inférieur, à confirmer par le cardiologue' };
  o.examens.bio = [
    { uid: uid(), type: 'cardiaque', date: day(0), interpretation: 'Élévation de la troponine (à interpréter selon le seuil du laboratoire et la cinétique).', valeurs: [
      { uid: uid(), analyte: 'tropo', libelle: 'Troponine T hs', valeur: '480', unite: 'ng/L', refMin: '', refMax: '14' },
    ] },
    { uid: uid(), type: 'nfs', date: day(0), interpretation: '', valeurs: [
      { uid: uid(), analyte: 'hb', libelle: '', valeur: '14.2', unite: 'g/dL', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'gb', libelle: '', valeur: '11.8', unite: 'G/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'plq', libelle: '', valeur: '245', unite: 'G/L', refMin: '', refMax: '' },
    ] },
    { uid: uid(), type: 'renal', date: day(0), interpretation: '', valeurs: [
      { uid: uid(), analyte: 'creat', libelle: '', valeur: '98', unite: 'µmol/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'uree', libelle: '', valeur: '6.1', unite: 'mmol/L', refMin: '', refMax: '' },
    ] },
    { uid: uid(), type: 'iono', date: day(0), interpretation: '', valeurs: [
      { uid: uid(), analyte: 'na', libelle: '', valeur: '138', unite: 'mmol/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'k', libelle: '', valeur: '4.1', unite: 'mmol/L', refMin: '', refMax: '' },
    ] },
  ];
  o.scores = { heart: { inputs: { H: '2', E: '2', T: '2' }, inclure: true }, killip: { inputs: { classe: 'I' }, inclure: true } };
  o.discussion = {
    ...o.discussion,
    syndromes: 'Douleur thoracique angineuse prolongée de repos avec sus-décalage du segment ST en territoire inférieur.',
    diagnosticPrincipal: 'un syndrome coronarien aigu avec sus-décalage du segment ST (territoire inférieur)',
    argumentsPour: 'douleur rétrosternale constrictive prolongée irradiant à la mâchoire et au bras gauche ; terrain (tabagisme, HTA, diabète, hérédité coronarienne) ; sus-décalage ST DII DIII aVF avec miroir ; troponine élevée.',
    argumentsContre: 'aucun à ce stade.',
    differentiels: [
      { uid: uid(), diagnostic: 'Dissection aortique', pour: 'douleur intense de début brutal, HTA', contre: 'pas d’asymétrie tensionnelle ni d’abolition de pouls, pas de souffle d’insuffisance aortique', examens: 'échocardiographie, angioscanner si doute' },
      { uid: uid(), diagnostic: 'Péricardite aiguë', pour: '', contre: 'douleur non modifiée par la respiration ni la position, pas de frottement', examens: 'ECG, échocardiographie' },
    ],
    urgences: 'Dissection aortique, embolie pulmonaire, tamponnade.',
    hypotheses: ['Syndrome coronarien aigu avec sus-décalage du segment ST inférieur'],
    examensNecessaires: 'Coronarographie en urgence (avis cardiologique), échocardiographie transthoracique.',
    diagnosticRetenu: '', statutDiagnostic: '', commentaire: '',
  };
  o.cat = {
    ...o.cat,
    mesures: ['Monitorage cardio-tensionnel continu et scope', 'Deux voies veineuses périphériques', 'Repos strict au lit'],
    examensDemandes: ['Troponine de contrôle', 'Bilan lipidique', 'HbA1c', 'Échocardiographie transthoracique'],
    surveillance: ['Constantes (PA, FC, SpO₂) toutes les 15 minutes', 'Douleur (EVA)', 'ECG répété', 'Diurèse'],
    avis: [{ uid: uid(), specialite: 'Cardiologie interventionnelle', motif: 'suspicion de SCA ST+ inférieur', date: day(0), reponse: '' }],
    orientation: 'Transfert en unité de soins intensifs cardiologiques', orientationDetail: 'après avis du cardiologue',
    reevaluation: 'Réévaluation clinique et électrique rapprochée.',
  };
  return { identity, observation: o, titre: 'Douleur thoracique' };
}

/* ------------------------------------------------------------------ */
/* Cas 2 : fièvre et arthralgies (médecine interne)                    */
/* ------------------------------------------------------------------ */
function cas2(): DemoCase {
  const identity: PatientIdentity = {
    ipp: 'DEMO-0002', nom: 'Hamdi', prenom: 'Nadia', dateNaissance: '1992-07-02', sexe: 'F',
    adresse: 'rue fictive des Jasmins, El Bouni', telephone: '0600 00 00 03', profession: 'Comptable', situationFamiliale: 'Célibataire',
    origine: 'Guelma', personnePrevenir: { nom: 'Fatima Hamdi', lien: 'mère', telephone: '0600 00 00 04' },
  };
  const o = emptyObservation(identity);
  o.admission = { date: iso(1, '15:20'), service: 'Médecine interne', medecin: 'Dr S. Démo', mode: 'Consultation', provenance: 'consultation externe de médecine interne', informateurs: ['Patient'], fiabilite: 'Bonne', fiabiliteDetail: '' };
  o.motif = { principal: 'Fièvre prolongée avec polyarthralgies', secondaires: ['éruption cutanée du visage'], symptomes: '', dateDebut: day(21), circonstances: '', caractere: 'programme', formulation: '' };
  o.atcd.medicauxAucun = true;
  o.atcd.chirurgicaux = { s: 'a', entries: [] };
  o.atcd.gyneco = { ...o.atcd.gyneco, gestite: '0', parite: '0', ddr: day(12), cycles: 'réguliers', contraception: 'aucune', grossesse: 'exclue' };
  o.atcd.familiaux = { s: 'p', cats: { autoimmun: 'p' }, entries: [{ uid: uid(), cat: 'autoimmun', pathologie: 'thyroïdite de Hashimoto', lien: 'mère', age: '40' }] };
  o.atcd.toxiques = { ...o.atcd.toxiques, tabac: 'non', alcool: 'non', substances: 'non' };
  o.atcd.allergies = { statut: 'presentes', entries: [{ uid: uid(), type: 'Médicament', agent: 'Cotrimoxazole', reaction: 'Éruption maculo-papuleuse', date: '2019', documentee: 'non documentée' }] };
  o.atcd.traitements = { statut: 'aucun', entries: [] };
  o.hdm.symptomes = [
    { uid: uid(), type: 'fievre', principal: true, libelle: '', a: { debut_date: day(21), mode_debut: 'progressif', evolution: 'évolution fluctuante', tmax: '38.8', mesure: 'mesurée au thermomètre', profil: 'intermittente', contexte_fievre: [], episodes_ant: 'non', evolution_ttt: 'absence d’amélioration sous traitement' } },
    { uid: uid(), type: 'dl_articulaire', principal: false, libelle: '', a: { debut_date: day(18), mode_debut: 'progressif', siege: ['du poignet', 'des petites articulations des mains', 'du genou'], intensite: '5', type: ['élancements'], mode_atteinte: 'polyarticulaire (5 articulations ou plus)', symetrie: 'symétrique', horaire: 'd’horaire inflammatoire (réveils nocturnes, dérouillage matinal prolongé)', derouillage: '45', evolution_art: 'additive', inflammation_locale: 'oui' } },
  ];
  o.hdm.traitementsAvant = { s: 'p', entries: [{ uid: uid(), nom: 'Paracétamol 1 g × 3/j', type: 'automédication', efficacite: 'partiellement efficace', tolerance: 'bonne', observance: 'bonne' }] };
  f(o, {
    fievre: ['p', { x: { tmax: '38,8' } }], frissons: 'a', sueurs: ['p', { x: { horaire: 'nocturnes' } }], asthenie: 'p', anorexie: 'p', amaigrissement: ['p', { x: { kg: '3', depuis: '1 mois' } }],
    raideur_matinale: ['p', { x: { duree: '45' } }], gonflement_articulaire: 'p', eruption: ['p', { d: 'érythème du visage en vespertilio apparu après exposition solaire' }],
    photosensibilite: 'p', aphtes: ['p', { x: { siege: 'buccale' } }], raynaud: 'p', xerostomie: 'a', xerophtalmie: 'a', alopecie: 'a',
    toux: 'a', dyspnee: 'a', douleur_thoracique: 'a', brulures_mictionnelles: 'a', diarrhee: 'a', rougeur_oculaire: 'a', myalgies: 'nr', pertes_genitales: 'nr', rachialgies: 'a',
    urines_mousseuses: 'a', omi: 'a', paleur: 'p',
    synovite: 'p', adenopathies: 'p', splenomegalie: 'a', hepatomegalie: 'a', purpura: 'a', livedo: 'a', frottement_pericardique: 'a', frottement_pleural: 'a',
    souffle_cardiaque: 'a', crepitants: 'a',
  });
  o.fields = { conscience: 'conscient', orientation: 'orienté dans le temps et dans l’espace', etat_general: 'légèrement altéré', hydratation: 'bien hydraté', nutrition: 'bon état nutritionnel', rythme_cardiaque: 'régulier', b1b2: 'bien perçus', mv: 'bien perçu et symétrique', abdomen_souple: 'abdomen souple, dépressible et indolore', peau_couleur: 'pâle', cavite_buccale: 'lésion muqueuse', bandelette: 'protéines +, sang +' };
  o.specials.adenopathies = [{ uid: uid(), aire: 'cervicale', cote: 'bilatérale', taille: '1,5', consistance: 'élastique', mobilite: 'mobile', sensibilite: 'indolore', autre: '' }];
  o.specials.airesExaminees = ['cervicales', 'sus-claviculaires', 'axillaires', 'inguinales'];
  o.specials.articulations = [
    { uid: uid(), articulation: 'poignet', cote: 'bilatéral', signes: ['tuméfaction', 'douleur à la mobilisation'], amplitude: '', detail: '' },
    { uid: uid(), articulation: 'métacarpo-phalangiennes', cote: '2e et 3e bilatérales', signes: ['tuméfaction', 'douleur à la mobilisation'], amplitude: '', detail: '' },
  ];
  o.specials.lesions = [{ uid: uid(), type: 'macule', localisation: 'des joues et de l’arête nasale', taille: '', description: 'érythémateuse, en ailes de papillon, respectant les sillons naso-géniens' }];
  o.findings.lesions_cutanees = { s: 'p' };
  o.constantes = { ...o.constantes, temperature: '38.4', pas: '118', pad: '72', fc: '96', fr: '18', spo2: '98', o2: 'aa', poids: '58', taille: '165', eva: '5', glasgow: '15' };
  o.appareils = { genital: { statut: 'na', notes: {}, conclusion: '' } };
  o.examens.bio = [
    { uid: uid(), type: 'nfs', date: day(1), interpretation: 'Anémie normocytaire, leucopénie avec lymphopénie.', valeurs: [
      { uid: uid(), analyte: 'hb', libelle: '', valeur: '10.4', unite: 'g/dL', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'vgm', libelle: '', valeur: '86', unite: 'fL', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'gb', libelle: '', valeur: '3.1', unite: 'G/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'lympho', libelle: '', valeur: '0.7', unite: 'G/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'plq', libelle: '', valeur: '142', unite: 'G/L', refMin: '', refMax: '' },
    ] },
    { uid: uid(), type: 'inflam', date: day(1), interpretation: '', valeurs: [
      { uid: uid(), analyte: 'crp', libelle: '', valeur: '12', unite: 'mg/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'vs', libelle: '', valeur: '68', unite: 'mm', refMin: '', refMax: '20' },
    ] },
    { uid: uid(), type: 'renal', date: day(1), interpretation: '', valeurs: [
      { uid: uid(), analyte: 'creat', libelle: '', valeur: '7.5', unite: 'mg/L', refMin: '', refMax: '' },
    ] },
  ];
  o.examens.autres = [{ uid: uid(), categorie: 'Imagerie', type: 'Radiographie thoracique', region: 'face', date: day(1), resultat: 'pas de foyer parenchymateux, pas d’épanchement pleural, index cardio-thoracique normal', conclusion: 'radiographie thoracique normale', interpretation: '' }];
  o.discussion = { ...o.discussion, syndromes: 'Fièvre prolongée, polyarthrite bilatérale et symétrique, éruption photosensible du visage, aphtose buccale, cytopénies.', diagnosticPrincipal: '', hypotheses: ['Lupus systémique (à confirmer par le bilan immunologique)', 'Infection virale (parvovirus B19, VIH, hépatites)', 'Hémopathie lymphoïde'], urgences: 'Infection bactérienne grave, endocardite infectieuse.', examensNecessaires: 'Anticorps antinucléaires, anti-ADN natif, complément, protéinurie des 24 h, sérologies virales, hémocultures.' };
  o.cat = { ...o.cat, examensDemandes: ['Anticorps antinucléaires et anti-ADN natif', 'Complément C3, C4', 'Protéinurie des 24 heures', 'Sérologies VIH, VHB, VHC, parvovirus B19', 'Hémocultures'], surveillance: ['Courbe thermique', 'Constantes', 'Poids'], orientation: 'Hospitalisation en médecine interne' };
  return { identity, observation: o, titre: 'Fièvre et polyarthralgies' };
}

/* ------------------------------------------------------------------ */
/* Cas 3 : dyspnée et œdèmes (sujet âgé)                               */
/* ------------------------------------------------------------------ */
function cas3(): DemoCase {
  const identity: PatientIdentity = {
    ipp: 'DEMO-0003', nom: 'Zerrouki', prenom: 'Ahmed', dateNaissance: '1953-11-20', sexe: 'M',
    adresse: 'quartier fictif du Port, Annaba', telephone: '0600 00 00 05', profession: 'Retraité (docker)', situationFamiliale: 'Veuf(ve)',
    origine: '', personnePrevenir: { nom: 'Samir Zerrouki', lien: 'fils', telephone: '0600 00 00 06' },
  };
  const o = emptyObservation(identity);
  o.admission = { date: iso(0, '22:10'), service: 'Médecine interne', medecin: 'Dr R. Démo', mode: 'Urgences', provenance: 'service des urgences', informateurs: ['Patient', 'Famille', 'Dossier médical'], fiabilite: 'Moyenne', fiabiliteDetail: 'patient dyspnéique, complété par le fils' };
  o.motif = { principal: 'Dyspnée d’aggravation progressive avec œdèmes des membres inférieurs', secondaires: [], symptomes: '', dateDebut: day(10), circonstances: '', caractere: 'urgent', formulation: '' };
  o.atcd.medicaux = {
    hta: { s: 'p', entries: [{ uid: uid(), nom: 'HTA', date: '2005', traitement: 'ramipril 5 mg', suivi: '', complications: '', evolution: '' }] },
    cardio: { s: 'p', entries: [{ uid: uid(), nom: 'Fibrillation atriale permanente', date: '2019', traitement: 'apixaban 5 mg × 2/j, bisoprolol 5 mg', suivi: 'cardiologue', complications: '', evolution: '' }, { uid: uid(), nom: 'Insuffisance cardiaque à fraction d’éjection altérée', date: '2021', traitement: 'furosémide 40 mg', suivi: 'cardiologue', complications: 'une hospitalisation pour décompensation en 2023', evolution: '' }] },
    diabete: { s: 'a', entries: [] },
    bpco: { s: 'a', entries: [] },
  };
  o.atcd.chirurgicaux = { s: 'a', entries: [] };
  o.atcd.toxiques = { ...o.atcd.toxiques, tabac: 'sevre', paquetsAnnees: '25', tabacArret: '2010', alcool: 'non', expoPro: 'docker (exposition possible à l’amiante, non documentée)' };
  o.atcd.allergies = { statut: 'non_verifiees', entries: [] };
  o.atcd.traitements = { statut: 'liste', entries: [
    { uid: uid(), nom: 'Apixaban', dosage: '5 mg', posologie: '1 cp', voie: 'per os', frequence: 'matin et soir', observance: 'bonne', debut: '2019' },
    { uid: uid(), nom: 'Bisoprolol', dosage: '5 mg', posologie: '1 cp', voie: 'per os', frequence: 'le matin', observance: 'bonne', debut: '2019' },
    { uid: uid(), nom: 'Furosémide', dosage: '40 mg', posologie: '1 cp', voie: 'per os', frequence: 'le matin', observance: 'mauvaise', debut: '2021' },
    { uid: uid(), nom: 'Ramipril', dosage: '5 mg', posologie: '1 cp', voie: 'per os', frequence: 'le matin', observance: 'bonne', debut: '2005' },
  ] };
  o.hdm.symptomes = [{ uid: uid(), type: 'dyspnee', principal: true, libelle: '', a: { debut_date: day(10), mode_debut: 'progressif', evolution: 'aggravation progressive', caractere: 'permanent', circonstances_dysp: ['d’effort', 'de décubitus (orthopnée)', 'paroxystique nocturne'], nyha: 'III', facteurs_dysp: ['un écart de régime sodé', 'une interruption thérapeutique'], episodes_ant: 'oui', episodes_detail: 'décompensation cardiaque en 2023' } }];
  o.hdm.parcours = 'Devant l’aggravation de la dyspnée, le patient a consulté aux urgences où il a reçu 40 mg de furosémide IV avant son transfert dans le service.';
  f(o, {
    dyspnee: 'p', orthopnee: ['p', { x: { oreillers: '3' } }], dpn: 'p', gonflement_mi: 'p', prise_poids: ['p', { x: { kg: '4', depuis: '10 jours' } }],
    toux: ['p', { x: { type: 'sèche', horaire: 'nocturne' } }], fievre: 'a', douleur_thoracique: 'a', hemoptysie: 'a', palpitations: 'a', syncope: 'a', sifflements: 'a', expectoration: 'a', sueurs: 'a',
    turgescence_jugulaire: 'p', rhj: 'p', omi: ['p', { x: { godet: 'prenant le godet', ext: 'remontant aux cuisses', sym: 'bilatéraux et symétriques', caract: 'blancs, mous, indolores' } }], b3: 'nr',
    hepatomegalie: ['p', { x: { fleche: '15', sensible: 'sensible' } }], ascite: 'a', crepitants: ['p', { x: { loc: 'deux tiers inférieurs des deux champs', cote: 'des deux côtés' } }],
    sibilants: 'a', cyanose: 'a', marbrures: 'a', mollet: 'a', souffle_cardiaque: 'p',
  });
  o.specials.souffles = [{ uid: uid(), temps: 'systolique', foyer: 'mitral', intensite: '3', irradiation: 'vers l’aisselle', caractere: 'en jet de vapeur' }];
  o.fields = { conscience: 'conscient', orientation: 'orienté dans le temps et dans l’espace', etat_general: 'altéré', autonomie: 'autonome avec aide technique', rythme_cardiaque: 'irrégulièrement irrégulier', b1b2: 'bien perçus', type_respi: 'polypnéique', mv: 'diminué', mv_loc: 'aux deux bases', percussion_thorax: 'matité', percussion_loc: 'base droite', abdomen_souple: 'abdomen souple, dépressible et indolore' };
  o.constantes = { ...o.constantes, temperature: '36.7', pas: '146', pad: '88', fc: '118', fr: '28', spo2: '89', o2: 'aa', glycemie: '1.20', glycemieUnite: 'g/L', poids: '84', taille: '170', glasgow: '15', diurese: '600' };
  o.appareils = { genital: { statut: 'na', notes: {}, conclusion: '' }, orl: { statut: 'na', notes: {}, conclusion: '' }, peau: { statut: 'nr', notes: {}, conclusion: '' } };
  o.examens.bio = [
    { uid: uid(), type: 'cardiaque', date: day(0), interpretation: '', valeurs: [{ uid: uid(), analyte: 'ntprobnp', libelle: '', valeur: '6850', unite: 'pg/mL', refMin: '', refMax: '' }] },
    { uid: uid(), type: 'iono', date: day(0), interpretation: '', valeurs: [
      { uid: uid(), analyte: 'na', libelle: '', valeur: '131', unite: 'mmol/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'k', libelle: '', valeur: '5.3', unite: 'mmol/L', refMin: '', refMax: '' },
    ] },
    { uid: uid(), type: 'renal', date: day(0), interpretation: 'Altération de la fonction rénale (antériorité inconnue).', valeurs: [
      { uid: uid(), analyte: 'creat', libelle: '', valeur: '142', unite: 'µmol/L', refMin: '', refMax: '' },
      { uid: uid(), analyte: 'uree', libelle: '', valeur: '12.4', unite: 'mmol/L', refMin: '', refMax: '' },
    ] },
  ];
  o.examens.ecg = { date: iso(0, '22:30'), realise: 'oui', rythme: 'fibrillation atriale', fc: '115', axe: 'gauche', pr: '', qrs: '100', qtc: '450', st: 'pas de sus-décalage', ondeT: '', autres: '', interpretation: 'fibrillation atriale à réponse ventriculaire rapide' };
  o.discussion = { ...o.discussion, diagnosticRetenu: 'Insuffisance cardiaque aiguë globale (décompensation) sur cardiopathie connue, favorisée par un écart de régime et une inobservance du diurétique', statutDiagnostic: 'hypothese', hypotheses: ['Décompensation cardiaque globale', 'Pneumopathie associée (à éliminer)', 'Syndrome coronarien aigu (à éliminer)'] };
  o.cat = { ...o.cat, mesures: ['Position demi-assise', 'Oxygénothérapie pour SpO₂ cible 94–98 %', 'Voie veineuse périphérique', 'Restriction hydrosodée'], surveillance: ['Poids quotidien', 'Diurèse des 24 heures', 'Ionogramme et créatinine quotidiens', 'Constantes et SpO₂'], orientation: 'Hospitalisation en médecine interne' };
  return { identity, observation: o, titre: 'Dyspnée et œdèmes' };
}

export function demoCases(): DemoCase[] {
  return [cas1(), cas2(), cas3()];
}
