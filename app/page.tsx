"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

type ForecastSlot = {
  time: string;
  pop: number;
  type: string;
  temp: number;
  amount: string;
  sky: string;
  code: number;
  precipitation: number;
  humidity: number;
  wind: number;
  windDirection: number;
};

type PrecipitationSpot = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  pop: number;
  temp: number;
  precipitation: number;
  sky: string;
  type: string;
};

type WeatherData = {
  location: {
    label: string;
    address?: string;
    locality?: string;
    latitude: number;
    longitude: number;
    updatedAt: string;
    source: "saved" | "default";
  };
  baseTime: string;
  high: number;
  low: number;
  maxPop: number;
  forecast: ForecastSlot[];
  hourly: ForecastSlot[];
  precipitationMap: {
    source: string;
    maxPop: number;
    maxPrecipitation: number;
    spots: PrecipitationSpot[];
  };
  sourceInfo: {
    weather: string;
    address: string;
    map: string;
    koreaRecommendation: string;
  };
  decision: {
    key: "need" | "recommend" | "clear";
    label: string;
    title: string;
    level: number;
    summary: string;
    detail: string;
    reasons: string[];
    message: string;
  };
};

type SaveState = {
  status: "idle" | "saving" | "success" | "error";
  message: string;
};

type TimelineMode = "weather" | "rain" | "wind" | "humidity";

const workflowSteps = [
  {
    time: "자동",
    title: "휴대폰 위치 수집",
    detail: "페이지가 열리면 브라우저 위치 권한 요청",
  },
  {
    time: "즉시",
    title: "날씨 조회",
    detail: "저장된 좌표로 오늘 예보 갱신",
  },
  {
    time: "07:58",
    title: "우산 판단",
    detail: "강수확률과 강수형태로 필요 여부 계산",
  },
  {
    time: "08:00",
    title: "PlayMCP 발송",
    detail: "ChatGPT 자동화가 카카오톡 전송",
  },
];

const statusClass = {
  need: "status-need",
  recommend: "status-recommend",
  clear: "status-clear",
};

const timelineModes: Array<{ key: TimelineMode; label: string }> = [
  { key: "weather", label: "날씨" },
  { key: "rain", label: "강수" },
  { key: "wind", label: "바람" },
  { key: "humidity", label: "습도" },
];

function slotIconClass(slot: ForecastSlot) {
  if (slot.type === "비" || slot.type === "소나기") return "rain";
  if (slot.type === "눈") return "snow";
  if (slot.sky === "구름" || slot.sky === "흐림") return "cloud";
  return "sun";
}

function timelineMetric(slot: ForecastSlot, mode: TimelineMode) {
  if (mode === "rain") return `${slot.pop}%`;
  if (mode === "wind") return `${slot.wind}km/h`;
  if (mode === "humidity") return `${slot.humidity}%`;
  return slot.type === "없음" ? slot.sky : slot.type;
}

function windDirectionLabel(degrees: number) {
  const directions = [
    "북풍",
    "북동풍",
    "동풍",
    "남동풍",
    "남풍",
    "남서풍",
    "서풍",
    "북서풍",
  ];
  const index = Math.round(((degrees % 360) / 45)) % directions.length;

  return directions[index];
}

function barPercent(value: number, max: number) {
  return `${Math.min(100, Math.max(8, (value / max) * 100))}%`;
}

function rainIntensity(spot: PrecipitationSpot) {
  if (spot.precipitation >= 3 || spot.pop >= 70) return "heavy";
  if (spot.precipitation >= 1 || spot.pop >= 50) return "mid";
  if (spot.pop >= 25) return "light";
  return "clear";
}

