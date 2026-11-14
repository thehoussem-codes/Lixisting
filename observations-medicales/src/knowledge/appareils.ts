/**
 * Examen clinique : état général et 11 appareils.
 * Chaque appareil comprend interrogatoire fonctionnel, inspection, palpation, percussion,
 * auscultation et signes spécifiques recherchés. Les signes partagés entre appareils
 * (R(...)) gardent un état unique pour éviter toute incohérence.
 */
import { D, F, N, R, S, SP, T, setHome, setNature } from './registry.ts';
import type { AppareilDef, BlockDef, BlockItem, BlockKind } from './types.ts';

function B(id: string, title: string, kind: BlockKind, fn: () => BlockItem[], extra: Partial<BlockDef> = {}): BlockDef {
  setNature(kind === 'interrogatoire' ? 'fonctionnel' : 'physique');
  return { id, title, kind, items: fn(), ...extra };
}

function A(
  id: string,
  title: string,
  short: string,
  redac: string,
  defaut: AppareilDef['defaut'],
  fn: () => BlockDef[],
  extra: Partial<AppareilDef> = {},
): AppareilDef {
  setHome(id);
  return { id, title, short, redac, defaut, blocks: fn(), ...extra };
}


/* ================================================================== */
/* ÉTAT GÉNÉRAL                                                         */
/* ================================================================== */
export const ETAT_GENERAL: AppareilDef = A('eg', 'État général', 'État général', 'État général', 'indispensable', () => [
  B('eg_conscience', 'Conscience et comportement', 'examen', () => [
    S('conscience', 'État de conscience', ['conscient', 'obnubilé', 'confus', 'somnolent', 'stuporeux', 'comateux', 'agité'], {
      nl: ['conscient'], p: '{v}',
      hint: "L'évaluation quantitative se fait par le score de Glasgow (rubrique Constantes).",
    }),
    S('orientation', 'Orientation temporo-spatiale', [
      'orienté dans le temps et dans l’espace', 'désorienté dans le temps', 'désorienté dans l’espace',
      'désorienté dans le temps et dans l’espace', 'non évaluable',
    ], { accord: true, nl: ['orienté dans le temps et dans l’espace'], p: '{v}' }),
    S('etat_general', 'État général', ['conservé', 'légèrement altéré', 'altéré', 'très altéré'], { accord: true, nl: ['conservé'], p: 'état général {v}' }),
    S('autonomie', 'Autonomie / état fonctionnel', [
      'autonome', 'autonome avec aide technique', 'aide partielle pour les actes de la vie quotidienne',
      'dépendant pour les actes de la vie quotidienne', 'grabataire',
    ], { accord: true, nl: ['autonome'], p: '{v}', hint: 'Échelle de Rankin modifiée et OMS/ECOG disponibles dans les scores.' }),
  ]),
  B('eg_generaux', 'Signes généraux (interrogatoire)', 'interrogatoire', () => [
    F('asthenie', 'Asthénie', 'f', { details: [D.sel('type', 'Type', ['physique', 'psychique', 'sexuelle', 'globale']), D.sel('horaire', 'Horaire', ['matinale', 'vespérale', 'permanente']), D.depuis()] }),
    F('anorexie', 'Anorexie', 'f', { details: [D.sel('sel', 'Caractère', ['globale', 'sélective (viandes)', 'sélective (autre)']), D.depuis()] }),
    F('amaigrissement', 'Amaigrissement', 'm', {
      details: [D.num('kg', 'Perte', 'kg', 'de {v} kg'), D.text('pct', '% du poids habituel', 'soit {v} % du poids habituel'), D.depuis()],
      hint: 'Significatif si ≥ 5 % en 1 mois ou ≥ 10 % en 6 mois (critère de dénutrition HAS).',
    }),
    F('fievre', 'Fièvre', 'f', { details: [D.num('tmax', 'Température maximale', '°C', 'chiffrée jusqu’à {v} °C'), D.depuis()] }),
    F('frissons', 'Frissons', 'mp', { hint: 'Frissons solennels : évocateurs de bactériémie.' }),
    F('sueurs', 'Sueurs', 'fp', { details: [D.sel('horaire', 'Horaire', ['nocturnes', 'diurnes', 'profuses'], '{v}')] }),
    F('prise_poids', 'Prise de poids', 'f', { details: [D.num('kg', 'Gain', 'kg', 'de {v} kg'), D.depuis()] }),
  ]),
  B('eg_inspection', 'Inspection générale', 'inspection', () => [
    F('paleur', 'Pâleur cutanéo-muqueuse', 'f', { hint: 'Rechercher au niveau des conjonctives, du lit unguéal et des paumes.' }),
    F('ictere', 'Ictère cutanéo-muqueux', 'm', { t: 'ictère cutanéo-muqueux', hint: 'Visible au niveau des conjonctives (sclères) dès 40–50 µmol/L de bilirubine.', details: [D.sel('int', 'Intensité', ['franc', 'discret (sub-ictère conjonctival)'], '{v}')] }),
    F('cyanose', 'Cyanose', 'f', { details: [D.sel('type', 'Type', ['centrale (lèvres, langue)', 'périphérique (extrémités)'], '{v}')] }),
    F('marbrures', 'Marbrures', 'fp', { details: [D.sel('ext', 'Extension (score de marbrures)', ['péri-rotuliennes', 'jusqu’à mi-cuisse', 'jusqu’au pli inguinal', 'au-delà du pli inguinal'], '{v}')], hint: 'Signe d’hypoperfusion périphérique ; score de marbrures 0 à 5.' }),
    F('detresse_respi', 'Signes de détresse respiratoire', 'mp', { hint: 'Polypnée, tirage, balancement thoraco-abdominal, cyanose, sueurs, troubles de conscience.' }),
    F('pli_cutane', 'Pli cutané persistant', 'm', { hint: 'Signe de déshydratation extracellulaire ; peu fiable chez le sujet âgé (rechercher sur le front ou le sternum).' }),
    F('secheresse_muqueuses', 'Sécheresse des muqueuses', 'f', { hint: 'Face interne des joues : signe de déshydratation intracellulaire.' }),
    F('soif', 'Soif', 'f'),
    F('hypotonie_globes', 'Hypotonie des globes oculaires', 'f'),
    S('hydratation', 'État d’hydratation', ['bien hydraté', 'signes de déshydratation extracellulaire', 'signes de déshydratation intracellulaire', 'déshydratation globale', 'signes d’hyperhydratation'], { accord: true, nl: ['bien hydraté'], p: '{v}' }),
    S('nutrition', 'État nutritionnel', ['bon état nutritionnel', 'dénutrition modérée', 'dénutrition sévère', 'surpoids', 'obésité'], { nl: ['bon état nutritionnel'], p: '{v}' }),
  ]),
]);

