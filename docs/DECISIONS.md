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

## Rues taillées dans le relief (12 novembre)

Le relief à 30 m ne décrit que la colline, pas la tranchée d'une rue : la chaussée grimpait donc dessus.
Dans les zones listées dans `GRADING_ZONES` (`tools/build_terrain.py`), les grandes rues reçoivent un profil en long
adouci (pente maximale 3,5 %, on entaille sans jamais remblayer), le terrain est entaillé à leur passage et un mur de
soutènement en pierre retient le talus dès qu'il dépasse 1,2 m. Le terrain autour garde son altitude réelle.
Première zone : rue du 24 Février 1956 (nord du Cours). Hauteur exacte des murs : déduite du relief, à confirmer par photos.

## Identification des lieux (12 novembre)

- Base unique `public/world/locations.json`, fabriquée par `tools/build_locations.py` (à relancer après `build_world.py`).
- Identifiants stables : tronçon de rue `ANN-<quartier>-<numéro>`, carrefour `ANN-<quartier>-X<numéro>`,
  bâtiment `B-<rang>`, voie `R-<rang>` (rangs dans `annaba.json`, donc directement utilisables dans le code et les outils).
- Quartier : quartier OpenStreetMap à moins de 450 m, sinon repère du jeu à moins de 600 m, sinon secteur de grille de 500 m
  (lettre + chiffres, sans nom). Aucun nom n'est inventé ; 1 375 tronçons sur 1 834 n'ont pas de nom dans OpenStreetMap.
- En jeu : ligne LIEU / QUARTIER / ID / POSITION / ALTITUDE / latitude-longitude en bas de l'écran ;
  touche I = fiche détaillée (carrefour, repères, voies et bâtiments proches), touche C = copier la fiche.
- Pour retrouver un lieu : `?at=x,nord` (donné dans la fiche), ou chercher l'identifiant dans `locations.json`.

## Licences des modèles et textures (12 novembre)

Lixiting est un projet personnel, non commercial. Sont donc acceptés : CC0, CC-BY, CC-BY-SA, CC-BY-NC (et variantes NC),
ainsi que toute licence autorisant explicitement un jeu personnel non commercial.

Deux questions distinctes, à vérifier pour chaque fichier :
1. **Utiliser le modèle dans le jeu** : permis par toutes les licences ci-dessus.
2. **Laisser le fichier d'origine téléchargeable** (dépôt GitHub public, site du jeu) : permis par les licences Creative Commons,
   à condition de créditer l'auteur ; **non permis** par la licence « Standard » de Sketchfab ni par la licence Quaternius.
   Ces modèles-là ne vont pas dans le dépôt public.

Chaque modèle intégré est noté dans `public/assets/CREDITS.md` : titre, auteur, lien, licence.
Si le jeu devenait commercial un jour, tous les modèles en licence NC devraient être retirés ou remplacés.
Les modèles marqués « NoAI » sur Sketchfab restent écartés : cette mention interdit de les donner à un programme d'IA.

## 13 novembre 2026 — Règle de décision visuelle et voitures du quotidien

- **Règle demandée par Houssem** : pour tout ce qui touche à l'apparence, Claude choisit lui-même la solution
  qui rend le jeu le plus beau, puis explique ce qu'il a fait. Les règles fixes restent : pas de données
  géographiques inventées, licences vérifiées, pas de code ni de ressources Rockstar.
- **Circulation** : les voitures calculées (formes simples) sont remplacées par les neuf modèles du
  « Generic Passenger Car Pack » (6 000 à 7 000 triangles chacun, roues séparées qui tournent et braquent).
  La peinture cuite dans les textures a été neutralisée pour que le jeu choisisse la couleur.
  Couleurs : surtout blanc et gris, comme dans les rues algériennes ; taxi jaune ; SUV noir (sa texture
  ne se laisse pas repeindre proprement).
