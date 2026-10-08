scroll meta {
  language: "MoScripts"
  version: "0.1"
  sealed: true
  resonance_min: 0.92
  roles: ["Executor", "Architect", "Guardian"]
  audit: true
}

service SatelliteService {
  id: "mostar.systems.satellite.v1"
  base: "/v1/satellite"

  route GET "/imagery" -> imagery {
    access: public
    rate_limit: "30/min/ip"
    timeout_ms: 10000

    query {
      lat: number[-90..90] required
      lon: number[-180..180] required
      zoom: integer[1..18] optional default 10
      from: datetime optional
      to: datetime optional
      layer: string optional
    }

    source = satellite.first_healthy_provider()
    raw = source.imagery(lat, lon, zoom, from, to, layer)

    return satellite.normalize(raw)
  }
}
