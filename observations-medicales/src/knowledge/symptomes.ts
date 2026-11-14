/**
 * Assistant d'interrogatoire : bibliothèque des symptômes.
 * Pour chaque symptôme : questions sémiologiques ciblées, signes associés à rechercher
 * (partagés avec l'interrogatoire fonctionnel des appareils), éléments d'examen à ne pas oublier,
 * drapeaux rouges, diagnostics graves à ne pas manquer et scores pertinents.
 */
import './appareils.ts';
import { F, setHome, setNature } from './registry.ts';
import type { Genre } from './types.ts';

export type QType = 'select' | 'multi' | 'text' | 'number' | 'yn' | 'eva' | 'date' | 'time';

export interface Question {
  id: string;
  label: string;
  type: QType;
  options?: string[];
  unit?: string;
  /** Gabarit de rédaction ; {v} = valeur (les choix multiples sont joints par « et ») */
  p?: string;
  /** Rédaction si « oui » / si « non » (questions tri-état) */
  py?: string;
  pn?: string;
  hint?: string;
  group: 'chrono' | 'caract' | 'facteurs' | 'specifique' | 'retentissement';
  essentiel?: boolean;
  placeholder?: string;
  sex?: 'F' | 'M';
  /** Rédigé directement après le nom du symptôme (« dyspnée d’effort », « toux sèche ») */
  adj?: boolean;
}

export interface SymptomDef {
  id: string;
  label: string;
  /** Groupe nominal sans article pour la rédaction */
  t: string;
  g: Genre;
  categorie: string;
  douleur?: boolean;
  questions: Question[];
  associes: string[];
  focus: string[];
  rappels: string[];
  drapeaux: string[];
  aNePasManquer: string[];
  scores: string[];
  appareils: string[];
}

/* Signes complémentaires propres à l'interrogatoire de certains symptômes */
setHome('neuro');
setNature('fonctionnel');
F('anesthesie_selle', 'Anesthésie en selle', 'f', { hint: 'Hypoesthésie périnéale : drapeau rouge de syndrome de la queue de cheval.' });
setHome('dig');
F('urines_foncees', 'Urines foncées', 'fp');
F('selles_decolorees', 'Selles décolorées', 'fp');

/* ------------------------------------------------------------------ */
/* Questions communes                                                   */
/* ------------------------------------------------------------------ */

export const MODE_DEBUT = ['brutal', 'rapidement progressif', 'progressif', 'insidieux'];

export function chrono(opts: { caractere?: boolean } = {}): Question[] {
  const q: Question[] = [
    { id: 'debut_date', label: 'Date de début', type: 'date', group: 'chrono', essentiel: true },
    { id: 'debut_heure', label: 'Heure de début', type: 'time', group: 'chrono' },
    { id: 'mode_debut', label: 'Mode de début', type: 'select', options: MODE_DEBUT, group: 'chrono', essentiel: true },
    { id: 'circonstances', label: 'Circonstances de survenue', type: 'text', group: 'chrono', placeholder: 'ex. au repos, au cours d’un effort, au réveil…' },
    {
      id: 'evolution', label: 'Évolution depuis le début', type: 'select', group: 'chrono', essentiel: true,
      options: ['aggravation progressive', 'stabilité', 'amélioration progressive', 'évolution fluctuante', 'évolution par poussées', 'résolution complète'],
    },
    { id: 'duree', label: 'Durée (ou durée des épisodes)', type: 'text', group: 'chrono', placeholder: 'ex. 3 jours, épisodes de 20 minutes' },
  ];
  if (opts.caractere !== false) {
    q.push({ id: 'caractere', label: 'Caractère', type: 'select', options: ['permanent', 'intermittent', 'paroxystique'], group: 'chrono' });
  }
  q.push(
    { id: 'frequence', label: 'Fréquence des épisodes', type: 'text', group: 'chrono', placeholder: 'ex. 3 épisodes par jour' },
    { id: 'episodes_ant', label: 'Épisodes similaires antérieurs', type: 'yn', group: 'chrono' },
    { id: 'episodes_detail', label: 'Précisions sur les épisodes antérieurs', type: 'text', group: 'chrono' },
    {
      id: 'evolution_ttt', label: 'Évolution spontanée ou sous traitement', type: 'select', group: 'chrono',
      options: ['évolution spontanée, sans traitement', 'amélioration sous traitement', 'absence d’amélioration sous traitement', 'aggravation malgré le traitement'],
    },
  );
  return q;
}

/* Questions communes à toutes les douleurs (approche OPQRST complétée) */
function painCommon(o: {
  siege: string[];
  irradiation: string[];
  type: string[];
  declenchants: string[];
  aggravants: string[];
  calmants: string[];
  positions?: string[];
}): Question[] {
  return [
    ...chrono({ caractere: false }),
    { id: 'siege', label: '1. Siège (localisation précise)', type: 'multi', options: o.siege, group: 'caract', essentiel: true, p: '{v}' },
    { id: 'siege_precis', label: 'Point de départ / précision du siège', type: 'text', group: 'caract', p: '({v})', placeholder: 'point de départ, étendue, côté' },
    { id: 'irradiation', label: '8. Irradiation', type: 'multi', options: [...o.irradiation, 'sans irradiation'], group: 'caract', essentiel: true, p: 'irradiant {v}' },
    { id: 'type', label: '3. Type (qualité)', type: 'multi', options: o.type, group: 'caract', essentiel: true, p: 'à type de {v}' },
    { id: 'intensite', label: '4. Intensité (EVA / EN)', type: 'eva', group: 'caract', essentiel: true, p: 'd’intensité {v}/10 sur l’échelle visuelle analogique' },
    {
      id: 'temporalite', label: '5. Durée / profil temporel', type: 'select', group: 'caract', essentiel: true, p: '{v}',
      options: ['continue', 'intermittente', 'paroxystique', 'continue avec des paroxysmes', 'par crises'],
    },
    { id: 'duree_crise', label: 'Durée d’une crise / d’un accès', type: 'text', group: 'caract', p: 'les accès durant {v}' },
    { id: 'declenchants', label: '9. Facteurs déclenchants', type: 'multi', options: [...o.declenchants, 'sans facteur déclenchant retrouvé'], group: 'facteurs', p: 'déclenchée par {v}' },
    { id: 'aggravants', label: '10. Facteurs aggravants', type: 'multi', options: o.aggravants, group: 'facteurs', essentiel: true, p: 'aggravée par {v}' },
    { id: 'calmants', label: '11. Facteurs calmants', type: 'multi', options: [...o.calmants, 'non calmée par le repos ni les antalgiques usuels'], group: 'facteurs', essentiel: true, p: 'soulagée par {v}' },
    {
      id: 'position', label: '12. Position antalgique', type: 'select', group: 'facteurs', p: 'avec une position antalgique {v}',
      options: o.positions ?? ['en chien de fusil', 'penchée en avant', 'immobile', 'aucune position antalgique'],
    },
    {
      id: 'retentissement_fonctionnel', label: '14. Retentissement fonctionnel', type: 'select', group: 'retentissement', p: '{v}',
      options: ['sans retentissement fonctionnel', 'limitant les activités quotidiennes', 'responsable d’une impotence fonctionnelle totale'],
    },
    {
      id: 'retentissement_sommeil', label: 'Retentissement sur le sommeil', type: 'select', group: 'retentissement', p: '{v}',
      options: ['sans retentissement sur le sommeil', 'responsable de réveils nocturnes', 'responsable d’une insomnie'],
    },
    { id: 'ttt_essayes', label: '15. Traitements déjà essayés', type: 'text', group: 'retentissement', placeholder: 'ex. paracétamol 1 g' },
    {
      id: 'ttt_efficacite', label: 'Efficacité de ces traitements', type: 'select', group: 'retentissement',
      options: ['efficaces', 'partiellement efficaces', 'inefficaces'],
    },
  ];
}

const PAIN_ASSOC_COMMUNS = ['fievre', 'sueurs', 'nausees', 'vomissements'];

/* ------------------------------------------------------------------ */
/* Bibliothèque                                                         */
/* ------------------------------------------------------------------ */

