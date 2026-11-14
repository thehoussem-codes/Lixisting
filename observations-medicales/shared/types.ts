/**
 * Modèle de données d'une observation médicale.
 *
 * Principe fondamental : une donnée non saisie reste `undefined` (« non renseigné »).
 * Elle n'est JAMAIS convertie en « absent ». Les états explicites sont :
 *   'p'  = présent
 *   'a'  = absent après recherche
 *   'nr' = non recherché (le médecin déclare ne pas l'avoir recherché)
 *   'na' = non applicable
 */
export type FState = 'p' | 'a' | 'nr' | 'na';

/** Réponse oui / non tri-état pour les questions d'interrogatoire. */
export type YN = 'oui' | 'non' | 'nr';

export interface FindingVal {
  s?: FState;
  /** Précision libre */
  d?: string;
  /** Détails structurés (stade, latéralité, taille...) */
  x?: Record<string, string>;
}

export type Sexe = 'M' | 'F' | '';

export interface Identite {
  ipp: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: Sexe;
  adresse: string;
  telephone: string;
  profession: string;
  situationFamiliale: string;
  origine: string;
  personnePrevenir: { nom: string; lien: string; telephone: string };
}

export interface Admission {
  date: string; // AAAA-MM-JJTHH:MM
  service: string;
  medecin: string;
  mode: string;
  provenance: string;
  informateurs: string[];
  fiabilite: string;
  fiabiliteDetail: string;
}

export interface Motif {
  principal: string;
  secondaires: string[];
  symptomes: string;
  dateDebut: string;
  circonstances: string;
  caractere: '' | 'urgent' | 'programme';
  formulation: string;
}

export interface AtcdEntry {
  uid: string;
  nom: string;
  date: string;
  traitement: string;
  suivi: string;
  complications: string;
  evolution: string;
}

export interface AtcdCat {
  s?: 'p' | 'a' | 'nr';
  entries: AtcdEntry[];
}

export interface Chirurgie {
  uid: string;
  intervention: string;
  date: string;
  indication: string;
  complications: string;
}

export interface Gyneco {
  gestite: string;
  parite: string;
  accouchementsVB: string;
  cesariennes: string;
  faussesCouches: string;
  ivg: string;
  ddr: string;
  cycles: string;
  menopause: '' | 'oui' | 'non';
  ageMenopause: string;
  ths: string;
  contraception: string;
  grossesse: '' | 'exclue' | 'possible' | 'en_cours' | 'nr';
  termeGrossesse: string;
  atcdGyneco: string;
}

export interface FamEntry {
  uid: string;
  cat: string;
  pathologie: string;
  lien: string;
  age: string;
}

export interface Toxiques {
  tabac: '' | 'non' | 'actif' | 'sevre' | 'passif' | 'nr';
  cigJour: string;
  tabacAnnees: string;
  paquetsAnnees: string;
  tabacArret: string;
  tabacAutre: string;
  alcool: '' | 'non' | 'occasionnel' | 'regulier' | 'sevre' | 'nr';
  alcoolVerresJour: string;
  alcoolDetail: string;
  deta: Record<string, YN | undefined>;
  substances: '' | 'non' | 'oui' | 'nr';
  substancesDetail: string;
  expoPro: string;
  expoEnv: string;
  activitePhysique: string;
  alimentation: string;
}

export interface Allergie {
  uid: string;
  type: string;
  agent: string;
  reaction: string;
  date: string;
  documentee: string;
}

export interface Medicament {
  uid: string;
  nom: string;
  dosage: string;
  posologie: string;
  voie: string;
  frequence: string;
  observance: string;
  debut: string;
}

export interface Antecedents {
  medicaux: Record<string, AtcdCat>;
  medicauxAucun: boolean;
  chirurgicaux: { s?: 'p' | 'a' | 'nr'; entries: Chirurgie[] };
  gyneco: Gyneco;
  familiaux: { s?: 'p' | 'a' | 'nr'; cats: Record<string, FState | undefined>; entries: FamEntry[] };
  toxiques: Toxiques;
  allergies: { statut: '' | 'aucune' | 'presentes' | 'non_verifiees'; entries: Allergie[] };
  traitements: { statut: '' | 'aucun' | 'liste' | 'non_verifies'; entries: Medicament[] };
}

