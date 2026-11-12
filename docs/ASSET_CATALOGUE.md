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

## F. Visual review from rendered previews (12 November, evening)

Every uploaded model that could be opened was rendered on a neutral grey background with the same lighting,
in three views (front, side, three-quarter), textures on. Sheets: `docs/asset-previews/sheet_1.jpg` to `sheet_4.jpg`.
This section replaces the "not seen" entries of section A. Ranked by visual quality, then usefulness for Annaba.

| Rank | Asset | Sheet | Visual (1-5) | What the render shows | Triangles | Optimisation potential | Annaba fit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Renault Master (Algerian) | 3 | 5 | Two Protection Civile ambulances, yellow with red-white chevrons and Arabic lettering; accurate, clean | 2,141,318 (two vehicles) | Medium: keep one vehicle, drop interior and underbody, then reduce; livery is in the texture so it should survive | 5 |
| 2 | Skoda Rapid Spaceback | 3 | 5 | Two Gendarmerie Nationale cars, green and white with markings and light bars | 264,280 (two vehicles) | Good: one vehicle is about 130,000; a target of 8,000 to 12,000 looks reachable | 5 |
| 3 | Algerian police car | 3 | 5 | Mercedes Vito police van, white with blue stripe and Arabic "police" lettering | 621,159 | Medium | 5 |
| 4 | Algerian villa | 1 | 4 | Photo-scan of a real two-storey house: roller shutter, tiled ground floor, balustrade balcony, window grilles. Front is convincing; sides and back are blank | 148,420 | Good: flat walls reduce well; front detail lives in the texture | 5 |
| 5 | Mosque JAMAA | 1 | 4 | Maghrebi mosque with a square minaret and crenellated roofline; no textures or colours | 152,014 | Good; needs materials made for it | 5 |
| 6 | Italian balcony | 2 | 4 | Iron-railing balcony with shutters, clothes line and laundry on a wall section; the wall texture rendered oddly | 357,107 | Medium: thin railings and cloth are hard to reduce; could be baked to a flat railing texture | 5 |
| 7 | Indian Scooter | 4 | 4 | Classic Vespa-type scooter, pale green with brown seat | 11,832 | Good | 4 |
| 8 | Bus stop pack | 2 | 4 | Shelter with advert panel, bench, bin, mailbox, sign, ticket machine. Advert text is in English | 4,506 | None needed | 3 |
| 9 | BRI vehicle | 3 | 4 | Black Mercedes G-Class with BRI lettering | 1,570,483 | Medium | 2 |
| 10 | Naftal "sign" | 1 | 4 | It is an oil drum, blue and yellow with Naftal marking, not a sign | 1,276 | Only the 12 MB texture needs shrinking | 4 |
| 11 | Casbah of Algiers house | 1 | 3 | Stacked whitewashed volumes with small grilled windows, arched door, roof terrace; rendered without its colours | 57,336 | Good | 3 |
| 12 | Low-poly Building | 2 | 3 | Grey four-storey office block with a photo texture; reads as PS2-era | 818 | None needed | 2 |
| 13 | Lowpoly Mediterranean House | 2 | 2 | A small diorama: white cubic houses on a sand base with a black disc | 256,614 | Poor value: heavy for what it shows | 2 |
| 14 | Naftal station | 1 | 2 | A single fuel pump, grey, with a hose; proportions look stretched | 148,053 | Poor value | 3 |
| 15 | Low Poly Balcony | 2 | 2 | A wooden porch with a green roof, not a Mediterranean balcony | 4,020 | None needed | 1 |

Previews that are not usable yet:

- **Generic passenger car pack** and **Retro PSX Male Pack** rendered almost black and far too small (a whole pack per image). Their textures were not picked up by the preview tool. They need a second render, one car and one character at a time.
- **Dolomitized reef** and **Cala del Cuervo coast**: the FBX files could not be opened by the loader.
- Still unopened because they are Blender files: the five Poly Haven models, the bearded man, the Algerian flag.
- Not rendered yet: Algerian police Mercedes G63, Kenney kits (their own preview images were used).

Note on brand marks: the four Algerian vehicles carry real manufacturer badges and official liveries. That is what makes them recognisable, and it is a choice for the project owner.

## G. New candidates from the third search (not downloaded)

