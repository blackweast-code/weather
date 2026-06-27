"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

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
    time: "한 번",
    title: "폰 위치 저장",
    detail: "카카오톡 받을 폰에서 위치 권한 허용",
  },
  {
    time: "07:55",
    title: "날씨 조회",
    detail: "저장된 좌표로 오늘 예보 조회",
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
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    message: "카카오톡을 받을 휴대폰에서 위치를 저장하면 그 위치 기준으로 알림을 보냅니다.",
  });

  async function loadWeather() {
    setError("");
    const response = await fetch("/api/weather/current", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "날씨 정보를 가져오지 못했습니다.");
    }

    setWeather(payload as WeatherData);
    setLabel((payload as WeatherData).location.label);
  }

  useEffect(() => {
    loadWeather().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "날씨 정보를 가져오지 못했습니다.",
      );
    });
  }, []);

  function savePhoneLocation() {
    if (!navigator.geolocation) {
      setSaveState({
        status: "error",
        message: "이 브라우저는 위치 권한을 지원하지 않습니다.",
      });
      return;
    }

    setSaveState({
      status: "saving",
      message: "휴대폰 위치 권한을 요청하는 중입니다.",
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch("/api/location", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              label,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error || "위치 저장에 실패했습니다.");
          }

          setSaveState({
            status: "success",
            message: "휴대폰 위치가 저장됐습니다. 다음 알림부터 이 위치를 사용합니다.",
          });
          await loadWeather();
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
          message: "위치 권한이 거부됐습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.",
        });
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 15000 },
    );
  }

  if (!weather) {
    return (
      <main className="app-shell">
        <section className="card loading-panel">
          <p className="eyebrow">Morning Weather Agent</p>
          <h1>위치 기반 날씨를 불러오는 중입니다</h1>
          <p>{error || "저장된 위치가 없으면 서울 성동구 기준으로 먼저 표시합니다."}</p>
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
                  ? "휴대폰 위치 저장됨"
                  : "기본 위치 사용 중"}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="location-band card" aria-label="휴대폰 위치 설정">
        <div>
          <p className="section-kicker">Phone Location</p>
          <h2>카카오톡 받을 휴대폰 위치로 지역 설정</h2>
          <p>
            카카오톡이나 PlayMCP가 휴대폰 GPS를 자동으로 읽을 수는 없어서,
            받을 폰에서 이 페이지를 열고 위치 권한을 한 번 허용해야 합니다.
          </p>
        </div>
        <div className="location-controls">
          <input
            aria-label="위치 이름"
            className="text-input"
            onChange={(event) => setLabel(event.target.value)}
            placeholder="예: 집, 회사, 서울 성동구"
            value={label}
          />
          <button onClick={savePhoneLocation} type="button">
            이 폰 위치 저장
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
