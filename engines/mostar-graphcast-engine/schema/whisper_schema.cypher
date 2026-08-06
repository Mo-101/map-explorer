// engines/mostar-graphcast-engine/schema/whisper_schema.cypher
// Whisper Subgraph — constraints & indexes only.
// Lives inside the same Neo4j instance as Grid Core and Phantom subgraphs.
// Run once via cypher-shell or seed_locations.py.

CREATE CONSTRAINT w_location_id   IF NOT EXISTS FOR (l:W_Location)      REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT w_cycle_id      IF NOT EXISTS FOR (c:W_ForecastCycle) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT w_fnode_id      IF NOT EXISTS FOR (f:W_ForecastNode)  REQUIRE f.id IS UNIQUE;

// Shared :ViolationFlag constraint — only create if Grid Core hasn't already.
CREATE CONSTRAINT violation_flag_id IF NOT EXISTS FOR (v:ViolationFlag) REQUIRE v.id IS UNIQUE;

CREATE POINT INDEX w_location_point IF NOT EXISTS FOR (l:W_Location)      ON (l.point);
CREATE INDEX      w_fnode_valid     IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.valid_time);
CREATE INDEX      w_fnode_lead      IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.lead_hours);
CREATE INDEX      w_fnode_cycle     IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.cycle_id);
CREATE INDEX      w_fnode_flood     IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.flood_risk);
CREATE INDEX      w_fnode_precip    IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.precip_rate);
CREATE INDEX      w_fnode_msl       IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.msl);
CREATE INDEX      w_fnode_wind      IF NOT EXISTS FOR (f:W_ForecastNode)  ON (f.wind_speed_10m);
