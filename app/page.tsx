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
};

type WeatherData = {
  location: {
    label: string;
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

export default function Home() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("내 휴대폰 위치");
  const [adminToken, setAdminToken] = useState("");
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
  ) {
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
          await saveCoordinates(
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
                ? "위치가 자동 저장됐습니다. 이 휴대폰 위치 기준으로 날씨를 갱신했습니다."
                : "위치를 다시 저장했습니다. 다음 알림부터 이 위치를 사용합니다.",
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

        <article className="visual-panel card">
          <img
            src="/rain-forecast.png"
            alt="우산과 시간대별 강수확률 그래픽"
          />
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
        <article className="card forecast-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">시간대별 예보</p>
              <h2>저장된 위치의 오늘 예보</h2>
            </div>
            <span className="freshness">기준 {weather.baseTime}</span>
          </div>

          <div className="forecast-list">
            {weather.forecast.map((slot) => (
              <div className="forecast-row" key={slot.time}>
                <span className="forecast-time">{slot.time}</span>
                <div
                  aria-label={`${slot.time} 강수확률 ${slot.pop}%`}
                  className="rain-bar"
                  style={{ "--rain": `${slot.pop}%` } as CSSProperties}
                >
                  <span />
                </div>
                <strong>{slot.pop}%</strong>
                <span>{slot.type}</span>
                <span>{slot.temp}°C</span>
                <span>{slot.amount}</span>
              </div>
            ))}
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