/** Un symptôme analysé dans l'histoire de la maladie. */
export interface SymptomEntry {
  uid: string;
  type: string; // identifiant du symptôme dans la bibliothèque
  principal: boolean;
  libelle: string; // libellé personnalisé (symptôme « autre »)
  /** Réponses aux questions : identifiant -> valeur(s) */
  a: Record<string, string | string[] | undefined>;
}

export interface TraitementAvant {
  uid: string;
  nom: string;
  type: string; // automédication / prescrit
  efficacite: string;
  tolerance: string;
  observance: string;
}

export interface HDM {
  symptomes: SymptomEntry[];
  traitementsAvant: { s?: 'p' | 'a' | 'nr'; entries: TraitementAvant[] };
  recit: string;
  parcours: string;
}

export interface Constantes {
  temperature: string;
  pas: string;
  pad: string;
  fc: string;
  fr: string;
  spo2: string;
  o2: string; // '' | 'aa' | 'o2'
  o2Debit: string;
  glycemie: string;
  glycemieUnite: string; // g/L | mmol/L
  poids: string;
  taille: string;
  eva: string;
  glasgow: string;
  diurese: string;
  heure: string;
  autres: string;
}

export interface AppExam {
  /** '' = non renseigné ; 'na' = non pertinent dans ce contexte ; 'nr' = non examiné */
  statut?: '' | 'na' | 'nr';
  notes: Record<string, string>;
  conclusion: string;
}

export interface Souffle {
  uid: string;
  temps: string;
  foyer: string;
  intensite: string;
  irradiation: string;
  caractere: string;
}

export interface Adenopathie {
  uid: string;
  aire: string;
  cote: string;
  taille: string;
  consistance: string;
  mobilite: string;
  sensibilite: string;
  autre: string;
}

export interface ArticulationAtteinte {
  uid: string;
  articulation: string;
  cote: string;
  signes: string[];
  amplitude: string;
  detail: string;
}

export interface LesionCutanee {
  uid: string;
  type: string;
  localisation: string;
  taille: string;
  description: string;
}

export interface Specials {
  pouls: Record<string, string>; // `${artere}_${cote}` -> perçu / diminué / aboli / nr
  paBras: { droit: string; gauche: string };
  souffles: Souffle[];
  mrc: Record<string, string>; // `${segment}_${cote}` -> 0..5
  rot: Record<string, string>; // `${reflexe}_${cote}`
  nerfs: Record<string, { s?: string; d?: string }>;
  adenopathies: Adenopathie[];
  airesExaminees: string[];
  articulations: ArticulationAtteinte[];
  lesions: LesionCutanee[];
}

export interface ScoreVal {
  inputs: Record<string, string | undefined>;
  inclure: boolean;
  commentaire?: string;
}

export interface BioValeur {
  uid: string;
  analyte: string; // identifiant bibliothèque ou '' (libre)
  libelle: string;
  valeur: string;
  unite: string;
  refMin: string;
  refMax: string;
}

export interface BioPanel {
  uid: string;
  type: string; // NFS, ionogramme...
  date: string;
  valeurs: BioValeur[];
  interpretation: string;
}

export interface ExamenLibre {
  uid: string;
  categorie: string; // bacterio / imagerie / endoscopie / autre
  type: string; // ECBU, hémocultures, radiographie...
  region: string;
  date: string;
  resultat: string;
  conclusion: string;
  interpretation: string;
}

export interface ECG {
  date: string;
  realise: '' | 'oui' | 'non';
  rythme: string;
  fc: string;
  axe: string;
  pr: string;
  qrs: string;
  qtc: string;
  st: string;
  ondeT: string;
  autres: string;
  interpretation: string;
}

export interface ExamensComp {
  bio: BioPanel[];
  ecg: ECG;
  autres: ExamenLibre[];
}

export interface Differentiel {
  uid: string;
  diagnostic: string;
  pour: string;
  contre: string;
  examens: string;
}

