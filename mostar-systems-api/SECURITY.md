# Security / deployment checklist

- Rotate all previously exposed credentials before deployment.
- Store provider and database secrets in a server-side secret manager.
- No secrets in `.ms`, frontend bundles, logs, fixtures, screenshots, CI output, or git history.
- Compile MoScripts to validated IR before execution; never eval raw `.ms`.
- Require sealed scrolls, immutable IDs, soulprint validation and ScrollRegistry membership.
- Enforce ThroneLock RBAC for non-public operations.
- Reject resonance scores below 0.92.
- Parameterize all database queries.
- Restrict egress to approved weather/satellite providers.
- Add request IDs, structured audit logs, timeouts, retry-with-jitter and circuit breakers.
- Bound bbox/resolution/hours to prevent resource exhaustion.
- Cache upstream weather data and serve stale-with-warning during provider outages.
- Use TLS only; enable HSTS.
- Set strict CORS to approved Mostar Systems frontend origins.
- Rate-limit public endpoints.
- Add SBOM, dependency scanning, secrets scanning and signed builds.