function openStreetMapUrl(location: WeatherData["location"]) {
  const lat = location.latitude;
  const lon = location.longitude;
  const latPad = 0.07;
  const lonPad = 0.09;
  const bbox = [
    lon - lonPad,
    lat - latPad,
    lon + lonPad,
    lat + latPad,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
}

export default function Home() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("내 휴대폰 위치");
  const [adminToken, setAdminToken] = useState("");
  const [timelineMode, setTimelineMode] = useState<TimelineMode>("weather");
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    message:
      "관리자 토큰을 저장한 휴대폰에서만 자동 위치 수집이 실행됩니다. 일반 방문자는 보기만 가능합니다.",
  });
  const autoRequested = useRef(false);

  async function loadWeather() {
    setError("");
    const response = await fetch("/api/weather/current", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "날씨 정보를 가져오지 못했습니다.");
    }

    const nextWeather = payload as WeatherData;
    setWeather(nextWeather);
    setLabel(nextWeather.location.label);
  }

  async function saveCoordinates(
    latitude: number,
    longitude: number,
    locationLabel: string,
    updateToken: string,
  ): Promise<WeatherData["location"]> {
    const response = await fetch("/api/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-location-update-token": updateToken,
      },
      body: JSON.stringify({
        label: locationLabel,
        latitude,
        longitude,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "위치 저장에 실패했습니다.");
    }

    return payload.location as WeatherData["location"];
  }

  function collectPhoneLocation(
    mode: "auto" | "manual" = "manual",
    tokenOverride?: string,
  ) {
    const updateToken = (tokenOverride ?? adminToken).trim();

    if (!updateToken) {
      setSaveState({
        status: "idle",
        message:
          "공개 방문자는 위치를 바꿀 수 없습니다. 관리자 토큰을 입력하면 이 휴대폰 위치를 자동으로 저장합니다.",
      });
      return;
    }

    if (!navigator.geolocation) {
      setSaveState({
        status: "error",
        message: "이 브라우저는 위치 권한을 지원하지 않습니다.",
      });
      return;
    }

    setSaveState({
      status: "saving",
      message:
        mode === "auto"
          ? "자동 위치 수집을 위해 브라우저 권한을 요청하는 중입니다."
          : "휴대폰 위치 권한을 다시 요청하는 중입니다.",
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const locationLabel = label.trim() || "내 휴대폰 위치";
          const savedLocation = await saveCoordinates(
            position.coords.latitude,
            position.coords.longitude,
            locationLabel,
            updateToken,
          );
          window.localStorage.setItem("locationUpdateToken", updateToken);
          await loadWeather();
          setSaveState({
            status: "success",
            message:
              mode === "auto"
                ? `위치가 자동 저장됐습니다. 확인된 위치: ${savedLocation.address ?? savedLocation.label}`
                : `위치를 다시 저장했습니다. 확인된 위치: ${savedLocation.address ?? savedLocation.label}`,
          });
        } catch (saveError) {
          setSaveState({
            status: "error",
            message:
              saveError instanceof Error
                ? saveError.message
                : "위치 저장에 실패했습니다.",
          });
        }
      },
      () => {
        setSaveState({
          status: "error",
          message:
            "위치 권한이 허용되지 않아 기본 위치를 사용합니다. 브라우저에서 위치 권한을 허용하면 자동 갱신됩니다.",
        });
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 15000 },
    );
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem("locationUpdateToken") ?? "";
    setAdminToken(storedToken);

    loadWeather()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "날씨 정보를 가져오지 못했습니다.",
        );
      })
      .finally(() => {
        if (storedToken && !autoRequested.current) {
          autoRequested.current = true;
          collectPhoneLocation("auto", storedToken);
        } else if (!storedToken) {
          setSaveState({
            status: "idle",
            message:
              "공개 열람 모드입니다. 관리자 토큰을 입력하면 이 휴대폰 위치를 자동으로 저장할 수 있습니다.",
          });
        }
      });
    // This should run only once on page entry so the browser permission prompt
    // does not keep reappearing during normal state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!weather) {
    return (
      <main className="app-shell">
        <section className="card loading-panel">
          <p className="eyebrow">PlayMCP Weather Agent</p>
          <h1>위치 기반 날씨를 불러오는 중입니다</h1>
          <p>{error || "저장된 위치가 없으면 기본 위치 기준으로 먼저 표시합니다."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PlayMCP Weather Agent</p>
          <h1>오늘 우산 필요할까?</h1>
        </div>
        <div className="topbar-meta">
          <span>{weather.location.label}</span>
          <span>
            {weather.location.source === "saved" ? "휴대폰 위치 기준" : "기본 위치 기준"}
          </span>
          <span>날씨 출처: {weather.sourceInfo.weather}</span>
        </div>
      </header>

      <section className="hero-grid" aria-label="오늘의 우산 판단">
        <article
          className={`decision-panel card ${statusClass[weather.decision.key]}`}
        >
          <div className="decision-header">
            <span className="status-badge">{weather.decision.label}</span>
            <span className="level">Level {weather.decision.level}</span>
          </div>
          <h2>{weather.decision.title}</h2>
          <p className="summary">{weather.decision.summary}</p>
          <p className="detail">{weather.decision.detail}</p>

          <div className="metric-grid" aria-label="오늘 날씨 요약">
            <div>
              <span>최고</span>
              <strong>{weather.high}°C</strong>
            </div>
            <div>
              <span>최저</span>
              <strong>{weather.low}°C</strong>
            </div>
            <div>
              <span>강수확률</span>
              <strong>{weather.maxPop}%</strong>
            </div>
          </div>
        </article>

        <article className="weather-map card">
          <div className="map-header">
            <div>
              <p className="section-kicker">강수량 지도</p>
              <h2>{weather.location.locality ?? weather.location.label}</h2>
            </div>
            <span className="freshness">{weather.precipitationMap.source}</span>
          </div>
          <div className="map-canvas">
            <iframe
              aria-label={`${weather.location.label} 주변 지도`}
              loading="lazy"
              src={openStreetMapUrl(weather.location)}
              title="현재 위치 주변 지도"
            />
            <div className="rain-overlay" aria-hidden="true" />
            {weather.precipitationMap.spots.map((spot) => (
              <div
                className={`rain-spot ${rainIntensity(spot)} ${
                  spot.id === "c" ? "current" : ""
                }`}
                key={spot.id}
                style={
                  {
                    "--x": `${spot.x}%`,
                    "--y": `${spot.y}%`,
                  } as CSSProperties
                }
              >
                <strong>{spot.label}</strong>
                <span>{spot.precipitation.toFixed(1)}mm</span>
                <small>{spot.pop}%</small>
              </div>
            ))}
            <div className="current-location-pin" aria-label="내 정확한 위치">
              <span />
              <strong>내 위치</strong>
            </div>
          </div>
          <div className="map-legend">
            <span>0mm</span>
            <span>1mm+</span>
            <span>3mm+</span>
            <strong>최대 {weather.precipitationMap.maxPop}%</strong>
          </div>
          <div className="message-preview">
            <span>PlayMCP 카카오톡 알림</span>
            <strong>ChatGPT 자동화 발송</strong>
            <p>{weather.decision.message}</p>
            <div className="playmcp-status">
              <span className="ready">PlayMCP 연결 확인됨</span>
              <span className={weather.location.source === "saved" ? "ready" : ""}>
                {weather.location.source === "saved"
                  ? "자동 위치 저장됨"
                  : "위치 권한 대기 중"}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="location-band card" aria-label="자동 위치 설정">
        <div>
          <p className="section-kicker">Auto Location</p>
          <h2>관리자 휴대폰 위치를 자동으로 수집합니다</h2>
          <p>
            공개 링크는 누구나 볼 수 있지만 위치 변경은 관리자 토큰이 있는
            브라우저에서만 가능합니다. 관리자 토큰을 저장한 휴대폰에서 열면
            자동으로 위치 권한을 요청하고, 허용된 좌표로 날씨를 다시 계산합니다.
          </p>
          <div className="resolved-location">
            <span>확인된 위치</span>
            <strong>{weather.location.address ?? weather.location.label}</strong>
            <small>
              {weather.location.latitude.toFixed(5)},{" "}
              {weather.location.longitude.toFixed(5)}
            </small>
          </div>
        </div>
        <div className="location-controls">
          <input
            aria-label="관리자 토큰"
            className="text-input"
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="관리자 위치 저장 토큰"
            type="password"
            value={adminToken}
          />
          <input
            aria-label="위치 이름"
            className="text-input"
            onChange={(event) => setLabel(event.target.value)}
            placeholder="예: 집, 회사, 서울 성동구"
            value={label}
          />
          <button onClick={() => collectPhoneLocation("manual")} type="button">
            관리자 위치 저장
          </button>
          <p className={`send-result ${saveState.status}`}>
            {saveState.message}
          </p>
        </div>
      </section>

      <section className="content-grid">
        <article className="card hourly-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">시간별 예보</p>
              <h2>아이콘으로 보는 앞으로의 날씨</h2>
            </div>
            <span className="freshness">기준 {weather.baseTime}</span>
          </div>

          <div className="weather-tabs" role="tablist" aria-label="시간별 예보 보기">
            {timelineModes.map((mode) => (
              <button
                aria-selected={timelineMode === mode.key}
                className={timelineMode === mode.key ? "active" : ""}
                key={mode.key}
                onClick={() => setTimelineMode(mode.key)}
                role="tab"
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className={`hourly-strip ${timelineMode}`} aria-label="시간별 날씨 표">
            {weather.hourly.map((slot, index) => {
              const displayTime = index === 0 ? "지금" : `${slot.time.slice(0, 2)}시`;

              if (timelineMode === "rain") {
                return (
                  <div className="hour-card rain-mode" key={`${slot.time}-${index}`}>
                    <span className="rain-drop" />
                    <strong>{slot.pop > 0 ? `${slot.pop}%` : "-"}</strong>
                    <small>{slot.precipitation > 0 ? slot.precipitation.toFixed(1) : "0"}</small>
                    <div
                      className="metric-column rain-column"
                      style={{ "--bar": barPercent(slot.precipitation, 5) } as CSSProperties}
                    />
                    <time>{displayTime}</time>
                  </div>
                );
              }

              if (timelineMode === "wind") {
                return (
                  <div className="hour-card wind-mode" key={`${slot.time}-${index}`}>
                    <span
                      className="wind-arrow"
                      style={
                        {
                          "--wind": `${(slot.windDirection + 270) % 360}deg`,
                        } as CSSProperties
                      }
                    />
                    <strong>{windDirectionLabel(slot.windDirection)}</strong>
                    <small>{slot.wind} m/s</small>
                    <div
                      className="metric-column wind-column"
                      style={{ "--bar": barPercent(slot.wind, 12) } as CSSProperties}
                    />
                    <time>{displayTime}</time>
                  </div>
                );
              }

              if (timelineMode === "humidity") {
                return (
                  <div className="hour-card humidity-mode" key={`${slot.time}-${index}`}>
                    <strong>{slot.humidity}</strong>
                    <small>%</small>
                    <div
                      className="metric-column humidity-column"
                      style={{ "--bar": barPercent(slot.humidity, 100) } as CSSProperties}
                    />
                    <time>{displayTime}</time>
                  </div>
                );
              }

              return (
                <div className="hour-card weather-mode" key={`${slot.time}-${index}`}>
                  <strong>{slot.temp}°</strong>
                  <div className={`weather-icon ${slotIconClass(slot)}`}>
                    <span />
                  </div>
                  <time>{displayTime}</time>
                  <small>{timelineMetric(slot, timelineMode)}</small>
                  <em>{slot.pop}%</em>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card reasons-card">
          <p className="section-kicker">판단 근거</p>
          <h2>Decision Engine</h2>
          <ul>
            {weather.decision.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="coordinate-note">
            <span>좌표</span>
            <strong>
              {weather.location.latitude.toFixed(4)},{" "}
              {weather.location.longitude.toFixed(4)}
            </strong>
          </div>
          <div className="coordinate-note">
            <span>데이터 출처</span>
            <strong>{weather.sourceInfo.weather}</strong>
            <small>
              주소 {weather.sourceInfo.address} · 지도 {weather.sourceInfo.map}
            </small>
            <small>{weather.sourceInfo.koreaRecommendation}</small>
          </div>
        </article>
      </section>

      <section className="workflow-band" aria-label="PlayMCP 자동화 흐름">
        <div className="section-heading">
          <div>
            <p className="section-kicker">자동화 흐름</p>
            <h2>위치 기반 카카오톡 발송 순서</h2>
          </div>
          <span className="freshness">메시지 200자 이하</span>
        </div>

        <div className="timeline">
          {workflowSteps.map((step) => (
            <article className="timeline-item" key={`${step.time}-${step.title}`}>
              <time>{step.time}</time>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