export interface Discussion {
  syndromes: string;
  diagnosticPrincipal: string;
  argumentsPour: string;
  argumentsContre: string;
  differentiels: Differentiel[];
  urgences: string;
  hypotheses: string[];
  examensNecessaires: string;
  diagnosticRetenu: string;
  statutDiagnostic: '' | 'hypothese' | 'retenu';
  commentaire: string;
}

export interface Prescription {
  uid: string;
  nom: string;
  dose: string;
  posologie: string;
  voie: string;
  frequence: string;
  duree: string;
  indication: string;
  ciVerifiees: boolean;
  surveillance: string;
  effets: string;
}

export interface AvisSpe {
  uid: string;
  specialite: string;
  motif: string;
  date: string;
  reponse: string;
}

export interface ConduiteATenir {
  mesures: string[];
  mesuresDetail: string;
  traitements: Prescription[];
  examensDemandes: string[];
  examensDetail: string;
  surveillance: string[];
  surveillanceDetail: string;
  avis: AvisSpe[];
  orientation: string;
  orientationDetail: string;
  consignes: string;
  reevaluation: string;
}

export type FormatObs = 'complet' | 'standard' | 'court';

export interface Override {
  text: string;
  /** Empreinte du texte généré au moment de la modification manuelle */
  base: string;
}

export interface Redaction {
  overrides: Partial<Record<FormatObs, Record<string, Override>>>;
  verifies: Record<string, boolean>;
}

export interface Observation {
  version: 1;
  identite: Identite;
  admission: Admission;
  motif: Motif;
  atcd: Antecedents;
  hdm: HDM;
  findings: Record<string, FindingVal>;
  fields: Record<string, string>;
  constantes: Constantes;
  appareils: Record<string, AppExam>;
  specials: Specials;
  scores: Record<string, ScoreVal>;
  examens: ExamensComp;
  syntheseNote: string;
  discussion: Discussion;
  cat: ConduiteATenir;
  redaction: Redaction;
}

/* ------------------------------------------------------------------ */
/* Échanges avec le serveur                                             */
/* ------------------------------------------------------------------ */

export type Role = 'admin' | 'medecin' | 'interne' | 'lecture';

export interface UserInfo {
  id: number;
  username: string;
  nom: string;
  role: Role;
  actif: boolean;
  createdAt: string;
  lastLogin?: string | null;
}

export interface PatientIdentity {
  ipp: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: Sexe;
  adresse: string;
  telephone: string;
  profession: string;
  situationFamiliale: string;
  origine: string;
  personnePrevenir: { nom: string; lien: string; telephone: string };
}

export interface PatientSummary {
  id: number;
  identity: PatientIdentity;
  fictif: boolean;
  createdAt: string;
  updatedAt: string;
  nbObservations: number;
  derniereObservation: string | null;
}

export type ObsStatut = 'brouillon' | 'validee';

export interface ObservationMeta {
  id: number;
  patientId: number;
  statut: ObsStatut;
  rev: number;
  titre: string;
  dateAdmission: string;
  createdAt: string;
  updatedAt: string;
  auteur: string;
  validePar: string | null;
  valideLe: string | null;
}

export interface ObservationFull extends ObservationMeta {
  data: Observation;
  patient: PatientSummary;
}

export interface TemplateRecord {
  id: number;
  nom: string;
  description: string;
  partage: boolean;
  auteur: string;
  ownerId: number;
  createdAt: string;
  content: TemplateContent;
}

/** Contenu d'un modèle : uniquement la structure, jamais de constatation clinique. */
export interface TemplateContent {
  motif?: Partial<Motif>;
  symptomes?: { type: string; principal: boolean; libelle: string; loc?: string }[];
  appareilsNonPertinents?: string[];
  scores?: string[];
  examensDemandes?: string[];
  surveillance?: string[];
  mesures?: string[];
  differentiels?: string[];
  urgences?: string;
  service?: string;
}

export interface Preferences {
  etablissement: string;
  service: string;
  enTete: string;
  signature: string;
}
