/** Liste de DCI usuelles (aide à la saisie) et classes utilisées pour le contrôle des allergies. */

export const MEDICAMENTS: string[] = [
  'Paracétamol', 'Ibuprofène', 'Kétoprofène', 'Diclofénac', 'Naproxène', 'Acide acétylsalicylique', 'Tramadol', 'Codéine', 'Néfopam', 'Morphine', 'Oxycodone',
  'Amoxicilline', 'Amoxicilline + acide clavulanique', 'Ampicilline', 'Cloxacilline', 'Pénicilline G', 'Pipéracilline-tazobactam', 'Céfazoline', 'Céfuroxime', 'Ceftriaxone', 'Céfotaxime', 'Céfixime', 'Céfépime',
  'Imipénème', 'Méropénème', 'Gentamicine', 'Amikacine', 'Vancomycine', 'Ciprofloxacine', 'Lévofloxacine', 'Ofloxacine', 'Azithromycine', 'Clarithromycine', 'Spiramycine', 'Doxycycline',
  'Cotrimoxazole (sulfaméthoxazole-triméthoprime)', 'Métronidazole', 'Nitrofurantoïne', 'Fosfomycine', 'Rifampicine', 'Isoniazide', 'Pyrazinamide', 'Éthambutol', 'Fluconazole', 'Aciclovir', 'Valaciclovir',
  'Amlodipine', 'Nifédipine', 'Ramipril', 'Périndopril', 'Énalapril', 'Captopril', 'Losartan', 'Valsartan', 'Irbésartan', 'Candésartan', 'Bisoprolol', 'Aténolol', 'Propranolol', 'Nébivolol', 'Carvédilol', 'Métoprolol',
  'Hydrochlorothiazide', 'Indapamide', 'Furosémide', 'Bumétanide', 'Spironolactone', 'Éplérénone', 'Sacubitril-valsartan', 'Dapagliflozine', 'Empagliflozine', 'Ivabradine', 'Digoxine', 'Amiodarone', 'Flécaïnide',
  'Trinitrine', 'Isosorbide dinitrate', 'Molsidomine', 'Clopidogrel', 'Ticagrélor', 'Prasugrel', 'Héparine non fractionnée', 'Énoxaparine', 'Tinzaparine', 'Fondaparinux', 'Apixaban', 'Rivaroxaban', 'Dabigatran', 'Warfarine', 'Acénocoumarol', 'Fluindione',
  'Atorvastatine', 'Rosuvastatine', 'Simvastatine', 'Pravastatine', 'Ézétimibe', 'Fénofibrate',
  'Metformine', 'Gliclazide', 'Glimépiride', 'Sitagliptine', 'Vildagliptine', 'Liraglutide', 'Sémaglutide', 'Dulaglutide', 'Insuline glargine', 'Insuline détémir', 'Insuline asparte', 'Insuline lispro', 'Insuline humaine rapide', 'Insuline NPH',
  'Lévothyroxine', 'Carbimazole', 'Thiamazole', 'Propylthiouracile', 'Hydrocortisone', 'Prednisone', 'Prednisolone', 'Méthylprednisolone', 'Dexaméthasone', 'Fludrocortisone',
  'Oméprazole', 'Ésoméprazole', 'Pantoprazole', 'Lansoprazole', 'Dompéridone', 'Métoclopramide', 'Ondansétron', 'Lopéramide', 'Macrogol', 'Lactulose', 'Phloroglucinol', 'Siméticone',
  'Salbutamol', 'Terbutaline', 'Ipratropium', 'Tiotropium', 'Formotérol', 'Salmétérol', 'Budésonide', 'Fluticasone', 'Béclométasone', 'Montélukast',
  'Allopurinol', 'Fébuxostat', 'Colchicine', 'Méthotrexate', 'Hydroxychloroquine', 'Sulfasalazine', 'Léflunomide', 'Azathioprine', 'Mycophénolate mofétil', 'Ciclosporine', 'Tacrolimus', 'Cyclophosphamide',
  'Alendronate', 'Acide zolédronique', 'Calcium + vitamine D', 'Cholécalciférol', 'Fer (sulfate ferreux)', 'Carboxymaltose ferrique', 'Acide folique', 'Cyanocobalamine', 'Potassium (chlorure)',
  'Lévétiracétam', 'Valproate de sodium', 'Carbamazépine', 'Lamotrigine', 'Phénobarbital', 'Phénytoïne', 'Clonazépam', 'Diazépam', 'Alprazolam', 'Bromazépam', 'Oxazépam', 'Lorazépam', 'Zolpidem', 'Zopiclone',
  'Sertraline', 'Escitalopram', 'Fluoxétine', 'Paroxétine', 'Venlafaxine', 'Mirtazapine', 'Amitriptyline', 'Halopéridol', 'Rispéridone', 'Olanzapine', 'Quétiapine', 'Aripiprazole', 'Lithium',
  'Lévodopa + carbidopa', 'Lévodopa + bensérazide', 'Donépézil', 'Mémantine', 'Prégabaline', 'Gabapentine', 'Baclofène', 'Tamsulosine', 'Alfuzosine', 'Finasteride', 'Oxybutynine',
  'Sérum salé isotonique (NaCl 0,9 %)', 'Ringer lactate', 'Glucosé 5 %', 'Glucosé 10 %', 'Sérum glucosé 30 %', 'Bicarbonate de sodium', 'Albumine humaine', 'Noradrénaline', 'Adrénaline', 'Dobutamine',
];