/* ================================================================== */
/* 1. CARDIOVASCULAIRE                                                  */
/* ================================================================== */
export const CARDIO: AppareilDef = A('cv', 'Appareil cardiovasculaire', 'Cardiovasculaire', 'Examen cardiovasculaire', 'indispensable', () => [
  B('cv_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('douleur_thoracique', 'Douleur thoracique', 'f', { hint: 'Caractérisation détaillée dans l’histoire de la maladie (analyse de la douleur).' }),
    F('dyspnee', 'Dyspnée', 'f', {
      details: [
        D.sel('circ', 'Circonstances', ['d’effort', 'de repos', 'de décubitus', 'paroxystique'], '{v}'),
        D.sel('nyha', 'Stade NYHA', ['I', 'II', 'III', 'IV'], 'stade {v} de la NYHA'),
        D.sel('mmrc', 'Stade mMRC', ['0', '1', '2', '3', '4'], 'stade {v} de l’échelle mMRC'),
        D.sel('temps', 'Temps', ['inspiratoire', 'expiratoire', 'aux deux temps']),
      ],
    }),
    F('orthopnee', 'Orthopnée', 'f', { details: [D.num('oreillers', 'Nombre d’oreillers', '', 'à {v} oreillers')], hint: 'Dyspnée de décubitus obligeant à dormir en position semi-assise.' }),
    F('dpn', 'Dyspnée paroxystique nocturne', 'f', { hint: 'Réveil nocturne par une dyspnée obligeant à s’asseoir au bord du lit.' }),
    F('palpitations', 'Palpitations', 'fp', { details: [D.sel('reg', 'Régularité', ['régulières', 'irrégulières'], '{v}'), D.sel('debut', 'Début/fin', ['à début et fin brutaux', 'à début et fin progressifs'], '{v}')] }),
    F('syncope', 'Syncope', 'f', { hint: 'Perte de connaissance brève, à début rapide, avec récupération spontanée complète.' }),
    F('lipothymie', 'Lipothymie', 'f'),
    F('claudication', 'Claudication intermittente des membres inférieurs', 'f', { t: 'claudication intermittente des membres inférieurs', details: [D.num('perimetre', 'Périmètre de marche', 'm', 'pour un périmètre de marche de {v} m'), D.cote()] }),
    F('gonflement_mi', 'Gonflement des membres inférieurs (rapporté)', 'm', { t: 'gonflement des membres inférieurs' }),
  ]),
  B('cv_inspection', 'Inspection', 'inspection', () => [
    S('inspection_precordiale', 'Inspection précordiale', ['sans anomalie', 'voussure précordiale', 'battements visibles', 'cicatrice de sternotomie'], { nl: ['sans anomalie'], p: 'inspection précordiale : {v}' }),
    F('turgescence_jugulaire', 'Turgescence jugulaire', 'f', { hint: 'Patient en position demi-assise à 45° ; veines jugulaires visibles au-dessus de la clavicule.' }),
  ]),
  B('cv_palpation', 'Palpation', 'palpation', () => [
    S('choc_pointe', 'Choc de pointe', ['en place (5e espace intercostal gauche, ligne médio-claviculaire)', 'dévié en bas et en dehors', 'étalé', 'non perçu'], { nl: ['en place (5e espace intercostal gauche, ligne médio-claviculaire)'], p: 'choc de pointe {v}' }),
    F('fremissement', 'Frémissement (thrill)', 'm', { t: 'frémissement palpatoire', details: [D.loc('Foyer')] }),
    F('harzer', 'Signe de Harzer', 'm', { hint: 'Battements du ventricule droit perçus au creux épigastrique.' }),
    F('rhj', 'Reflux hépato-jugulaire', 'm', { hint: 'Turgescence jugulaire provoquée par la compression prolongée de l’hypochondre droit.' }),
    F('omi', 'Œdèmes des membres inférieurs', 'mp', {
      details: [
        D.sel('godet', 'Godet', ['prenant le godet', 'ne prenant pas le godet'], '{v}'),
        D.sel('stade', 'Stade', ['1 (godet 2 mm, disparition rapide)', '2 (4 mm, 10–15 s)', '3 (6 mm, > 1 min)', '4 (8 mm, 2–5 min)'], 'stade {v}'),
        D.sel('ext', 'Extension', ['malléolaires', 'remontant aux jambes', 'remontant aux cuisses', 'avec œdème des lombes', 'anasarque'], '{v}'),
        D.sel('sym', 'Symétrie', ['bilatéraux et symétriques', 'unilatéraux droits', 'unilatéraux gauches', 'asymétriques'], '{v}'),
        D.sel('caract', 'Caractères', ['blancs, mous, indolores', 'durs', 'inflammatoires (rouges, chauds, douloureux)'], '{v}'),
      ],
      hint: 'Préciser godet, extension, symétrie, caractère inflammatoire.',
    }),
    S('trc', 'Temps de recoloration cutanée', ['< 3 secondes', '≥ 3 secondes (allongé)'], { nl: ['< 3 secondes'], p: 'temps de recoloration cutanée {v}' }),
    SP('pouls'),
    SP('paBras'),
    F('mollet', 'Douleur / empâtement du mollet', 'f', { t: 'douleur avec empâtement du mollet', details: [D.cote()], hint: 'Signes cliniques de thrombose veineuse profonde : à interpréter avec un score de probabilité (Wells).' }),
    F('froideur_extremites', 'Froideur des extrémités', 'f'),
    F('ischemie_peripherique', 'Signes d’ischémie périphérique', 'mp', { t: 'signes d’ischémie périphérique', details: [D.loc('Description (pâleur, froideur, troubles trophiques, déficit)')] }),
  ]),
  B('cv_auscultation', 'Auscultation', 'auscultation', () => [
    S('rythme_cardiaque', 'Rythme cardiaque', ['régulier', 'irrégulier', 'irrégulièrement irrégulier'], { nl: ['régulier'], p: 'bruits du cœur {v}s' }),
    S('b1b2', 'B1 et B2', ['bien perçus', 'assourdis', 'éclat de B2 au foyer pulmonaire', 'B2 diminué au foyer aortique'], { nl: ['bien perçus'], p: 'B1 et B2 {v}' }),
    F('b3', 'Galop protodiastolique (B3)', 'm', { t: 'galop protodiastolique (B3)' }),
    F('b4', 'Galop présystolique (B4)', 'm', { t: 'galop présystolique (B4)' }),
    F('souffle_cardiaque', 'Souffle cardiaque', 'm', { hint: 'Décrire chaque souffle : temps, foyer, intensité (/6), irradiation, timbre.' }),
    SP('souffles'),
    F('frottement_pericardique', 'Frottement péricardique', 'm'),
    F('souffle_carotidien', 'Souffle carotidien', 'm', { details: [D.cote()] }),
    F('souffle_femoral', 'Souffle fémoral / abdominal', 'm', { t: 'souffle vasculaire fémoral ou abdominal', details: [D.loc()] }),
  ]),
  B('cv_ic', 'Signes d’insuffisance cardiaque', 'signes', () => [
    R('turgescence_jugulaire'), R('rhj'), R('omi'), R('b3'), F('hepatalgie', 'Hépatalgie d’effort', 'f'),
    R('orthopnee'),
  ], { hint: 'IC droite : TJ, RHJ, hépatomégalie douloureuse, OMI, ascite. IC gauche : dyspnée, orthopnée, crépitants, galop B3.' }),
]);

