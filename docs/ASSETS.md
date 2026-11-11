# Ajouter ou remplacer un modèle 3D

Tout passe par un seul fichier : `public/assets/catalog.json`. Aucun code à modifier.

## Étapes

1. Dépose le fichier `.glb` (ou `.gltf`) dans `public/assets/models/` (les véhicules dans `models/vehicles/`).
   Sur github.com : ouvre le dossier, bouton « Add file » puis « Upload files ».
2. Ajoute ou modifie l'entrée correspondante dans `public/assets/catalog.json`.
3. Le jeu se reconstruit tout seul. Si le fichier manque ou est invalide, le jeu garde son modèle intégré.

## Budget conseillé (pour rester fluide)

| Type | Triangles | Poids | Textures |
|---|---|---|---|
| Voiture | 5 000 | 2 Mo | 512 à 1 024 px |
| Personnage | 3 000 | 3 Mo | 512 à 1 024 px |
| Arbre, mobilier | 500 à 1 500 | 0,5 Mo | 256 à 512 px |
| Bâtiment emblématique | 10 000 | 4 Mo | 1 024 px |

## Véhicule

```json
"vehicles": {
  "taxi": {
    "model": "models/vehicles/taxi.glb",
    "scale": 1,
    "rotationY": 0,
    "offset": [0, 0, 0],
    "length": 4.25, "width": 1.7, "height": 1.5,
    "wheelRadius": 0.3,
    "wheels": [[0.76, -1.3], [-0.76, -1.3], [0.76, 1.3], [-0.76, 1.3]],
    "keepWheels": false,
    "collision": { "halfLength": 2.1, "halfWidth": 0.85 },
    "centerOfGravityHeight": 0.5,
    "handling": { "maxSpeed": 34, "grip": 1.3 }
  }
}
```

- Le nom de l'entrée (`taxi`) est celui d'un véhicule existant : `mini`, `citadine`, `citadine-recente`, `compacte`,
  `berline`, `grande-berline`, `suv`, `suv-coupe`, `taxi`. Le modèle fourni le remplace.
- Pour un véhicule entièrement nouveau, choisis un autre nom et ajoute `"base": "berline"` (le modèle dont il hérite).
- `rotationY` (degrés) : l'avant de la voiture doit pointer vers +Z. `offset` : les roues doivent toucher y = 0.
- `wheels` : points de suspension `[x, z]` dans l'ordre arrière gauche, arrière droite, avant gauche, avant droite (x positif = gauche).
- `keepWheels: true` : on garde les roues du jeu, qui tournent et braquent. `false` : le modèle a ses propres roues (fixes).
- `handling` : tout réglage de `Handling` (voir `src/vehicles/physics/SuspensionPhysics.ts`) : masse, moteur, freins,
  adhérence, ressorts, amortisseurs...
- `"enabled": false` désactive une entrée ; on peut la tester quand même avec `?assets=nom` dans l'adresse.

Une entrée d'exemple (`exemple`, une caisse violette) est fournie, désactivée. Pour la voir :
`...?test=1&assets=exemple`.

## Personnage

```json
"character": { "model": "models/character.glb", "height": 1.78, "rotationY": 0,
               "animations": { "idle": "idle", "walk": "walk", "run": "run" } }
```

Le fichier doit contenir un squelette et trois animations ; `animations` donne leur nom dans le fichier.
Le personnage actuel est un mannequin provisoire (exemples officiels de three.js, modèle issu de Mixamo).
