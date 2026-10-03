# London map data: sources, provenance, and race adaptations

`london-map.json` is an OpenStreetMap-derived geographic dataset for the London circuit. Coordinate order is **[longitude, latitude]**, WGS84 / EPSG:4326. It contains actual road geometry, building outlines, landmark locations, water, and park boundaries. It does not contain Google Maps imagery, Street View captures, or photogrammetric building models.

## Source and licence

- Data: **© OpenStreetMap contributors**.
- Dataset licence: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Attribution and licence explanation: [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
- Retrieved: **3 October 2026**. Original response SHA-256 hashes and requests are recorded in the JSON `source` object.
- This derived geographic dataset remains available under ODbL. Keep it distributable with this source notice. Display a visible linked `© OpenStreetMap contributors · ODbL` credit in the game/map interface. The geographic dataset's licence should not be confused with the licence of separately authored game code or landmark meshes.

The successful requests used the OpenStreetMap official read API:

1. [Palace, Westminster, and western West End](https://api.openstreetmap.org/api/0.6/map?bbox=-0.144,51.499,-0.125,51.5135)
2. [Northern West End, High Holborn, and Kingsway](https://api.openstreetmap.org/api/0.6/map?bbox=-0.132,51.512,-0.113,51.521)
3. [Thames bridges and South Bank](https://api.openstreetmap.org/api/0.6/map?bbox=-0.127,51.496,-0.111,51.5125)
4. [Complete Thames water multipolygon, relation 28934](https://api.openstreetmap.org/api/0.6/relation/28934/full)

OSM object IDs are preserved, so a way such as `way/25803161` can be inspected at [its original map object](https://www.openstreetmap.org/way/25803161). The route's `nodeIds` correspond one-to-one to `coordinates`; each `segments` entry identifies the source way and inclusive start/end coordinate indices.

## Circuit and geographic fidelity

The approximately **6.96 km** closed circuit follows this order:

Buckingham Palace / Victoria Memorial → The Mall → Admiralty Arch / Charing Cross → Trafalgar Square → Cockspur Street → Haymarket → Piccadilly Circus / Coventry Street → Shaftesbury Avenue → Wardour Street → Gerrard Street → Gerrard Place → Shaftesbury Avenue → High Holborn → Kingsway → Strand Underpass → Waterloo Bridge → Tenison Way → York Road → Westminster Bridge Road → Westminster Bridge → Bridge Street / Big Ben → Great George Street → Birdcage Walk → Spur Road → Queens Gardens → start.

All 464 route points, including the repeated closing point, are existing OSM nodes. Consecutive points follow existing mapped ways. Shortest connected subpaths were selected between landmarks and road junctions. There are no duplicated intermediate nodes or artificial straight-line jumps between unconnected roads. Game-side smoothing must stay near this geometry and must not invent shortcuts through buildings.

The direct central connection from The Mall to Waterloo Place is **Duke of York Steps**. This circuit instead goes through the real Admiralty Arch/Cockspur/Haymarket road connection and passes His Majesty's Theatre.

The circuit is a **fictional closed-road race on real London geometry**. It ignores ordinary one-way restrictions, uses pedestrianised Chinatown streets as a race course, and drives the real Strand Underpass southbound. It must not be presented as a legal public-road driving itinerary. Geometry and location are preserved despite these explicitly fictional traffic permissions.

The Strand Underpass is real, not an invented tunnel. Its normal direction is northbound; TfL's official 2012 Games material documented a temporary reversal for southbound traffic, while Camden's road-access notice explicitly describes northbound use. Sources: [TfL central London Games transport booklet](https://foi.tfl.gov.uk/FOI-0994-2223/TR127586%20CLZ_Booklet_FINAL_26%2006%2012.pdf), [Camden access update](https://news.camden.gov.uk/incident-at-holborn/), and [Camden Kingsway conservation-area statement](https://www.camden.gov.uk/documents/20142/7871262/Kingsway.pdf). The closed race reverses direction as an adaptation; no road tunnel is relocated or added.

## Landmark and theatre provenance

The JSON includes original OSM IDs, links, and footprint-derived positions for Buckingham Palace, Victoria Memorial, Elizabeth Tower (Big Ben), Parliament, Westminster Abbey, the London Eye, and the West End theatres. Chinatown Gate uses its actual OSM point, [node 4189248446](https://www.openstreetmap.org/node/4189248446), on Wardour Street. This gate is south of the Gerrard Street turn; its position has not been moved to force it onto the race line.

Admiralty Arch is extracted from the existing building record [OSM relation 17074208](https://www.openstreetmap.org/relation/17074208). Its landmark position is the area centroid of the original outer footprint, its full footprint and courtyard rings are preserved, and its facade bearing follows the mapped passage axis on The Mall, facing toward Buckingham Palace. [Historic England listing 1238982](https://historicengland.org.uk/listing/the-list/list-entry/1238982) confirms three carriage arches and two pedestrian arches. The visual model has real through-openings; collision geometry must leave these passages open.

Theatre show associations were checked against the venue or operator, rather than inferred from old posters:

| Venue | Verified association | Official source |
| --- | --- | --- |
| His Majesty's Theatre | The Phantom of the Opera | [LW Theatres venue material](https://assets.lwtheatres.co.uk/wp-content/uploads/2023/06/26171032/HMT-Group-Preorder-Form.pdf) |
| Sondheim Theatre | Les Misérables | [Delfont Mackintosh](https://www.delfontmackintosh.co.uk/whats-on/les-miserables) |
| Prince Edward Theatre | Beetlejuice; do not label MJ as its current show | [Official venue](https://www.princeedwardtheatre.co.uk/whats-on/beetlejuice) |
| Lyceum Theatre | Disney's The Lion King | [Official venue](https://www.thelyceumtheatre.com/) |
| Dominion Theatre | The Devil Wears Prada | [Nederlander Theatres](https://nederlander.co.uk/dominion/shows/the-devil-wears-prada/) |
| Aldwych Theatre | Venue name only; no current-show claim in this data | [Nederlander venue history](https://nederlander.co.uk/aldwych/about/) |

These are factual text associations only. No production artwork, posters, logos, or official 3D models were copied. The show associations are a dated snapshot, not a live programme feed.

## Geometry and accuracy notes for rendering

- `buildings[].coordinates` and `landmarks[].footprint` are outer polygon rings; `holes` preserves mapped courtyards where available. Do not fill courtyards merely because an outline is concave.
- Landmark centre positions are computed from footprint geometry except the gate, which has an OSM point. `coordinateSource` distinguishes these cases.
- `bearing` is a compass angle: **0° north, 90° east**. It is an approximate facade orientation derived from the footprint centre toward the closest point on a known frontage street's mapped road segment. Buckingham Palace instead faces the Victoria Memorial; the gate faces along its real street axis. `frontageTarget`, `frontageStreet`, and `bearingSource` make the derivation reviewable. Null means no directional claim. It is not a surveyed facade-normal measurement.
- Building `height` is in metres when OSM supplies a numeric height. `levels` is the numeric OSM storey count. **Null means unknown**, not zero. Rendering may estimate missing heights, but should not call those estimates measured building geometry.
- OSM `layer` encodes relative topology, **not elevation in metres**. This dataset contains no terrain DEM. Bridge arches, road grades, portal depth, and unmeasured elevations require separately labelled modelling estimates.
- Water polygons are clipped to a local bounding box. New clip vertices are calculated intersections of real OSM boundary edges with the box. River banks within the box retain the source geometry. Lakes and mapped islands retain their inner rings.
- General buildings are selected near the circuit; important landmarks are retained even when farther from the road. `distanceToRouteMeters` measures approximate planar distance to the un-smoothed race line.
- The road context retains mapped one-way, tunnel, bridge, layer, lane, and width tags where available. These descriptive tags must not be treated as blanket traffic permission for the fictional race.

The geographic outlines support a recognisable London layout. Separately authored low-poly or detailed landmark models remain artistic reconstructions, not scanned replicas.


## Closed-course road presentation

The October 2026 hand-modelled release distinguishes the race course with mint-green edge paint. Red-and-white physical barriers close intersecting non-racing streets. These markings and barriers are fictional race equipment, not surveyed London street furniture. Ground-level road and pavement surfaces use polygon unions and cut-outs to remove overlapping junction kerbs; the actual bridge and tunnel elevation profiles remain separate. Street name signs are moved along their named street when an offset at a tight junction would intrude into another part of the race course.
