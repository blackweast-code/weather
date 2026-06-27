export type SavedLocation = {
  label: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
  source: "saved" | "default";
};

export type ForecastSlot = {
  time: string;
  pop: number;
  type: string;
  temp: number;
  amount: string;
  sky: string;
};

export type UmbrellaDecision = {
  key: "need" | "recommend" | "clear";
  label: string;
  title: string;
  level: number;
  summary: string;
  detail: string;
  reasons: string[];
  message: string;
};

export type WeatherResult = {
  location: SavedLocation;
  baseTime: string;
  high: number;
  low: number;
  maxPop: number;
  forecast: ForecastSlot[];
  decision: UmbrellaDecision;
};

type OpenMeteoResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    weather_code?: number[];
  };
};

export const DEFAULT_LOCATION: SavedLocation = {
  label: "서울 성동구",
  latitude: 37.5636,
  longitude: 127.0365,
  updatedAt: "",
  source: "default",
};

function isRainCode(code: number) {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

function isSnowCode(code: number) {
  return code >= 71 && code <= 77;
}

function precipitationType(code: number) {
  if (isSnowCode(code)) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (isRainCode(code)) return "비";
  return "없음";
}

function skyLabel(code: number) {
  if (isRainCode(code)) return "비";
  if (isSnowCode(code)) return "눈";
  if (code === 0) return "맑음";
  if (code <= 3) return "구름";
  if (code === 45 || code === 48) return "안개";
  return "흐림";
}

function findNearestIndex(times: string[], targetHour: number) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const hour = Number(time.slice(11, 13));
    const distance = Math.abs(hour - targetHour);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function makeSlot(hourly: Required<OpenMeteoResponse>["hourly"], index: number) {
  const time = hourly.time?.[index] ?? "";
  const temp = Math.round(hourly.temperature_2m?.[index] ?? 0);
  const pop = Math.round(hourly.precipitation_probability?.[index] ?? 0);
  const precipitation = hourly.precipitation?.[index] ?? 0;
  const code = hourly.weather_code?.[index] ?? 0;

  return {
    time: time.slice(11, 16) || "--:--",
    pop,
    type: precipitationType(code),
    temp,
    amount: precipitation > 0 ? `${precipitation.toFixed(1)}mm` : "0mm",
    sky: skyLabel(code),
  };
}

function decideUmbrella(location: SavedLocation, forecast: ForecastSlot[]) {
  const maxPop = Math.max(...forecast.map((slot) => slot.pop));
  const wetSlots = forecast.filter((slot) =>
    ["비", "눈", "소나기"].includes(slot.type),
  );
  const strongPopSlots = forecast.filter((slot) => slot.pop >= 60);
  const midPopSlots = forecast.filter((slot) => slot.pop >= 40 && slot.pop < 60);
  const commuteRisk = forecast.some((slot) => {
    const hour = Number(slot.time.slice(0, 2));
    return (hour <= 10 || (hour >= 17 && hour <= 20)) && slot.pop >= 40;
  });
  const measurableRain = forecast.some((slot) => !slot.amount.startsWith("0"));

  if (wetSlots.length > 0 || strongPopSlots.length > 0 || measurableRain) {
    const firstWet = wetSlots[0] ?? strongPopSlots[0] ?? forecast[0];
    return {
      key: "need" as const,
      label: "필요",
      title: "우산 필요",
      level: 3,
      summary: `${location.label}은 ${firstWet.time} 전후 비 가능성이 있어 우산이 필요합니다.`,
      detail:
        "강수형태, 강수확률, 예상 강수량 중 하나 이상이 기준을 넘어 보수적으로 필요로 판단했습니다.",
      reasons: [
        `최대 강수확률 ${maxPop}%`,
        `강수형태 ${firstWet.type}`,
        `예상 강수량 ${firstWet.amount}`,
      ],
      message: `[오늘의 우산 알림]\n지역: ${location.label}\n판단: 우산 필요\n${firstWet.time} 전후 비 가능성. 최고 ${Math.max(...forecast.map((slot) => slot.temp))}°C / 최저 ${Math.min(...forecast.map((slot) => slot.temp))}°C / 강수확률 최대 ${maxPop}%`,
    };
  }

  if (midPopSlots.length >= 2 || commuteRisk) {
    return {
      key: "recommend" as const,
      label: "권장",
      title: "휴대용 우산 권장",
      level: 2,
      summary: `${location.label}은 강수확률이 애매해 휴대용 우산을 권장합니다.`,
      detail:
        "40~59% 강수확률이 반복되거나 이동 시간대에 걸쳐 있어 권장으로 안내합니다.",
      reasons: [
        `최대 강수확률 ${maxPop}%`,
        `40~59% 시간대 ${midPopSlots.length}개`,
        commuteRisk ? "출퇴근 시간대 강수 가능성 있음" : "불확실성 기준 적용",
      ],
      message: `[오늘의 우산 알림]\n지역: ${location.label}\n판단: 우산 권장\n강수확률이 애매합니다. 휴대용 우산을 챙기면 좋아요. 최대 ${maxPop}%`,
    };
  }

  return {
    key: "clear" as const,
    label: "불필요",
    title: "우산 불필요",
    level: 1,
    summary: `${location.label}은 오늘 강수 가능성이 낮아 우산이 필요하지 않습니다.`,
    detail:
      "전 시간대 강수확률이 낮고 강수형태가 없어 일반 이동에는 우산 없이도 충분합니다.",
    reasons: [
      `최대 강수확률 ${maxPop}%`,
      "강수형태 없음",
      "예상 강수량 0mm",
    ],
    message: `[오늘의 우산 알림]\n지역: ${location.label}\n판단: 우산 불필요\n오늘은 강수 가능성이 낮습니다. 최고 ${Math.max(...forecast.map((slot) => slot.temp))}°C / 최저 ${Math.min(...forecast.map((slot) => slot.temp))}°C`,
  };
}

export async function fetchWeather(location: SavedLocation): Promise<WeatherResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,precipitation,weather_code",
  );
  url.searchParams.set("timezone", "Asia/Seoul");
  url.searchParams.set("forecast_days", "1");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("날씨 예보를 가져오지 못했습니다.");
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const hourly = data.hourly;

  if (!hourly?.time?.length) {
    throw new Error("날씨 예보 데이터가 비어 있습니다.");
  }

  const targetHours = [9, 12, 15, 18, 21];
  const forecast = targetHours.map((hour) =>
    makeSlot(hourly, findNearestIndex(hourly.time ?? [], hour)),
  );
  const temps = hourly.temperature_2m ?? [];
  const decision = decideUmbrella(location, forecast);

  return {
    location,
    baseTime: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    high: Math.round(Math.max(...temps)),
    low: Math.round(Math.min(...temps)),
    maxPop: Math.max(...forecast.map((slot) => slot.pop)),
    forecast,
    decision,
  };
}
