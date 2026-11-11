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
- 2026-11-11 : voitures provisoires (conduite arcade, sans moteur physique pour l'instant), une par repère ; touche F pour monter et descendre.
- 2026-11-11 : collisions entre voitures et entre personnage et voitures ; élan en ligne droite (115 puis jusqu'à 165 km/h) ; la téléportation ne déplace plus la voiture.
- 2026-11-11 : mini-carte et grande carte (touche M) ; façades génériques à fenêtres (texture dessinée par code, pas les vraies façades) ; frein moteur renforcé.
- 2026-11-11 : 14 repères (dont 6 nommés d'après les captures, à confirmer) ; grande carte cliquable pour se téléporter ; script d'extraction du relief.
- 2026-11-11 : relief réel (Terrain Tiles AWS, environ 30 m de précision ; `tools/build_terrain.py` produit `public/world/terrain.bin`). Routes, bâtiments, personnage et voitures suivent le sol. Limites : falaises adoucies, pas de ponts ni de tunnels, pas de murs de soutènement.
- 2026-11-11 : routes visibles et texturées (elles étaient invisibles en 3D : faces à l'envers), trottoirs, ciel, arbres dans les zones vertes OSM, 3 styles de façades, nom de zone et compteur, circulation automatique (24 voitures), frein moteur encore renforcé, vérification par captures d'écran automatiques (branche build).
- 2026-11-11 : bâtiments différenciés par usage (maison à toit de tuiles, immeuble, tour, mosquée à coupole et minaret, école, hôpital, bâtiment public, entrepôt) ; 338 usages certains d'après OSM, les autres déduits de la taille ; commerces en rez-de-chaussée le long des grandes rues (hypothèse) ; bordures rouge et blanc (hypothèse de style) ; lampadaires génériques ; adresse ?at=x,n pour démarrer à un point précis.
