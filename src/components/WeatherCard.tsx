import { useEffect, useState } from "react";
import { Cloud, CloudRain, CloudSnow, Sun, Wind, Zap, Droplets, Loader2, MapPin, Mountain, Layers as LayersIcon } from "lucide-react";

type WeatherData = {
  name: string;
  main: { temp: number; humidity: number; feels_like: number };
  weather: { id: number; main: string; description: string; icon: string }[];
  wind: { speed: number };
  sys: { country: string };
};

type Condition = "sunny" | "clear-night" | "cloudy" | "rain" | "storm" | "snow" | "cyclone" | "mist";

function classify(id: number, icon: string): Condition {
  if (id >= 200 && id < 300) return "storm";
  if (id >= 300 && id < 600) return "rain";
  if (id >= 600 && id < 700) return "snow";
  if (id >= 700 && id < 800) return "mist";
  if (id === 800) return icon.endsWith("n") ? "clear-night" : "sunny";
  if (id > 800) return "cloudy";
  // tropical storm / hurricane fallback
  if (id === 781) return "cyclone";
  return "cloudy";
}

const API_KEY = import.meta.env.VITE_OPENWEATHER_API as string | undefined;

interface WeatherCardProps {
  terrainEnabled?: boolean;
  onToggleTerrain?: () => void;
  imergEnabled?: boolean;
  onToggleIMERG?: () => void;
  imergMode?: '24h' | '72h';
  onChangeIMERGMode?: (m: '24h' | '72h') => void;
  copernicusFloodEnabled?: boolean;
  onToggleCopernicusFlood?: () => void;
}

export default function WeatherCard({
  terrainEnabled,
  onToggleTerrain,
  imergEnabled,
  onToggleIMERG,
  imergMode,
  onChangeIMERGMode,
  copernicusFloodEnabled,
  onToggleCopernicusFlood,
}: WeatherCardProps = {}) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(lat: number, lon: number) {
      try {
        if (!API_KEY) throw new Error("Missing OpenWeather API key");
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
        );
        if (!res.ok) throw new Error(`Weather API ${res.status}`);
        const json = await res.json();
        if (!cancelled) { setData(json); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setError(e.message ?? "Failed"); setLoading(false); }
      }
    }
    if (!navigator.geolocation) { load(-1.2921, 36.8219); return; } // Nairobi fallback
    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude),
      () => load(-1.2921, 36.8219),
      { timeout: 6000 }
    );
    return () => { cancelled = true; };
  }, []);

  const condition: Condition = data ? classify(data.weather[0].id, data.weather[0].icon) : "cloudy";

  return (
    <div
      className="fixed top-20 right-4 z-30 w-72 rounded-2xl overflow-hidden neu-panel border border-white/10 shadow-2xl backdrop-blur-md transition-all"
      style={{ animation: "fade-in 0.4s ease-out" }}
    >
      {/* Animated background */}
      <div className={`weather-bg weather-${condition}`}>
        <WeatherAnimation condition={condition} />
      </div>

      <div className="relative z-10 p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-90">
            <MapPin className="w-3 h-3" />
            <span>{data?.name ?? "Locating..."}</span>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs opacity-70 hover:opacity-100"
            aria-label="toggle"
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm opacity-80">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading weather…
          </div>
        )}
        {error && <div className="text-xs text-red-300 py-2">{error}</div>}

        {data && !collapsed && (
          <>
            <div className="flex items-end gap-3 mb-3">
              <div className="text-5xl font-light leading-none">{Math.round(data.main.temp)}°</div>
              <div className="pb-1">
                <ConditionIcon condition={condition} />
                <div className="text-xs capitalize opacity-90 mt-0.5">{data.weather[0].description}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] opacity-90 border-t border-white/15 pt-2">
              <div className="flex flex-col items-center gap-0.5">
                <Wind className="w-3.5 h-3.5" />
                <span>{Math.round(data.wind.speed)} m/s</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Droplets className="w-3.5 h-3.5" />
                <span>{data.main.humidity}%</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="opacity-70">feels</span>
                <span>{Math.round(data.main.feels_like)}°</span>
              </div>
            </div>
          </>
        )}
        {data && collapsed && (
          <div className="flex items-center gap-2 text-sm">
            <ConditionIcon condition={condition} />
            <span>{Math.round(data.main.temp)}° · {data.weather[0].main}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConditionIcon({ condition }: { condition: Condition }) {
  const cls = "w-5 h-5";
  switch (condition) {
    case "sunny": return <Sun className={cls} />;
    case "clear-night": return <Sun className={cls} />;
    case "rain": return <CloudRain className={cls} />;
    case "storm":
    case "cyclone": return <Zap className={cls} />;
    case "snow": return <CloudSnow className={cls} />;
    default: return <Cloud className={cls} />;
  }
}

function WeatherAnimation({ condition }: { condition: Condition }) {
  if (condition === "sunny") {
    return <div className="sun-rays" />;
  }
  if (condition === "rain") {
    return (
      <div className="rain-container">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="raindrop" style={{ left: `${(i * 2.5) % 100}%`, animationDelay: `${(i * 0.07) % 1.4}s`, animationDuration: `${0.6 + ((i * 0.13) % 0.8)}s` }} />
        ))}
      </div>
    );
  }
  if (condition === "storm") {
    return (
      <>
        <div className="rain-container">
          {Array.from({ length: 50 }).map((_, i) => (
            <span key={i} className="raindrop storm" style={{ left: `${(i * 2) % 100}%`, animationDelay: `${(i * 0.05) % 1}s` }} />
          ))}
        </div>
        <div className="lightning" />
      </>
    );
  }
  if (condition === "cyclone") {
    return <div className="cyclone-spiral" />;
  }
  if (condition === "snow") {
    return (
      <div className="snow-container">
        {Array.from({ length: 30 }).map((_, i) => (
          <span key={i} className="snowflake" style={{ left: `${(i * 3.3) % 100}%`, animationDelay: `${(i * 0.2) % 4}s`, animationDuration: `${4 + ((i * 0.3) % 4)}s` }}>❄</span>
        ))}
      </div>
    );
  }
  if (condition === "clear-night") {
    return (
      <div className="stars-container">
        {Array.from({ length: 25 }).map((_, i) => (
          <span key={i} className="star" style={{ left: `${(i * 4.1) % 100}%`, top: `${(i * 7.3) % 100}%`, animationDelay: `${(i * 0.15) % 3}s` }} />
        ))}
      </div>
    );
  }
  return <div className="cloud-drift" />;
}
