# Lixiting asset catalogue

Status on 12 November 2026. Nothing in the "Models" tables is integrated; integration waits for review.
Only the eight textures at the bottom are already in the game.

## How each asset is judged

| Criterion | What it covers | Scale |
| --- | --- | --- |
| Visual | Realism, detail, proportions, fit with the GTA San Andreas / Vice City direction | 1 to 5, or "not seen" when only file data was inspected |
| Technical | Triangles, textures, format, scale, rig, how well it can be optimised, three.js compatibility | 1 to 5 |
| Licence | Exact licence, credit, non-commercial limits, and whether the original file may sit in the public repository | Text |
| Annaba fit | How much it helps recreate Annaba specifically, not a generic city | 1 to 5 |

Rules: the project is personal and non-commercial, so NC licences are accepted. A high triangle count alone
does not reject a model; the question is whether it survives reduction. "Licence: to confirm" means the
licence label on the Sketchfab page has not been reported yet.

Triangle budget for reference: the whole visible scene is about 500,000 triangles.

## A. Uploaded models, measured from the files

### Algeria-specific

| Asset | Visual | Technical | Licence | Annaba fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Algerian villa (OBJ) | 2: texture is a fragmented atlas, typical of a scan or an AI-generated mesh; shapes likely soft | 2: 148,420 triangles, 15 MB textures, OBJ | To confirm | 4: real Algerian house type | Candidate after reduction; must be rendered and judged first |
| Casbah of Algiers house (FBX) | Not seen | 3: 1.1 MB, no textures in the pack | To confirm | 3: Casbah style is Algiers, but close to Annaba's old town | Convert and render before deciding |
| Mosque "JAMAA" (OBJ) | Not seen | 2: 152,014 triangles, no textures | To confirm (Sketchfab Free Standard on the page first found) | 4 | Needs reduction and our own materials |
| Naftal sign (GLB) | 2: texture looks AI-generated, smeared | 4: 1,276 triangles; 12.5 MB of textures to shrink | To confirm | 5: Naftal stations are everywhere in Algeria | Good candidate; texture may need redrawing |
| Naftal station (OBJ) | Not seen | 2: 153,167 triangles, no textures | To confirm | 5 | Candidate after reduction |
| Renault Master, Algerian (GLB) | Not seen | 1: 2,141,318 triangles in 128 meshes | To confirm | 5: very common on Algerian roads | Test reduction; likely needs a rebuild of body panels |
| Skoda Rapid Spaceback (GLB) | Not seen | 2: 264,280 triangles, 188 meshes, 12 textures | To confirm | 4 | Most realistic candidate for reduction among the vehicles |
| Algerian police car (GLB) | Not seen | 1: 621,159 triangles, 81 meshes, 10 animations | To confirm | 4 | Reduction test needed |
| BRI vehicle (GLB) | Not seen | 1: 1,570,483 triangles, 34 textures, 76 MB | To confirm | 2: rarely seen in ordinary streets | Low priority |
| Algerian police Mercedes G63 | Not inspected yet | Not inspected yet | To confirm | 2 | Low priority |
| Waving Algerian flag (Blender file) | Not seen | 1: .blend only, cannot be opened here | To confirm | 4: flags on public buildings | Need glTF or FBX download |

### Mediterranean and generic architecture

| Asset | Visual | Technical | Licence | Annaba fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Italian balcony (FBX) | Not seen; described as highly detailed wrought iron | 2: 357,100 triangles, 15 MB textures | CC-BY | 5: close to the Cours de la Révolution balconies | Strong candidate; reduce and bake to a simple railing |
| Lowpoly Mediterranean House (FBX) | Not seen | 2: 257,200 triangles despite the name | CC-BY | 4 | Reduction test |
| Low Poly Balcony (OBJ) | Not seen | 5: 4,020 triangles, 6 textures | CC-BY | 3 | Ready once converted |
| Low-poly Building (FBX) | Not seen | 5: 818 triangles, 2 textures | CC-BY | 1: generic block | Filler only |
| Kenney Modular Buildings (GLB) | 2: clean but toy-like, flat colours | 5: tiny GLB pieces | CC0 | 1: generic | Parts only (doors, windows) |
| Kenney Retro Urban Kit (GLB) | 3: textured, retro look closest to PS2 | 5 | CC0 | 2 | Pick pieces one by one |
| Quaternius Downtown City MegaKit | Not seen | 4: 694 files, glTF | Quaternius licence: use in a game allowed, files may not be redistributed, so not in the public repository | 1: Boston / New York style | Set aside |

