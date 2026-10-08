scroll meta {
  language: "MoScripts"
  version: "0.1"
  sealed: true
  resonance_min: 0.92
  roles: ["Executor", "Architect", "Guardian"]
  audit: true
}

service MostarGateway {
  id: "mostar.systems.gateway.v1"
  origin: "https://api.mostarsystems.com"

  route GET "/health" -> health {
    access: public
    cache: no_store
    timeout_ms: 2000

    return {
      service: "mostar-systems-api",
      status: "ok",
      version: "v1",
      timestamp: clock.utc()
    }
  }
}
