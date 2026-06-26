"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

type ScenarioKey = "need" | "recommend" | "clear";

type ForecastSlot = {
  time: string;
  pop: number;
  type: string;
  temp: number;
  amount: string;
  sky: string;
};

type Scenario = {
  label: string;
  decision: string;
  level: number;
  summary: string;
  detail: string;
  region: string;
  baseTime: string;
  high: number;
  low: number;
  kakaoStatus: string;
  message: string;
  reasons: string[];
  forecast: ForecastSlot[];
};

const scenarios: Record<ScenarioKey, Scenario> = {
  need: {
    label: "필요",
    decision: "우산 필요",
    level: 3,
    summary: "오후 3시 이후 비 예보가 있어 우산이 필요합니다.",
    detail:
      "강수확률 60% 이상 시간대가 있고, 퇴근 시간대 강수 가능성이 높아 보수적으로 필요로 판단했습니다.",
    region: "서울 성동구",
    baseTime: "2026-06-26 07:55",
    high: 27,
    low: 21,
    kakaoStatus: "발송 대기",
    message:
      "오후 3시 이후 비 예보가 있습니다. 최고기온 27°C / 최저기온 21°C, 강수확률 최대 70%",
    reasons: [
      "15시 이후 강수확률 70%",
      "예상 강수형태: 비",
      "퇴근 시간대 17:00~20:00 강수 가능성 있음",
    ],
    forecast: [
      { time: "09:00", pop: 30, type: "없음", temp: 24, amount: "0mm", sky: "흐림" },
      { time: "12:00", pop: 45, type: "없음", temp: 26, amount: "0mm", sky: "흐림" },
      { time: "15:00", pop: 70, type: "비", temp: 25, amount: "1~4mm", sky: "비" },
      { time: "18:00", pop: 65, type: "비", temp: 23, amount: "1mm", sky: "비" },
      { time: "21:00", pop: 40, type: "없음", temp: 22, amount: "0mm", sky: "흐림" },
    ],
  },
  recommend: {
    label: "권장",
    decision: "휴대용 우산 권장",
    level: 2,
    summary: "강수확률은 높지 않지만 퇴근 시간대 소나기 가능성이 있습니다.",
    detail:
      "40~59% 강수확률이 반복되고 이동 시간대에 걸쳐 있어 가벼운 우산을 권장합니다.",
    region: "서울 성동구",
    baseTime: "2026-06-26 07:55",
    high: 29,
    low: 22,
    kakaoStatus: "발송 대기",
    message:
      "강수확률은 높지 않지만 퇴근 시간대 소나기 가능성이 있어 휴대용 우산을 권장합니다.",
    reasons: [
      "퇴근 시간대 강수확률 45%",
      "40~59% 시간대가 2개 이상",
      "불확실성이 있어 권장으로 안내",
    ],
    forecast: [
      { time: "09:00", pop: 20, type: "없음", temp: 25, amount: "0mm", sky: "구름많음" },
      { time: "12:00", pop: 35, type: "없음", temp: 28, amount: "0mm", sky: "구름많음" },
      { time: "15:00", pop: 45, type: "없음", temp: 28, amount: "0mm", sky: "흐림" },
      { time: "18:00", pop: 45, type: "소나기", temp: 26, amount: "1mm 미만", sky: "흐림" },
      { time: "21:00", pop: 30, type: "없음", temp: 24, amount: "0mm", sky: "흐림" },
    ],
  },
  clear: {
    label: "불필요",
    decision: "우산 불필요",
    level: 1,
    summary: "오늘은 강수 예보가 없어 우산이 필요하지 않습니다.",
    detail:
      "전 시간대 강수확률이 낮고 강수형태가 없어 일반 이동에는 우산 없이도 충분합니다.",
    region: "서울 성동구",
    baseTime: "2026-06-26 07:55",
    high: 30,
    low: 23,
    kakaoStatus: "발송 대기",
    message:
      "오늘은 강수 예보가 없어 우산이 필요하지 않습니다. 최고기온 30°C / 최저기온 23°C",
    reasons: [
      "전 시간대 강수확률 30% 미만",
      "강수형태 없음",
      "예상 강수량 0mm",
    ],
    forecast: [
      { time: "09:00", pop: 10, type: "없음", temp: 25, amount: "0mm", sky: "맑음" },
      { time: "12:00", pop: 10, type: "없음", temp: 29, amount: "0mm", sky: "맑음" },
      { time: "15:00", pop: 20, type: "없음", temp: 30, amount: "0mm", sky: "구름많음" },
      { time: "18:00", pop: 20, type: "없음", temp: 28, amount: "0mm", sky: "구름많음" },
      { time: "21:00", pop: 10, type: "없음", temp: 25, amount: "0mm", sky: "맑음" },
    ],
  },
};