/**
 * Classes thérapeutiques pour la détection des allergies croisées.
 * Clé : mot-clé de l'allergie déclarée ; valeurs : fragments de DCI concernées.
 */
export const CLASSES_ALLERGIE: { nom: string; motsCles: string[]; molecules: string[]; croisees?: string[] }[] = [
  { nom: 'Pénicillines (bêta-lactamines)', motsCles: ['pénicilline', 'penicilline', 'bêta-lactamine', 'beta-lactamine', 'amoxicilline', 'augmentin'], molecules: ['pénicilline', 'amoxicilline', 'ampicilline', 'cloxacilline', 'oxacilline', 'pipéracilline'], croisees: ['céfazoline', 'céfuroxime', 'ceftriaxone', 'céfotaxime', 'céfixime', 'céfépime', 'imipénème', 'méropénème'] },
  { nom: 'Céphalosporines', motsCles: ['céphalosporine', 'cephalosporine', 'ceftriaxone', 'céfotaxime'], molecules: ['céfazoline', 'céfuroxime', 'ceftriaxone', 'céfotaxime', 'céfixime', 'céfépime'] },
  { nom: 'Sulfamides', motsCles: ['sulfamide', 'cotrimoxazole', 'bactrim', 'sulfaméthoxazole'], molecules: ['cotrimoxazole', 'sulfaméthoxazole', 'sulfasalazine'] },
  { nom: 'AINS', motsCles: ['ains', 'anti-inflammatoire', 'ibuprofène', 'aspirine', 'kétoprofène', 'diclofénac'], molecules: ['ibuprofène', 'kétoprofène', 'diclofénac', 'naproxène', 'acide acétylsalicylique'] },
  { nom: 'Quinolones', motsCles: ['quinolone', 'fluoroquinolone', 'ciprofloxacine', 'lévofloxacine', 'ofloxacine'], molecules: ['ciprofloxacine', 'lévofloxacine', 'ofloxacine'] },
  { nom: 'Macrolides', motsCles: ['macrolide', 'azithromycine', 'clarithromycine', 'érythromycine', 'spiramycine'], molecules: ['azithromycine', 'clarithromycine', 'érythromycine', 'spiramycine'] },
  { nom: 'Opioïdes', motsCles: ['morphine', 'opioïde', 'codéine', 'tramadol'], molecules: ['morphine', 'codéine', 'tramadol', 'oxycodone'] },
  { nom: 'Héparines', motsCles: ['héparine', 'heparine', 'tih'], molecules: ['héparine', 'énoxaparine', 'tinzaparine'] },
];

export const PRODUITS_CONTRASTE_MOTS = ['iode', 'iodé', 'produit de contraste', 'contraste'];
export const EXAMENS_INJECTES_MOTS = ['angioscanner', 'injecté', 'injection', 'avec injection', 'uro-scanner', 'coronarographie', 'artériographie'];