- **Plaques algériennes** : blanche à l'avant, jaune à l'arrière, indicatif 23 (wilaya d'Annaba).
  Les numéros sont fictifs. La position est trouvée par lancer de rayon sur le pare-chocs.
- **Limites** : ce sont des voitures génériques, pas des modèles de marque (Symbol, Logan, Clio).
  Les vrais modèles sont listés dans `docs/ASSET_CATALOGUE.md` et doivent être téléchargés par Houssem.
  La licence du lot reste à confirmer sur sa page.

## 13 novembre 2026 (soir) — Défauts de chaussée et cité de la Ménadia

- **Trottoir qui passait par-dessus la chaussée** (taches claires en dents de scie aux carrefours en pente) :
  chaque ruban suit le relief à ses propres bords, donc un trottoir large pouvait dépasser de quelques
  centimètres la chaussée voisine. Les couches au sol (pistes, trottoirs, chaussées, carrefours) sont désormais
  dessinées après le reste, dans un ordre fixe et sans écrire de profondeur : la chaussée recouvre toujours le trottoir.
- **La Ménadia et les « 1000 logements »** : d'après les photos fournies par Houssem, les immeubles et tours
  de la zone (centre x 450, n 1885, rayon 210 m) reçoivent un style « cité moderne » : enduit blanc, fenêtres
  en bande, allèges et balcons jaune ocre. Les emprises et hauteurs restent celles d'OpenStreetMap ; seule la
  façade vient des photos. La limite de la zone est une estimation, à corriger sur place.
- Non fait : l'esplanade pavée avec ses arbres taillés et ses jardinières, les enseignes, la station-service.

## 13 novembre 2026 (20 h) — Conduite plus douce

Skills chargés avant de coder : `physics-tuning`, `game-feel`, `camera-systems`.
- **Volant progressif** : la touche ne braque plus les roues d'un coup. Le volant tourne à vitesse limitée
  (plus lentement à haute vitesse) et revient plus vite au centre. Les deux-roues répondent 1,5 fois plus vite.
- **Roues avant** : elles affichent l'angle réellement appliqué, la roue intérieure braquant un peu plus (Ackermann).
- **Caméra** : tous les lissages utilisent `1 - exp(-taux × dt)` (règle du skill camera-systems : même sensation à
  30 et à 144 images/s) ; la hauteur visée est lissée ; la caméra recule légèrement avec la vitesse.
- Référence étudiée : codingedger/car-game (Unity, GPL v3). Idées reprises, aucun code ni asset copié : ses voitures
  et sa carte viennent de jeux commerciaux (l'auteur le dit dans son README).
- `?voiture=identifiant` : choisit la voiture garée à la gare, pour les essais.

## 13 novembre 2026 (20 h 35) — Roues redressées, boîte de vitesses, son

Skill chargé en plus : `audio-design`.
- **Roues des véhicules algériens** : trois des quatre modèles étaient livrés roues avant braquées d'environ 25°
  (gendarmerie, ambulance, BRI). En tournant, elles « voilaient ». L'outil d'export mesure maintenant l'axe réel de
  chaque pneu et le remet dans l'axe de l'essieu avant de séparer la roue.
- **Boîte automatique à cinq rapports** : le moteur pousse fort en première puis de moins en moins, avec un court
  creux à chaque passage ; le régime suit la vitesse dans le rapport. Le rapport s'affiche à côté de la vitesse.
- **Son** (fabriqué en direct, aucun fichier) : moteur dont la hauteur suit le régime, crissement des pneus au frein
  à main et dans les virages pris trop vite. Touche P : couper ou remettre le son. Bus général à 0,3 avec limiteur.
- Idées reprises de codingedger/car-game (EngineManager) ; aucun code copié.
- Non vérifié : le son (le navigateur de test n'a pas de sortie audio) et la sensation de la boîte.

## 13 novembre 2026 (23 h 45) — Vitesse maximale par véhicule

Demande de Houssem : une vitesse maximale différente pour chaque voiture ; police, gendarmerie, ambulance et BRI
sans limite ; le BRI monte plus vite que les autres jusqu'à 100 km/h.
- Nouveaux champs du catalogue : `topSpeed` (km/h, `null` = aucune limite) et `sprint` (multiplie l'accélération
  jusqu'à 100 km/h). Le bonus d'élan en ligne droite (« boost ») est supprimé : la vitesse affichée est la vraie limite.
- Vitesses : mini 120, citadine 130, coupé 150, break 140, berline 145, grande berline 155, SUV 150,
  tout-terrain 140, taxi 135, pick-up 125, monospace 130, maxi-scooter 140, cyclomoteur 50.
  Police, gendarmerie, ambulance, BRI : aucune limite. BRI : `sprint` 1,4.
- Les rapports de la boîte s'étirent selon la vitesse du modèle.
- Mesuré sur la zone d'essai plate (?test=1) : à 3 s, BRI 108 km/h, police 91, berline 75 ; berline plafonne à 145,
  cyclomoteur à 50 ; BRI et police dépassent 190 km/h à 9 s et accélèrent encore.


## 14 novembre 2026 — Priorités

- Piétons : tout en bas de la liste, à ne pas proposer avant que tout le reste soit fait (demande de Houssem).
- Mode histoire, missions, poursuite policière, menu : aussi à la fin. Priorité actuelle : environnement et visuel uniquement.

## 14 novembre 2026 (1 h) — Lumière, ciel, reflets

Skill chargé : `threejs-materials-lighting`.
- Rendu filmique (ACES, exposition 1,05) ; soleil 3,4 plus chaud, lumière du ciel 1,05 plus bleue : plus de contraste
  entre soleil et ombre. L'eau applique aussi le rendu filmique (sinon elle tranchait).
- Ciel : halo chaud du côté du soleil près de l'horizon, dôme plus fin (48 × 24).
- Brouillard exponentiel (densité 0,00105) au lieu de linéaire : voile progressif dès les premières centaines de
  mètres ; l'eau utilise la même formule.
- Reflets : une petite copie du ciel (sol sombre, soleil très lumineux) devient la carte d'environnement. Seuls les
  véhicules passent en matériaux physiques (peinture vernie, vitres brillantes, pneus mats) ; les façades restent en
  Lambert pour ne pas coûter plus cher.
- Façades : le crépi photographié ne fait plus que nuancer la couleur (opacité 0,4 au lieu de 0,75) ; palettes
  d'immeubles et de maisons élargies (ocre clair, saumon pâle, jaune pâle).
- Gendarmerie ré-exportée avec une simplification plus fine (54 000 triangles) : la carrosserie n'est plus déchirée.

## 14 novembre 2026 (2 h) — Collisions, circulation, stade, Sheraton, gare maritime, palmiers

Skills chargés : `physics-tuning`, `game-ai`, `audio-design`, `threejs-materials-lighting`.
- **Son** : moteur deux fois moins fort ; coup sourd aux chocs ; klaxon des voitures bloquées derrière le joueur.
- **Collisions** : échange de quantité de mouvement selon les masses (≈ volume × 130 kg/m³, deux-roues 150 kg),
  restitution 0,25, rotation quand le choc n'est pas dans l'axe (point de contact = pare-chocs). Une moto percutée
  se couche et glisse. Une voiture de la circulation percutée n'est plus conduite : elle glisse puis reste sur place.
  Essai : berline à 54 km/h dans un SUV arrêté → le SUV recule de 3 m ; dans une mini, décalé de 1,5 m → elle pivote
  d'environ 60° ; dans une moto → la moto est projetée à 12 m et tombe, la berline continue.
- **Circulation** (machine à états : rouler / attendre / doubler / accidentée) : virages en courbe (Bézier de 7 m au
  plus) au lieu d'angles droits, freinage anticipé selon l'angle du virage (3,2 m/s² latéral), distance de sécurité,
  demi-tour en demi-cercle aux impasses. Devant un obstacle immobile : arrêt, klaxon après 1,2 s, dépassement après
  2 s si la voie d'en face est libre sur 30 m, et rabattement seulement après avoir dépassé toute la file.
  Essai sur rue d'essai, joueur debout sur la voie, 4 minutes : 36 dépassements, aucune voiture sur le joueur,
  aucun saut de direction.
- **Stades** : tout bâtiment OSM `stadium`/`grandstand`, ou posé dans une enceinte `leisure=stadium`, devient une
  tribune en gradins inclinée vers le terrain (stade Chabou : 4 tribunes). Tracés blancs sur les terrains de plus
  de 4 000 m². On ne devine pas un stade à partir d'un simple grand rectangle : beaucoup d'usines en sont aussi.
- **Bâtiments sur la chaussée** : les murs sont repoussés à 3,3 m au moins de l'axe des rues carrossables
  (1 288 bâtiments retouchés, 4 retirés car presque entièrement sur la chaussée). Écart assumé avec OSM.
- **Sheraton** : modèle sur mesure sur ses quatre emprises OSM (tour 66 m vitrée en résille, renflée à mi-hauteur,
  couronne, fente de balcons, « bulle » d'accueil blanche ajourée, socle et piscine). Pas d'enseigne ni de logo
  (marque déposée). La position exacte de la fente de balcons est approximative.
- **Gare maritime** : bâtiment de 110 × 30 m dans l'emprise OSM « Nouvelle gare maritime », d'après les photos du
  bâtiment réel (rez vitré, dalle grise, étage vitré bleu à grandes diagonales, enseigne arabe, clôture bleue).
  Les images de synthèse du projet (toit blanc courbe) n'ont pas servi. Le reste du port (quais, grues,
  entrepôts) n'est pas modélisé : OSM ne le décrit pas et il faut des photos.
- **Palmiers** : palmiers des Canaries (tronc épais, « ananas » brun, 30 palmes), écorce en losanges et pied chaulé à
  limite irrégulière (1,45 à 2 m, coulures, éclats). Rangée de palmiers devant la gare maritime (photo).
- **Végétation** : palmiers ramenés de 827 à 296 ; zones vertes OSM plantées environ deux fois plus densément
  (ficus, pins d'Alep, cyprès, massifs).

## 14 novembre 2026 (2 h 20) — Cours de la Révolution d'après photos

- **Bâtiment manquant** : l'îlot ouest du Cours (entre les rues Asla Hocine, Lamara Abdelkader, Zenine Larbi et la
  chaussée ouest du Cours) est vide dans OSM. Ajout d'un immeuble colonial de 22 m à pans coupés côté Cours
  (`MANUAL` dans tools/build_world.py), emprise calée sur les bords réels des rues. Ajout manuel, signalé comme tel.
- **Promenade** : la bande entre les deux chaussées devient une allée dallée claire (zone « plaza » calculée depuis
  les chaussées OSM, pas enregistrée dans la carte).
- **Arbres du Cours** : plus de remplissage aléatoire (avant : 4 rangées tous les 7 m avec décalages, plus des
  ficus au hasard dans les pelouses voisines et des palmiers). Maintenant deux alignements réguliers de grands
  ficus à écorce grise, un tous les 9 m, de part et d'autre de l'allée centrale (87 arbres).
- **Squares voisins** (place du théâtre) : pelouses plantées sobrement de palmiers isolés, d'araucarias (nouvelle
  espèce) et de massifs bas, comme sur les photos.

## 14 novembre 2026 (2 h 40) — Port de pêche et de plaisance

- **Bateaux** (src/world/Harbor.ts) : quatre familles modélisées d'après les photos du port — hors-bord (4 variantes
  de couleurs, majoritaires), barque de pêche traditionnelle, sardinier (lamparo : timonerie arrière, mât à lampes,
  filets), chalutier (coque bleue à pavois blanc, timonerie avant, portique arrière). Tailles variées (± 15 %).
- **Placement** : amarrés côte à côte, poupe au quai, le long du vrai trait de côte, uniquement dans les bassins
  abrités (la terre est proche dans au moins 10 directions sur 12) et hors des plages. Résultat : 162 bateaux
  (122 hors-bord, 22 barques, 13 sardiniers, 5 chalutiers).
- **Flottaison** : la houle est une onde qui traverse le bassin, donc deux bateaux voisins bougent presque
  ensemble ; un grand bateau monte, roule et tangue moins et plus lentement qu'un petit ; légère rotation sur les
  amarres. Amplitudes : 9 cm et 3° pour un hors-bord, environ moitié moins pour un chalutier.
- **Performance** : un tracé par modèle (InstancedMesh), soit 16 appels de dessin pour tout le port ; rien n'est
  animé ni affiché à plus de 1,3 km.
- **Conduite à venir** : chaque bateau est un objet `Boat` avec son gabarit, sa vitesse maximale et sa vitesse de
  giration ; `moored = false` le sortira du balancement pour le confier à un pilote.
- **Quais** : dans les ports (cercles `HARBOURS` de tools/build_terrain.py), le bord de l'eau devient un quai
  vertical au lieu d'une pente de plage : le fond marin ne remonte plus dans les bassins (avant, du sable
  affleurait sous l'eau le long des quais). Les vraies plages ne sont pas touchées.

## 14 novembre 2026 (2 h 45) — Hôtel Seybouse International

- Modèle sur mesure (src/world/Landmarks.ts) sur l'emprise OSM (way 165582442, 18 niveaux), d'après les photos :
  barre de 18 étages de 3 m sur 6 m de pilotis (60 m), loggias à garde-corps de verre coloré (rose, vert, bleu,
  orange, jaune, turquoise, violet, rouge) sur environ 6 baies sur 10, réparties sans ordre comme sur l'hôtel réel,
  nez de dalle et refends blancs, rez vitré en retrait, couronne de portiques blancs sur le toit.
- Pignon ouest : fresque arc-en-ciel, bande verticale qui s'enroule en spirale en bas. Le choix du pignon (ouest
  plutôt qu'est) n'est pas vérifié sur place.
- Les couleurs exactes de chaque baie ne sont pas relevées une à une : la répartition est aléatoire (tirage fixe).
- Pas d'éclairage de nuit (le jeu n'a pas encore de nuit) : les photos de nuit ont servi aux couleurs du verre.

