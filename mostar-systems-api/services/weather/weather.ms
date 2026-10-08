scroll meta {
  language: "MoScripts"
  version: "0.1"
  sealed: true
  resonance_min: 0.92
  roles: ["Executor", "Architect", "Guardian"]
  audit: true
}

service WeatherService {
  id: "mostar.systems.weather.v1"
  base: "/v1/weather"

  provider primary = env("MOSTAR_WEATHER_PRIMARY")
  provider fallback = env("MOSTAR_WEATHER_FALLBACK")

  route GET "/current" -> current_weather {
    access: public
    rate_limit: "120/min/ip"
    timeout_ms: 5000

    query {
      lat: number[-90..90] required
      lon: number[-180..180] required
    }

    source = providers.first_healthy([primary, fallback])
    raw = source.current(lat, lon)

    return weather.normalize_current(raw) {
      include: [
        "observed_at",
        "temperature_c",
        "wind_speed_ms",
        "wind_direction_deg",
        "pressure_hpa",
        "precipitation_mm",
        "source"
      ]
    }
  }

  route GET "/wind" -> wind_field {
    access: public
    rate_limit: "60/min/ip"
    timeout_ms: 8000

    query {
      bbox: bbox required
      time: datetime optional
      resolution: number[0.05..2.0] optional default 0.25
    }

    guard bbox.area() <= 80
      else error(413, "BBOX_TOO_LARGE")

    source = providers.first_healthy([primary, fallback])
    raw = source.wind_grid(bbox, time, resolution)

    return weather.normalize_wind(raw) {
      schema: {
        source: string,
        generated_at: datetime,
        valid_at: datetime,
        units: { wind: "m/s" },
        grid: {
          west: number,
          south: number,
          east: number,
          north: number,
          width: integer,
          height: integer
        },
        u: number[],
        v: number[]
      }
    }
  }

  route GET "/forecast" -> forecast {
    access: public
    rate_limit: "60/min/ip"
    timeout_ms: 8000

    query {
      lat: number[-90..90] required
      lon: number[-180..180] required
      hours: integer[1..168] optional default 72
    }

    source = providers.first_healthy([primary, fallback])
    raw = source.forecast(lat, lon, hours)

    return weather.normalize_forecast(raw)
  }
}
