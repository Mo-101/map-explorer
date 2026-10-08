# MoStar Systems API — MoScripts-first v0.1

Canonical production origin:

    https://api.mostarsystems.com

This package defines the first MoScripts-first API surface for:
- health
- current weather
- wind field data
- weather forecast
- geospatial alerts
- live geospatial alert stream
- satellite imagery

## Important language note

The uploaded MoScript corpus establishes these execution semantics:
- sealed scrolls only
- immutable IDs
- soulprint-bound authorship
- ScrollValidator validation
- ThroneLock RBAC with Executor / Architect / Guardian roles
- resonance threshold enforcement (0.92 minimum)
- immutable registry / duplicate-ID blocking
- audit logging
- initialization order:
  1. initializeMoScriptEngine
  2. Apply ScrollValidator
  3. Enforce ThroneLock
  4. Activate ResonanceEngine
  5. Bind WooInterpreter
  6. Populate ScrollRegistry
  7. Connect DeepCAL + DeepTalk AI

The source corpus does not provide a complete formal HTTP grammar for `.ms`.
Therefore the HTTP syntax in this package is a MoScripts v0.1 PROPOSAL,
while the enforcement semantics above are corpus-grounded.

## Routes

GET /health
GET /v1/weather/current
GET /v1/weather/wind
GET /v1/weather/forecast
GET /v1/geo/alerts
GET /v1/geo/alerts/live
GET /v1/satellite/imagery

## Security posture

No credentials are embedded in this package.
All upstream provider credentials must be supplied at runtime from a secret manager.
The previously exposed project credentials must be treated as compromised and rotated.

## Deployment target

api.mostarsystems.com -> reverse proxy / load balancer -> MoScripts runtime

See:
- contracts/openapi.yaml
- services/**/*.ms
- runtime/adapter.ts
