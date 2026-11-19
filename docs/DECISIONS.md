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


## Sous-Terrain de la place (ex-église Sainte-Monique) et abords du Sheraton

- **Sous-Terrain** : la première version (petit édifice octogonal au milieu de la place) est remplacée, voir
  « Complexe commercial surélevé » plus bas.
- **Terrain percé** : `Terrain.cutHole()` découpe exactement le maillage du relief selon un polygone convexe, et le
  jeu remplace la hauteur du sol par celle des paliers, des marches et de la halle (`LandmarkEdits.ground`).
- **Abords du Sheraton** (`src/world/SheratonGrounds.ts`, le modèle de l'hôtel n'est pas changé) : clôture muret
  blanc + grille noire + piliers le long du boulevard Victor Hugo et à l'ouest, ouverte à l'allée d'entrée (poste de
  garde et barrière) et à un portillon piéton ; chemin dallé jusqu'au parvis ; marquise, portes vitrées et trois
  mâts aux couleurs algériennes devant l'entrée ; pelouses à bords nets qui suivent les voies OSM ; palmiers alignés
  (clôture, terre-plein de l'allée, bordure ouest, piscine) à la place des arbres posés au hasard ; ombrières
  blanches sur les deux parkings (le long des allées OSM) ; piscine extérieure au nord-ouest ; court de tennis.
- **Correction** : l'emprise du socle de l'hôtel n'était pas reconnue (centre décalé de 6 m), si bien que le jeu
  affichait un immeuble générique de 22 m à sa place. Le socle de 9 m prévu est maintenant construit, et le court
  de tennis que montre le satellite est posé sur son toit (la piscine, qui y était, est descendue au sol, au
  nord-ouest, là où le satellite la montre).

## Théâtre régional Azzedine Medjoubi

- `src/world/Theatre.ts`, à la place de l'immeuble générique sur l'emprise OSM (way 341076691), façade vers le
  Cours (est). D'après les photos : volume ivoire années 1950 aux angles avant arrondis et à corniche mince,
  cadre blanc en saillie avec cinq hautes baies bleues à petits bois, cartouche doré au-dessus (motif ornemental,
  pas de texte inventé), rez-de-chaussée jaune en retrait sur quatre colonnes jaunes, marquise noire à bord arrondi
  portant « المسرح الجهوي عز الدين مجوبي » en doré, perron praticable, comble en pyramide gris (carte postale).
- Parvis dallé dégagé : aucun arbre devant la façade (filtre des arbres). Les deux arbres des côtés (OSM) sont
  dans des massifs bas ; celui du nord est décalé de 4 m pour laisser la façade dégagée. Potelets à chaînes et deux
  lanternes au bord du trottoir (photo panoramique).
- Le nom en arabe s'affiche aussi en bas de l'écran à moins de 45 m du parvis.
- Ficus : tronc chaulé au pied avec la même limite irrégulière que les palmiers (texture dédiée, écorce lisse).
  Appliqué à tous les ficus d'alignement, pour que les arbres de rue soient cohérents dans toute la ville.
- Hauteurs estimées à vue sur les photos : façade 18 m, corps 13 m, pyramide 20,5 m.

## Complexe commercial surélevé du Cours (remplace le petit Sous-Terrain octogonal)

- `src/world/SousTerrain.ts`, d'après l'image de conception de Houssem, adaptée à la place réelle : toute la place
  vide entre le boulevard Zighout Youcef, la rue du 24 Février et le chemin des Caroubiers (38 × 51 m), trottoirs et
  chaussées conservés, circulation non bloquée.
- Socle jaune (même jaune que le précédent modèle) portant une esplanade dallée à 4,2 m au-dessus du trottoir le
  plus haut ; garde-corps en fer forgé à volutes et lampadaires à trois globes ; grand bâtiment jaune aveugle au fond
  (35 × 21 m, 8,5 m au-dessus de l'esplanade, pilastres, soubassement, corniche, sans fenêtres).
- Grand escalier central de 16 m de large depuis le trottoir, trois volées séparées par des rampes noires ; le
  lampadaire générique qui tombait au pied de l'escalier est retiré.
- De chaque côté de l'escalier, une entrée sous l'esplanade mène à une galerie semi-enterrée (sol au niveau du
  trottoir, l'esplanade au-dessus) : boutiques de vêtements et de maillots de football (dessins génériques, aucun
  écusson ni marque réels), enseignes bilingues, portants, étal de vendeur, néons.
- Mur de gauche (côté boulevard Zighout Youcef) : fresque de street art dessinée par programme (lettres bulles
  ANNABA, BÔNE, 23, HIP HOP, personnages, tags, coulures).
- Deux niveaux superposés : les obstacles ont maintenant une plage de hauteur (`Collider.addBuilding(points, yMin,
  yMax)`) et le sol tient compte de la hauteur du joueur, pour qu'on circule sur l'esplanade au-dessus des galeries
  et dans les galeries en dessous.

## Îlot complet jusqu'à la Grande Poste ; angles arrondis du complexe

- Le complexe commercial a maintenant les angles arrondis (rayon 4,5 m, comme la place sur le satellite), son
  bâtiment du haut aussi (3 m). Les galeries ont été resserrées (6 m de large) pour rester dans la partie droite de
  la façade ; l'étal du vendeur est passé au fond de chaque galerie.
- `src/world/GrandePoste.ts` : OSM n'a aucun bâtiment entre le complexe et la rue au nord (seulement le point du
  bureau de poste). D'après la vue satellite : La Grande Poste (quadrilatère colonial autour d'une cour avec un
  palmier, pavillons d'angle, toits de tuiles orange en croupe, ≈ 40 × 66 m) et, au nord, un grand immeuble à toit
  plat autour d'une cour plantée ; entre le complexe et la Poste, stationnement et grands arbres. Emprises calées sur
  le satellite (±2 m), hauteurs estimées (13 à 15 m), façades du générateur colonial.

## Extension à toute la ville d'Annaba (point 16)

- **Emprise** : sans la capture annotée (non reçue), lecture retenue = toute la ville. Rectangle 36,845–36,980 N,
  7,685–7,815 E (≈ 11,6 × 15 km) : du Cap de Garde à El Bouni et à l'embouchure de la Seybouse, de la Plaine Ouest /
  Oued Forcha et des pentes de l'Edough à la mer et Sidi Salem. Avant : 6,2 × 11 km.
- **Données** : nouvelle extraction OpenStreetMap (par l'action GitHub) et relief Terrain Tiles sur cette emprise.
  19 579 bâtiments (10 403 avant), 3 218 tronçons de voies (1 834), 103 000 plantes. La latitude de référence de la
  projection reste 36,93 : les lieux modélisés à la main gardent leurs coordonnées (vérifié : 9 520 bâtiments de
  l'ancienne zone inchangés, Sheraton / théâtre / complexe / port intacts).
- **« Entourée par la mer »** : Annaba n'a la mer qu'au nord et à l'est. À la demande de Houssem, les bords sud et
  ouest de la carte deviennent une **côte inventée** (`edge_shore` dans `tools/build_world.py`) : rivage ondulé 20 à
  180 m à l'intérieur du rectangle, relief qui descend vers lui (350 m en plaine, jusqu'à 900 m au pied de l'Edough),
  bâtiments et voies coupés avant l'eau. Ce n'est pas la géographie réelle : à corriger si Houssem préfère un bord
  terrestre noyé dans la brume.
- **Secteurs et chargement progressif** :
  - les grands maillages d'un seul tenant (terrain, chaussées, trottoirs, marquages…) sont découpés en secteurs de
    400 m (`src/world/Sectors.ts`) et affichés seulement à moins de 1 400 m ;
  - la végétation est construite au fur et à mesure autour du joueur (`TreeStream` dans `Trees.ts` : construction à
    680 m, affichage à 520 m, libération à 1 420 m) ;
  - mesuré ici (rendu logiciel) à la place du Cours : chargement 16 s (15 s avec l'ancienne petite carte, 27 s avant
    ces deux mesures), 463 000 triangles affichés (668 000 avec l'ancienne carte), mémoire 530 Mo (490 Mo).
  - Limite : les bâtiments et les voies sont encore tous construits au chargement (≈ 7 s ici) ; seul leur affichage
    est progressif. Pas encore de modèles simplifiés au loin : au-delà de 1 400 m, la brume cache tout.
- **Détails de rue réels** (`src/world/StreetDetails.ts`, données dans `annaba.json`) : uniquement ce qui est
  cartographié dans OSM, à sa place : 121 murs / clôtures / remparts / murs de soutènement, 25 portails en travers
  d'une voie (piliers et vantaux ouverts), 33 parkings (enrobé et places tracées), bancs et arrêts de bus tournés
  vers la chaussée. Hauteurs et aspect : valeurs types (OSM ne les décrit pas). Les clôtures et parkings qui ne sont
  pas dans OSM restent à faire lieu par lieu d'après des vues satellite.
- `locations.json` (fiches de lieux) reconstruit sur la nouvelle emprise.
- Non traité dans cette étape : la passe « netteté des arêtes et surfaces » (section 4 de la demande).

## Forêts, troncs, lissage général (retour de Houssem)

- **Forêts** : tout terrain naturel (à plus de 45 m des bâtiments, hors plages / terrains / parkings / parcs) est
  boisé, un arbre pour 150 m² : pins de forêt et chênes (modèles allégés), cyprès, buissons ; bois OSM 1 pour 80 m².
  437 000 plantes au total, construites au fur et à mesure autour du joueur. Sol naturel vert sombre, pour que les
  collines lointaines (au-delà des 520 m d'affichage des arbres) se lisent comme boisées. Emplacements tirés au
  hasard (décor plausible) ; la plaine agricole du sud est boisée aussi, à corriger si besoin.
- **Tronc chaulé** seulement à moins de 12 m d'une rue (ficus et palmiers d'alignement) ; tronc nu ailleurs.
- **Lissage** : angles des bâtiments arrondis (`roundCorners` dans Buildings.ts : coins de 35° à 145° entre deux murs
  d'au moins 5 m, rayon ≈ 1,2 m), textures filtrées (plus de gros pixels), anticrénelage activé.
  Coût à surveiller sur l'Intel UHD 630 : l'anticrénelage et les forêts ; la résolution automatique compense.

## Maisons algériennes, arcades, stores, corniches ; forêts jointives

- `src/world/Houses.ts` : chaque emprise OSM « maison » devient une villa algérienne (façade tirée d'un rendu du
  modèle « Algerian villa » fourni par Houssem : garage à rideau, soubassement de pierre, balcon à balustres, dalle
  débordante terre cuite), une villa enduite à toit de tuiles et balcon en fer forgé, une maison en brique en cours
  de construction (fers en attente sur la dalle) ou, autour de la Vieille Ville, une maison blanche à porte cintrée
  bleue. Façade principale = mur le plus proche d'une rue. Citernes d'eau sur les toits plats.
- Immeubles coloniaux sur rue commerçante : vraies arcades en 3D (piliers, arcs en plein cintre, galerie de 2,8 m
  où l'on circule, vitrines au fond). Stores en toile au-dessus des vitrines ; corniche en saillie en tête des
  immeubles. Les angles arrondis de l'étape précédente sont retirés (mal compris).
- Forêts : un arbre pour 95 m², houppiers élargis, les arbres se touchent (664 000 plantes, modèles allégés).

## Version téléphone

- `src/engine/Mobile.ts` détecte un écran tactile sans souris (`?mobile=1` pour forcer, `?mobile=0` pour couper).
- `src/ui/TouchControls.ts` : joystick à gauche (poussé au bord = courir), glisser ailleurs = caméra, boutons SAUT
  (aussi frein à main), voiture, carte. Les commandes passent par la même classe `Input` que le clavier.
- Écran « tourne ton téléphone » en vertical ; plein écran et verrouillage horizontal au premier contact là où le
  navigateur l'accepte (Android ; pas Safari sur iPhone, où il faut « Ajouter à l'écran d'accueil »).
- Mode allégé : pas d'ombres ni d'anticrénelage, résolution 0,7 (ajustée ensuite automatiquement), vue à 850 m avec
  brouillard plus dense, arbres affichés à 360 m, une plante de forêt sur deux (houppiers élargis).
- Vérifié en émulation téléphone (844 × 390) : joystick, caméra au doigt, écran vertical. Pas sur un vrai téléphone.

## Plantage sur téléphone : mémoire

- Cause probable : pic de 1,67 Go de mémoire JavaScript pendant la construction de la ville (+ ≈ 460 Mo de
  géométrie), au-delà de ce qu'un navigateur de téléphone accorde à un onglet.
- `MeshBuilder` stocke désormais sommets, couleurs (1 octet par canal), coordonnées de texture et indices dans des
  tableaux typés qui grandissent par doublement, libérés après `build()` ; indices sur 16 bits quand c'est possible.
- Décor fixe : la copie en mémoire des maillages est libérée dès leur envoi à la carte graphique.
- Téléphone : pas de corniches, de stores, de balcons d'immeubles ou de maisons, ni de citernes (moitié moins de
  géométrie de bâtiments).
- Mesuré en émulation téléphone : pic 1 670 → 543 Mo, mémoire après chargement 687 → 373 Mo, géométrie 462 → ≈ 295 Mo.

## Qualité et fluidité sur ordinateur (retour de Houssem : « baisse de qualité et de fluidité »)

- Cause : forêts très denses (664 000 plantes) et nouveaux détails → images par seconde en baisse → la résolution
  automatique descendait jusqu'à 0,5 et coupait les ombres (image floue), et la construction des blocs d'arbres en
  jeu (jusqu'à 6 ms par image) donnait des à-coups.
- Forêts : un arbre pour 150 m² mais houppiers plus larges (les arbres se touchent toujours) : 453 000 plantes.
- Arbres construits un bloc par image (2,5 ms au plus) en jeu.
- Résolution automatique jamais sous 0,7.

## Rues à niveau, maisons hors chaussée, garage, netteté

- **Rues à niveau** (`build_terrain.py`) : toutes les rues carrossables de la ville reçoivent une plate-forme :
  horizontale en travers (les deux bords à la même hauteur), profil en long adouci (relief lissé à ~30 m puis
  moyenne glissante sur ~50 m, jamais à plus de 1 m du terrain naturel). Les rues qui se croisent partagent le même
  champ lissé, donc la même hauteur au carrefour. Murs de soutènement là où la rue entaille la pente de plus de 1,5 m.
  Mesuré sur 293 rues tirées au hasard : écart de hauteur entre les deux bords 0,43 m → 0,07 m en moyenne
  (90 % des rues : 1,06 m → 0,26 m). Terrain : 312 000 points (fichier 15 Mo, contre 6,6 Mo).
- **Maisons sur la chaussée** (`build_world.py`) : seconde passe de recul avec la largeur finale de chaque chaussée
  (+ 35 cm) et les voies de service : 1 565 bâtiments reculés.
- **Garage de l'Est** (`src/world/Garage.ts`, OSM way 341068653, shop=car, près de la gare) : hall vitré, enseigne,
  trois grandes portes ; toutes les voitures normales du jeu et les deux-roues y sont exposés et conduisibles
  (13 véhicules ; police, gendarmerie, BRI et ambulance exclus). Repère sur la carte.
- **Netteté** : sur écran Retina, la résolution monte jusqu'à 1,5 pixel par point quand le jeu est fluide ; elle
  change moins souvent (toutes les 3 s au plus), chaque changement coûtant une image saccadée.
- « Voitures du PDF » : aucun PDF reçu ; toutes les voitures des fichiers fournis sont déjà dans le jeu, sauf la
  Mercedes G63 de police (non intégrée).

## Véhicules utilitaires (Kenney Car Kit, CC0)

- Aucune autre voiture n'était exploitable dans les fichiers fournis (Mercedes G63 de police : archive .rar que
  l'environnement de travail ne sait pas ouvrir ; scooter indien : un seul bloc, roues non séparées).
- Ajout de 7 véhicules du Car Kit de Kenney (CC0, domaine public), à l'échelle réelle par la largeur : fourgon,
  camion à caisse, camion plateau, camionnette plateau, benne à ordures, pompiers (Protection civile, sans limite de
  vitesse, absent du garage) et tracteur. Roues séparées (elles tournent), textures intégrées.
- Style plus simple et plus « jouet » que le pack de voitures : à retirer si Houssem le juge trop différent.
- Ils roulent dans la circulation (plus rares que les voitures) et sont exposés au Garage de l'Est (19 véhicules).

## Retrait des véhicules Kenney — véhicules réalistes uniquement (18/11/2026)

- Les 7 véhicules Kenney (style jouet, formes carrées) ont été retirés à la demande du propriétaire du projet.
- **Règle permanente** : le jeu est réaliste, dans l'esprit GTA. Seuls des modèles de véhicules réalistes (proportions réelles, vraies marques/modèles du parc algérien) sont acceptés. Jamais de modèles jouets, cartoon ou « low-poly stylisés carrés ».
- Recherche dans les fichiers envoyés : Skoda Rapid gendarmerie, Renault Master ambulance, fourgon police et BRI sont déjà dans le jeu, ainsi que le pack générique de 9 voitures. La Mercedes G63 police est dans une archive .rar qui ne peut pas être ouverte ici : à extraire sur le Mac et renvoyer.

## Commandes tactiles simplifiées (18/11/2026)

- Joystick à gauche : directions seulement. Pousser vers l'avant ne fait plus avancer la voiture ; tirer vers l'arrière freine puis recule.
- À droite, boutons texte simples (sans logo) : AVANCER/ACCÉLÉRER (gros bouton), SAUTER/FREIN À MAIN, MONTER/SORTIR. Les libellés changent quand on est dans un véhicule.
- La mini-carte en haut à gauche s'ouvre en plein écran d'un toucher ; plus de bouton « carte ».

## Routes d'avant, lissées ; toits franchissables ; végétation satellite ; boutons ronds (18/11/2026)

- **Routes** : le nivellement de toutes les rues (plates-formes ajoutées au maillage, 18/11 01h48) est retiré à la demande de Houssem : il créait des marches et des bosses (« on saute de partout »). Retour au terrain d'avant, mais le relief à 30 m est lissé sous les rues carrossables et jusqu'à 20 m autour (fondu jusqu'à 45 m), plus fortement dans les rues en pente. Les maisons repoussées hors des chaussées restent repoussées.
- **Toits** : chaque maison et chaque immeuble a un toit pour les collisions (plat, terrasse ou à quatre pentes). Les murs ne bloquent que sous le toit : à pied (saut) ou en voiture (saut depuis une pente), on peut passer au-dessus, se poser sur le toit et y marcher ; en sortant du bord, on tombe. Mosquées, gradins et monuments restent pleins.
- **Voitures** : on peut sauter par-dessus une voiture et se poser sur son toit ; deux voitures l'une au-dessus de l'autre ne se percutent plus.
- **Végétation** : source satellite ESA WorldCover 10 m (2021, CC BY 4.0). Arbres → forêt serrée de pins et chênes ; broussailles → maquis clair ; herbe → quelques plantes ; ville, port, cultures, sol nu → rien. Les bois OSM ne sont plantés que là où le satellite voit du vert. Arbres d'alignement seulement sur les grandes avenues, jamais sur le port de pêche. Couleur du sol d'après la même carte.
- **Téléphone** : trois boutons ronds — pédale d'accélérateur (dessin, aucun emoji n'existe), FREIN (au volant seulement, frein à main) et 🚗 pour monter/sortir. Plus de bouton sauter.

## Corniche Chapuis d'après la vidéo de Houssem (18/11/2026)

- Source : 11 captures d'une vidéo « CORNICHE CHAPUIS » (trajet vers le nord, mer à droite), recalées sur une vue aérienne Esri World Imagery utilisée seulement comme repère (téléchargée par une action GitHub, jamais mise dans le jeu ni gardée dans le dépôt).
- Nouveau module `src/world/Chapuis.ts` : hôtel jaune ocre (tour à fenêtres en arc, aile basse à arcades, pavillons à toits de tuiles, clôture), tour ronde blanche à bandeaux de balcons et commerces, restaurant Savannah (cadre d'acier rouge, enseigne), « Machawi La Marina », tour blanche et tour en brique au bout ; promenade côté mer (bande de briques rouges, pavés gris, muret), palmiers, lampadaires à un bras et à deux bras sur le terre-plein, corbeilles, panneau « Plage Rizzi Amor » ; villas blanches et murets à grille verte côté ouest.
- Six emprises OSM remplacées ; les autres bâtiments d'OSM restent. Emprises tenues à au moins 1 m des rues d'OSM.
- Limites : hauteurs comptées sur la vidéo ; tours du bout placées à ±15 m (vue aérienne penchée) ; nom de l'hôtel illisible, donc non inventé. Pas encore faits : la sculpture « 6 » du rond-point, les bâtiments blancs à arcades et l'immeuble à frise mauresque après le virage.
- Corniche plate (retour de Houssem : « la route est bien droite et plate » sur la vidéo) : `build_terrain.py` pose un couloir de points (axe tous les 4 m, 9 rangées en travers, des murets des villas au muret de la promenade) tous à la même hauteur en travers ; en long, le relief adouci sur ~80 m (5,3 m au sud → 6,9 m au nord), raccordé au terrain sur 30 m aux deux bouts ; mur de soutènement côté terre si le talus dépasse 1,2 m. Mesuré dans le jeu : 8 cm d'écart en travers au plus.

## Corniche Saint-Cloud d'après la vidéo de Houssem (19/11/2026)

- Source : 16 captures de la vidéo « CORNICHE SAINT-CLOUD » (trajet vers le nord-ouest, mer à droite) et une photo de la promenade ; vue aérienne Esri comme simple repère (non gardée).
- `build_terrain.py` : les couloirs plats sont maintenant une liste (`CORNICHES`) ; Saint-Cloud ajouté (684 m, 3,1 → 4,7 m, plat en travers, de la bordure côté terre au bord de la promenade).
- Nouveau module `src/world/SaintCloud.ts` : promenade en grandes dalles grises claires et foncées, garde-corps métallique, grands lampadaires gris au mât courbe, palmiers (surtout dans la seconde moitié), bancs face à la mer, corbeilles, cabines rouge et bleue, passages piétons jaunes, hauts murs crème à portails côté terre ; la tour crème sur pilotis (emprise OSM), l'immeuble à bandes cyan et portail bleu, la pizzeria « MEGA PIZZA » (piliers rouges, grille), le mur peint « EDEN DES ANGES », l'immeuble à cage d'escalier vitrée bleue, le long bâtiment à véranda brune, la rangée « BOUREK ANNABA » à soubassement bleu ; enduits crème et ocre sur les bâtiments OSM de la rive, une villa jaune.
- Limites : emplacements le long de la route estimés d'après l'avancement de la vidéo (±20 m) ; la pizzeria n'est pas dans OSM (ajoutée d'après la vidéo et la vue aérienne) ; beaucoup de villas visibles sur la vue aérienne manquent dans OSM et ne sont pas encore ajoutées.

## Mer réaliste (19/11/2026)

- Profondeur réelle : EMODnet Bathymetry (CC BY 4.0) téléchargée par une action GitHub (`data/bathymetry/`), fondue avec une pente régulière près du rivage (la maille de 115 m est trop grossière pour les petits fonds) ; carte du jeu `public/world/sea.png` (distance au rivage, profondeur, terre) faite par `tools/build_sea.py`.
- Surface : quatre houles de Gerstner venant du nord-est (42, 25, 15 et 9 m de longueur d'onde), amorties dans les petits fonds ; rides fines par carte de normales ; couleur selon la profondeur (turquoise transparent sur le sable → bleu profond) ; reflet du ciel par Fresnel ; éclat du soleil ; écume au bord de l'eau, rouleaux qui avancent vers la plage, moutons sur les crêtes au large.
- Fond marin visible par transparence : sable, plus sombre en profondeur, taches d'herbiers.
- La même houle est calculée en JavaScript (`waveHeight`, `Water.heightAt`) pour faire flotter les bateaux.
- Corrigé au passage : les points du rivage ne sont plus retirés près des corniches (ils décalaient tout le talus sous-marin), et le talus a ses propres sommets (le sable du rivage n'est plus assombri en dents de scie).

## Bateau à moteur au ponton de la plage Toche (19/11/2026)

- Ponton de jeu en bois sur pieux (34 m vers le large, perpendiculaire à la côte d'OSM, au droit du repère « Plage Toche ») : aménagement inventé pour le jeu, pas un ouvrage relevé sur place. Panneau « PONTON TOCHE ».
- Deux opens de 6,2 m amarrés de part et d'autre (`src/vehicles/Boat.ts`, modèle fait en code) : coque en V section par section (antifouling rouge sous la flottaison, liseré bleu ou rouge, liston sombre), console à tribord avec pare-brise et volant, siège-appui, banquette arrière, plateforme avant, balcon en inox, moteur hors-bord gris.
- On monte et descend avec F (ou 🚗 sur téléphone), comme une voiture : depuis le ponton ou à la nage. En descendant près du ponton on se retrouve dessus, sinon à l'eau à côté du bateau. Le pilote reste debout derrière la console.
- Conduite : W/S gaz et marche arrière, A/D barre, Espace pour casser l'erre. Environ 58 km/h en pointe (31 nœuds), 0 → 46 km/h en 3 s ; la barre n'agit qu'avec de la vitesse ; le bateau dérape un peu en virage.
- Flottaison : la hauteur de l'eau est lue sous l'étrave, la poupe et les deux bords avec la même houle que la mer affichée ; pilonnement, tangage et roulis suivent par ressorts amortis ; en vitesse l'étrave se lève (déjauge) et le bateau se couche dans les virages. Mesuré : ±0,5 m de pilonnement au large, 5 à 8° de cabrage en pleine vitesse, 7 à 12° de gîte en virage serré.
- Il s'arrête avant la plage (moins de 0,7 m de fond, ou sol réel trop haut) et heurte les pieux.
- Sillage : remous blanc derrière le moteur et deux bras en V qui s'écartent selon l'angle de Kelvin (19,5°), qui s'effacent en quelques secondes.
- Un masque invisible au niveau du plat-bord empêche la surface de la mer d'apparaître sur le pont dans le creux des vagues.
- Fond marin : même grain de sable que le terrain ; près du bord, pente douce juste au-dessus du talus de la plage puis vraie profondeur entre 24 et 90 m ; bords des herbiers fondus (une ligne nette suivait l'isobathe des 4 m).
- Vérifié dans Chrome sans carte graphique (1 à 2 images/s) : montée et descente (ponton et nage), pleine vitesse, virages, marche arrière, arrêt devant la plage. Pas encore essayé sur un vrai Mac ni sur téléphone.

## Bâtiments manquants, d'après les images aériennes (19/11/2026)

- Source : Overture Maps (thème buildings, ODbL), qui réunit OSM et les bâtiments détectés automatiquement sur images aériennes et satellite par Microsoft (Global ML Building Footprints) et Google (Open Buildings). Téléchargé par une action GitHub pour toute la wilaya (253 283 bâtiments : 116 719 OSM, 89 384 Microsoft, 47 180 Google), dans `data/buildings/`.
- Dans la ville : 18 805 détections candidates, 12 874 ajoutées (32 452 bâtiments au total au lieu de 19 578). Écartées : confiance Google sous 0,7 (2 613), moins de 20 m² (surtout des annexes) ou plus de 6 000 m² (2 407), chevauchement avec OSM ou doublon (89), ports (conteneurs et navires), plages, terrains de sport, promenades des corniches refaites à la main (570), faux rivage du bord de carte (176). Sur téléphone, les détections de moins de 45 m² ne sont pas affichées (mémoire de la carte graphique).
- Les bâtiments OSM gardent leur numéro (les détections sont ajoutées à la fin). Les détections sont reculées hors de toute la chaussée et de son trottoir (elles sont moins précises que les rues d'OSM) : les rues ne sont pas rétrécies pour elles ; 76 détections presque entièrement sur une chaussée retirées.
- Hauteurs : aucune mesure dans ces données pour l'Algérie ; estimées d'après la surface au sol (2 à 5 niveaux), comme les bâtiments OSM sans étiquette. Usage inconnu : maison sous 170 m² et 10 m, immeuble au-delà.
- Effet visible : les îlots vides des quartiers ouest et sud (Plaine Ouest, Boukhadra, El Bouni…) et l'intérieur de Saint-Cloud sont maintenant bâtis comme sur les vues aériennes. Essai : `?detectes=0` pour revoir la ville avec OSM seul.
- Limites : les détections automatiques peuvent manquer des bâtiments, en fusionner deux mitoyens ou en voir un de trop ; formes simplifiées (contours au plus près de 0,4 m).

## Toute la wilaya autour de la ville (19-20/11/2026)

- Zone : de Chetaïbi à l'ouest jusqu'à la limite d'El Tarf à l'est, et au sud jusqu'à Guelma (36,55-37,12° N, 7,20-8,10° E, environ 80 × 63 km). Les abords (El Tarf, Guelma, Skikda) sont dans la même zone, avec le même détail léger. La limite de la wilaya d'Annaba (OSM) est tracée sur la carte.
- Données : OSM par Overpass (côte, 7 867 routes et rues hors de la ville, voies ferrées, rivières, lacs, pistes, 144 villes et villages, limites), relief Terrain Tiles au pas de 60 m, sol ESA WorldCover, bâtiments Overture (178 728 hors de la ville, en boîtes orientées : rectangle le plus serré autour du vrai contour).
- Rendu : cases de 1 km construites autour du joueur au fur et à mesure (une par image) et libérées quand il s'éloigne : relief coloré selon le sol (sable au bord de l'eau, falaises), routes posées sur le relief (ponts en ligne droite), rivières et lacs, bâtiments à façades (maisons, briques, ciment, immeubles), forêts de chênes et de pins d'après WorldCover.
- Plus de faux rivage autour de la ville : la terre continue au-delà du rectangle. Sur les 200 derniers mètres, le relief détaillé rejoint celui de la wilaya ; mesuré aux passages de routes : moins de 10 cm de marche (après correction d'un écart de 1 m dû au lissage des rues). Les cases du bord passent 15 cm sous la ville.
- Mer : deuxième carte de la mer (pixels de 48 m) pour toute la côte de la wilaya, fondue avec celle de la ville ; le bateau peut aller partout.
- Une voiture garée dans chaque ville et village (45 au plus). Carte (M) : toute la wilaya, clic sur une ville pour y aller (on arrive au bord de la rue la plus proche).
- Téléphone : cases construites moins loin, image de la carte deux fois plus petite (mémoire).
- Corrigé en passant : 807 bâtiments OSM marqués « usage certain » s'affichaient en noir (le drapeau était pris pour une couleur).
- Limites : détail léger (pas de trottoirs ni de feux, bâtiments en boîtes, relief à 60 m) ; pas de circulation hors de la ville ; Lac Fetzara figure en eau d'après OSM.