/* ================================================================== */
/* 2. RESPIRATOIRE                                                      */
/* ================================================================== */
export const RESPI: AppareilDef = A('resp', 'Appareil respiratoire', 'Respiratoire', 'Examen pleuro-pulmonaire', 'indispensable', () => [
  B('resp_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    R('dyspnee'),
    F('toux', 'Toux', 'f', { details: [D.sel('type', 'Type', ['sèche', 'productive', 'quinteuse', 'rauque', 'émétisante'], '{v}'), D.sel('horaire', 'Horaire', ['nocturne', 'matinale', 'diurne', 'positionnelle', 'post-prandiale'], '{v}'), D.depuis()] }),
    F('expectoration', 'Expectoration', 'f', { t: 'expectoration', details: [D.sel('aspect', 'Aspect', ['muqueuse', 'muco-purulente', 'purulente', 'mousseuse rosée', 'hémoptoïque', 'fétide'], '{v}'), D.text('qte', 'Abondance', 'd’abondance {v}')] }),
    F('hemoptysie', 'Hémoptysie', 'f', { details: [D.sel('abond', 'Abondance', ['de faible abondance (crachats striés)', 'de moyenne abondance', 'de grande abondance']), D.text('vol', 'Volume estimé')] }),
    R('douleur_thoracique'),
    F('sifflements', 'Sifflements respiratoires', 'mp', { t: 'sifflements respiratoires' }),
    F('ronflements', 'Ronflements / apnées nocturnes rapportés', 'mp', { t: 'ronflements et apnées nocturnes rapportés' }),
    R('orthopnee'),
  ]),
  B('resp_inspection', 'Inspection', 'inspection', () => [
    S('type_respi', 'Type respiratoire', ['eupnéique', 'polypnéique', 'bradypnéique', 'dyspnée de Kussmaul', 'dyspnée de Cheyne-Stokes'], { nl: ['eupnéique'], p: '{v}' }),
    F('tirage', 'Tirage', 'm', { details: [D.sel('siege', 'Siège', ['sus-sternal', 'sus-claviculaire', 'intercostal', 'sous-costal', 'global'], '{v}')], hint: 'Dépression inspiratoire des parties molles : signe de lutte.' }),
    F('balancement', 'Balancement thoraco-abdominal', 'm', { hint: 'Respiration paradoxale : signe d’épuisement respiratoire.' }),
    F('battement_ailes_nez', 'Battement des ailes du nez', 'm'),
    F('muscles_accessoires', 'Mise en jeu des muscles respiratoires accessoires', 'f', { t: 'mise en jeu des muscles respiratoires accessoires' }),
    R('cyanose'),
    F('hippocratisme', 'Hippocratisme digital', 'm', { hint: 'Bombement des ongles en verre de montre, perte de l’angle unguéal (signe de Schamroth).' }),
    F('deformation_thoracique', 'Déformation thoracique', 'f', { details: [D.sel('type', 'Type', ['thorax en tonneau (distension)', 'cyphoscoliose', 'pectus excavatum', 'pectus carinatum', 'rétraction d’un hémithorax'], '{v}')] }),
    F('asymetrie_ampliation', 'Asymétrie de l’ampliation thoracique', 'f', { details: [D.sel('cote', 'Côté hypomobile', ['droit', 'gauche'], 'aux dépens du côté {v}')] }),
  ]),
  B('resp_palpation', 'Palpation', 'palpation', () => [
    S('vv', 'Vibrations vocales', ['bien transmises et symétriques', 'diminuées', 'abolies', 'augmentées'], { nl: ['bien transmises et symétriques'], p: 'vibrations vocales {v}' }),
    T('vv_loc', 'Localisation des anomalies des vibrations vocales', { p: '(localisation : {v})', placeholder: 'ex. base droite' }),
    F('emphyseme_sc', 'Emphysème sous-cutané', 'm', { hint: 'Crépitation neigeuse à la palpation.' }),
    F('douleur_paroi', 'Douleur thoracique reproduite à la palpation', 'f'),
  ]),
  B('resp_percussion', 'Percussion', 'percussion', () => [
    S('percussion_thorax', 'Sonorité', ['sonorité normale et symétrique', 'matité', 'submatité', 'hypersonorité', 'tympanisme'], { nl: ['sonorité normale et symétrique'], p: '{v} à la percussion' }),
    T('percussion_loc', 'Localisation des anomalies de percussion', { p: '(localisation : {v})', placeholder: 'ex. base gauche, matité déclive' }),
  ]),
  B('resp_auscultation', 'Auscultation', 'auscultation', () => [
    S('mv', 'Murmure vésiculaire', ['bien perçu et symétrique', 'diminué', 'aboli'], { nl: ['bien perçu et symétrique'], p: 'murmure vésiculaire {v}' }),
    T('mv_loc', 'Localisation des anomalies du murmure', { p: '(localisation : {v})' }),
    F('crepitants', 'Râles crépitants', 'mp', { details: [D.loc('Localisation'), D.cote()], hint: 'Fins, secs, en fin d’inspiration, non modifiés par la toux (alvéolaires).' }),
    F('sous_crepitants', 'Râles sous-crépitants (bulleux)', 'mp', { t: 'râles sous-crépitants', details: [D.loc('Localisation'), D.cote()] }),
    F('ronchi', 'Ronchi', 'mp', { details: [D.loc('Localisation')], hint: 'Râles graves, modifiés par la toux (bronchiques).' }),
    F('sibilants', 'Sibilants', 'mp', { details: [D.loc('Localisation')], hint: 'Râles aigus, expiratoires, témoins d’une obstruction bronchique.' }),
    F('souffle_tubaire', 'Souffle tubaire', 'm', { details: [D.loc('Localisation')], hint: 'Évocateur de condensation pulmonaire avec bronche perméable.' }),
    F('souffle_pleural', 'Souffle pleurétique', 'm', { details: [D.loc('Localisation')] }),
    F('frottement_pleural', 'Frottement pleural', 'm', { details: [D.loc('Localisation')] }),
    F('silence_auscultatoire', 'Silence auscultatoire', 'm', { hint: 'Signe de gravité dans l’asthme aigu grave.' }),
    F('stridor', 'Stridor', 'm'),
  ]),
]);

/* ================================================================== */
/* 3. DIGESTIF                                                          */
/* ================================================================== */
export const DIGESTIF: AppareilDef = A('dig', 'Appareil digestif', 'Digestif', 'Examen abdominal', 'indispensable', () => [
  B('dig_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('douleur_abdominale', 'Douleur abdominale', 'f'),
    F('nausees', 'Nausées', 'fp'),
    F('vomissements', 'Vomissements', 'mp', { details: [D.sel('aspect', 'Aspect', ['alimentaires', 'bilieux', 'fécaloïdes', 'sanglants', 'en jet'], '{v}'), D.text('nb', 'Nombre / jour', '({v} par jour)')] }),
    F('hematemese', 'Hématémèse', 'f', { details: [D.text('abond', 'Abondance')] }),
    F('melena', 'Méléna', 'm'),
    F('rectorragies', 'Rectorragies', 'fp'),
    F('diarrhee', 'Diarrhée', 'f', { details: [D.text('nb', 'Nombre de selles / jour', 'à {v} selles par jour'), D.sel('aspect', 'Aspect', ['liquide', 'glairo-sanglante', 'graisseuse', 'hydrique', 'molle'], '{v}'), D.depuis()] }),
    F('constipation', 'Constipation', 'f', { details: [D.depuis()] }),
    F('arret_matieres_gaz', 'Arrêt des matières et des gaz', 'm', { details: [D.depuis()] }),
    F('dysphagie', 'Dysphagie', 'f', { details: [D.sel('type', 'Type', ['aux solides', 'aux liquides', 'aux solides et aux liquides', 'paradoxale'], '{v}'), D.sel('niveau', 'Niveau', ['haute (oropharyngée)', 'basse (œsophagienne)'], '{v}')] }),
    F('pyrosis', 'Pyrosis', 'm'),
    F('regurgitations', 'Régurgitations', 'fp'),
    F('ballonnement', 'Ballonnement abdominal', 'm'),
    F('troubles_transit', 'Troubles du transit', 'mp', { details: [D.text('desc', 'Description')] }),
    F('ictere_rapporte', 'Ictère rapporté / urines foncées / selles décolorées', 'm', { t: 'ictère rapporté (urines foncées, selles décolorées)' }),
    F('syndrome_rectal', 'Syndrome rectal (ténesme, épreintes, faux besoins)', 'm', { t: 'syndrome rectal (ténesme, épreintes, faux besoins)' }),
  ]),
  B('dig_inspection', 'Inspection', 'inspection', () => [
    F('distension_abdo', 'Distension abdominale', 'f'),
    F('cicatrices_abdo', 'Cicatrices abdominales', 'fp', { details: [D.text('desc', 'Description')] }),
    F('cvc', 'Circulation veineuse collatérale', 'f', { details: [D.sel('type', 'Type', ['de type porto-cave', 'de type cave-cave'], '{v}')] }),
    F('hernie', 'Hernie / éventration', 'f', { ha: true, details: [D.text('siege', 'Siège')] }),
    F('angiomes_stellaires', 'Angiomes stellaires', 'mp'),
    F('erythrose_palmaire', 'Érythrose palmaire', 'f'),
    S('respiration_abdo', 'Mobilité respiratoire de l’abdomen', ['abdomen respirant normalement', 'abdomen ne respirant pas'], { nl: ['abdomen respirant normalement'], p: '{v}' }),
  ]),
  B('dig_auscultation', 'Auscultation', 'auscultation', () => [
    S('bha', 'Bruits hydro-aériques', ['présents et normaux', 'augmentés', 'diminués', 'absents (silence auscultatoire)'], { nl: ['présents et normaux'], p: 'bruits hydro-aériques {v}' }),
  ]),
  B('dig_palpation', 'Palpation', 'palpation', () => [
    S('abdomen_souple', 'Palpation globale', ['abdomen souple, dépressible et indolore', 'abdomen souple, sensible', 'abdomen tendu', 'abdomen en bois'], { nl: ['abdomen souple, dépressible et indolore'], p: '{v}' }),
    F('sensibilite_abdo', 'Sensibilité abdominale à la palpation', 'f', { details: [D.loc('Localisation (épigastre, HCD, FID...)')] }),
    F('defense', 'Défense', 'f', { details: [D.loc('Localisation')], hint: 'Contraction réflexe localisée de la paroi, vaincue par une palpation douce et progressive.' }),
    F('contracture', 'Contracture abdominale', 'f', { hint: 'Contraction tonique, invincible, permanente et douloureuse : signe de péritonite.' }),
    F('masse_abdo', 'Masse abdominale', 'f', { details: [D.loc('Siège, taille, consistance, mobilité')] }),
    F('hepatomegalie', 'Hépatomégalie', 'f', {
      details: [
        D.num('fleche', 'Flèche hépatique', 'cm', 'avec une flèche hépatique à {v} cm'),
        D.sel('bord', 'Bord inférieur', ['bord inférieur mousse', 'bord inférieur tranchant'], '{v}'),
        D.sel('surface', 'Surface', ['surface lisse', 'surface nodulaire'], '{v}'),
        D.sel('consistance', 'Consistance', ['ferme', 'dure', 'molle'], 'de consistance {v}'),
        D.sel('sensible', 'Sensibilité', ['sensible', 'indolore'], '{v}'),
      ],
    }),
    F('splenomegalie', 'Splénomégalie', 'f', { details: [D.num('debord', 'Débord costal', 'cm', 'débordant de {v} cm le rebord costal'), D.sel('hackett', 'Stade de Hackett', ['1', '2', '3', '4', '5'], 'stade {v} de Hackett')] }),
    F('murphy', 'Signe de Murphy', 'm', { hint: 'Inhibition inspiratoire douloureuse à la palpation de l’hypochondre droit.' }),
    F('mcburney', 'Douleur au point de McBurney', 'f'),
    F('blumberg', 'Signe de Blumberg (douleur à la décompression)', 'm', { t: 'douleur à la décompression (signe de Blumberg)' }),
    F('cri_ombilic', 'Cri de l’ombilic', 'm'),
    F('ascite', 'Ascite', 'f', { details: [D.sel('abond', 'Abondance', ['de faible abondance (matité déclive des flancs)', 'de moyenne abondance', 'de grande abondance (abdomen tendu, signe du flot)'], '{v}')] }),
    S('orifices_herniaires', 'Orifices herniaires', ['libres', 'hernie non compliquée', 'hernie engouée / étranglée'], { nl: ['libres'], p: 'orifices herniaires {v}' }),
  ]),
  B('dig_percussion', 'Percussion', 'percussion', () => [
    S('percussion_abdo', 'Percussion abdominale', ['tympanisme normal', 'tympanisme diffus', 'matité déclive des flancs', 'matité localisée', 'disparition de la matité pré-hépatique'], { nl: ['tympanisme normal'], p: '{v} à la percussion' }),
    N('fleche_hepatique', 'Flèche hépatique (percussion)', 'cm', { p: 'flèche hépatique à {v} cm', hint: 'Normale : 10–12 cm sur la ligne médio-claviculaire.' }),
  ]),
  B('dig_tr', 'Toucher rectal (si indiqué)', 'examen', () => [
    S('tr_realise', 'Toucher rectal', ['non réalisé (non indiqué)', 'réalisé avec consentement', 'refusé par le patient'], { p: 'toucher rectal {v}' }),
    F('tr_douglas', 'Douleur au cul-de-sac de Douglas', 'f'),
    F('tr_sang', 'Sang rouge au doigtier', 'm'),
    F('tr_melena', 'Méléna au doigtier', 'm'),
    F('tr_masse', 'Masse rectale', 'f', { details: [D.text('desc', 'Description')] }),
    F('tr_fecalome', 'Fécalome', 'm'),
    F('tr_prostate', 'Prostate anormale', 'f', { t: 'prostate anormale', sex: 'M', details: [D.text('desc', 'Description')] }),
  ], { siIndique: true, hint: 'Examen intime : indication médicale, information et consentement, présence d’un tiers si souhaitée.' }),
]);

