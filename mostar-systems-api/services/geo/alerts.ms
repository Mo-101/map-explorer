scroll meta {
  language: "MoScripts"
  version: "0.1"
  sealed: true
  resonance_min: 0.92
  roles: ["Executor", "Architect", "Guardian"]
  audit: true
}

service GeoService {
  id: "mostar.systems.geo.v1"
  base: "/v1/geo"

  route GET "/alerts" -> alerts {
    access: public
    rate_limit: "120/min/ip"
    timeout_ms: 5000

    query {
      bbox: bbox optional
      region: string optional
      types: string[] optional
      since: datetime optional
    }

    require bbox != null or region != null
      else error(400, "LOCATION_REQUIRED")

    return geo.alerts.list(bbox, region, types, since)
  }

  route GET "/alerts/live" -> live_alerts {
    protocol: websocket
    access: public
    connection_limit: "10/ip"
    heartbeat_seconds: 30

    subscribe geo.alerts.stream
    emit event {
      id: string,
      type: string,
      severity: string,
      occurred_at: datetime,
      geometry: geojson,
      source: string,
      provenance: string
    }
  }
}