const pipelineSteps = [
  { time: "07:45", title: "날씨 수집", detail: "기상청 API 호출 및 예보 저장" },
  { time: "07:55", title: "우산 판단", detail: "강수확률, 형태, 시간대 가중치 반영" },
  { time: "07:58", title: "홈페이지 갱신", detail: "최신 카드와 상세 표 업데이트" },
  { time: "08:00", title: "카카오 발송", detail: "나에게 보내기 메시지 전송" },
];

const mvpItems = [
  "단일 지역 날씨 조회",
  "우산 필요 여부 3단계 판단",
  "홈페이지 자동 업데이트",
  "카카오톡 나에게 보내기",
  "수집 및 발송 로그 저장",
  "실패 시 재시도",
];

const statusClass: Record<ScenarioKey, string> = {
  need: "status-need",
  recommend: "status-recommend",
  clear: "status-clear",
};

export default function Home() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("need");
  const scenario = scenarios[scenarioKey];

  const maxPop = useMemo(
    () => Math.max(...scenario.forecast.map((slot) => slot.pop)),
    [scenario],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Morning Weather Agent</p>
          <h1>오늘 우산 필요할까?</h1>
        </div>
        <div className="topbar-meta">
          <span>{scenario.region}</span>
          <span>기준 {scenario.baseTime}</span>
        </div>
      </header>

      <section className="hero-grid" aria-label="오늘의 우산 판단">
        <article className={`decision-panel card ${statusClass[scenarioKey]}`}>
          <div className="decision-header">
            <span className="status-badge">{scenario.label}</span>
            <span className="level">Level {scenario.level}</span>
          </div>
          <h2>{scenario.decision}</h2>
          <p className="summary">{scenario.summary}</p>
          <p className="detail">{scenario.detail}</p>

          <div className="metric-grid" aria-label="오늘 날씨 요약">
            <div>
              <span>최고</span>
              <strong>{scenario.high}°C</strong>
            </div>
            <div>
              <span>최저</span>
              <strong>{scenario.low}°C</strong>
            </div>
            <div>
              <span>강수확률</span>
              <strong>{maxPop}%</strong>
            </div>
          </div>
        </article>

        <article className="visual-panel card">
          <img
            src="/rain-forecast.png"
            alt="비 예보를 나타내는 우산과 강수 시간 그래픽"
          />
          <div className="message-preview">
            <span>카카오톡 알림</span>
            <strong>{scenario.kakaoStatus}</strong>
            <p>{scenario.message}</p>
          </div>
        </article>
      </section>

      <section className="control-band" aria-label="판단 시나리오">
        <div>
          <p className="section-kicker">판단 상태</p>
          <h2>PRD 기준 3단계 판단 미리보기</h2>
        </div>
        <div className="segmented-control" role="tablist" aria-label="우산 판단 상태">
          {Object.entries(scenarios).map(([key, item]) => (
            <button
              aria-selected={scenarioKey === key}
              className={scenarioKey === key ? "active" : ""}
              key={key}
              onClick={() => setScenarioKey(key as ScenarioKey)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="content-grid">
        <article className="card forecast-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">시간대별 예보</p>
              <h2>강수확률과 강수형태</h2>
            </div>
            <span className="freshness">자동 업데이트 전</span>
          </div>

          <div className="forecast-list">
            {scenario.forecast.map((slot) => (
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
            {scenario.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="workflow-band" aria-label="매일 아침 자동화 흐름">
        <div className="section-heading">
          <div>
            <p className="section-kicker">자동화 흐름</p>
            <h2>오전 8시 발송을 위한 실행 순서</h2>
          </div>
          <span className="freshness">재시도 정책 포함</span>
        </div>

        <div className="timeline">
          {pipelineSteps.map((step) => (
            <article className="timeline-item" key={step.time}>
              <time>{step.time}</time>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mvp-band" aria-label="MVP 범위">
        <div>
          <p className="section-kicker">MVP Scope</p>
          <h2>초기 버전에 포함되는 기능</h2>
        </div>
        <ul className="mvp-list">
          {mvpItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