/* ================================================================== */
/* 4. URINAIRE ET NÉPHROLOGIQUE                                         */
/* ================================================================== */
export const URINAIRE: AppareilDef = A('uro', 'Appareil urinaire et néphrologique', 'Urinaire', 'Examen uro-néphrologique', 'recommande', () => [
  B('uro_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('dysurie', 'Dysurie', 'f', { hint: 'Difficulté à uriner (retard, jet faible, poussée abdominale).' }),
    F('pollakiurie', 'Pollakiurie', 'f', { details: [D.sel('type', 'Type', ['diurne', 'nocturne', 'diurne et nocturne'], '{v}')] }),
    F('brulures_mictionnelles', 'Brûlures mictionnelles', 'fp'),
    F('hematurie', 'Hématurie macroscopique', 'f', { details: [D.sel('temps', 'Temps', ['initiale', 'terminale', 'totale'], '{v}'), D.sel('caillots', 'Caillots', ['avec caillots', 'sans caillot'], '{v}')] }),
    F('urgenturie', 'Urgenturie', 'f'),
    F('incontinence', 'Incontinence urinaire', 'f', { details: [D.sel('type', 'Type', ['d’effort', 'par urgenturie', 'mixte', 'par regorgement'], '{v}')] }),
    F('nycturie', 'Nycturie', 'f', { details: [D.num('nb', 'Levers nocturnes', '', '({v} levers par nuit)')] }),
    F('oligurie', 'Oligurie', 'f'),
    F('anurie', 'Anurie', 'f'),
    F('polyurie', 'Polyurie', 'f', { details: [D.text('vol', 'Volume / 24 h')] }),
    F('douleur_lombaire', 'Douleur lombaire', 'f', { details: [D.cote()] }),
    F('colique_nephretique', 'Colique néphrétique', 'f', { details: [D.cote()] }),
    F('urines_troubles', 'Urines troubles / malodorantes', 'fp', { t: 'urines troubles ou malodorantes' }),
    F('urines_mousseuses', 'Urines mousseuses', 'fp'),
  ]),
  B('uro_examen', 'Examen', 'palpation', () => [
    F('contact_lombaire', 'Contact lombaire', 'm', { details: [D.cote()] }),
    F('giordano', 'Signe de Giordano', 'm', { details: [D.cote()], hint: 'Douleur provoquée par la percussion de la fosse lombaire.' }),
    F('sensibilite_lombaire', 'Sensibilité des fosses lombaires', 'f', { details: [D.cote()] }),
    F('globe_vesical', 'Globe vésical', 'm', { hint: 'Matité sus-pubienne convexe vers le haut ; confirmer par échographie (bladder scan).' }),
    R('omi'),
    F('surcharge_hydrosodee', 'Signes de surcharge hydrosodée', 'mp', { t: 'signes de surcharge hydrosodée', details: [D.text('desc', 'Description')] }),
    T('bandelette', 'Bandelette urinaire', { p: 'bandelette urinaire : {v}', placeholder: 'ex. leucocytes ++, nitrites +, sang +' }),
  ]),
]);

