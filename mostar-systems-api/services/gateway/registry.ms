scroll meta {
  language: "MoScripts"
  version: "0.1"
  sealed: true
  resonance_min: 0.92
  roles: ["Executor", "Architect", "Guardian"]
  audit: true
}

registry MostarServiceRegistry {
  id: "mostar.systems.registry.v1"
  immutable_ids: true
  duplicate_id: deny
  require_sealed: true
  require_soulprint: true
  resonance_min: 0.92
  audit_chain: true

  register "mostar.systems.gateway.v1"
  register "mostar.systems.weather.v1"
  register "mostar.systems.geo.v1"
  register "mostar.systems.satellite.v1"
}
