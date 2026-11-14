/** Modèles d'observations intégrés (structure uniquement, aucune constatation clinique). */
import type { TemplateContent } from '../../shared/types.ts';

export const MODELES_INTEGRES: { id: string; nom: string; description: string; content: TemplateContent }[] = [
  {
    id: 'int-thoracique', nom: 'Douleur thoracique aux urgences', description: 'Analyse OPQRST, scores HEART / Wells, ECG, troponine, surveillance scopée.',
    content: {
      motif: { principal: 'Douleur thoracique', caractere: 'urgent' }, service: 'Urgences',
      symptomes: [{ type: 'dl_thoracique', principal: true, libelle: '' }],
      appareilsNonPertinents: ['genital'], scores: ['heart'],
      examensDemandes: ['ECG', 'Troponine', 'NFS', 'Ionogramme sanguin', 'Fonction rénale', 'Radiographie thoracique'],
      surveillance: ['Pression artérielle, FC', 'Douleur (EVA)', 'Fréquence respiratoire, SpO₂'],
      mesures: ['Monitorage cardio-tensionnel continu', 'Voie veineuse périphérique'],
      urgences: 'Syndrome coronarien aigu, dissection aortique, embolie pulmonaire, pneumothorax, tamponnade.',
    },
  },
  {
    id: 'int-dyspnee', nom: 'Dyspnée aiguë', description: 'Analyse de la dyspnée, signes de gravité, insuffisance cardiaque, NEWS2.',
    content: {
      motif: { principal: 'Dyspnée', caractere: 'urgent' },
      symptomes: [{ type: 'dyspnee', principal: true, libelle: '' }],
      appareilsNonPertinents: ['genital'], scores: ['news2'],
      examensDemandes: ['Gaz du sang', 'NFS', 'CRP', 'Ionogramme sanguin', 'Fonction rénale', 'ECG', 'Radiographie thoracique'],
      surveillance: ['Fréquence respiratoire, SpO₂', 'Pression artérielle, FC', 'Diurèse'],
    },
  },
  {
    id: 'int-fievre', nom: 'Fièvre / sepsis', description: 'Recherche de porte d’entrée, qSOFA, hémocultures.',
    content: {
      motif: { principal: 'Fièvre', caractere: 'urgent' },
      symptomes: [{ type: 'fievre', principal: true, libelle: '' }],
      scores: ['qsofa', 'news2'],
      examensDemandes: ['Hémocultures', 'ECBU', 'NFS', 'CRP', 'Lactates', 'Ionogramme sanguin', 'Fonction rénale', 'Radiographie thoracique'],
      surveillance: ['Température', 'Pression artérielle, FC', 'Diurèse', 'État neurologique (Glasgow)'],
      urgences: 'Sepsis / choc septique, purpura fulminans, méningite, paludisme grave.',
    },
  },
  {
    id: 'int-avc', nom: 'Déficit neurologique aigu', description: 'Heure de début, NIHSS, glycémie, filière AVC.',
    content: {
      motif: { principal: 'Déficit neurologique', caractere: 'urgent' },
      symptomes: [{ type: 'deficit_neuro', principal: true, libelle: '' }],
      appareilsNonPertinents: ['genital'], scores: ['nihss', 'glasgow'],
      examensDemandes: ['Glycémie capillaire', 'NFS', 'Bilan de coagulation', 'Ionogramme sanguin', 'ECG', 'IRM ou scanner cérébral en urgence'],
      surveillance: ['État neurologique (Glasgow)', 'Pression artérielle, FC', 'Glycémie capillaire'],
    },
  },
  {
    id: 'int-abdo', nom: 'Douleur abdominale aiguë', description: 'Analyse de la douleur, irritation péritonéale, β-hCG.',
    content: {
      motif: { principal: 'Douleur abdominale', caractere: 'urgent' },
      symptomes: [{ type: 'dl_abdominale', principal: true, libelle: '' }],
      scores: ['alvarado'],
      examensDemandes: ['NFS', 'CRP', 'Lipasémie', 'Bilan hépatique', 'Ionogramme sanguin', 'Fonction rénale', 'Bandelette urinaire', 'Échographie abdominale'],
      surveillance: ['Douleur (EVA)', 'Température', 'Pression artérielle, FC'],
    },
  },
  {
    id: 'int-aeg', nom: 'Altération de l’état général (médecine interne)', description: 'AEG, examen complet, bilan de première intention.',
    content: {
      motif: { principal: 'Altération de l’état général', caractere: 'programme' }, service: 'Médecine interne',
      symptomes: [{ type: 'aeg', principal: true, libelle: '' }],
      scores: ['ecog'],
      examensDemandes: ['NFS', 'CRP', 'Ionogramme sanguin', 'Fonction rénale', 'Bilan hépatique', 'Bilan phosphocalcique', 'TSH', 'Électrophorèse des protéines', 'Radiographie thoracique'],
      surveillance: ['Poids', 'Température'],
    },
  },
];