/* ================================================================== */
/* 5. NEUROLOGIQUE                                                      */
/* ================================================================== */
export const NEURO: AppareilDef = A('neuro', 'Appareil neurologique', 'Neurologique', 'Examen neurologique', 'indispensable', () => [
  B('neuro_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('cephalees', 'Céphalées', 'fp'),
    F('vertiges', 'Vertiges', 'mp', { details: [D.sel('type', 'Type', ['rotatoires', 'instabilité', 'positionnels'], '{v}')] }),
    F('perte_connaissance', 'Troubles de la conscience / perte de connaissance', 'f', { t: 'perte de connaissance' }),
    F('convulsions', 'Convulsions', 'fp'),
    F('deficit_moteur_rapporte', 'Déficit moteur (rapporté)', 'm', { t: 'déficit moteur', details: [D.loc('Topographie')] }),
    F('troubles_sensitifs', 'Troubles sensitifs (paresthésies, hypoesthésie)', 'mp', { t: 'troubles sensitifs', details: [D.loc('Topographie')] }),
    F('troubles_marche', 'Troubles de la marche', 'mp'),
    F('troubles_sphincteriens', 'Troubles sphinctériens', 'mp'),
    F('troubles_visuels', 'Troubles visuels', 'mp', { details: [D.text('desc', 'Description')] }),
    F('troubles_langage', 'Troubles du langage', 'mp'),
    F('troubles_memoire', 'Troubles de la mémoire', 'mp'),
    F('photophobie', 'Photophobie', 'f'),
    F('phonophobie', 'Phonophobie', 'f'),
  ]),
  B('neuro_vigilance', 'Vigilance et fonctions supérieures', 'examen', () => [
    R('conscience'),
    S('fonctions_sup', 'Fonctions supérieures', ['sans anomalie décelable', 'troubles mnésiques', 'troubles attentionnels', 'syndrome dysexécutif', 'apraxie', 'agnosie', 'négligence'], { nl: ['sans anomalie décelable'], p: 'fonctions supérieures : {v}' }),
    S('langage', 'Langage', ['normal', 'aphasie de Broca (non fluente)', 'aphasie de Wernicke (fluente)', 'aphasie globale', 'dysarthrie', 'mutisme'], { nl: ['normal'], p: 'langage {v}' }),
  ]),
  B('neuro_nc', 'Nerfs crâniens (II à XII)', 'examen', () => [SP('nerfs')]),
  B('neuro_motricite', 'Motricité et tonus', 'examen', () => [
    F('deficit_moteur', 'Déficit moteur à l’examen', 'm', { t: 'déficit moteur', details: [D.sel('topo', 'Topographie', ['hémiplégie droite', 'hémiplégie gauche', 'hémiparésie droite', 'hémiparésie gauche', 'paraplégie', 'paraparésie', 'tétraplégie', 'tétraparésie', 'monoplégie', 'déficit proportionnel', 'déficit non proportionnel'], '{v}')] }),
    SP('mrc'),
    S('tonus', 'Tonus', ['normal', 'hypotonie', 'hypertonie spastique', 'hypertonie plastique (roue dentée)'], { nl: ['normal'], p: 'tonus {v}' }),
    F('amyotrophie_neuro', 'Amyotrophie', 'f', { details: [D.loc('Topographie')] }),
    F('fasciculations', 'Fasciculations', 'fp'),
  ]),
  B('neuro_reflexes', 'Réflexes', 'examen', () => [SP('rot'), F('clonus', 'Clonus', 'm', { details: [D.loc('Siège')] })]),
  B('neuro_sensibilite', 'Sensibilité', 'examen', () => [
    S('sensibilite_sup', 'Sensibilité superficielle (tact, piqûre, thermique)', ['normale', 'hypoesthésie', 'anesthésie', 'hyperesthésie', 'dissociation thermo-algique'], { nl: ['normale'], p: 'sensibilité superficielle {v}' }),
    S('sensibilite_prof', 'Sensibilité profonde (arthrokinesthésie, pallesthésie)', ['normale', 'altérée'], { nl: ['normale'], p: 'sensibilité profonde {v}' }),
    T('sensibilite_topo', 'Topographie du trouble sensitif', { p: '(topographie : {v})', placeholder: 'ex. hémicorps droit, niveau sensitif T10, en chaussettes' }),
  ]),
  B('neuro_coordination', 'Coordination, station et marche', 'examen', () => [
    S('doigt_nez', 'Épreuve doigt-nez', ['normale', 'dysmétrie à droite', 'dysmétrie à gauche', 'dysmétrie bilatérale', 'non réalisable'], { nl: ['normale'], p: 'épreuve doigt-nez {v}' }),
    S('talon_genou', 'Épreuve talon-genou', ['normale', 'dysmétrie à droite', 'dysmétrie à gauche', 'dysmétrie bilatérale', 'non réalisable'], { nl: ['normale'], p: 'épreuve talon-genou {v}' }),
    F('adiadococinesie', 'Adiadococinésie', 'f'),
    S('romberg', 'Station debout (Romberg)', ['stable, Romberg négatif', 'Romberg positif (proprioceptif)', 'Romberg latéralisé (vestibulaire)', 'instabilité yeux ouverts (cérébelleuse)', 'station debout impossible'], { nl: ['stable, Romberg négatif'], p: 'station debout : {v}' }),
    S('marche', 'Marche', ['normale', 'fauchante', 'ataxique (talonnante)', 'ébrieuse (cérébelleuse)', 'en steppage', 'à petits pas', 'antalgique (boiterie)', 'impossible', 'non évaluée (patient alité)'], { nl: ['normale'], p: 'marche {v}' }),
  ]),
  B('neuro_meninges', 'Syndrome méningé', 'examen', () => [
    F('raideur_nuque', 'Raideur de nuque', 'f', { hint: 'Résistance douloureuse à la flexion passive de la nuque.' }),
    F('kernig', 'Signe de Kernig', 'm'),
    F('brudzinski', 'Signe de Brudzinski', 'm'),
  ]),
  B('neuro_pyramidal', 'Syndromes pyramidal et extrapyramidal', 'examen', () => [
    F('hoffmann', 'Signe de Hoffmann', 'm', { details: [D.cote()] }),
    F('tremblement_repos', 'Tremblement de repos', 'm', { details: [D.cote()] }),
    F('rigidite', 'Rigidité extrapyramidale (roue dentée)', 'f', { t: 'rigidité en roue dentée' }),
    F('akinesie', 'Akinésie / bradykinésie', 'f', { t: 'akinésie' }),
    F('asterixis', 'Astérixis (flapping tremor)', 'm', { t: 'astérixis (flapping tremor)' }),
  ]),
]);

/* ================================================================== */
/* 6. LOCOMOTEUR ET RHUMATOLOGIQUE                                      */
/* ================================================================== */
export const LOCOMOTEUR: AppareilDef = A('loco', 'Appareil locomoteur et rhumatologique', 'Locomoteur', 'Examen ostéo-articulaire et musculaire', 'recommande', () => [
  B('loco_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('arthralgies', 'Arthralgies', 'fp', { details: [D.loc('Topographie'), D.sel('horaire', 'Horaire', ['d’horaire mécanique', 'd’horaire inflammatoire', 'd’horaire mixte'], '{v}')] }),
    F('myalgies', 'Myalgies', 'fp', { details: [D.loc('Topographie')] }),
    F('rachialgies', 'Rachialgies', 'fp', { details: [D.sel('niveau', 'Niveau', ['cervicales', 'dorsales', 'lombaires'], '{v}'), D.sel('horaire', 'Horaire', ['d’horaire mécanique', 'd’horaire inflammatoire'], '{v}')] }),
    F('raideur_matinale', 'Raideur matinale', 'f', { details: [D.num('duree', 'Durée du dérouillage', 'min', 'avec un dérouillage matinal de {v} minutes')] }),
    F('gonflement_articulaire', 'Gonflement articulaire', 'm', { details: [D.loc('Articulations')] }),
    F('impotence', 'Impotence fonctionnelle', 'f', { details: [D.sel('deg', 'Degré', ['partielle', 'totale'], '{v}'), D.loc('Siège')] }),
    F('faiblesse_musculaire', 'Faiblesse musculaire', 'f', { details: [D.loc('Topographie')] }),
    F('traumatisme', 'Notion de traumatisme', 'f', { t: 'notion de traumatisme', details: [D.text('desc', 'Description')] }),
  ]),
  B('loco_articulaire', 'Examen articulaire', 'inspection', () => [
    SP('articulations'),
    F('synovite', 'Synovite clinique', 'f', { hint: 'Tuméfaction articulaire rénitente (épanchement ou épaississement synovial).' }),
    F('deformations', 'Déformations articulaires', 'fp', { details: [D.text('desc', 'Description (coup de vent cubital, col de cygne...)')] }),
    F('enthesite', 'Douleur à la palpation des enthèses', 'f', { details: [D.loc('Enthèses')] }),
    F('nodules', 'Nodules (rhumatoïdes, tophus, Heberden...)', 'mp', { t: 'nodules', details: [D.text('desc', 'Type et siège')] }),
  ]),
  B('loco_rachis', 'Examen du rachis', 'examen', () => [
    S('rachis_statique', 'Statique rachidienne', ['normale', 'attitude antalgique', 'scoliose', 'hypercyphose', 'hyperlordose', 'effacement de la lordose lombaire'], { nl: ['normale'], p: 'statique rachidienne {v}' }),
    N('schober', 'Indice de Schober', 'cm', { p: 'indice de Schober à 10 + {v} cm', hint: 'Normal ≥ 10 + 4 cm.' }),
    N('dds', 'Distance doigts-sol', 'cm', { p: 'distance doigts-sol à {v} cm' }),
    F('contracture_paravert', 'Contracture paravertébrale', 'f'),
    F('douleur_epineuses', 'Douleur à la percussion des épineuses', 'f', { details: [D.loc('Niveau')] }),
    F('lasegue', 'Signe de Lasègue', 'm', { details: [D.cote(), D.num('angle', 'Angle', '°', 'à {v}°')] }),
    F('sonnette', 'Signe de la sonnette', 'm', { details: [D.cote()] }),
    F('leri', 'Signe de Léri (crural)', 'm', { t: 'signe de Léri', details: [D.cote()] }),
  ]),
  B('loco_muscle', 'Examen musculaire et marche', 'examen', () => [
    F('amyotrophie', 'Amyotrophie', 'f', { details: [D.loc('Topographie')] }),
    F('douleur_masses_musc', 'Douleur à la palpation des masses musculaires', 'f', { details: [D.loc('Topographie')] }),
    F('deficit_proximal', 'Déficit musculaire proximal (lever de chaise, signe du tabouret)', 'm', { t: 'déficit musculaire proximal (signe du tabouret)' }),
    F('boiterie', 'Boiterie', 'f', { details: [D.text('desc', 'Description')] }),
  ]),
]);

