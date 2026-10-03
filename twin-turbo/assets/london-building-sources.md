# London building facade studies

Research date: 2026-10-03. The game consumes `london-building-profiles.json`; the original OSM dataset is unchanged.

## Scope and honesty

The file covers **25 individually identified OSM footprints**, plus six street-level fallback profiles. It is a first manual architectural pass, not a measured reconstruction of every building. `verified-features` refers only to the short evidence list. Colours in hex, unrecorded dimensions, side/rear walls and simplified ornaments remain artistic estimates. `inferred` profiles must not be presented as photographically verified.

Every profile is keyed by the exact OSM identifier in `london-map.json`. Coordinates are calculated from that footprint. Facade bearings are estimated from the nearest named frontage street; do not treat these bearings as surveyed or apply a main-front bay count indiscriminately to every edge.

## Sources and per-building differences

| OSM footprint | Building | Evidenced features / status | Source |
|---|---|---|---|
| `relation/5208404` | Buckingham Palace | East elevation has a 3:7:3:7:3 bay rhythm. Three main storeys, Corinthian detailing and a continuous first-floor balcony. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1239087) |
| `way/4266528` | Carlton House Terrace — western block | OSM footprint is the western terrace of Nos 1–9, not the demolished Carlton House. Stucco and slate; park elevation follows five groups of 5:8:5:8:5. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1209780) |
| `way/4266524` | Lancaster House | Bath-stone classical mansion with Corinthian porticoes. Nine-window north and south fronts with a five-bay centre; two main storeys and attic. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1236546) |
| `way/161800467` | Marlborough House | Red brick, stone quoins and dressings. Garden front has thirteen bays with advanced three-bay wings. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1331701) |
| `way/38446590` | Institute of Directors — former United Service Club | Stucco, rusticated ground floor and dormered mansard. Pall Mall elevation is thirteen windows wide; central entrance has a portico. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1225843) |
| `way/369234481` | Oceanic House | Portland stone office of 1903–06 with lead roof. Five-bay entrance and five-bay splayed returns; three main storeys and substantial attic composition. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1219835) |
| `relation/2071332` | New Zealand House podium | Stone-banded glazed podium carried on stainless-steel pilotis. Haymarket entrance has a projecting canopy. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1242616) |
| `way/302075160` | Royal Opera Arcade | Stucco-faced brick arcade with slate and glazed-lantern roof. Eighteen interior vaulted bays; arched street entrances. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1235289) |
| `way/153661824` | Theatre Royal Haymarket | Seven-bay frontage and six-column Corinthian pedimented portico. Five arched entry doors; high attic with round windows. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1066641) |
| `way/153661807` | Former Carlton Theatre — Haymarket cinema | Seven-bay Portland-stone elevation; central five project. Palazzo composition, prominent cornice, entrance canopy and central advertising panel. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1456493) |
| `way/149173459` | Criterion Theatre | Painted-stone frontage with dormered mansard and pavilion roof. Three-bay recessed centre between single-bay pedimented wings. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1265753) |
| `way/369245408` | London Pavilion | London Pavilion identity and Piccadilly Circus location verified in Historic England archive. An entrance pediment carries the London Pavilion name. **inferred** | [Source 1](https://historicengland.org.uk/images-books/photos/item/BL20230) · [Source 2](https://historicengland.org.uk/images-books/photos/item/NWC01/01/1867) |
| `way/149173469` | Lyric Theatre | Brick and stone facade, slate roof, three storeys and attic. Five pavilion groups have 3:2:4:2:3 windows; ground-floor arcade and canopied entrance. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1264706) |
| `way/149173453` | Apollo Theatre | Stone street elevation with three principal bays. Arcaded ground floor, glass canopy and shallow-domed end turrets. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1236173) |
| `way/149173466` | Gielgud Theatre | Portland stone and slate in a Baroque composition. Bowed three-window corner rises to a short circular tower and stone dome. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1236174) |
| `way/149173471` | Palace Theatre | Red brick alternates with buff terracotta bands. Concave three-part front, corbelled turrets, broad gable and glazed entrance canopy. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1066339) |
| `way/993781431` | Wong Kei — former Clarkson premises | 41–43 Wardour Street: red brick with green and buff stone dressings. Three-window front, four floors and attic; upper canted bays and elaborate centre entry. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1357341) · [Source 2](https://chinatown.co.uk/en/restaurant/wong-kei/) |
| `way/993439403` | De Hems Dutch Café Bar | Venue at 11 Macclesfield Street confirmed by its operator. OSM records brick, four levels and one roof level. **inferred** | [Source 1](https://www.dehemspub.co.uk/) · [Source 2](https://www.openstreetmap.org/way/993439403) |
| `way/993516028` | Viet Food | Operator/district listing confirms 34–36 Wardour Street. OSM records brick, four levels and grey roof. **inferred** | [Source 1](https://chinatown.co.uk/en/restaurant/viet-food/) · [Source 2](https://www.openstreetmap.org/way/993516028) |
| `way/993439410` | Golden Gate Cake Shop | OSM identifies this footprint as Golden Gate Cake Shop and records four levels. **inferred** | [Source 1](https://www.openstreetmap.org/way/993439410) |
| `way/901384876` | Soho Telephone Exchange | OSM records five levels, brick material, wall colour #eae1c5 and grey roof. **inferred** | [Source 1](https://www.openstreetmap.org/way/901384876) |
| `way/81459092` | Shaftesbury Theatre | Listed theatre at the Shaftesbury Avenue and High Holborn corner. OSM footprint and four levels verified. **inferred** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1378647) |
| `way/97237916` | Princess Louise | Historic England confirms yellow brick with stone dressings and address 208–209 High Holborn. **inferred** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1378884) |
| `way/99952220` | One Aldwych | Hotel owner identifies the 1905–1907 Morning Post building by Mewès & Davis. Standalone triangular plan; original dome was removed during later alterations. **inferred** | [Source 1](https://www.onealdwych.com/inside-one-aldwych/history) · [Source 2](https://www.onealdwych.com/article/gallery-menu) |
| `way/484870412` | The Waldorf Hotel | Portland-stone facade following Aldwych curve, fifteen windows wide. Seven floors and a steep slate mansard with two tiers of dormers. **verified-features** | [Source 1](https://historicengland.org.uk/listing/the-list/list-entry/1357167) |

## Special handling

- Buckingham Palace already has a dedicated landmark model. This profile records the real facade rhythm without replacing that model with a generic extrusion.
- Carlton House in the input is the western Carlton House Terrace footprint, not the demolished royal residence. The 31-window, 5:8:5:8:5 park rhythm belongs to the full long front.
- New Zealand House is split into building parts in OSM. The named relation is its four-floor podium; its separate tower must keep its own measured height and modern glass skin.
- Royal Opera Arcade has eighteen **interior** vaulted bays; this is not eighteen windows on a short entrance facade. Preserve its passage.
- Theatre profiles distinguish brick/terracotta, pale stone, curved corners, gables and roof forms. Current show posters have not been copied or invented.
- Chinatown retains ordinary Georgian and Victorian upper floors with varied materials. The street is not a row of traditional Chinese pagodas. Its gateway is modeled separately.
- Tenant names are included only when an official operator/district source confirms the location. Golden Gate and the telephone exchange use OSM identities but omit unverified tenant lettering.

## Reuse and licensing

OpenStreetMap geometry and descriptive tags: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). The profiles summarize architectural facts from official listings and venue websites. Historic England text is available under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) except where otherwise stated. No listing photography, copyrighted maps, Google imagery, photogrammetric tiles or third-party textures have been downloaded or embedded. Archive images are references only; their rights are separate from listing text.

## Street fallbacks

Six bounded street profiles give coherent material families for buildings not yet researched. They are explicitly `inferred`, carry no invented venue signs, and are not counted as individually restored buildings. Priority at overlapping bounds should be: known building ID first, Chinatown next, West End next, then the other street profiles.

## Gerrard Street public realm

The district's own [street history](https://chinatown.co.uk/en/culture/history-of-chinatown/) confirms the gates and strings of red lanterns on Gerrard Street. The game models lantern bodies, ribs, tassels and suspension cables with clearance above the cars. Exact spacing, dimensions and paving joints are a visual reconstruction, not a survey; the street remains widened for a closed racing event.
