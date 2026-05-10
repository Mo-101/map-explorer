// engines/mostar-graphcast-engine/schema/apoc_trigger.cypher
// Stormscribe reflex — fires whenever a W_ForecastNode is written.
// Raises a SHARED :ViolationFlag (Grid Core namespace), not a W_-prefixed one.
// mo-weather-stormscribe-003 polls these flags and trigger_moscript_ritual().

CALL apoc.trigger.install(
  'whisper',
  'stormscribe_reflex',
  "UNWIND [n IN $createdNodes WHERE 'W_ForecastNode' IN labels(n)] AS f
   WITH f
   WHERE f.msl < 100000.0
      OR f.precip_rate > 25.0
      OR f.wind_speed_10m > 25.0
   WITH f,
     CASE WHEN f.msl < 100000.0          THEN 'low_pressure'
          WHEN f.precip_rate > 25.0      THEN 'heavy_precip'
          ELSE                                 'high_wind' END        AS kind,
     CASE WHEN f.msl < 100000.0          THEN (100000.0 - f.msl) / 100000.0
          WHEN f.precip_rate > 25.0      THEN (f.precip_rate - 25.0) / 25.0
          ELSE                                 (f.wind_speed_10m - 25.0) / 25.0 END AS severity
   MATCH (l:W_Location { id: f.location_id })
   MERGE (v:ViolationFlag { id: 'whisper:' + f.id + ':' + kind })
     ON CREATE SET v.source       = 'whisper',
                   v.kind         = kind,
                   v.severity     = severity,
                   v.subgraph     = 'W_',
                   v.cycle_id     = f.cycle_id,
                   v.lead_hours   = f.lead_hours,
                   v.valid_time   = f.valid_time,
                   v.lat          = l.lat,
                   v.lon          = l.lon,
                   v.triggered_at = datetime(),
                   v.status       = 'open'
   MERGE (f)-[:VIOLATES_THRESHOLD]->(v)
   MERGE (v)-[:AT]->(l)",
  { phase: 'afterAsync' }
);
