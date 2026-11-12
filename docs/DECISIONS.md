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
- 2026-11-11 : corrections : collisions exactes entre voitures (rectangles orientés) ; circulation qui contourne un obstacle immobile au lieu de s'empiler ; largeur des rues et des trottoirs réduite quand les bâtiments sont proches (373 rues) ; commerces seulement sur les murs donnant sur une grande rue, un immeuble sur deux ; voitures garées contre le trottoir.
- 2026-11-11 : nouvelle direction artistique validée (niveau visé : Vice City, identité d'Annaba). Première étape : catalogue de véhicules (`src/vehicles/CarModels.ts`), 9 modèles à carrosserie arrondie générée par code, sans logos ; rendu en pleine résolution par défaut (`?res=0.6` pour alléger) ; `?salon=1` expose le catalogue.
- 2026-11-11 : REFONTE PHYSIQUE, étape 1. Sauvegarde de l'état précédent : branche `sauvegarde-avant-physique`.
  Nouvelle physique automobile sur mesure (`src/vehicles/physics/SuspensionPhysics.ts`, sans dépendance au moteur 3D,
  remplaçable plus tard par Rapier) : gravité, 4 suspensions indépendantes, pentes, vol balistique, butées, transfert de poids,
  adhérence par essieu, frein à main. Réglages par véhicule dans le catalogue (`handling`). Appliquée au véhicule du joueur et
  aux véhicules percutés ; la circulation reste simplifiée. Retour à l'ancienne conduite : `?physique=arcade`.
  Zone de test fictive : `?test=1`. Affichage du nombre d'images par seconde.
  Mesures en simulation (berline de 1 192 kg) : 0 à 100 km/h en 6,9 s ; pointe 112 km/h ; côte à 15 % : 99 km/h ;
  descente à 15 % sans accélérer : 47 km/h après 10 s ; tremplin de 3 m à 90 km/h : environ 3,4 m de haut et 30 à 40 m de portée.
- 2026-11-11 : suite de la refonte.
  Vitesse d'avant rétablie avec la nouvelle physique (0 à 100 km/h en 3,3 s en simulation, pointe 115 km/h, élan en ligne droite conservé).
  Mer : surface animée et translucide (`src/world/Water.ts`), rivage en pente douce sous l'eau, fond marin, immersion des véhicules
  (freinage, flottaison brève, moteur noyé), nage du personnage. Ombres portées simplifiées sous le personnage et les voitures.
  Résolution automatique selon la fluidité ; décor éloigné masqué par blocs.
  Catalogue central des modèles 3D (`public/assets/catalog.json`, `src/assets/AssetLibrary.ts`, mode d'emploi `docs/ASSETS.md`) :
  véhicules, personnage, objets ; téléchargement automatique listé dans `tools/assets.txt`.
  Personnage provisoire articulé et animé (mannequin « X Bot » des exemples three.js, issu de Mixamo) : à remplacer.
  Végétation : 19 144 plantes de 5 espèces (pin, palmier, ficus, cyprès, buisson dont lauriers-roses), dans les zones vertes OSM,
  sur les collines non bâties et en alignement le long des rues à trottoir (palmiers près de la mer). Emplacements plausibles, non relevés.
- 2026-11-11 : conduite. La simulation à quatre suspensions a été jugée trop difficile à conduire : la conduite arcade redevient le
  réglage par défaut, mais n'est plus collée au sol. Principe repris des jeux de course arcade : direction et vitesse simples,
  mouvement vertical séparé (décollage quand le sol se dérobe de plus de 12 cm sous la trajectoire, chute libre, réception avec
  écrasement des suspensions sans rebond), attitudes de caisse purement visuelles et lissées (cabrage, plongée, roulis), effet
  modéré des pentes sur la vitesse (55 % de la gravité). Simulation complète conservée : `?physique=simulation`.
  Essais dans le jeu : tremplin à 124 km/h, 4,2 m de haut, réception stable ; en ville, aucune perte de contact parasite.
- 2026-11-11 : photos de référence d'Annaba (Wikimedia Commons, licences libres) dans la branche `references`, avec auteurs et
  licences dans `references/credits.json`. Elles servent de modèles visuels et ne sont pas intégrées au jeu.

## Qualité visuelle (12 novembre)

- **Ombres portées du soleil** (bâtiments, arbres, véhicules, personnage) dans un rayon de 85 m autour du joueur ;
  coupées automatiquement si le jeu rame, ou à la main avec `?ombres=0`.
- **Végétation** : feuillage à image de feuilles ajourée (on voit à travers), houppiers faits de plusieurs masses,
  palmes à folioles. Les emplacements restent ceux des données réelles.
- **Immeubles** : balcons superposés, édicules, citernes et paraboles sur les toits-terrasses (détails indicatifs).
- **Modèles** : personnage ramené de 49 000 à 13 000 triangles (`tools/optimize_character.py`).
