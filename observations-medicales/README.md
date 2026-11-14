# Observations médicales

Application professionnelle de rédaction d’observations médicales structurées, conçue pour un usage
hospitalier (urgences, médecine interne, consultation). Elle guide l’interrogatoire et l’examen clinique,
rappelle les éléments sémiologiques importants, détecte les informations manquantes et les incohérences,
puis rédige automatiquement l’observation en français médical, dans trois formats exportables en PDF et Word.

> Outil d’aide à la documentation médicale : il ne pose aucun diagnostic et ne prescrit rien.
> Toute observation doit être relue et validée par le médecin.

## Démarrage

Prérequis : **Node.js ≥ 22.18** (module `node:sqlite` intégré et exécution directe du TypeScript du serveur).

```bash
cd observations-medicales
npm install
npm run dev          # API sur :3180 + interface Vite sur http://localhost:5180
```

Au premier lancement, l’application demande de créer le **compte administrateur**. Sur l’accueil, le bouton
« Charger des cas de démonstration fictifs » crée trois dossiers entièrement fictifs (douleur thoracique,
fièvre et polyarthralgies, dyspnée et œdèmes).

Production (un seul processus sert l’API et l’interface) :

```bash
npm run build
OBS_DATA_KEY=$(openssl rand -base64 32) SECURE_COOKIES=1 npm start   # derrière un proxy HTTPS
```

Créer un compte en ligne de commande : `node server/creer-utilisateur.ts <identifiant> <mot-de-passe> <admin|medecin|interne|lecture> "Dr Nom"`.

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT`, `HOST` | Adresse d’écoute | `3180`, `127.0.0.1` |
| `DATA_DIR` | Base SQLite et clé locale | `./data` |
| `OBS_DATA_KEY` | Clé AES-256 (32 octets, base64) | générée dans `DATA_DIR` (développement) |
| `SESSION_IDLE_MIN` / `SESSION_MAX_HOURS` | Expiration des sessions | 30 min / 12 h |
| `SECURE_COOKIES` | Cookie `Secure` (HTTPS) | activé si `NODE_ENV=production` |
| `TRUST_PROXY` | Derrière un reverse proxy | — |

## Tests

```bash
npm test             # 24 tests : règles de sécurité de la rédaction, scores, cohérence, API, chiffrement
npm run build && npm run e2e   # parcours complet dans Chromium (captures dans e2e/captures/)
npx vite-node scripts/apercu-demo.ts 0 complet   # texte généré d’un cas de démonstration
```

## Fonctionnalités

- **11 modules** avec barre de progression et navigation libre : état civil, motif, antécédents (médicaux,
  chirurgicaux, gynéco-obstétricaux, familiaux, habitudes de vie avec paquets-années et DETA, allergies,
  traitements), histoire de la maladie, examen clinique (état général, constantes, 11 appareils), scores,
  examens complémentaires, synthèse, discussion diagnostique, conduite à tenir, complétude, rédaction.
- **Assistant d’interrogatoire** : 24 symptômes, analyse OPQRST de la douleur adaptée à 6 localisations,
  signes associés, drapeaux rouges, diagnostics graves à ne pas manquer.
- **Examen clinique** : 248 signes et 68 champs structurés ; chaque signe a 5 états (présent, absent après recherche,
  non recherché, non applicable, non renseigné) ; tableaux des pouls, souffles, force MRC, réflexes, nerfs
  crâniens, adénopathies, articulations, lésions cutanées. Les signes partagés entre rubriques gardent un
  état unique (aucune contradiction possible).
- **29 scores et classifications** proposés selon le contexte, pré-remplis à partir du dossier.
- **Biologie** avec unités convertibles (g/L ↔ mmol/L, mg/L ↔ µmol/L…), valeurs de référence, signalement
  des valeurs anormales ; calculs automatiques (âge, IMC, PAM, DFG CKD-EPI 2021, Cockcroft, calcémie corrigée,
  trou anionique).
- **Rédaction automatique** en trois formats, modifiable paragraphe par paragraphe, avec détection des
  textes modifiés devenus obsolètes ; validation finale avec attestation ; exports PDF, Word, impression, copie.
- **Contrôle de complétude** (indispensable / recommandé / non pertinent), **incohérences** (allergie
  croisée avec une prescription, fièvre notée absente à 39 °C, Glasgow incompatible…), constantes à signaler.
- Dossiers multiples, recherche, historique, duplication, reprise des antécédents, modèles personnalisables,
  bibliothèques (scores, termes avec insertion, aide-mémoire, valeurs de référence), mode sombre, responsive.

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) et [`docs/SECURITE.md`](docs/SECURITE.md).
