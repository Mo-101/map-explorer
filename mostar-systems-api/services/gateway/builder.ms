scroll meta {
  language: "MoScripts"
  version: "0.1"
  sealed: true
  resonance_min: 0.92
  roles: ["Executor", "Architect", "Guardian"]
  audit: true
}

builder MostarSystemsApi {
  id: "mostar.systems.builder.v1"

  sequence {
    initializeMoScriptEngine()
    ApplyScrollValidator()
    EnforceThroneLock()
    ActivateResonanceEngine()
    BindWooInterpreter()
    PopulateScrollRegistry()
    ConnectDeepCAL()
    ConnectDeepTalkAI()
  }

  mount "./api.ms"
  mount "../weather/weather.ms"
  mount "../geo/alerts.ms"
  mount "../geo/satellite.ms"
  mount "./registry.ms"
}
