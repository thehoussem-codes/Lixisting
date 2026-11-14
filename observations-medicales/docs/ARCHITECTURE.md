# Architecture

```
observations-medicales/
├── shared/            Modèle de données (types), valeurs par défaut, cas de démonstration fictifs
├── server/            API Express + SQLite (node:sqlite), authentification, chiffrement, audit
├── src/
│   ├── knowledge/     Base de connaissances médicale (données déclaratives)
│   │   ├── appareils.ts    État général + 11 appareils : blocs, signes, champs, tableaux
│   │   ├── symptomes.ts    Assistant d'interrogatoire (questions, signes associés, rappels)
│   │   ├── scores.ts       Scores : critères, calcul, interprétation, pertinence, pré-remplissage
│   │   ├── biologie.ts     Analytes, unités, valeurs de référence
│   │   ├── constantes.ts   Bornes de plausibilité et signalement des constantes
│   │   └── antecedents.ts, medicaments.ts, termes.ts, modeles.ts
│   ├── engine/        Moteur pur (sans interface), testable
│   │   ├── fr.ts           Grammaire : élisions, articles, accords, énumérations
│   │   ├── examen.ts       Analyse et rédaction des appareils
│   │   ├── hdm.ts          Rédaction de l'histoire de la maladie
│   │   ├── generate.ts     Assemblage des 3 formats, modifications manuelles
│   │   ├── completude.ts   Complétude, incohérences, rappels contextuels
│   │   └── context.ts, calc.ts, doc.ts
│   ├── app/           Session, routeur, magasin d'édition (immer + sauvegarde automatique)
│   ├── ui/            Composants (contrôles, signe tri-état, tableaux cliniques)
│   ├── modules/       Une rubrique de l'observation par fichier
│   ├── pages/         Accueil, dossier patient, éditeur, bibliothèques, modèles, administration
│   └── export/        PDF (pdfmake) et Word (docx), chargés à la demande
├── tests/             Vitest (moteur, règles de sécurité, API)
└── e2e/               Parcours Playwright
```

## Principes

1. **Données déclaratives** : ajouter un signe, un symptôme ou un score se fait dans `knowledge/` ; le
   formulaire, la rédaction, la complétude et les rappels en découlent automatiquement.
2. **Registre unique des signes** : un signe (ex. « œdèmes des membres inférieurs ») a un état unique,
   affiché dans plusieurs rubriques mais rédigé une seule fois, dans sa rubrique d'origine ou dans
   l'histoire de la maladie s'il y a été analysé.
3. **Non renseigné ≠ absent** : `undefined` reste non renseigné ; seuls les états explicites sont rédigés.
   Le bouton « non renseignés → absents » exige une confirmation attestant la recherche effective.
4. **Rédaction honnête** : les appareils non examinés sont mentionnés comme tels, les éléments non
   recherchés sont listés dans le format complet, aucune phrase normale n'est produite par défaut.
5. **Modification manuelle traçable** : un paragraphe modifié conserve l'empreinte du texte généré ; si les
   données changent ensuite, il est signalé « données modifiées depuis » et la validation le rappelle.

## Données

- `patients.identity_enc` et `observations.data_enc` : JSON chiffrés (AES-256-GCM).
- `observations.rev` : verrou optimiste (détection des modifications concurrentes, HTTP 409).
- `versions` : instantané chiffré à chaque validation.
- `audit` : traçabilité des accès, sans donnée médicale.