export const SYMPTOMES: SymptomDef[] = [
  /* ======================= DOULEURS ======================= */
  {
    id: 'dl_thoracique', label: 'Douleur thoracique', t: 'douleur thoracique', g: 'f', categorie: 'Douleur', douleur: true,
    questions: [
      ...painCommon({
        siege: ['rétrosternale', 'précordiale', 'latéro-thoracique droite', 'latéro-thoracique gauche', 'basithoracique', 'épigastrique', 'diffuse', 'punctiforme (montrée du doigt)'],
        irradiation: ['vers la mâchoire', 'vers le membre supérieur gauche', 'vers les deux membres supérieurs', 'vers les épaules', 'dans le dos (interscapulaire)', 'migrant vers les lombes', 'vers l’épigastre', 'vers le cou'],
        type: ['constriction (serrement, étau)', 'oppression / pesanteur', 'brûlure', 'coup de poignard', 'déchirure', 'piqûre', 'point de côté'],
        declenchants: ['l’effort', 'le froid', 'un repas copieux', 'un stress émotionnel', 'un traumatisme thoracique', 'un effort de toux', 'des vomissements'],
        aggravants: ['l’effort', 'l’inspiration profonde', 'la toux', 'le décubitus dorsal', 'les mouvements du tronc', 'la palpation', 'la déglutition'],
        calmants: ['le repos', 'la trinitrine', 'la position penchée en avant', 'les antalgiques', 'les antiacides'],
        positions: ['penchée en avant', 'immobile, en inspiration bloquée', 'aucune position antalgique'],
      }),
      { id: 'effort', label: 'Relation à l’effort', type: 'select', group: 'specifique', essentiel: true, p: '{v}', options: ['survenant à l’effort et cédant au repos', 'survenue au repos', 'survenue à l’effort, persistant au repos', 'sans relation avec l’effort'] },
      { id: 'respiration', label: 'Modifiée par la respiration (caractère pleurétique)', type: 'yn', group: 'specifique', py: 'augmentée par l’inspiration profonde', pn: 'non modifiée par la respiration' },
      { id: 'position_tc', label: 'Modifiée par la position', type: 'yn', group: 'specifique', py: 'modifiée par la position', pn: 'non modifiée par la position' },
      { id: 'palpation', label: 'Reproduite par la palpation', type: 'yn', group: 'specifique', py: 'reproduite par la palpation de la paroi', pn: 'non reproduite par la palpation' },
      { id: 'trinitrine', label: 'Test à la trinitrine', type: 'select', group: 'specifique', p: '{v}', options: ['cédant en moins de 5 minutes sous trinitrine', 'non sensible à la trinitrine', 'trinitrine non testée'] },
      { id: 'duree_20', label: 'Durée > 20 minutes au repos', type: 'yn', group: 'specifique', py: 'prolongée, de plus de 20 minutes au repos', pn: 'de moins de 20 minutes' },
    ],
    associes: ['dyspnee', 'sueurs', 'palpitations', 'syncope', 'lipothymie', 'nausees', 'vomissements', 'toux', 'fievre', 'hemoptysie', 'gonflement_mi', 'douleur_abdominale'],
    focus: ['turgescence_jugulaire', 'rhj', 'omi', 'mollet', 'souffle_cardiaque', 'frottement_pericardique', 'b3', 'b1b2', 'rythme_cardiaque', 'crepitants', 'mv', 'percussion_thorax', 'asymetrie_ampliation', 'douleur_paroi', 'emphyseme_sc', 'marbrures', 'cyanose', 'trc', 'souffle_carotidien'],
    rappels: [
      'ECG 12 dérivations dans les 10 minutes suivant le premier contact médical.',
      'Pression artérielle aux deux bras et palpation de tous les pouls (asymétrie : dissection aortique).',
      'Auscultation : souffle d’insuffisance aortique, frottement péricardique, galop, crépitants.',
      'Rechercher des signes de thrombose veineuse profonde ; évaluer la probabilité clinique d’embolie pulmonaire.',
      'Rechercher des signes de choc (marbrures, TRC, conscience, diurèse).',
      'Préciser les facteurs de risque cardiovasculaire (tabac, HTA, diabète, dyslipidémie, hérédité).',
      'Palper la paroi thoracique et rechercher un emphysème sous-cutané.',
    ],
    drapeaux: ['Douleur constrictive prolongée (> 20 min) au repos', 'Douleur à type de déchirure irradiant dans le dos', 'Syncope, hypotension, signes de choc', 'Dyspnée, désaturation', 'Asymétrie tensionnelle > 20 mmHg ou abolition d’un pouls', 'Douleur après vomissements violents'],
    aNePasManquer: ['Syndrome coronarien aigu', 'Dissection aortique', 'Embolie pulmonaire', 'Pneumothorax compressif', 'Tamponnade', 'Rupture œsophagienne (Boerhaave)'],
    scores: ['heart', 'killip', 'wells_ep', 'geneve', 'news2', 'chads'],
    appareils: ['cv', 'resp'],
  },
  {
    id: 'dl_abdominale', label: 'Douleur abdominale', t: 'douleur abdominale', g: 'f', categorie: 'Douleur', douleur: true,
    questions: [
      ...painCommon({
        siege: ['épigastrique', 'de l’hypochondre droit', 'de l’hypochondre gauche', 'péri-ombilicale', 'du flanc droit', 'du flanc gauche', 'de la fosse iliaque droite', 'de la fosse iliaque gauche', 'hypogastrique', 'diffuse'],
        irradiation: ['dans le dos (transfixiante)', 'en ceinture', 'vers l’épaule droite', 'vers la pointe de l’omoplate droite', 'vers la fosse iliaque droite', 'vers les organes génitaux externes', 'vers la face antérieure de la cuisse', 'vers le thorax'],
        type: ['crampe', 'torsion', 'brûlure', 'colique (spasmes)', 'pesanteur', 'coup de poignard', 'distension'],
        declenchants: ['un repas', 'un repas gras', 'la prise d’alcool', 'la prise d’AINS', 'un traumatisme abdominal', 'un effort'],
        aggravants: ['l’alimentation', 'les mouvements', 'la toux', 'la marche', 'l’inspiration profonde', 'la palpation'],
        calmants: ['l’alimentation', 'les antiacides', 'les vomissements', 'l’émission de selles ou de gaz', 'les antispasmodiques', 'l’antéflexion', 'l’immobilité'],
        positions: ['en chien de fusil', 'en antéflexion', 'immobile', 'aucune position antalgique'],
      }),
      { id: 'migration', label: 'Migration de la douleur', type: 'text', group: 'specifique', p: 'ayant migré {v}', placeholder: 'ex. de la région péri-ombilicale vers la fosse iliaque droite' },
      { id: 'repas', label: 'Relation avec les repas', type: 'select', group: 'specifique', essentiel: true, p: '{v}', options: ['post-prandiale précoce', 'post-prandiale tardive', 'calmée par l’alimentation', 'sans relation avec les repas'] },
      { id: 'rythme', label: 'Rythme évocateur', type: 'select', group: 'specifique', p: '{v}', options: ['de rythme ulcéreux (post-prandiale tardive, calmée par l’alimentation)', 'de type biliaire (hypochondre droit, inhibant l’inspiration)', 'de type pancréatique (épigastrique, transfixiante)', 'de type colique (crampe soulagée par l’émission de selles)', 'de type occlusif'] },
      { id: 'transit', label: 'Transit', type: 'select', group: 'specifique', essentiel: true, p: '{v}', options: ['avec un transit conservé', 'avec une diarrhée associée', 'avec une constipation associée', 'avec un arrêt des matières et des gaz', 'avec une alternance diarrhée-constipation'] },
    ],
    associes: [...PAIN_ASSOC_COMMUNS, 'frissons', 'diarrhee', 'arret_matieres_gaz', 'hematemese', 'melena', 'rectorragies', 'ictere_rapporte', 'brulures_mictionnelles', 'hematurie', 'metrorragies', 'pertes_genitales', 'douleur_thoracique', 'dyspnee'],
    focus: ['abdomen_souple', 'sensibilite_abdo', 'defense', 'contracture', 'blumberg', 'murphy', 'mcburney', 'bha', 'distension_abdo', 'orifices_herniaires', 'masse_abdo', 'hepatomegalie', 'splenomegalie', 'ascite', 'percussion_abdo', 'giordano', 'tr_realise', 'ictere', 'marbrures'],
    rappels: [
      'Palper les orifices herniaires (hernie étranglée).',
      'Rechercher défense, contracture, signe de Murphy, douleur au point de McBurney, décompression douloureuse.',
      'Femme en âge de procréer : date des dernières règles et β-hCG (grossesse extra-utérine).',
      'Toucher rectal si indiqué (douleur du Douglas, méléna, fécalome).',
      'ECG chez le sujet à risque cardiovasculaire (IDM inférieur révélé par une épigastralgie).',
      'Palper les pouls fémoraux et rechercher une masse battante (anévrisme de l’aorte abdominale).',
      'Bandelette urinaire.',
    ],
    drapeaux: ['Défense ou contracture', 'Signes de choc', 'Fièvre avec ictère (angiocholite)', 'Arrêt des matières et des gaz, vomissements', 'Hématémèse, méléna', 'Douleur intense chez le sujet âgé vasculaire (ischémie mésentérique)', 'Femme en âge de procréer avec métrorragies'],
    aNePasManquer: ['Péritonite', 'Occlusion intestinale', 'Appendicite aiguë', 'Cholécystite / angiocholite', 'Pancréatite aiguë', 'Grossesse extra-utérine', 'Ischémie mésentérique', 'Rupture d’anévrisme de l’aorte abdominale', 'Infarctus du myocarde inférieur', 'Torsion d’annexe ou de testicule'],
    scores: ['alvarado', 'qsofa', 'news2', 'blatchford'],
    appareils: ['dig', 'uro', 'genital'],
  },
  {
    id: 'cephalee', label: 'Céphalée', t: 'céphalée', g: 'f', categorie: 'Douleur', douleur: true,
    questions: [
      ...painCommon({
        siege: ['frontale', 'temporale', 'occipitale', 'en casque', 'hémicrânienne droite', 'hémicrânienne gauche', 'rétro-orbitaire', 'diffuse'],
        irradiation: ['vers la nuque', 'vers le cou', 'vers l’œil', 'vers la mâchoire'],
        type: ['pulsatile', 'en étau (serrement)', 'pesanteur', 'en coup de tonnerre', 'brûlure', 'décharges électriques'],
        declenchants: ['un effort', 'un rapport sexuel', 'un traumatisme crânien', 'le passage en orthostatisme', 'la prise d’alcool', 'un stress'],
        aggravants: ['l’effort', 'la toux et les efforts de poussée', 'le décubitus', 'la position debout', 'la lumière', 'le bruit', 'les mouvements de la tête'],
        calmants: ['le repos', 'l’obscurité', 'le sommeil', 'les antalgiques', 'le décubitus'],
        positions: ['allongé dans l’obscurité', 'aucune position antalgique'],
      }),
      { id: 'coup_tonnerre', label: 'Début en coup de tonnerre (< 1 minute)', type: 'yn', group: 'specifique', essentiel: true, py: 'à début en coup de tonnerre (intensité maximale en moins d’une minute)', pn: 'sans début en coup de tonnerre' },
      { id: 'inhabituelle', label: 'Caractère inhabituel', type: 'yn', group: 'specifique', essentiel: true, py: 'de caractère inhabituel par rapport aux céphalées antérieures', pn: 'semblable aux céphalées habituelles' },
      { id: 'horaire', label: 'Horaire', type: 'select', group: 'specifique', p: '{v}', options: ['à prédominance matinale', 'nocturne, réveillant le patient', 'vespérale', 'sans horaire particulier'] },
      { id: 'aura', label: 'Aura', type: 'yn', group: 'specifique', py: 'précédée d’une aura', pn: 'sans aura' },
      { id: 'abus', label: 'Consommation régulière d’antalgiques', type: 'yn', group: 'specifique', py: 'avec une consommation régulière d’antalgiques', pn: 'sans abus d’antalgiques' },
    ],
    associes: ['photophobie', 'phonophobie', 'nausees', 'vomissements', 'fievre', 'troubles_visuels', 'deficit_moteur_rapporte', 'troubles_sensitifs', 'troubles_langage', 'convulsions', 'perte_connaissance', 'vertiges', 'rachialgies', 'douleur_oculaire', 'rougeur_oculaire'],
    focus: ['conscience', 'raideur_nuque', 'kernig', 'brudzinski', 'deficit_moteur', 'pupilles', 'oculomotricite', 'fond_oeil', 'langage', 'purpura', 'rpm'],
    rappels: [
      'Score de Glasgow et examen neurologique complet (déficit focal, paires crâniennes).',
      'Rechercher un syndrome méningé (raideur de nuque, Kernig, Brudzinski).',
      'Température et recherche d’un purpura (vitropression).',
      'Pression artérielle.',
      'Après 50 ans : palpation des artères temporales (maladie de Horton).',
      'Fond d’œil si suspicion d’hypertension intracrânienne.',
      'Penser à l’intoxication au monoxyde de carbone (céphalées collectives, chauffage).',
    ],
    drapeaux: ['Céphalée en coup de tonnerre', 'Première céphalée ou changement de caractère après 50 ans', 'Fièvre et raideur de nuque', 'Déficit neurologique focal ou crise comitiale', 'Troubles de la vigilance', 'Aggravation progressive, céphalée matinale avec vomissements', 'Grossesse / post-partum, immunodépression', 'Céphalée positionnelle ou à l’effort'],
    aNePasManquer: ['Hémorragie méningée', 'Méningite / méningo-encéphalite', 'Hypertension intracrânienne (processus expansif)', 'Thrombose veineuse cérébrale', 'Dissection d’une artère cervicale', 'Maladie de Horton', 'Intoxication au monoxyde de carbone', 'Glaucome aigu par fermeture de l’angle', 'Encéphalopathie hypertensive'],
    scores: ['glasgow', 'news2'],
    appareils: ['neuro', 'orl'],
  },
  {
    id: 'dl_lombaire', label: 'Douleur lombaire / lombalgie', t: 'douleur lombaire', g: 'f', categorie: 'Douleur', douleur: true,
    questions: [
      ...painCommon({
        siege: ['lombaire basse médiane', 'lombaire droite', 'lombaire gauche', 'lombaire bilatérale', 'lombo-sacrée', 'dorso-lombaire'],
        irradiation: ['vers la fesse', 'à la face postérieure de la cuisse et de la jambe jusqu’au talon (trajet S1)', 'à la face externe de la jambe et au dos du pied (trajet L5)', 'à la face antérieure de la cuisse (trajet crural)', 'vers l’aine et les organes génitaux externes', 'vers le flanc'],
        type: ['pesanteur', 'brûlure', 'décharge électrique', 'colique', 'torsion', 'broiement'],
        declenchants: ['un effort de soulèvement', 'un faux mouvement', 'un traumatisme', 'une chute'],
        aggravants: ['la station debout', 'la marche', 'la position assise prolongée', 'la toux et la défécation', 'les mouvements du rachis'],
        calmants: ['le repos', 'le décubitus', 'les antalgiques', 'les AINS', 'l’activité physique'],
        positions: ['en décubitus, cuisses fléchies', 'en antéflexion', 'aucune position antalgique'],
      }),
      { id: 'horaire', label: 'Horaire', type: 'select', group: 'specifique', essentiel: true, p: '{v}', options: ['d’horaire mécanique (aggravée par l’effort, calmée par le repos)', 'd’horaire inflammatoire (réveils nocturnes en deuxième partie de nuit)', 'd’horaire mixte'] },
      { id: 'derouillage', label: 'Dérouillage matinal (minutes)', type: 'number', unit: 'min', group: 'specifique', p: 'avec un dérouillage matinal de {v} minutes' },
      { id: 'impulsivite', label: 'Impulsivité à la toux / défécation', type: 'yn', group: 'specifique', py: 'impulsive à la toux et à la défécation', pn: 'non impulsive à la toux' },
      { id: 'trauma', label: 'Traumatisme', type: 'yn', group: 'specifique', py: 'survenue après un traumatisme', pn: 'sans notion de traumatisme' },
    ],
    associes: ['troubles_sphincteriens', 'anesthesie_selle', 'troubles_sensitifs', 'deficit_moteur_rapporte', 'fievre', 'amaigrissement', 'asthenie', 'brulures_mictionnelles', 'hematurie', 'douleur_abdominale', 'sueurs_nocturnes'],
    focus: ['lasegue', 'leri', 'douleur_epineuses', 'contracture_paravert', 'schober', 'dds', 'rachis_statique', 'deficit_moteur', 'sensibilite_sup', 'giordano', 'contact_lombaire', 'globe_vesical', 'tr_realise', 'masse_abdo'],
    rappels: [
      'Rechercher les drapeaux rouges : âge < 20 ou > 50 ans, antécédent néoplasique, fièvre, altération de l’état général, douleur non mécanique, corticothérapie, immunodépression, traumatisme.',
      'Examen neurologique des membres inférieurs : force (MRC), réflexes rotuliens et achilléens, sensibilité, Lasègue.',
      'Rechercher une anesthésie en selle, des troubles sphinctériens et un globe vésical (syndrome de la queue de cheval).',
      'Percussion des fosses lombaires (signe de Giordano) et bandelette urinaire.',
      'Palper l’abdomen à la recherche d’une masse battante (anévrisme de l’aorte abdominale).',
    ],
    drapeaux: ['Troubles sphinctériens ou anesthésie en selle', 'Déficit moteur', 'Fièvre', 'Antécédent de cancer, amaigrissement', 'Douleur d’horaire inflammatoire ou nocturne', 'Traumatisme important ou ostéoporose'],
    aNePasManquer: ['Syndrome de la queue de cheval', 'Compression médullaire', 'Spondylodiscite', 'Métastase ou fracture vertébrale pathologique', 'Fissuration d’anévrisme de l’aorte abdominale', 'Pyélonéphrite aiguë', 'Colique néphrétique compliquée'],
    scores: ['news2'],
    appareils: ['loco', 'neuro', 'uro'],
  },
  {
    id: 'dl_articulaire', label: 'Douleur articulaire', t: 'douleur articulaire', g: 'f', categorie: 'Douleur', douleur: true,
    questions: [
      ...painCommon({
        siege: ['de l’épaule', 'du coude', 'du poignet', 'des petites articulations des mains', 'de la hanche', 'du genou', 'de la cheville', 'des petites articulations des pieds', 'du rachis', 'des sacro-iliaques'],
        irradiation: ['à distance de l’articulation', 'le long du membre'],
        type: ['brûlure', 'pesanteur', 'élancements', 'broiement'],
        declenchants: ['un traumatisme', 'un effort', 'un excès alimentaire ou alcoolique', 'une infection récente', 'une prise médicamenteuse'],
        aggravants: ['la mobilisation', 'la marche', 'la mise en charge', 'le repos prolongé'],
        calmants: ['le repos', 'la mobilisation', 'les AINS', 'la colchicine', 'les antalgiques'],
      }),
      { id: 'mode_atteinte', label: 'Nombre d’articulations', type: 'select', group: 'specifique', essentiel: true, p: 'd’atteinte {v}', options: ['monoarticulaire', 'oligoarticulaire (2 à 4 articulations)', 'polyarticulaire (5 articulations ou plus)'] },
      { id: 'symetrie', label: 'Symétrie', type: 'select', group: 'specifique', p: '{v}', options: ['symétrique', 'asymétrique'] },
      { id: 'horaire', label: 'Horaire', type: 'select', group: 'specifique', essentiel: true, p: '{v}', options: ['d’horaire mécanique (aggravée par l’effort, calmée par le repos)', 'd’horaire inflammatoire (réveils nocturnes, dérouillage matinal prolongé)', 'd’horaire mixte'] },
      { id: 'derouillage', label: 'Dérouillage matinal (minutes)', type: 'number', unit: 'min', group: 'specifique', p: 'avec un dérouillage matinal de {v} minutes' },
      { id: 'evolution_art', label: 'Mode évolutif', type: 'select', group: 'specifique', p: 'd’évolution {v}', options: ['fixe', 'migratrice', 'additive'] },
      { id: 'inflammation_locale', label: 'Gonflement, rougeur, chaleur', type: 'yn', group: 'specifique', py: 'avec des signes inflammatoires locaux (gonflement, rougeur, chaleur)', pn: 'sans signe inflammatoire local rapporté' },
    ],
    associes: ['fievre', 'raideur_matinale', 'gonflement_articulaire', 'eruption', 'aphtes', 'raynaud', 'photosensibilite', 'xerostomie', 'xerophtalmie', 'rachialgies', 'diarrhee', 'brulures_mictionnelles', 'pertes_genitales', 'rougeur_oculaire', 'myalgies', 'asthenie', 'amaigrissement'],
    focus: ['synovite', 'deformations', 'enthesite', 'nodules', 'lesions_cutanees', 'phaneres', 'adenopathies', 'splenomegalie'],
    rappels: [
      'Examiner toutes les articulations (y compris rachis et sacro-iliaques) : tuméfaction, épanchement, mobilité.',
      'Monoarthrite aiguë : la ponction articulaire est la règle (arthrite septique, microcristaux).',
      'Rechercher des signes extra-articulaires : cutanés, muqueux, oculaires, digestifs, urogénitaux.',
      'Examiner la peau et les ongles (psoriasis), rechercher des tophus.',
    ],
    drapeaux: ['Monoarthrite fébrile', 'Altération de l’état général', 'Atteinte polyviscérale', 'Impotence fonctionnelle totale'],
    aNePasManquer: ['Arthrite septique', 'Arthrite microcristalline', 'Fracture', 'Connectivite ou vascularite systémique', 'Endocardite infectieuse'],
    scores: [],
    appareils: ['loco', 'peau'],
  },
  {
    id: 'dl_mi', label: 'Douleur des membres inférieurs', t: 'douleur du membre inférieur', g: 'f', categorie: 'Douleur', douleur: true,
    questions: [
      ...painCommon({
        siege: ['au niveau du mollet', 'au niveau de la cuisse', 'au niveau de la fesse', 'au niveau du pied', 'au niveau des orteils', 'intéressant l’ensemble du membre'],
        irradiation: ['vers le pied', 'vers la cuisse', 'le long d’un trajet radiculaire'],
        type: ['crampe', 'brûlure', 'broiement', 'pesanteur', 'décharge électrique', 'paresthésies'],
        declenchants: ['la marche', 'un traumatisme', 'une immobilisation prolongée', 'un effort'],
        aggravants: ['la marche', 'la station debout', 'l’élévation du membre', 'le décubitus', 'la palpation'],
        calmants: ['l’arrêt de la marche', 'la position jambes pendantes', 'l’antéflexion du tronc', 'la surélévation du membre', 'les antalgiques'],
        positions: ['jambes pendantes', 'en antéflexion', 'aucune position antalgique'],
      }),
      { id: 'cote', label: 'Côté', type: 'select', group: 'caract', essentiel: true, options: ['droit', 'gauche', 'bilatérale (des deux membres inférieurs)'] },
      { id: 'claudication_perimetre', label: 'Périmètre de marche (claudication)', type: 'number', unit: 'm', group: 'specifique', p: 'apparaissant après un périmètre de marche de {v} mètres' },
      { id: 'repos', label: 'Douleur de repos (décubitus)', type: 'yn', group: 'specifique', essentiel: true, py: 'présente au repos, en décubitus, soulagée par la position jambes pendantes', pn: 'absente au repos' },
      { id: 'neurogene', label: 'Soulagée par l’antéflexion / la position assise', type: 'yn', group: 'specifique', py: 'soulagée par l’antéflexion du tronc ou la position assise', pn: 'non soulagée par l’antéflexion' },
      { id: 'unilaterale', label: 'Grosse jambe / œdème unilatéral', type: 'yn', group: 'specifique', py: 'associée à une augmentation de volume du membre', pn: 'sans augmentation de volume du membre' },
    ],
    associes: ['froideur_extremites', 'gonflement_mi', 'troubles_sensitifs', 'deficit_moteur_rapporte', 'claudication', 'fievre', 'dyspnee', 'douleur_thoracique', 'rachialgies'],
    focus: ['omi', 'mollet', 'trc', 'froideur_extremites', 'ischemie_peripherique', 'souffle_femoral', 'deficit_moteur', 'sensibilite_sup', 'lasegue', 'lesions_cutanees'],
    rappels: [
      'Palper tous les pouls des membres inférieurs, comparer les deux côtés ; mesurer l’IPS si possible.',
      'Ischémie aiguë : pâleur, froideur, abolition des pouls, déficit sensitivo-moteur — urgence vasculaire.',
      'Rechercher des signes de thrombose veineuse profonde et calculer le score de Wells.',
      'Examiner la peau (dermohypodermite, troubles trophiques, ulcère).',
      'Examen neurologique (sciatique, claudication neurogène).',
    ],
    drapeaux: ['Membre froid, pâle, sans pouls', 'Déficit sensitivo-moteur', 'Grosse jambe rouge fébrile', 'Douleur disproportionnée, tension des loges'],
    aNePasManquer: ['Ischémie aiguë de membre', 'Thrombose veineuse profonde', 'Dermohypodermite bactérienne nécrosante', 'Syndrome des loges', 'Sciatique paralysante'],
    scores: ['wells_tvp'],
    appareils: ['cv', 'neuro', 'peau'],
  },
  {
    id: 'dl_autre', label: 'Autre douleur', t: 'douleur', g: 'f', categorie: 'Douleur', douleur: true,
    questions: painCommon({
      siege: ['cervicale', 'dorsale', 'de l’épaule', 'du membre supérieur', 'faciale', 'pelvienne', 'périnéale', 'diffuse'],
      irradiation: ['à distance', 'le long d’un trajet nerveux'],
      type: ['brûlure', 'pesanteur', 'crampe', 'torsion', 'décharge électrique', 'coup de poignard', 'pulsatile'],
      declenchants: ['un effort', 'un traumatisme', 'un mouvement'],
      aggravants: ['l’effort', 'les mouvements', 'la palpation', 'la toux'],
      calmants: ['le repos', 'les antalgiques', 'la chaleur', 'le froid'],
    }),
    associes: PAIN_ASSOC_COMMUNS,
    focus: [],
    rappels: ['Caractériser la douleur selon les 15 items : siège, irradiation, type, intensité, durée, facteurs, retentissement.', 'Rechercher une composante neuropathique (questionnaire DN4).'],
    drapeaux: [],
    aNePasManquer: [],
    scores: ['dn4'],
    appareils: [],
  },

  /* ======================= CARDIO-RESPIRATOIRE ======================= */
  {
    id: 'dyspnee', label: 'Dyspnée', t: 'dyspnée', g: 'f', categorie: 'Cardio-respiratoire',
    questions: [
      ...chrono(),
      { id: 'circonstances_dysp', adj: true, label: 'Circonstances', type: 'multi', group: 'caract', essentiel: true, p: '{v}', options: ['d’effort', 'de repos', 'de décubitus (orthopnée)', 'paroxystique nocturne'] },
      { id: 'nyha', label: 'Stade NYHA', type: 'select', group: 'caract', p: 'stade {v} de la NYHA', options: ['I', 'II', 'III', 'IV'], hint: 'I : aucune gêne ; II : gêne aux efforts importants ; III : gêne aux efforts modérés ; IV : au repos.' },
      { id: 'mmrc', label: 'Stade mMRC', type: 'select', group: 'caract', p: 'stade {v} de l’échelle mMRC', options: ['0', '1', '2', '3', '4'] },
      { id: 'temps', label: 'Temps respiratoire', type: 'select', group: 'caract', p: 'à prédominance {v}', options: ['inspiratoire', 'expiratoire', 'aux deux temps'] },
      { id: 'facteurs_dysp', label: 'Facteurs favorisants', type: 'multi', group: 'facteurs', p: 'favorisée par {v}', options: ['un épisode infectieux', 'un écart de régime sodé', 'une interruption thérapeutique', 'un effort inhabituel', 'une exposition allergénique', 'une immobilisation récente', 'une prise médicamenteuse'] },
    ],
    associes: ['toux', 'expectoration', 'hemoptysie', 'douleur_thoracique', 'sifflements', 'fievre', 'palpitations', 'orthopnee', 'dpn', 'gonflement_mi', 'syncope', 'sueurs', 'prise_poids'],
    focus: ['type_respi', 'tirage', 'balancement', 'cyanose', 'muscles_accessoires', 'mv', 'crepitants', 'sibilants', 'ronchi', 'silence_auscultatoire', 'percussion_thorax', 'vv', 'turgescence_jugulaire', 'rhj', 'omi', 'mollet', 'b3', 'souffle_cardiaque', 'rythme_cardiaque', 'marbrures'],
    rappels: [
      'Fréquence respiratoire, SpO2 (préciser air ambiant ou débit d’O2), signes de lutte et d’épuisement.',
      'Auscultation pulmonaire et cardiaque ; signes d’insuffisance cardiaque droite et gauche.',
      'Rechercher des signes de thrombose veineuse profonde (embolie pulmonaire).',
      'Débit expiratoire de pointe si asthme connu.',
      'Gazométrie artérielle si signes de gravité.',
    ],
    drapeaux: ['SpO2 < 90 %', 'FR > 30/min', 'Signes de lutte ou d’épuisement respiratoire', 'Cyanose, troubles de conscience', 'Silence auscultatoire', 'Impossibilité de parler', 'Signes de choc'],
    aNePasManquer: ['Œdème aigu pulmonaire', 'Embolie pulmonaire', 'Pneumothorax', 'Asthme aigu grave', 'Exacerbation sévère de BPCO', 'Pneumopathie hypoxémiante', 'Tamponnade', 'Obstruction des voies aériennes supérieures (corps étranger, angio-œdème)', 'Acidose métabolique (dyspnée de Kussmaul)'],
    scores: ['mmrc', 'nyha', 'wells_ep', 'geneve', 'curb65', 'killip', 'news2'],
    appareils: ['resp', 'cv'],
  },
  {
    id: 'toux', label: 'Toux', t: 'toux', g: 'f', categorie: 'Cardio-respiratoire',
    questions: [
      ...chrono(),
      { id: 'type_toux', adj: true, label: 'Type', type: 'select', group: 'caract', essentiel: true, p: '{v}', options: ['sèche', 'productive', 'quinteuse', 'rauque (aboyante)', 'émétisante'] },
      { id: 'anciennete', label: 'Ancienneté', type: 'select', group: 'caract', p: '{v}', options: ['aiguë (moins de 3 semaines)', 'subaiguë (3 à 8 semaines)', 'chronique (plus de 8 semaines)'] },
      { id: 'horaire', label: 'Horaire', type: 'select', group: 'caract', p: '{v}', options: ['à prédominance nocturne', 'à prédominance matinale', 'diurne', 'positionnelle', 'post-prandiale'] },
      { id: 'contexte_toux', label: 'Contexte', type: 'multi', group: 'facteurs', p: 'dans un contexte de {v}', options: ['tabagisme actif', 'contage tuberculeux', 'traitement par IEC', 'reflux gastro-œsophagien', 'exposition professionnelle', 'syndrome de pénétration (corps étranger)'] },
    ],
    associes: ['expectoration', 'hemoptysie', 'dyspnee', 'fievre', 'douleur_thoracique', 'sifflements', 'pyrosis', 'rhinorrhee', 'sueurs_nocturnes', 'amaigrissement', 'dysphonie', 'asthenie'],
    focus: ['mv', 'crepitants', 'ronchi', 'sibilants', 'souffle_tubaire', 'percussion_thorax', 'vv', 'hippocratisme', 'adenopathies', 'pharynx'],
    rappels: ['Statut tabagique en paquets-années, expositions professionnelles.', 'Contage tuberculeux, origine géographique, vaccination BCG.', 'Traitements (IEC), reflux gastro-œsophagien, rhinorrhée postérieure.', 'Aires ganglionnaires, hippocratisme digital.'],
    drapeaux: ['Hémoptysie', 'Altération de l’état général, sueurs nocturnes', 'Dyspnée, désaturation', 'Tabagisme important avec modification d’une toux ancienne'],
    aNePasManquer: ['Tuberculose pulmonaire', 'Cancer bronchique', 'Pneumopathie', 'Corps étranger', 'Insuffisance cardiaque', 'Coqueluche'],
    scores: ['curb65', 'mmrc'],
    appareils: ['resp', 'orl'],
  },
  {
    id: 'palpitations', label: 'Palpitations', t: 'palpitations', g: 'fp', categorie: 'Cardio-respiratoire',
    questions: [
      ...chrono(),
      { id: 'debut_fin', adj: true, label: 'Début et fin', type: 'select', group: 'caract', essentiel: true, p: '{v}', options: ['à début et fin brutaux', 'à début et fin progressifs'] },
      { id: 'regularite', adj: true, label: 'Régularité', type: 'select', group: 'caract', essentiel: true, p: '{v}', options: ['régulières', 'irrégulières'] },
      { id: 'freq_ressentie', label: 'Fréquence ressentie / mesurée', type: 'text', group: 'caract', p: 'rapides, estimées à {v}' },
      { id: 'terminaison', label: 'Mode de terminaison', type: 'select', group: 'caract', p: '{v}', options: ['cédant spontanément', 'cédant après manœuvres vagales', 'persistantes à l’admission'] },
      { id: 'circ_palp', label: 'Circonstances', type: 'multi', group: 'facteurs', p: 'survenant {v}', options: ['à l’effort', 'au repos', 'en période post-prandiale', 'lors d’un stress', 'après prise de café, d’alcool ou d’excitants'] },
    ],
    associes: ['syncope', 'lipothymie', 'douleur_thoracique', 'dyspnee', 'polyurie', 'sueurs', 'tremblements', 'intolerance_chaleur', 'amaigrissement', 'asthenie'],
    focus: ['rythme_cardiaque', 'souffle_cardiaque', 'turgescence_jugulaire', 'crepitants', 'goitre', 'tremblement_fin', 'paleur'],
    rappels: ['ECG pendant la crise si possible, sinon ECG de repos.', 'Rechercher une cardiopathie sous-jacente et une insuffisance cardiaque.', 'TSH, ionogramme (kaliémie, magnésémie), hémoglobine.', 'En cas de fibrillation atriale : CHA₂DS₂-VASc et HAS-BLED.'],
    drapeaux: ['Syncope', 'Douleur thoracique', 'Dyspnée, signes d’insuffisance cardiaque', 'Cardiopathie connue', 'Mort subite familiale'],
    aNePasManquer: ['Tachycardie ventriculaire', 'Fibrillation atriale rapide mal tolérée', 'Hyperthyroïdie', 'Anémie', 'Hypoglycémie'],
    scores: ['chads', 'hasbled'],
    appareils: ['cv', 'endo'],
  },
  {
    id: 'syncope', label: 'Syncope / malaise', t: 'syncope', g: 'f', categorie: 'Cardio-respiratoire',
    questions: [
      ...chrono({ caractere: false }),
      { id: 'circ_syncope', label: 'Circonstances', type: 'multi', group: 'caract', essentiel: true, p: 'survenue {v}', options: ['à l’effort', 'en position debout prolongée', 'lors du passage en orthostatisme', 'en position couchée', 'au cours d’une miction', 'lors d’une émotion ou d’une douleur', 'lors d’une rotation de la tête', 'au repos'] },
      { id: 'prodromes', label: 'Prodromes', type: 'multi', group: 'caract', essentiel: true, p: 'précédée de {v}', options: ['sueurs', 'nausées', 'flou visuel', 'palpitations', 'douleur thoracique', 'sensation de chaleur', 'aura'] },
      { id: 'sans_prodrome', label: 'Absence de prodrome', type: 'yn', group: 'caract', py: 'sans prodrome', pn: '' },
      { id: 'duree_pc', label: 'Durée de la perte de connaissance', type: 'text', group: 'caract', p: 'avec une perte de connaissance estimée à {v}' },
      { id: 'recuperation', label: 'Récupération', type: 'select', group: 'caract', essentiel: true, p: 'suivie d’une {v}', options: ['récupération rapide et complète', 'confusion post-critique prolongée'] },
      { id: 'morsure', label: 'Morsure de langue', type: 'yn', group: 'specifique', py: 'avec morsure latérale de langue', pn: 'sans morsure de langue' },
      { id: 'urines', label: 'Perte d’urines', type: 'yn', group: 'specifique', py: 'avec perte d’urines', pn: 'sans perte d’urines' },
      { id: 'mouvements', label: 'Mouvements anormaux', type: 'yn', group: 'specifique', py: 'avec mouvements anormaux rapportés', pn: 'sans mouvement anormal rapporté' },
      { id: 'trauma', label: 'Traumatisme lors de la chute', type: 'yn', group: 'specifique', py: 'compliquée d’un traumatisme', pn: 'sans traumatisme' },
      { id: 'temoins', label: 'Témoins', type: 'select', group: 'specifique', p: '{v}', options: ['devant témoins', 'sans témoin'] },
    ],
    associes: ['palpitations', 'douleur_thoracique', 'dyspnee', 'cephalees', 'deficit_moteur_rapporte', 'melena', 'convulsions', 'vertiges'],
    focus: ['rythme_cardiaque', 'souffle_cardiaque', 'b1b2', 'deficit_moteur', 'conscience', 'paleur', 'tr_melena'],
    rappels: ['Pression artérielle couché puis debout (1 et 3 minutes) : hypotension orthostatique.', 'ECG systématique.', 'Auscultation cardiaque (rétrécissement aortique, cardiomyopathie obstructive).', 'Glycémie capillaire.', 'Rechercher une hémorragie (pâleur, méléna).', 'Revoir les traitements (antihypertenseurs, psychotropes, allongeant le QT).'],
    drapeaux: ['Syncope d’effort ou en décubitus', 'Palpitations précédant la syncope', 'Cardiopathie connue', 'Antécédent familial de mort subite', 'ECG anormal', 'Traumatisme sévère'],
    aNePasManquer: ['Trouble du rythme ou de la conduction', 'Rétrécissement aortique serré', 'Embolie pulmonaire', 'Dissection aortique', 'Hémorragie (digestive)', 'Crise comitiale'],
    scores: ['news2'],
    appareils: ['cv', 'neuro'],
  },

  /* ======================= INFECTIEUX / GÉNÉRAL ======================= */
  {
    id: 'fievre', label: 'Fièvre', t: 'fièvre', g: 'f', categorie: 'Général',
    questions: [
      ...chrono(),
      { id: 'tmax', label: 'Température maximale', type: 'number', unit: '°C', group: 'caract', essentiel: true, p: 'chiffrée au maximum à {v} °C' },
      { id: 'mesure', label: 'Mesure', type: 'select', group: 'caract', p: '{v}', options: ['mesurée au thermomètre', 'ressentie, non mesurée'] },
      { id: 'profil', label: 'Profil', type: 'select', group: 'caract', p: 'd’allure {v}', options: ['continue (en plateau)', 'intermittente', 'rémittente', 'ondulante', 'irrégulière'] },
      { id: 'contexte_fievre', label: 'Contexte', type: 'multi', group: 'facteurs', essentiel: true, p: 'dans un contexte de {v}', options: ['voyage récent en zone d’endémie', 'contage infectieux dans l’entourage', 'hospitalisation ou soins récents', 'matériel étranger (prothèse, cathéter)', 'contact avec des animaux', 'consommation de lait cru', 'immunodépression', 'chimiothérapie récente'] },
    ],
    associes: ['frissons', 'sueurs', 'toux', 'expectoration', 'dyspnee', 'brulures_mictionnelles', 'pollakiurie', 'douleur_lombaire', 'diarrhee', 'douleur_abdominale', 'cephalees', 'photophobie', 'eruption', 'arthralgies', 'myalgies', 'odynophagie', 'otalgie', 'rhinorrhee', 'asthenie', 'amaigrissement'],
    focus: ['purpura', 'raideur_nuque', 'souffle_cardiaque', 'crepitants', 'souffle_tubaire', 'giordano', 'sensibilite_abdo', 'murphy', 'adenopathies', 'pharynx', 'otoscopie', 'cavite_buccale', 'lesions_cutanees', 'marbrures', 'trc', 'conscience', 'bandelette', 'splenomegalie'],
    rappels: ['Rechercher systématiquement une porte d’entrée : cutanée, urinaire, pulmonaire, dentaire, ORL, digestive, cathéters.', 'Rechercher un purpura (vitropression) et une raideur de nuque.', 'Ausculter le cœur : souffle nouveau (endocardite infectieuse).', 'Évaluer les critères de sepsis (qSOFA, lactates).', 'Retour de zone d’endémie palustre : frottis / goutte épaisse en urgence.', 'Hémocultures avant toute antibiothérapie.'],
    drapeaux: ['Purpura', 'Hypotension, marbrures', 'Troubles de conscience', 'Polypnée', 'Raideur de nuque', 'Neutropénie connue ou chimiothérapie', 'Retour de zone impaludée'],
    aNePasManquer: ['Sepsis / choc septique', 'Purpura fulminans', 'Méningite bactérienne', 'Paludisme grave', 'Endocardite infectieuse', 'Neutropénie fébrile', 'Pyélonéphrite obstructive', 'Angiocholite'],
    scores: ['qsofa', 'news2', 'curb65'],
    appareils: ['resp', 'uro', 'dig', 'neuro', 'peau', 'orl'],
  },
  {
    id: 'aeg', label: 'Altération de l’état général', t: 'altération de l’état général', g: 'f', categorie: 'Général',
    questions: [
      ...chrono({ caractere: false }),
      { id: 'poids_habituel', label: 'Poids habituel', type: 'number', unit: 'kg', group: 'caract', essentiel: true, p: 'pour un poids habituel de {v} kg' },
      { id: 'perte_kg', label: 'Perte de poids', type: 'number', unit: 'kg', group: 'caract', essentiel: true, p: 'avec une perte de {v} kg' },
      { id: 'perte_duree', label: 'Sur quelle durée', type: 'text', group: 'caract', p: 'en {v}' },
      { id: 'appetit', label: 'Appétit', type: 'select', group: 'caract', p: '{v}', options: ['anorexie globale', 'anorexie sélective pour les viandes', 'appétit conservé'] },
    ],
    associes: ['asthenie', 'anorexie', 'amaigrissement', 'fievre', 'sueurs_nocturnes', 'douleur_abdominale', 'toux', 'dysphagie', 'troubles_transit', 'rectorragies', 'adenopathies', 'prurit', 'polyurie', 'polydipsie', 'troubles_sommeil'],
    focus: ['adenopathies', 'hepatomegalie', 'splenomegalie', 'masse_abdo', 'seins', 'tr_realise', 'goitre', 'paleur', 'ictere', 'cavite_buccale', 'nutrition'],
    rappels: ['Poids actuel, poids habituel, IMC, albuminémie (critères de dénutrition).', 'Examen clinique complet : aires ganglionnaires, foie, rate, seins, thyroïde, toucher rectal, peau.', 'État bucco-dentaire, troubles de déglutition.', 'Rechercher un syndrome dépressif et l’isolement social.'],
    drapeaux: ['Amaigrissement > 10 % en 6 mois', 'Fièvre et sueurs nocturnes', 'Adénopathies, hépato-splénomégalie'],
    aNePasManquer: ['Néoplasie', 'Tuberculose', 'Hyperthyroïdie, diabète, insuffisance surrénale', 'Maladie inflammatoire chronique', 'Dépression'],
    scores: ['ecog'],
    appareils: ['hemato', 'dig', 'endo'],
  },
  {
    id: 'oedemes', label: 'Œdèmes', t: 'œdèmes', g: 'mp', categorie: 'Général',
    questions: [
      ...chrono(),
      { id: 'topo_oed', label: 'Topographie', type: 'multi', group: 'caract', essentiel: true, p: '{v}', options: ['des membres inférieurs', 'du visage / palpébraux', 'des lombes', 'des organes génitaux externes', 'généralisés (anasarque)'] },
      { id: 'lateralite_oed', label: 'Latéralité', type: 'select', group: 'caract', essentiel: true, p: '{v}', options: ['bilatéraux et symétriques', 'unilatéraux'] },
      { id: 'prise_kg', label: 'Prise de poids', type: 'number', unit: 'kg', group: 'caract', p: 'associés à une prise de poids de {v} kg' },
    ],
    associes: ['dyspnee', 'orthopnee', 'urines_mousseuses', 'oligurie', 'ictere_rapporte', 'asthenie', 'douleur_thoracique', 'gonflement_mi'],
    focus: ['omi', 'turgescence_jugulaire', 'rhj', 'ascite', 'hepatomegalie', 'crepitants', 'mollet', 'bandelette', 'angiomes_stellaires'],
    rappels: ['Préciser godet, extension, symétrie, caractère inflammatoire.', 'Rechercher des signes d’insuffisance cardiaque, d’hépatopathie (ascite, CVC) et de néphropathie (bandelette urinaire : protéinurie).', 'Œdème unilatéral : thrombose veineuse profonde jusqu’à preuve du contraire.', 'Œdème du visage brutal : angio-œdème (urgence).'],
    drapeaux: ['Œdème unilatéral douloureux', 'Œdème du visage ou de la langue', 'Dyspnée, orthopnée', 'Oligo-anurie'],
    aNePasManquer: ['Thrombose veineuse profonde', 'Insuffisance cardiaque décompensée', 'Syndrome néphrotique', 'Cirrhose décompensée', 'Angio-œdème'],
    scores: ['wells_tvp', 'oedeme'],
    appareils: ['cv', 'uro', 'dig'],
  },

  /* ======================= DIGESTIF ======================= */
  {
    id: 'vomissements', label: 'Vomissements', t: 'vomissements', g: 'mp', categorie: 'Digestif',
    questions: [
      ...chrono(),
      { id: 'aspect_vom', adj: true, label: 'Aspect', type: 'multi', group: 'caract', essentiel: true, p: '{v}', options: ['alimentaires', 'bilieux', 'fécaloïdes', 'sanglants', 'en marc de café'] },
      { id: 'nombre_vom', label: 'Nombre par jour', type: 'text', group: 'caract', p: 'au nombre de {v} par jour' },
      { id: 'repas_vom', label: 'Relation avec les repas', type: 'select', group: 'caract', p: '{v}', options: ['post-prandiaux précoces', 'post-prandiaux tardifs', 'matinaux à jeun', 'sans relation avec les repas'] },
      { id: 'jet', label: 'En jet', type: 'yn', group: 'caract', py: 'en jet', pn: 'non en jet' },
    ],
    associes: ['nausees', 'douleur_abdominale', 'diarrhee', 'arret_matieres_gaz', 'fievre', 'cephalees', 'vertiges', 'hematemese', 'troubles_visuels', 'douleur_thoracique', 'polyurie', 'polydipsie'],
    focus: ['distension_abdo', 'bha', 'defense', 'orifices_herniaires', 'pli_cutane', 'secheresse_muqueuses', 'raideur_nuque', 'conscience'],
    rappels: ['Évaluer la déshydratation et la perte de poids.', 'Rechercher un syndrome occlusif, examiner les orifices herniaires.', 'Examen neurologique (hypertension intracrânienne).', 'Glycémie capillaire et cétonémie chez le diabétique.', 'Test de grossesse chez la femme en âge de procréer.', 'ECG (infarctus inférieur), revue des médicaments et toxiques.'],
    drapeaux: ['Vomissements fécaloïdes ou sanglants', 'Déshydratation sévère', 'Céphalées, troubles neurologiques', 'Douleur abdominale intense'],
    aNePasManquer: ['Occlusion intestinale', 'Hypertension intracrânienne', 'Acidocétose diabétique', 'Infarctus du myocarde inférieur', 'Intoxication', 'Insuffisance surrénale aiguë', 'Hypercalcémie'],
    scores: ['deshydratation'],
    appareils: ['dig', 'neuro'],
  },
  {
    id: 'diarrhee', label: 'Diarrhée', t: 'diarrhée', g: 'f', categorie: 'Digestif',
    questions: [
      ...chrono(),
      { id: 'nb_selles', label: 'Nombre de selles par jour', type: 'text', group: 'caract', essentiel: true, p: 'à {v} selles par jour' },
      { id: 'aspect_diar', adj: true, label: 'Aspect', type: 'multi', group: 'caract', essentiel: true, p: '{v}', options: ['liquide', 'hydrique', 'glaireuse', 'sanglante', 'graisseuse', 'molle'] },
      { id: 'duree_diar', label: 'Durée', type: 'select', group: 'caract', p: '{v}', options: ['aiguë (moins de 2 semaines)', 'persistante (2 à 4 semaines)', 'chronique (plus de 4 semaines)'] },
      { id: 'nocturne', label: 'Selles nocturnes', type: 'yn', group: 'caract', py: 'avec des selles nocturnes', pn: 'sans selle nocturne' },
      { id: 'contexte_diar', label: 'Contexte', type: 'multi', group: 'facteurs', p: 'dans un contexte de {v}', options: ['repas collectif (TIAC)', 'voyage récent', 'antibiothérapie récente', 'hospitalisation récente', 'immunodépression', 'cas similaires dans l’entourage'] },
    ],
    associes: ['fievre', 'douleur_abdominale', 'vomissements', 'nausees', 'rectorragies', 'syndrome_rectal', 'amaigrissement', 'arthralgies', 'aphtes', 'eruption'],
    focus: ['pli_cutane', 'secheresse_muqueuses', 'sensibilite_abdo', 'defense', 'distension_abdo', 'tr_realise', 'hydratation'],
    rappels: ['Évaluer la déshydratation : poids, PA, FC, pli cutané, diurèse.', 'Coproculture si diarrhée fébrile, sanglante, prolongée ou terrain fragile.', 'Recherche de Clostridioides difficile après antibiothérapie.', 'Revue des médicaments (metformine, colchicine, laxatifs…).'],
    drapeaux: ['Déshydratation sévère', 'Syndrome dysentérique fébrile', 'Sujet âgé, immunodéprimé', 'Rectorragies abondantes'],
    aNePasManquer: ['Déshydratation sévère', 'Colite grave', 'Infection à Clostridioides difficile', 'Poussée sévère de MICI', 'Ischémie mésentérique'],
    scores: ['deshydratation'],
    appareils: ['dig'],
  },
  {
    id: 'hemorragie_dig', label: 'Hémorragie digestive', t: 'hémorragie digestive', g: 'f', categorie: 'Digestif',
    questions: [
      ...chrono({ caractere: false }),
      { id: 'type_hd', label: 'Type', type: 'multi', group: 'caract', essentiel: true, p: 'à type de {v}', options: ['hématémèse', 'méléna', 'rectorragies', 'hématochézie'] },
      { id: 'abondance_hd', label: 'Abondance estimée', type: 'select', group: 'caract', p: 'de {v}', options: ['faible abondance', 'moyenne abondance', 'grande abondance'] },
      { id: 'nb_episodes', label: 'Nombre d’épisodes', type: 'text', group: 'caract', p: '({v} épisodes)' },
      { id: 'retentissement_hd', label: 'Retentissement', type: 'multi', group: 'caract', essentiel: true, p: 'responsable de {v}', options: ['malaise', 'lipothymie', 'syncope', 'dyspnée', 'asthénie intense'] },
      { id: 'medicaments_hd', label: 'Médicaments à risque', type: 'multi', group: 'facteurs', essentiel: true, p: 'sous {v}', options: ['AINS', 'aspirine', 'anticoagulant', 'antiagrégant plaquettaire', 'corticoïdes', 'ISRS'] },
    ],
    associes: ['douleur_abdominale', 'vomissements', 'ictere_rapporte', 'amaigrissement', 'dysphagie', 'pyrosis', 'syncope', 'lipothymie'],
    focus: ['paleur', 'tr_melena', 'tr_sang', 'tr_realise', 'marbrures', 'trc', 'cvc', 'ascite', 'angiomes_stellaires', 'erythrose_palmaire', 'splenomegalie', 'conscience', 'asterixis'],
    rappels: ['Constantes répétées : rechercher un choc hémorragique (FC, PA, marbrures, conscience).', 'Toucher rectal (méléna).', 'Rechercher des signes d’hypertension portale et d’insuffisance hépatocellulaire.', 'Hémoglobine capillaire, groupe sanguin, RAI.', 'Score de Glasgow-Blatchford.'],
    drapeaux: ['Choc hémorragique', 'Hématémèse abondante', 'Cirrhose connue (rupture de varices)', 'Anticoagulants'],
    aNePasManquer: ['Choc hémorragique', 'Rupture de varices œsophagiennes', 'Ulcère gastroduodénal hémorragique'],
    scores: ['blatchford', 'child_pugh', 'news2'],
    appareils: ['dig', 'cv'],
  },
  {
    id: 'ictere', label: 'Ictère', t: 'ictère', g: 'm', categorie: 'Digestif',
    questions: [
      ...chrono(),
      { id: 'urines', label: 'Urines foncées', type: 'yn', group: 'caract', essentiel: true, py: 'avec des urines foncées', pn: 'sans urines foncées' },
      { id: 'selles', label: 'Selles décolorées', type: 'yn', group: 'caract', essentiel: true, py: 'avec des selles décolorées', pn: 'sans décoloration des selles' },
      { id: 'contexte_ict', label: 'Contexte', type: 'multi', group: 'facteurs', p: 'dans un contexte de {v}', options: ['consommation d’alcool', 'prise médicamenteuse récente', 'voyage récent', 'transfusion ou soins invasifs', 'rapports sexuels à risque', 'consommation de champignons'] },
    ],
    associes: ['prurit', 'douleur_abdominale', 'fievre', 'frissons', 'amaigrissement', 'asthenie', 'anorexie', 'nausees', 'vomissements', 'urines_foncees', 'selles_decolorees'],
    focus: ['ictere', 'hepatomegalie', 'splenomegalie', 'murphy', 'masse_abdo', 'ascite', 'cvc', 'angiomes_stellaires', 'asterixis', 'conscience', 'adenopathies'],
    rappels: ['Ictère fébrile avec douleur de l’hypochondre droit : triade de Charcot (angiocholite).', 'Rechercher des signes d’insuffisance hépatocellulaire et d’encéphalopathie (astérixis).', 'Grosse vésicule palpable (loi de Courvoisier-Terrier).', 'Revue exhaustive des médicaments et de la phytothérapie.'],
    drapeaux: ['Fièvre et frissons', 'Troubles de conscience, astérixis', 'TP < 50 %', 'Altération de l’état général'],
    aNePasManquer: ['Angiocholite', 'Hépatite aiguë grave / fulminante', 'Hémolyse aiguë', 'Obstacle néoplasique des voies biliaires'],
    scores: ['child_pugh', 'west_haven'],
    appareils: ['dig', 'hemato'],
  },

  /* ======================= NEUROLOGIE ======================= */
  {
    id: 'deficit_neuro', label: 'Déficit neurologique', t: 'déficit neurologique', g: 'm', categorie: 'Neurologie',
    questions: [
      ...chrono({ caractere: false }),
      { id: 'dernier_normal', label: 'Dernière fois vu(e) sans symptôme (date et heure)', type: 'text', group: 'chrono', essentiel: true, p: '' },
      { id: 'topographie', label: 'Topographie', type: 'multi', group: 'caract', essentiel: true, p: 'intéressant {v}', options: ['l’hémicorps droit', 'l’hémicorps gauche', 'la face', 'le membre supérieur droit', 'le membre supérieur gauche', 'le membre inférieur droit', 'le membre inférieur gauche', 'les deux membres inférieurs'] },
      { id: 'nature', label: 'Nature', type: 'multi', group: 'caract', essentiel: true, p: '{v}', options: ['moteur', 'sensitif', 'visuel', 'phasique', 'cérébelleux'] },
      { id: 'regressif', label: 'Régression', type: 'select', group: 'caract', p: '{v}', options: ['totalement régressif', 'partiellement régressif', 'persistant', 'fluctuant'] },
      { id: 'anticoag', label: 'Traitement anticoagulant / antiagrégant', type: 'yn', group: 'facteurs', essentiel: true, py: 'chez un patient sous traitement anticoagulant ou antiagrégant', pn: 'sans traitement anticoagulant' },
    ],
    associes: ['cephalees', 'troubles_langage', 'troubles_visuels', 'vertiges', 'perte_connaissance', 'convulsions', 'palpitations', 'vomissements', 'troubles_sensitifs', 'troubles_marche'],
    focus: ['conscience', 'langage', 'deficit_moteur', 'tonus', 'sensibilite_sup', 'pupilles', 'oculomotricite', 'doigt_nez', 'raideur_nuque', 'rythme_cardiaque', 'souffle_carotidien', 'marche'],
    rappels: ['Heure précise de début ou dernière fois vu(e) sans symptôme : conditionne la thrombolyse / thrombectomie.', 'Glycémie capillaire immédiate (hypoglycémie).', 'Score NIHSS, examen neurologique complet (MRC, ROT, Babinski, paires crâniennes).', 'Pression artérielle, ECG (fibrillation atriale).', 'Traitements anticoagulants et contre-indications à la thrombolyse.', 'Imagerie cérébrale en urgence (filière AVC).'],
    drapeaux: ['Début brutal', 'Troubles de conscience', 'Céphalée brutale associée', 'Anticoagulants'],
    aNePasManquer: ['AVC ischémique (fenêtre de reperfusion)', 'Hémorragie intracérébrale', 'Hypoglycémie', 'Dissection artérielle cervicale', 'Compression médullaire'],
    scores: ['nihss', 'glasgow', 'chads', 'rankin'],
    appareils: ['neuro', 'cv'],
  },
  {
    id: 'convulsions', label: 'Crise convulsive', t: 'crise convulsive', g: 'f', categorie: 'Neurologie',
    questions: [
      ...chrono({ caractere: false }),
      { id: 'type_crise', adj: true, label: 'Type de crise', type: 'select', group: 'caract', essentiel: true, p: '{v}', options: ['généralisée tonico-clonique', 'focale', 'focale secondairement généralisée', 'absence', 'non précisée'] },
      { id: 'duree_crise_conv', label: 'Durée', type: 'text', group: 'caract', p: 'd’une durée de {v}' },
      { id: 'nb_crises', label: 'Nombre de crises', type: 'text', group: 'caract', p: '({v} crises)' },
      { id: 'post_critique', label: 'Phase post-critique', type: 'select', group: 'caract', p: 'suivie d’une {v}', options: ['confusion post-critique brève', 'confusion post-critique prolongée', 'récupération rapide', 'déficit post-critique'] },
      { id: 'morsure', label: 'Morsure de langue', type: 'yn', group: 'caract', py: 'avec morsure latérale de langue', pn: 'sans morsure de langue' },
      { id: 'urines', label: 'Perte d’urines', type: 'yn', group: 'caract', py: 'avec perte d’urines', pn: 'sans perte d’urines' },
      { id: 'facteurs_conv', label: 'Facteurs favorisants', type: 'multi', group: 'facteurs', p: 'favorisée par {v}', options: ['une privation de sommeil', 'une prise d’alcool', 'un sevrage (alcool, benzodiazépines)', 'une inobservance du traitement antiépileptique', 'une fièvre', 'un traumatisme crânien', 'une prise de toxiques'] },
    ],
    associes: ['cephalees', 'fievre', 'deficit_moteur_rapporte', 'perte_connaissance', 'vomissements', 'troubles_langage'],
    focus: ['conscience', 'orientation', 'deficit_moteur', 'raideur_nuque', 'pupilles', 'langage'],
    rappels: ['Glycémie capillaire, natrémie, calcémie.', 'Examen neurologique complet à distance de la crise (déficit focal).', 'Recherche d’un syndrome méningé et de fièvre.', 'Femme enceinte : penser à l’éclampsie.', 'Dosage de l’antiépileptique si traitement en cours.'],
    drapeaux: ['Crise > 5 minutes ou crises sans reprise de conscience (état de mal)', 'Déficit post-critique', 'Fièvre', 'Première crise'],
    aNePasManquer: ['État de mal épileptique', 'Hypoglycémie', 'Hyponatrémie', 'Méningo-encéphalite', 'AVC', 'Hématome sous-dural', 'Éclampsie'],
    scores: ['glasgow'],
    appareils: ['neuro'],
  },
  {
    id: 'confusion', label: 'Confusion / troubles de la conscience', t: 'confusion', g: 'f', categorie: 'Neurologie',
    questions: [
      ...chrono(),
      { id: 'fluctuation', label: 'Fluctuation sur la journée', type: 'yn', group: 'caract', essentiel: true, py: 'fluctuante au cours de la journée', pn: 'non fluctuante' },
      { id: 'agitation', label: 'Agitation / hallucinations', type: 'yn', group: 'caract', py: 'avec agitation ou hallucinations', pn: 'sans agitation' },
      { id: 'facteurs_conf', label: 'Facteurs favorisants', type: 'multi', group: 'facteurs', essentiel: true, p: 'survenant après {v}', options: ['une introduction ou modification médicamenteuse', 'une chute / un traumatisme crânien', 'un épisode infectieux', 'une rétention urinaire ou un fécalome', 'un sevrage', 'une prise de toxiques', 'une douleur non contrôlée'] },
    ],
    associes: ['fievre', 'cephalees', 'convulsions', 'deficit_moteur_rapporte', 'vomissements', 'troubles_memoire', 'troubles_langage'],
    focus: ['conscience', 'orientation', 'deficit_moteur', 'raideur_nuque', 'asterixis', 'globe_vesical', 'tr_fecalome', 'pupilles'],
    rappels: ['Glycémie capillaire immédiate.', 'Score de Glasgow, température, SpO2, pression artérielle.', 'Rechercher un globe vésical et un fécalome.', 'Examen neurologique et recherche de signes méningés.', 'Revue des médicaments (anticholinergiques, benzodiazépines, opioïdes).', 'Penser au monoxyde de carbone.'],
    drapeaux: ['Glasgow ≤ 8', 'Fièvre et syndrome méningé', 'Déficit focal', 'Hypoglycémie'],
    aNePasManquer: ['Hypoglycémie', 'Sepsis', 'Méningo-encéphalite', 'AVC', 'Hématome sous-dural', 'Intoxication (dont CO)', 'Hyponatrémie / hypercalcémie', 'Encéphalopathie hépatique', 'Encéphalopathie de Gayet-Wernicke', 'Rétention aiguë d’urine'],
    scores: ['glasgow', 'west_haven', 'qsofa'],
    appareils: ['neuro'],
  },
  {
    id: 'vertiges', label: 'Vertiges', t: 'vertiges', g: 'mp', categorie: 'Neurologie',
    questions: [
      ...chrono(),
      { id: 'type_vertige', adj: true, label: 'Type', type: 'select', group: 'caract', essentiel: true, p: '{v}', options: ['rotatoires', 'à type d’instabilité', 'à type de lipothymie'] },
      { id: 'positionnel', label: 'Déclenchés par les changements de position', type: 'yn', group: 'caract', py: 'déclenchés par les changements de position de la tête', pn: 'non positionnels' },
      { id: 'duree_vert', label: 'Durée des crises', type: 'select', group: 'caract', p: '{v}', options: ['de quelques secondes', 'de quelques minutes à quelques heures', 'permanents depuis plusieurs jours'] },
    ],
    associes: ['nausees', 'vomissements', 'acouphenes', 'hypoacousie', 'cephalees', 'diplopie', 'troubles_langage', 'troubles_marche', 'deficit_moteur_rapporte', 'palpitations'],
    focus: ['nystagmus', 'romberg', 'marche', 'doigt_nez', 'otoscopie', 'oculomotricite', 'deficit_moteur'],
    rappels: ['Rechercher un nystagmus et ses caractères ; manœuvre de Dix-Hallpike si positionnel.', 'Examen neurologique : syndrome cérébelleux, atteinte des nerfs crâniens (protocole HINTS).', 'Pression artérielle couché-debout, ECG.'],
    drapeaux: ['Céphalée brutale', 'Déficit neurologique, diplopie, dysarthrie', 'Ataxie, impossibilité de tenir debout', 'Facteurs de risque vasculaire'],
    aNePasManquer: ['AVC vertébro-basilaire', 'Hypotension orthostatique', 'Trouble du rythme'],
    scores: [],
    appareils: ['neuro', 'orl'],
  },

  /* ======================= URO-NÉPHROLOGIE ======================= */
  {
    id: 'troubles_urinaires', label: 'Troubles urinaires', t: 'troubles urinaires', g: 'mp', categorie: 'Uro-néphrologie',
    questions: [
      ...chrono(),
      { id: 'type_tu', label: 'Nature', type: 'multi', group: 'caract', essentiel: true, p: 'à type de {v}', options: ['brûlures mictionnelles', 'pollakiurie', 'dysurie', 'hématurie', 'urgenturie', 'rétention', 'oligurie', 'polyurie'] },
    ],
    associes: ['fievre', 'frissons', 'douleur_lombaire', 'colique_nephretique', 'hematurie', 'urines_troubles', 'pertes_genitales', 'douleurs_pelviennes', 'douleur_scrotale'],
    focus: ['giordano', 'contact_lombaire', 'globe_vesical', 'bandelette', 'tr_prostate', 'tr_realise'],
    rappels: ['Bandelette urinaire puis ECBU si positive ou terrain à risque.', 'Rechercher un globe vésical, examiner les fosses lombaires.', 'Homme : toucher rectal (prostatite) si indiqué.', 'Fièvre + douleur lombaire : échographie (obstacle).'],
    drapeaux: ['Fièvre avec frissons', 'Douleur lombaire fébrile', 'Rétention aiguë', 'Anurie'],
    aNePasManquer: ['Pyélonéphrite obstructive', 'Prostatite aiguë', 'Rétention aiguë d’urine', 'Colique néphrétique compliquée'],
    scores: ['qsofa'],
    appareils: ['uro', 'genital'],
  },

  /* ======================= AUTRE ======================= */
  {
    id: 'autre', label: 'Autre symptôme (libellé libre)', t: 'symptôme', g: 'm', categorie: 'Autre',
    questions: [
      ...chrono(),
      { id: 'description', label: 'Description sémiologique', type: 'text', group: 'caract', essentiel: true, p: '{v}' },
      { id: 'facteurs_autre', label: 'Facteurs déclenchants / aggravants / calmants', type: 'text', group: 'facteurs', p: '{v}' },
    ],
    associes: ['fievre', 'asthenie', 'amaigrissement'],
    focus: [],
    rappels: ['Analyser le symptôme : chronologie, mode de début, caractères, facteurs modulateurs, signes associés, retentissement.'],
    drapeaux: [],
    aNePasManquer: [],
    scores: [],
    appareils: [],
  },
];

export const SYMPTOME_BY_ID: Record<string, SymptomDef> = Object.fromEntries(SYMPTOMES.map((s) => [s.id, s]));
export const CATEGORIES_SYMPTOMES = [...new Set(SYMPTOMES.map((s) => s.categorie))];
