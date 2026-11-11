# Lixiting

Jeu 3D en monde ouvert, jouable dans le navigateur, qui reproduit la ville d'Annaba (Algérie)
dans un style rétro des années 2000. Projet original, non commercial.

## Lancer le jeu

```bash
npm install     # une seule fois (automatique dans un Codespace)
npm run dev     # démarre le jeu, puis ouvrir l'adresse affichée
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/ui` | Interface React (HUD, menus) |
| `src/engine` | Moteur : boucle de jeu, rendu, clavier/souris |
| `src/player` | Personnage et caméra à la troisième personne |
| `src/vehicles` | Véhicules (à venir) |
| `src/world` | Monde 3D : carte de test, puis Annaba |
| `tools` | Scripts Python d'extraction des données géographiques (à venir) |
| `data` | Données brutes OpenStreetMap et relief (à venir) |
| `public/world`, `public/assets` | Tuiles du monde, textures et modèles (à venir) |
| `docs` | Journal des décisions |

Voir `docs/DECISIONS.md` pour les choix techniques et l'avancement.
