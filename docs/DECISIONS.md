# Lixiting : décisions et avancement

## Décisions

- **Nom** : Lixiting. Aucun code, modèle, texture, son ou nom issu des jeux Rockstar.
- **Technique** : Vite + React + TypeScript ; Three.js sans surcouche pour la 3D ; React uniquement pour l'interface.
- **Physique** : Rapier (à ajouter avec les collisions et les véhicules).
- **Données** : OpenStreetMap via Overpass, relief Copernicus 30 m, traités hors ligne par des scripts Python
  en tuiles d'environ 250 m. Le jeu ne contacte jamais Overpass.
- **Règle** : aucune donnée géographique inventée. Toute valeur estimée (hauteur, façade) est marquée comme telle.
- **Style** : rendu à 60 % de la résolution, sans anticrénelage, brouillard, textures 128 à 256 px.
- **Hébergement** : code sur GitHub, développement dans Codespaces, publication prévue sur GitHub Pages.

## Ordre de travail

1. Base de jeu sur carte de test : marche, caméra, puis collisions et voiture.
2. Zone pilote réelle : Cours de la Révolution et gare.
3. Extension au périmètre complet (Cap de Garde jusqu'à la gare).
4. Ambiance : façades, voix, radio, véhicules locaux.
5. Histoire (plus tard).

## Journal

- 2026-11-11 : création du projet ; première scène (carte de test fictive, personnage provisoire, caméra troisième personne).
  Écrit sans pouvoir être exécuté côté assistant : à valider dans le Codespace.
- 2026-11-11 : extraction OpenStreetMap de la zone (407 km de voies, 10 446 bâtiments, dont 5 % avec nombre d'étages).
- 2026-11-11 : première carte réelle d'Annaba dans le jeu (`tools/build_world.py` produit `public/world/annaba.json`) :
  trait de côte, voies, bâtiments en volumes, plages et espaces verts ; collisions avec les bâtiments ; personnage animé, saut ;
  téléportation vers 6 repères. Limites connues : terrain plat (relief non intégré), hauteurs estimées pour 95 % des bâtiments,
  pas de façades, pas de trottoirs, voies en construction ignorées, projection locale simple (quelques mètres d'écart aux extrémités).