### Street, vegetation, coast

| Asset | Visual | Technical | Licence | Annaba fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Bus stop pack (GLB) | Not seen | 5: 4,506 triangles, 7 meshes, 1 texture | CC-BY | 3 | Ready |
| Kenney City Kit Roads (GLB) | 2: toy-like | 5: includes traffic lights, signs, barriers, electricity poles and wires, street lights | CC0 | 3: poles and wires are missing from our streets | Use poles, wires, lights, signs |
| Street Lamp 01 and 02, Concrete Road Barrier, Shrub 03, Island Tree 03 (Poly Haven) | 5 by reputation: scanned, photo-real | 1 as delivered: .blend only | CC0 | Lamp 01: 5 for the Cours; others 3 | Re-download as glTF |
| Dolomitized reef, Spain (FBX scan) | Not seen | 2: 66 MB, 17 MB textures | To confirm | 4: Mediterranean coastal rock for Cap de Garde | Reduction test |
| Cala del Cuervo coast, Spain (FBX scan) | Not seen | 2: 40 MB, 25 MB textures | To confirm | 4 | Reduction test |

### Vehicles and characters

| Asset | Visual | Technical | Licence | Annaba fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| Generic passenger car pack (FBX) | 4: proper bodywork with baked textures, six colours each | 4: about 7,000 triangles per car, 24 MB textures to shrink | To confirm | 3: generic, no real brand | Best ready-made traffic cars |
| Indian Scooter (GLB) | Not seen | 4: 11,832 triangles, 1 mesh | CC-BY | 3 | Ready |
| Retro PSX Male Pack (FBX) | 4: photo-based clothes (plaid shirt, khaki trousers, boots), natural proportions, PS1/PS2 look | 4: small FBX, 44 textures, no rig confirmed | To confirm | 4: ordinary clothed men, right for a player and later pedestrians | Best character candidate so far |
| Bearded man (Blender file) | Not seen | 1: .blend only | To confirm | 3 | Need glTF or FBX download |

## B. Shortlisted earlier, not downloaded yet

| Asset | Visual | Technical | Licence | Annaba fit |
| --- | --- | --- | --- | --- |
| PBR Street Props Pack, MadeByYeshe | Not seen; hand-painted, "stylized-realistic" | 5: 37 models, 20,700 triangles, 1024 px textures | CC-BY | 3 |
| Small Mosque, sakigakefuruzawa | Not seen | 5: 2,000 triangles, real scale, 2K textures | CC-BY | 4 |
| Djamaa Djedid mosque, tafirest | Not seen | Not measured | CC-BY | 2 as a model (it is an Algiers landmark), 5 as a style reference |
| Free Low Poly Vehicles Pack, RgsDev | Not seen | 5: separate wheels, colours by material | CC-BY label, text says CC0 | 3 |
| Vespa / scooter, henriid | Not seen | 3: 36,900 triangles | CC-BY-NC, now acceptable | 4 |
| Rooftop AC units, Oskar3D_ | Not seen | 5: 3,500 triangles, textured | CC-BY | 4: AC units cover Annaba facades |

## C. Textures already in the game

All CC0, resized to 512 px. Credits in `public/assets/textures/CREDITS.md`.

| Texture | Source | Used for |
| --- | --- | --- |
| Ground 037 | ambientCG | Terrain |
| Asphalt 02, Asphalt 04 | Poly Haven | Main roads, side streets |
| Concrete Pavement, Concrete Pavers 03 | Poly Haven | Sidewalks, avenues and the Cours |
| Painted Plaster Wall, Worn Plaster Wall | Poly Haven | Facades |
| Plaster Stone Wall 01 | Poly Haven | Retaining walls |

Downloaded but not used yet: Plastered Wall, Sand 01, Cobblestone 04, Ground 029.

## D. What is still missing for Annaba

1. The landmarks themselves: railway station, town hall, the colonial blocks of the Cours. No free model exists; they must be built from photos.
2. Ficus and Aleppo pine trees.
3. Shop signs, café terraces, satellite dishes, water tanks as real models.
4. Algerian-style apartment blocks (cités).
5. Everyday Algerian cars at a usable triangle count.

## E. Open items before any integration

- Licence label for every "To confirm" row.
- glTF downloads for the five Poly Haven models and the two Blender-only models.
- A rendered preview of each candidate, so the Visual column can be filled from what the model really looks like.
