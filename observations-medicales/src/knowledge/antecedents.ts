/** Antécédents : catégories, suggestions et listes de référence. */

export interface AtcdCategorie {
  id: string;
  label: string;
  /** Libellé utilisé dans la rédaction (« d’hypertension artérielle ») */
  t: string;
  suggestions: string[];
  hint?: string;
}

export const ATCD_MEDICAUX: AtcdCategorie[] = [
  { id: 'hta', label: 'Hypertension artérielle', t: 'hypertension artérielle', suggestions: ['HTA essentielle', 'HTA secondaire'], hint: 'Préciser ancienneté, traitement, contrôle tensionnel, retentissement (cœur, rein, rétine).' },
  { id: 'diabete', label: 'Diabète', t: 'diabète', suggestions: ['Diabète de type 1', 'Diabète de type 2', 'Diabète gestationnel', 'Diabète secondaire'], hint: 'Type, ancienneté, traitement (ADO, insuline), dernière HbA1c, complications micro- et macro-angiopathiques.' },
  { id: 'cardio', label: 'Cardiopathies', t: 'cardiopathie', suggestions: ['Cardiopathie ischémique', 'Infarctus du myocarde', 'Insuffisance cardiaque', 'Fibrillation atriale', 'Valvulopathie', 'Cardiomyopathie', 'Porteur de stimulateur cardiaque', 'Artériopathie oblitérante des membres inférieurs', 'Maladie thrombo-embolique veineuse'] },
  { id: 'avc', label: 'AVC / AIT', t: 'accident vasculaire cérébral', suggestions: ['AVC ischémique', 'AVC hémorragique', 'Accident ischémique transitoire'], hint: 'Date, territoire, séquelles, traitement secondaire.' },
  { id: 'epilepsie', label: 'Épilepsie', t: 'épilepsie', suggestions: ['Épilepsie généralisée', 'Épilepsie focale'] },
  { id: 'asthme', label: 'Asthme', t: 'asthme', suggestions: ['Asthme allergique', 'Asthme non allergique'], hint: 'Contrôle, nombre d’exacerbations, hospitalisations, intubation antérieure.' },
  { id: 'bpco', label: 'BPCO', t: 'BPCO', suggestions: ['BPCO GOLD 1', 'BPCO GOLD 2', 'BPCO GOLD 3', 'BPCO GOLD 4', 'Emphysème', 'Oxygénothérapie de longue durée'] },
  { id: 'tuberculose', label: 'Tuberculose', t: 'tuberculose', suggestions: ['Tuberculose pulmonaire traitée', 'Tuberculose extra-pulmonaire', 'Infection tuberculeuse latente', 'Contage tuberculeux'], hint: 'Date, localisation, traitement reçu et sa durée, guérison documentée.' },
  { id: 'renal', label: 'Pathologies rénales', t: 'néphropathie', suggestions: ['Maladie rénale chronique', 'Dialyse', 'Transplantation rénale', 'Lithiase urinaire', 'Néphropathie diabétique', 'Polykystose rénale'] },
  { id: 'hepatique', label: 'Pathologies hépatiques', t: 'hépatopathie', suggestions: ['Cirrhose', 'Hépatite B chronique', 'Hépatite C', 'Stéatose hépatique', 'Lithiase biliaire'] },
  { id: 'endocrino', label: 'Pathologies endocriniennes', t: 'endocrinopathie', suggestions: ['Hypothyroïdie', 'Hyperthyroïdie', 'Goitre', 'Insuffisance surrénalienne', 'Dyslipidémie', 'Obésité', 'Ostéoporose'] },
  { id: 'autoimmun', label: 'Maladies auto-immunes et inflammatoires', t: 'maladie auto-immune ou inflammatoire', suggestions: ['Polyarthrite rhumatoïde', 'Lupus systémique', 'Spondyloarthrite', 'Maladie de Behçet', 'Sarcoïdose', 'Maladie de Crohn', 'Rectocolite hémorragique', 'Vascularite', 'Syndrome de Gougerot-Sjögren', 'Sclérodermie systémique'] },
  { id: 'infectieux', label: 'Maladies infectieuses', t: 'maladie infectieuse', suggestions: ['Infection par le VIH', 'Hépatite virale', 'Paludisme', 'Brucellose', 'Infections urinaires récidivantes', 'Endocardite infectieuse'] },
  { id: 'neuro', label: 'Pathologies neurologiques', t: 'pathologie neurologique', suggestions: ['Maladie de Parkinson', 'Maladie d’Alzheimer / troubles neurocognitifs', 'Sclérose en plaques', 'Migraine', 'Neuropathie périphérique'] },
  { id: 'rhumato', label: 'Pathologies rhumatologiques', t: 'pathologie rhumatologique', suggestions: ['Arthrose', 'Goutte', 'Chondrocalcinose', 'Lombalgie chronique', 'Ostéoporose fracturaire'] },
  { id: 'psy', label: 'Antécédents psychiatriques', t: 'antécédent psychiatrique', suggestions: ['Épisode dépressif caractérisé', 'Trouble anxieux', 'Trouble bipolaire', 'Schizophrénie', 'Tentative de suicide', 'Trouble de l’usage de substances'] },
  { id: 'neoplasie', label: 'Néoplasies', t: 'néoplasie', suggestions: ['Cancer du sein', 'Cancer bronchique', 'Cancer colorectal', 'Cancer de la prostate', 'Lymphome', 'Leucémie', 'Cancer de la vessie', 'Cancer de la thyroïde'], hint: 'Localisation, histologie, stade, traitements (chirurgie, chimiothérapie, radiothérapie), date, rémission.' },
  { id: 'hemato', label: 'Pathologies hématologiques', t: 'pathologie hématologique', suggestions: ['Anémie ferriprive', 'Drépanocytose', 'Thalassémie', 'Thrombopénie', 'Trouble de l’hémostase', 'Thrombophilie'] },
  { id: 'digestif', label: 'Pathologies digestives', t: 'pathologie digestive', suggestions: ['Ulcère gastroduodénal', 'Reflux gastro-œsophagien', 'Pancréatite', 'Diverticulose', 'Polypes coliques'] },
  { id: 'autres', label: 'Autres pathologies', t: 'autre pathologie', suggestions: [] },
];

