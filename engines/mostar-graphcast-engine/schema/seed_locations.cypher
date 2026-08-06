// engines/mostar-graphcast-engine/schema/seed_locations.cypher
// Reference template only — the full Africa 0.25° grid is ~96,000 nodes,
// which is too large to ship as a static .cypher file. Use seed_locations.py
// which generates the rows programmatically and runs this same MERGE in
// batches of 5000.
//
// The Python seed script also anchors each future W_ForecastCycle to the
// shared :SovereignCoreLedger node (mirroring the GridTag registration
// pattern). That anchoring lives in bridge.py and runs per cycle, not here.

UNWIND $rows AS r
MERGE (l:W_Location { id: r.id })
  ON CREATE SET l.lat     = r.lat,
                l.lon     = r.lon,
                l.lat_idx = r.lat_idx,
                l.lon_idx = r.lon_idx,
                l.region  = r.region,
                l.point   = point({ latitude: r.lat, longitude: r.lon, srid: 4326 });