/* ================================================================== */
/* 7. ENDOCRINIEN ET MÉTABOLIQUE                                        */
/* ================================================================== */
export const ENDOCRINIEN: AppareilDef = A('endo', 'Appareil endocrinien et métabolique', 'Endocrinien', 'Examen endocrinologique', 'recommande', () => [
  B('endo_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    R('polyurie'),
    F('polydipsie', 'Polydipsie', 'f'),
    F('polyphagie', 'Polyphagie', 'f'),
    R('amaigrissement'),
    R('prise_poids'),
    F('intolerance_froid', 'Frilosité / intolérance au froid', 'f', { t: 'frilosité' }),
    F('intolerance_chaleur', 'Thermophobie / intolérance à la chaleur', 'f', { t: 'thermophobie' }),
    F('tremblements', 'Tremblements', 'mp'),
    R('sueurs'),
    R('asthenie'),
    F('troubles_sommeil', 'Troubles du sommeil', 'mp'),
    F('malaises_hypo', 'Malaises évocateurs d’hypoglycémie', 'mp', { t: 'malaises évocateurs d’hypoglycémie' }),
    F('bouffees_chaleur', 'Bouffées de chaleur', 'fp'),
  ]),
  B('endo_inspection', 'Inspection et morphotype', 'inspection', () => [
    S('morphotype', 'Morphotype / répartition des graisses', ['normal', 'obésité androïde (abdominale)', 'obésité gynoïde', 'obésité facio-tronculaire (cushingoïde)', 'aspect acromégaloïde', 'maigreur'], { nl: ['normal'], p: 'morphotype : {v}' }),
    N('tour_taille', 'Tour de taille', 'cm', { p: 'tour de taille {v} cm', hint: 'Obésité abdominale : > 94 cm (H) / > 80 cm (F) selon IDF, > 102 / > 88 cm selon NCEP.' }),
    F('exophtalmie', 'Exophtalmie', 'f', { details: [D.cote()] }),
    F('retraction_palpebrale', 'Rétraction palpébrale / asynergie oculo-palpébrale', 'f', { t: 'rétraction palpébrale' }),
    F('vergetures', 'Vergetures pourpres larges', 'fp'),
    F('erythrose_faciale', 'Érythrose faciale', 'f'),
    F('bosse_bison', 'Comblement des creux sus-claviculaires / bosse de bison', 'm', { t: 'comblement des creux sus-claviculaires (bosse de bison)' }),
    F('acanthosis', 'Acanthosis nigricans', 'm', { t: 'acanthosis nigricans' }),
    F('melanodermie', 'Mélanodermie', 'f'),
    F('hirsutisme', 'Hirsutisme', 'm', { sex: 'F' }),
    F('dysmorphie_acro', 'Syndrome dysmorphique (acromégalie)', 'm', { t: 'syndrome dysmorphique acromégaloïde' }),
    F('infiltration_myxoedeme', 'Infiltration cutanée (myxœdème)', 'f', { t: 'infiltration cutanéo-muqueuse (myxœdème)' }),
  ]),
  B('endo_palpation', 'Palpation thyroïdienne et signes associés', 'palpation', () => [
    F('goitre', 'Goitre', 'm', { details: [D.sel('type', 'Type', ['homogène', 'multinodulaire', 'uninodulaire'], '{v}'), D.sel('consistance', 'Consistance', ['souple', 'ferme', 'dur', 'pierreux'], '{v}'), D.sel('vasc', 'Vascularité', ['non vasculaire', 'vasculaire (thrill / souffle)'], '{v}')] }),
    F('nodule_thyroidien', 'Nodule thyroïdien', 'm', { details: [D.cote(), D.num('taille', 'Taille', 'cm', 'de {v} cm')] }),
    F('tremblement_fin', 'Tremblement fin des extrémités', 'm'),
    F('peau_chaude_moite', 'Peau chaude et moite', 'f'),
  ]),
  B('endo_diabete', 'Complications du diabète (si diabétique)', 'examen', () => [
    S('pieds', 'Examen des pieds', ['sans lésion', 'hyperkératose', 'mal perforant plantaire', 'plaie', 'déformations (orteils en griffe, Charcot)', 'gangrène'], { nl: ['sans lésion'], p: 'examen des pieds : {v}' }),
    S('monofilament', 'Test au monofilament', ['perçu aux deux pieds', 'non perçu à droite', 'non perçu à gauche', 'non perçu aux deux pieds'], { nl: ['perçu aux deux pieds'], p: 'monofilament {v}' }),
    T('fond_oeil_diab', 'Rétinopathie (dernier fond d’œil)', { p: 'dernier fond d’œil : {v}' }),
  ]),
]);

/* ================================================================== */
/* 8. HÉMATOLOGIQUE ET LYMPHATIQUE                                      */
/* ================================================================== */
export const HEMATO: AppareilDef = A('hemato', 'Appareil hématologique et lymphatique', 'Hématologique', 'Examen hématologique et des aires ganglionnaires', 'recommande', () => [
  B('hemato_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    R('asthenie'),
    F('saignements', 'Saignements anormaux', 'mp', { details: [D.text('desc', 'Type et circonstances')] }),
    F('ecchymoses_faciles', 'Ecchymoses spontanées ou faciles', 'fp', { t: 'ecchymoses spontanées' }),
    F('epistaxis', 'Épistaxis', 'f'),
    F('gingivorragies', 'Gingivorragies', 'fp'),
    F('menorragies', 'Ménorragies', 'fp', { sex: 'F' }),
    F('infections_repetees', 'Infections répétées', 'fp'),
    F('fievre_prolongee', 'Fièvre prolongée', 'f'),
    F('sueurs_nocturnes', 'Sueurs nocturnes', 'fp'),
    R('amaigrissement'),
    F('prurit', 'Prurit', 'm', { details: [D.sel('type', 'Type', ['généralisé', 'localisé', 'aquagénique'], '{v}')] }),
  ]),
  B('hemato_examen', 'Examen', 'inspection', () => [
    R('paleur'),
    F('purpura', 'Purpura', 'm', { details: [D.sel('type', 'Type', ['pétéchial', 'ecchymotique', 'nécrotique', 'infiltré (vasculaire)'], '{v}'), D.loc('Localisation')], hint: 'Ne s’efface pas à la vitropression. Purpura fébrile nécrotique = urgence.' }),
    F('petechies', 'Pétéchies', 'fp', { details: [D.loc('Localisation')] }),
    F('ecchymoses', 'Ecchymoses', 'fp', { details: [D.loc('Localisation')] }),
    F('hematomes', 'Hématomes', 'mp', { details: [D.loc('Localisation')] }),
    F('bulles_hemorragiques', 'Bulles hémorragiques endobuccales', 'fp', { hint: 'Signe de gravité d’une thrombopénie.' }),
    R('splenomegalie'),
    R('hepatomegalie'),
  ]),
  B('hemato_ganglions', 'Aires ganglionnaires', 'palpation', () => [
    F('adenopathies', 'Adénopathies', 'fp', { hint: 'Décrire siège, taille, consistance, mobilité, sensibilité ; examiner toutes les aires.' }),
    SP('adenopathies'),
  ]),
]);