| Asset | Download page | Licence | Triangles | Why it is listed |
| --- | --- | --- | --- | --- |
| Casbah of Algiers / House, AlgiersTheWhite | https://sketchfab.com/3d-models/casbah-of-algiers-house-a06278a7b05c4035bf108a6e6f072f79 | CC-BY-NC (confirmed) | 57.5k | Already uploaded; licence now known |
| Low Poly Apartment Building, gluttonia | https://sketchfab.com/3d-models/low-poly-apartment-building-3a3ff43aadd64349abf306217fb199c3 | CC-BY | 2.1k | Based on a real apartment block, 4K textures |
| Low Poly Apartment, Wardster | https://sketchfab.com/3d-models/low-poly-apartment-af9b702de4ed4eabafab877518613592 | Not shown | 1.3k | PS1-style small apartment block, 512 px atlas |
| Pubg Building, ASAD MEHMOOD | https://sketchfab.com/3d-models/pubg-building-low-poly-building-d6dc7735c1ac47d58f6baff8fe66f749 | CC-BY | 13.3k | Three-storey block with interior |
| Mediterranean Townhouse, Mrigua Mohamed | https://sketchfab.com/3d-models/mediterranean-townhouse-stylized-tier-i-e259f78f32ad4218bbd313e3e34df82b | Not shown | 1.5M | Spanish and North African influences, balconies, arches; tagged as created with AI; needs heavy reduction |
| Game-Ready Roller Shutters, jellystuff | https://sketchfab.com/3d-models/game-ready-roller-shutters-fc5f2411ddea4fa19c882e9082f1e173 | Not shown | 176 | Roller shutters are on almost every Algerian shop front |
| Storefront, David Malkasian | https://sketchfab.com/3d-models/storefront-447f7c5908fa4082a1ef8f1f807b750b | CC-BY | 5.3k | Textured shop front |
| Simple Storefront Interior Pack, 99.Miles | https://sketchfab.com/3d-models/free-simple-storefront-interior-pack-348da01c195d46eca29e478e98aab16c | CC-BY | 4.8k | Shop interiors seen through windows, one 2K texture |
| Low Poly Shop Front 1, Christians | https://sketchfab.com/3d-models/low-poly-shop-front-1-free-8222c5f561bc493a8399f355cc65e111 | CC-BY-NC | 152 | Very light shop front |
| Low-Poly Cafe Asset Pack, uqi0033 | https://sketchfab.com/3d-models/low-poly-cafe-asset-pack-084c6df80168426b85803c46bc09f9c0 | CC-BY | 1.1k | Chairs, tables, plant pots for terraces |
| Pine tree low-poly, Ricardo Sanchez | https://sketchfab.com/3d-models/pine-tree-low-poly-e72f2c31aac544e58b667c13ec718daf | CC-BY | 282 | Leaf texture with opacity map |
| Pine Tree, Wenedi | https://sketchfab.com/3d-models/pine-tree-game-ready-dc3fbd9205cf4027a4455d1f415e0478 | CC-BY | 1.7k | Game-ready pine |
| Stylized Pine Tree, 3Dev | https://sketchfab.com/3d-models/stylized-pine-tree-7f9f8c5232794dbfb6d73389445c889b | CC-BY-SA | 664 | 1024 px textures |

Search gaps after three rounds: no Algerian apartment block (cité), no ficus, no Aleppo or stone pine by name
(the pines above are northern conifers), no school or hospital, no Arabic or French shop signs.

## H. Second preview round and reduction tests (12 November, late evening)

Decision recorded: the Algerian vehicles keep their liveries, badges and official markings.

### Packs re-rendered one item at a time

| Sheet | Content | Result |
| --- | --- | --- |
| `sheet_5_cars.jpg` | Generic passenger car pack, 7 items | Each car now renders alone with its textures. Measured: 6,022 to 7,257 triangles per single car; three items of about 14,000 triangles are two cars standing close together |
| `sheet_6_characters.jpg` | Retro PSX Male Pack, 12 of 23 characters | One shared body of 466 triangles with different clothing textures: plain shirts in several colours, plaid shirts, a leather jacket, one bare-chested. Proportions are natural and slim; detail is PS1 level. The three views show the side and the back; no front view of the faces was produced, and several heads show a white glare or render black |

### Reduction tests (grid merge of nearby vertices, textures kept)

| Asset | Original | Reduced A | Reduced B | Reading |
| --- | --- | --- | --- | --- |
| Skoda Rapid, one car (`sheet_7_skoda_reduction.jpg`) | 132,140 | 52,106 | 27,780 | A is visually identical at this size. B still reads as the same car with the livery intact; small breaks appear around the front bumper and wheel arches. Going below about 25,000 needs a different method: remove the interior and underbody first |
| Algerian villa (`sheet_8_villa_reduction.jpg`) | 148,420 | 34,162 | 10,884 | A is almost identical. B damages the front: balustrade, window grilles and wall edges crumble. The usable range with this method is roughly 20,000 to 34,000 |

This is the simplest reduction method. A proper edge-collapse tool would do better at the same triangle count, so these results are a floor, not a ceiling.

### New candidates from the fourth search (not downloaded)

| Asset | Download page | Licence | Triangles | Note |
| --- | --- | --- | --- | --- |
| Algerian House, tafirest | https://sketchfab.com/3d-models/algerian-house-cae302b43d8d4594af45706ed87a97c1 | Not shown; may not be downloadable | 38.2k | Tagged algeria, algiers, casbah |
| Algerian monuments, Mukagen | https://sketchfab.com/3d-models/algerian-monuments-2e7f88f9df00490db5b2065e9544b712 | CC-BY | 700.1k | Content unknown until rendered |
| 3D Map for old Algiers, Imad Hamouda | https://sketchfab.com/3d-models/3d-map-for-old-algeries-b089375a8f734224bb0a4b9382ac92f4 | CC-BY | Not shown | Casbah quarter; reference for old-town massing |
| Low Poly Hospital Scene, _its_sagar_bro | https://sketchfab.com/3d-models/low-poly-hospital-scene-a00aa1a1a9774a53869b6dd8b3497bd2 | CC-BY | 3.5k | Hospital with ambulance, diffuse maps |
| Low Poly Hospital, saqib24 | https://sketchfab.com/3d-models/low-poly-hospital-31ee55ffb7cf42698a9bf4d9300ac783 | CC-BY | 2k | Tagged cartoonish |
| lowpoly HOSPITAL PACK, Son.Sinpivong | https://sketchfab.com/3d-models/lowpoly-hospital-pack-6c49cf4ec94149c3b35c108428bdaee1 | CC-BY | 9.7k | Hospital pieces |
| Low Poly City, kabukidanshii | https://sketchfab.com/3d-models/low-poly-city-579d7493dbbc4cfa9fd50dde3df229bb | Not shown | 82.6k | 20 buildings including a hospital and a school, 10 traffic signs |

Still not found after four rounds: an Algerian apartment block (cité), a school on its own, ficus, Aleppo or stone pine,
Arabic or French shop signs. Tunisian heritage collections exist on Sketchfab but most items are not downloadable.
