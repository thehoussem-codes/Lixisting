# Modèles 3D utilisés dans le jeu

| Fichier | Titre | Auteur | Page | Licence |
| --- | --- | --- | --- | --- |
| models/player.glb | Retro PSX Male Pack (personnage 4) | jonniemadeit | https://sketchfab.com/3d-models/retro-psx-male-pack-by-jonniemadeit-82c270a7123a492dae842fa2e9edeed3 | À confirmer sur la page |
| models/character.glb | Xbot (squelette et animations) | three.js examples / Mixamo | https://github.com/mrdoob/three.js | Voir docs/ASSETS.md |
| models/vehicles/gendarmerie.glb | Skoda Rapid Spaceback (Gendarmerie nationale), allégé | à compléter | page Sketchfab à préciser | À confirmer |
| models/vehicles/ambulance.glb | Renault Master (Protection civile), allégé | à compléter | page Sketchfab à préciser | À confirmer |
| models/vehicles/police.glb | Fourgon de police algérien, allégé | à compléter | page Sketchfab à préciser | À confirmer |
| models/vehicles/bri.glb | Véhicule BRI, allégé | à compléter | page Sketchfab à préciser | À confirmer |
| models/vehicles/{mini,citadine,coupe,break,berline,suv,tout-terrain,pickup,monospace}.glb | Generic Passenger Car Pack (9 voitures séparées, peinture neutralisée, textures réduites à 512 px) | à compléter | page Sketchfab à préciser | À confirmer |

## Idées de conduite

Le lissage du volant (vitesse de rotation limitée, plus lente à haute vitesse, retour rapide au centre) et l'épure d'Ackermann s'inspirent du projet libre [codingedger/car-game](https://github.com/codingedger/car-game) (GPL v3). Aucun code ni fichier de ce projet n'a été copié : notre version est réécrite pour notre moteur.


## Végétation vue par satellite

Emplacement des forêts, broussailles et prairies : **ESA WorldCover 10 m 2021 v200**, licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.
Données extraites par `tools/extract_landcover.py` dans `data/landcover/`.

## Profondeur de la mer

Fonds marins : **EMODnet Bathymetry**, modèle numérique moyen (maille 1/16 de minute), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Repli possible : NOAA ETOPO1 (domaine public). Extraction : `tools/extract_bathymetry.py` ; carte du jeu : `tools/build_sea.py` → `public/world/sea.png`.

## Bâtiments détectés sur images aériennes

Empreintes de bâtiments absents d'OpenStreetMap, détectées automatiquement sur des images aériennes et satellite : **Microsoft Global ML Building Footprints** et **Google Open Buildings**, réunies par la **Overture Maps Foundation** (thème « buildings »), licence [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Extraction : `tools/extract_buildings.py` → `data/buildings/` ; ajout dans la ville (seulement là où OSM n'a rien) : `tools/build_world.py`. Hauteurs estimées d'après la surface au sol.

## Wilaya d'Annaba autour de la ville (détail léger)

- Routes, rues des villes, côte, voies ferrées, rivières, lacs, pistes, villes et villages, limites des wilayas : © contributeurs **OpenStreetMap**, licence [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) (`tools/extract_region.py`, requêtes Overpass).
- Bâtiments : **Overture Maps Foundation** (OSM, Microsoft, Google), ODbL.
- Relief : **Terrain Tiles** (AWS Open Data, format Terrarium ; sources SRTM et autres, voir la page du jeu de données), zoom 11, environ 60 m.
- Sol et forêts : **ESA WorldCover 10 m 2021 v200**, CC BY 4.0.
- Fonds marins : **EMODnet Bathymetry**, CC BY 4.0.
Fabrication : `tools/build_region.py` (relief, routes, bâtiments en boîtes orientées) et `tools/build_sea.py` (carte de la mer de la wilaya).