/* ================================================================== */
/* 9. CUTANÉO-MUQUEUX ET PHANÈRES                                       */
/* ================================================================== */
export const PEAU: AppareilDef = A('peau', 'Appareil cutanéo-muqueux et phanères', 'Cutané', 'Examen cutanéo-muqueux et des phanères', 'recommande', () => [
  B('peau_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('eruption', 'Éruption cutanée', 'f', { details: [D.text('desc', 'Description, chronologie')] }),
    R('prurit'),
    F('ulcerations_rapportees', 'Ulcérations cutanées ou muqueuses', 'fp', { t: 'ulcérations cutanéo-muqueuses' }),
    F('aphtes', 'Aphtose buccale / génitale', 'f', { t: 'aphtose', details: [D.sel('siege', 'Siège', ['buccale', 'génitale', 'bipolaire'], '{v}')] }),
    F('alopecie', 'Chute des cheveux', 'f'),
    F('ongles_modif', 'Modifications des ongles', 'fp'),
    F('photosensibilite', 'Photosensibilité', 'f'),
    F('raynaud', 'Phénomène de Raynaud', 'm', { details: [D.cote()] }),
    F('xerose', 'Sécheresse cutanée', 'f'),
  ]),
  B('peau_examen', 'Inspection de la peau', 'inspection', () => [
    S('peau_couleur', 'Couleur', ['normale', 'pâle', 'ictérique', 'cyanosée', 'érythrosique', 'mélanodermique', 'grisâtre'], { nl: ['normale'], p: 'téguments de coloration {v}' }),
    S('peau_temperature', 'Température cutanée', ['normale', 'chaude', 'froide', 'chaude et moite'], { nl: ['normale'], p: 'peau {v}' }),
    S('peau_hydratation', 'Hydratation cutanée', ['normale', 'sèche', 'moite'], { nl: ['normale'], p: 'hydratation cutanée {v}' }),
    S('peau_trophicite', 'Trophicité', ['normale', 'atrophie cutanée', 'troubles trophiques', 'sclérose cutanée'], { nl: ['normale'], p: 'trophicité cutanée {v}' }),
    F('lesions_cutanees', 'Lésions cutanées élémentaires', 'fp', { t: 'lésions cutanées', hint: 'Macule, papule, vésicule, bulle, pustule, nodule, plaque, purpura, ulcération, squame, croûte.' }),
    SP('lesions'),
    F('escarres', 'Escarres', 'fp', { details: [D.sel('stade', 'Stade', ['1 (érythème persistant)', '2 (phlyctène / désépidermisation)', '3 (nécrose, atteinte hypodermique)', '4 (atteinte muscle / os)'], 'de stade {v}'), D.loc('Localisation')] }),
    F('livedo', 'Livedo', 'm', { details: [D.sel('type', 'Type', ['réticulé', 'ramifié (racemosa)'], '{v}'), D.loc()] }),
    F('sclerodactylie', 'Sclérodactylie', 'f'),
    F('erytheme_noueux', 'Érythème noueux', 'm'),
  ]),
  B('peau_muqueuses', 'Muqueuses et phanères', 'examen', () => [
    F('lesions_muqueuses', 'Lésions muqueuses', 'fp', { details: [D.text('desc', 'Description (aphtes, candidose, ulcérations...)')] }),
    S('phaneres', 'Cheveux et ongles', ['sans anomalie', 'alopécie', 'onychodystrophie', 'ongles striés / cassants', 'koïlonychie', 'leuconychie', 'hémorragies en flammèches sous-unguéales'], { nl: ['sans anomalie'], p: 'phanères : {v}' }),
  ]),
]);

/* ================================================================== */
/* 10. ORL ET OPHTALMOLOGIQUE                                           */
/* ================================================================== */
export const ORL: AppareilDef = A('orl', 'Appareil ORL et ophtalmologique', 'ORL / Ophtalmo', 'Examen ORL et ophtalmologique', 'facultatif', () => [
  B('orl_interro', 'Interrogatoire fonctionnel ORL', 'interrogatoire', () => [
    F('rhinorrhee', 'Rhinorrhée', 'f', { details: [D.sel('aspect', 'Aspect', ['claire', 'purulente', 'sanglante'], '{v}')] }),
    R('epistaxis'),
    F('obstruction_nasale', 'Obstruction nasale', 'f', { details: [D.cote()] }),
    F('otalgie', 'Otalgie', 'f', { details: [D.cote()] }),
    F('otorrhee', 'Otorrhée', 'f', { details: [D.cote()] }),
    F('hypoacousie', 'Hypoacousie', 'f', { details: [D.cote()] }),
    F('acouphenes', 'Acouphènes', 'mp', { details: [D.cote()] }),
    R('vertiges'),
    F('dysphonie', 'Dysphonie', 'f'),
    R('dysphagie'),
    F('odynophagie', 'Odynophagie', 'f'),
    F('xerostomie', 'Sécheresse buccale (xérostomie)', 'f', { t: 'xérostomie' }),
  ]),
  B('ophtalmo_interro', 'Interrogatoire fonctionnel ophtalmologique', 'interrogatoire', () => [
    F('baisse_av', 'Baisse de l’acuité visuelle', 'f', { details: [D.cote(), D.sel('mode', 'Installation', ['brutale', 'progressive'], 'd’installation {v}')] }),
    F('diplopie', 'Diplopie', 'f', { details: [D.sel('type', 'Type', ['binoculaire', 'monoculaire'], '{v}'), D.sel('sens', 'Sens', ['horizontale', 'verticale', 'oblique'], '{v}')] }),
    F('douleur_oculaire', 'Douleur oculaire', 'f', { details: [D.cote()] }),
    F('rougeur_oculaire', 'Rougeur oculaire', 'f', { details: [D.cote()] }),
    F('xerophtalmie', 'Sécheresse oculaire (xérophtalmie)', 'f', { t: 'xérophtalmie' }),
  ]),
  B('orl_examen', 'Examen ORL', 'examen', () => [
    S('pavillons', 'Pavillons auriculaires', ['normaux', 'anomalie'], { nl: ['normaux'], p: 'pavillons auriculaires {v}' }),
    S('otoscopie', 'Otoscopie (conduits et tympans)', ['conduits libres, tympans normaux', 'bouchon de cérumen', 'tympan inflammatoire / bombant', 'perforation tympanique', 'otite externe'], { nl: ['conduits libres, tympans normaux'], p: 'otoscopie : {v}' }),
    S('fosses_nasales', 'Fosses nasales', ['normales', 'muqueuse inflammatoire', 'saignement / point de saignement', 'polypes', 'déviation septale'], { nl: ['normales'], p: 'fosses nasales {v}' }),
    S('cavite_buccale', 'Cavité buccale et état dentaire', ['normale, bon état bucco-dentaire', 'mauvais état bucco-dentaire', 'candidose buccale', 'langue dépapillée', 'lésion muqueuse'], { nl: ['normale, bon état bucco-dentaire'], p: 'cavité buccale : {v}' }),
    S('pharynx', 'Pharynx et amygdales', ['normaux', 'pharynx érythémateux', 'amygdales hypertrophiées', 'exsudat amygdalien', 'fausses membranes', 'bombement péri-amygdalien'], { nl: ['normaux'], p: 'pharynx et amygdales {v}' }),
    F('masse_cervicale', 'Masse cervicale', 'f', { details: [D.loc('Siège, taille')] }),
    S('mobilite_cervicale', 'Mobilité cervicale', ['libre et indolore', 'limitée', 'douloureuse'], { nl: ['libre et indolore'], p: 'mobilité cervicale {v}' }),
  ]),
  B('ophtalmo_examen', 'Examen ophtalmologique', 'examen', () => [
    T('acuite_od', 'Acuité visuelle OD', { p: 'acuité visuelle OD {v}' }),
    T('acuite_og', 'Acuité visuelle OG', { p: 'acuité visuelle OG {v}' }),
    S('pupilles', 'Pupilles', ['isocores et réactives', 'anisocorie (droite > gauche)', 'anisocorie (gauche > droite)', 'mydriase bilatérale', 'myosis bilatéral'], { nl: ['isocores et réactives'], p: 'pupilles {v}' }),
    S('rpm', 'Réflexes photomoteurs', ['présents et symétriques', 'diminués', 'abolis à droite', 'abolis à gauche', 'abolis des deux côtés'], { nl: ['présents et symétriques'], p: 'réflexes photomoteurs {v}' }),
    S('oculomotricite', 'Motilité oculaire', ['normale', 'limitation', 'paralysie oculomotrice'], { nl: ['normale'], p: 'oculomotricité {v}' }),
    F('nystagmus', 'Nystagmus', 'm', { details: [D.text('desc', 'Sens, caractère')] }),
    S('conjonctives', 'Conjonctives', ['normales', 'pâles', 'ictériques', 'hyperhémiées', 'hémorragie sous-conjonctivale'], { nl: ['normales'], p: 'conjonctives {v}' }),
    T('fond_oeil', 'Fond d’œil (si indiqué)', { p: 'fond d’œil : {v}' }),
  ]),
]);