export const ATCD_FAMILIAUX = [
  { id: 'cv', label: 'Maladies cardiovasculaires', t: 'maladie cardiovasculaire', hint: 'Accident cardiovasculaire précoce : avant 55 ans chez un parent du 1er degré masculin, avant 65 ans féminin.' },
  { id: 'diabete', label: 'Diabète', t: 'diabète' },
  { id: 'hta', label: 'HTA', t: 'hypertension artérielle' },
  { id: 'cancer', label: 'Cancers', t: 'cancer' },
  { id: 'genetique', label: 'Maladies génétiques', t: 'maladie génétique' },
  { id: 'autoimmun', label: 'Maladies auto-immunes', t: 'maladie auto-immune' },
  { id: 'mort_subite', label: 'Mort subite', t: 'mort subite' },
  { id: 'mtev', label: 'Maladie thrombo-embolique', t: 'maladie thrombo-embolique veineuse' },
  { id: 'tuberculose', label: 'Tuberculose', t: 'tuberculose' },
  { id: 'autres', label: 'Autres pathologies familiales', t: 'autre pathologie' },
];

export const LIENS_PARENTE = ['père', 'mère', 'frère', 'sœur', 'fils', 'fille', 'grand-père paternel', 'grand-mère paternelle', 'grand-père maternel', 'grand-mère maternelle', 'oncle', 'tante', 'cousin(e)'];

export const TYPES_ALLERGIE = ['Médicament', 'Aliment', 'Produit de contraste iodé', 'Latex', 'Venin d’hyménoptère', 'Pneumallergène', 'Autre'];
export const REACTIONS_ALLERGIE = ['Urticaire', 'Angio-œdème (Quincke)', 'Choc anaphylactique', 'Bronchospasme', 'Éruption maculo-papuleuse', 'Toxidermie grave (DRESS, Stevens-Johnson, Lyell)', 'Intolérance digestive', 'Réaction non précisée'];

export const MODES_ADMISSION = ['Urgences', 'Consultation', 'Transfert inter-hospitalier', 'Transfert inter-service', 'Admission programmée', 'SAMU / SMUR'];
export const INFORMATEURS = ['Patient', 'Famille', 'Accompagnant', 'Dossier médical', 'Médecin traitant', 'Équipe pré-hospitalière'];
export const FIABILITES = ['Bonne', 'Moyenne', 'Médiocre', 'Non évaluable'];
export const SITUATIONS_FAMILIALES = ['Célibataire', 'Marié(e)', 'Pacsé(e) / en couple', 'Divorcé(e)', 'Veuf(ve)'];
export const VOIES = ['per os', 'sublinguale', 'IV', 'IVSE', 'SC', 'IM', 'inhalée', 'cutanée', 'rectale', 'collyre', 'transdermique'];
export const OBSERVANCES = ['bonne', 'partielle', 'mauvaise', 'inconnue'];

export const SERVICES = ['Médecine interne', 'Urgences', 'Cardiologie', 'Pneumologie', 'Gastro-entérologie', 'Néphrologie', 'Neurologie', 'Endocrinologie', 'Rhumatologie', 'Maladies infectieuses', 'Hématologie', 'Gériatrie', 'Réanimation', 'Unité de soins intensifs', 'Chirurgie générale', 'Consultation externe'];