/* ================================================================== */
/* 11. GÉNITAL ET REPRODUCTEUR                                          */
/* ================================================================== */
export const GENITAL: AppareilDef = A('genital', 'Appareil génital et reproducteur', 'Génital', 'Examen génital', 'facultatif', () => [
  B('genital_interro', 'Interrogatoire fonctionnel', 'interrogatoire', () => [
    F('douleurs_pelviennes', 'Douleurs pelviennes', 'fp'),
    F('pertes_genitales', 'Pertes génitales / écoulement', 'fp', { t: 'pertes génitales', details: [D.text('aspect', 'Aspect')] }),
    F('metrorragies', 'Saignements génitaux anormaux (métrorragies)', 'fp', { t: 'métrorragies', sex: 'F' }),
    F('troubles_menstruels', 'Troubles menstruels', 'mp', { sex: 'F', details: [D.text('desc', 'Description')] }),
    F('troubles_sexuels', 'Troubles sexuels', 'mp', { details: [D.text('desc', 'Description')] }),
    F('douleur_scrotale', 'Douleur scrotale', 'f', { sex: 'M', details: [D.cote()] }),
    F('ulceration_genitale', 'Ulcération génitale', 'f'),
    F('mastodynie', 'Douleur / écoulement mammaire', 'm', { t: 'douleur ou écoulement mammaire' }),
  ]),
  B('genital_examen', 'Examen (si indiqué)', 'examen', () => [
    S('genital_consentement', 'Conditions de l’examen', ['non réalisé (non indiqué)', 'consentement recueilli, en présence d’un tiers', 'consentement recueilli', 'refusé par le patient'], { p: 'examen génital : {v}' }),
    S('genital_externe', 'Examen génital externe', ['sans anomalie', 'anomalie (préciser)'], { nl: ['sans anomalie'], p: 'examen génital externe {v}' }),
    S('seins', 'Examen des seins', ['sans anomalie', 'masse palpable', 'écoulement mamelonnaire', 'rétraction cutanée / mamelonnaire', 'signes inflammatoires'], { nl: ['sans anomalie'], p: 'examen des seins : {v}' }),
    S('testicules', 'Examen testiculaire', ['sans anomalie', 'masse testiculaire', 'testicule douloureux', 'varicocèle', 'hydrocèle'], { nl: ['sans anomalie'], p: 'examen testiculaire : {v}', sex: 'M' }),
    S('gyneco_examen', 'Examen gynécologique (spéculum, toucher vaginal)', ['sans anomalie', 'saignement endo-utérin', 'leucorrhées', 'masse latéro-utérine', 'douleur à la mobilisation utérine'], { nl: ['sans anomalie'], p: 'examen gynécologique : {v}', sex: 'F' }),
    F('masse_genitale', 'Masse', 'f', { details: [D.loc('Siège et description')] }),
    F('douleur_genitale', 'Douleur provoquée', 'f', { details: [D.loc('Siège')] }),
    T('genital_detail', 'Précisions', { p: '{v}' }),
  ], { siIndique: true }),
], { avertissement: 'Examens intimes : uniquement si médicalement indiqués, après information et consentement explicite, dans le respect de l’intimité, avec proposition de la présence d’un tiers.' });

/* ================================================================== */

export const APPAREILS: AppareilDef[] = [CARDIO, RESPI, DIGESTIF, URINAIRE, NEURO, LOCOMOTEUR, ENDOCRINIEN, HEMATO, PEAU, ORL, GENITAL];
export const APPAREIL_BY_ID: Record<string, AppareilDef> = Object.fromEntries(
  [ETAT_GENERAL, ...APPAREILS].map((a) => [a.id, a]),
);

/** Données des tableaux spéciaux */
export const POULS_ARTERES = [
  ['carotidien', 'Carotidiens'],
  ['radial', 'Radiaux'],
  ['humeral', 'Huméraux'],
  ['femoral', 'Fémoraux'],
  ['poplite', 'Poplités'],
  ['tibial_post', 'Tibiaux postérieurs'],
  ['pedieux', 'Pédieux'],
] as const;
export const POULS_VALEURS = ['perçu', 'diminué', 'aboli', 'non recherché'];

export const MRC_SEGMENTS = [
  ['ms_prox', 'Membre supérieur – proximal'],
  ['ms_dist', 'Membre supérieur – distal'],
  ['mi_prox', 'Membre inférieur – proximal'],
  ['mi_dist', 'Membre inférieur – distal'],
] as const;
export const MRC_VALEURS = ['5', '4', '3', '2', '1', '0', 'NE'];
export const MRC_AIDE: Record<string, string> = {
  '5': 'Force normale',
  '4': 'Mouvement contre résistance (diminuée)',
  '3': 'Mouvement contre la pesanteur',
  '2': 'Mouvement sans pesanteur',
  '1': 'Contraction visible sans mouvement',
  '0': 'Aucune contraction',
  NE: 'Non évaluable',
};

export const ROT_LISTE = [
  ['bicipital', 'Bicipital (C5)'],
  ['stylo', 'Stylo-radial (C6)'],
  ['tricipital', 'Tricipital (C7)'],
  ['rotulien', 'Rotulien (L4)'],
  ['achilleen', 'Achilléen (S1)'],
] as const;
export const ROT_VALEURS = ['normal', 'vif', 'vif diffusé / polycinétique', 'diminué', 'aboli', 'non recherché'];
export const BABINSKI_VALEURS = ['flexion (normal)', 'extension (Babinski)', 'indifférent', 'non recherché'];

export const NERFS_CRANIENS = [
  ['II', 'II – Optique (acuité, champ visuel)'],
  ['III_IV_VI', 'III, IV, VI – Oculomoteurs'],
  ['V', 'V – Trijumeau (sensibilité faciale, réflexe cornéen)'],
  ['VII', 'VII – Facial'],
  ['VIII', 'VIII – Cochléo-vestibulaire'],
  ['IX_X', 'IX, X – Glosso-pharyngien, vague (déglutition, voile)'],
  ['XI', 'XI – Spinal (SCM, trapèze)'],
  ['XII', 'XII – Hypoglosse (langue)'],
] as const;
export const NERFS_VALEURS = ['normal', 'anormal', 'non examiné'];

export const AIRES_GANGLIONNAIRES = [
  'cervicales', 'sus-claviculaires', 'axillaires', 'épitrochléennes', 'inguinales', 'poplitées',
];
export const ARTICULATIONS = [
  'épaule', 'coude', 'poignet', 'métacarpo-phalangiennes', 'interphalangiennes proximales (mains)',
  'interphalangiennes distales (mains)', 'hanche', 'genou', 'cheville', 'métatarso-phalangiennes',
  'sacro-iliaque', 'temporo-mandibulaire', 'sterno-claviculaire', 'rachis cervical', 'rachis lombaire',
];
export const SIGNES_ARTICULAIRES = [
  'tuméfaction', 'rougeur', 'chaleur', 'épanchement', 'douleur à la mobilisation', 'limitation des amplitudes',
  'déformation', 'craquements', 'instabilité',
];
export const LESIONS_TYPES = [
  'macule', 'papule', 'plaque', 'nodule', 'vésicule', 'bulle', 'pustule', 'purpura', 'ulcération', 'érosion',
  'squames', 'croûte', 'nécrose', 'escarre', 'cicatrice', 'tumeur',
];
