import { fetchKmaWeather, isKmaConfigured } from "@/lib/kma";

export type SavedLocation = {
  label: string;
  address?: string;
  addressSource?: string;
  locality?: string;
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
  code: number;
  precipitation: number;
  humidity: number;
  wind: number;
  windDirection: number;
};

export type PrecipitationSpot = {
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

export type PrecipitationMap = {
  source: string;
  maxPop: number;
  maxPrecipitation: number;
  spots: PrecipitationSpot[];
};

export type WeatherSourceInfo = {
  weather: string;
  address: string;
  map: string;
  koreaRecommendation: string;
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
  hourly: ForecastSlot[];
  precipitationMap: PrecipitationMap;
  sourceInfo: WeatherSourceInfo;
  decision: UmbrellaDecision;
};

type OpenMeteoResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    weather_code?: number[];
    relative_humidity_2m?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
};

export const DEFAULT_LOCATION: SavedLocation = {
  label: "서울 성동구",
  address: "서울특별시 성동구",
  locality: "서울 성동구",
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

function hasFinalConsonant(value: string) {
  const last = value.trim().at(-1);
  if (!last) return false;

  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;

  return (code - 0xac00) % 28 !== 0;
}

function withTopicParticle(value: string) {
  return `${value}${hasFinalConsonant(value) ? "은" : "는"}`;
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
  const humidity = Math.round(hourly.relative_humidity_2m?.[index] ?? 0);
  const wind = Math.round(hourly.wind_speed_10m?.[index] ?? 0);
  const windDirection = Math.round(hourly.wind_direction_10m?.[index] ?? 0);

  return {
    time: time.slice(11, 16) || "--:--",
    pop,
    type: precipitationType(code),
    temp,
    amount: precipitation > 0 ? `${precipitation.toFixed(1)}mm` : "0mm",
    sky: skyLabel(code),
    code,
    precipitation,
    humidity,
    wind,
    windDirection,
  };
}

function findCurrentOrNextIndex(times: string[]) {
  const now = new Date();
  const koreaNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  ).getTime();

  const nextIndex = times.findIndex((time) => new Date(time).getTime() >= koreaNow);

  return nextIndex === -1 ? 0 : nextIndex;
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
      summary: `${withTopicParticle(location.label)} ${firstWet.time} 전후 비 가능성이 있어 우산이 필요합니다.`,
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
      summary: `${withTopicParticle(location.label)} 강수확률이 애매해 휴대용 우산을 권장합니다.`,
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
    summary: `${withTopicParticle(location.label)} 오늘 강수 가능성이 낮아 우산이 필요하지 않습니다.`,
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
  if (isKmaConfigured()) {
    const weather = await fetchKmaWeather(location);
    const decision = decideUmbrella(location, weather.forecast);

    return {
      location,
      baseTime: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      high: weather.high,
      low: weather.low,
      maxPop: weather.maxPop,
      forecast: weather.forecast,
      hourly: weather.hourly,
      precipitationMap: weather.precipitationMap,
      sourceInfo: {
        weather: "기상청 초단기실황 + 초단기예보 + 단기예보",
        address: location.addressSource ?? "OpenStreetMap Nominatim",
        map: "OpenStreetMap + 기상청 초단기/단기 격자 예보",
        koreaRecommendation:
          "현재는 초단기실황, 가까운 시간은 초단기예보, 이후 시간대는 단기예보를 조합해 한국 격자 기준으로 계산합니다.",
      },
      decision,
    };
  }

  return fetchOpenMeteoWeather(location);
}

async function fetchOpenMeteoWeather(
  location: SavedLocation,
  fallbackReason?: unknown,
): Promise<WeatherResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
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
  const startIndex = findCurrentOrNextIndex(hourly.time ?? []);
  const hourlyTimeline = Array.from({ length: 14 }, (_, offset) =>
    makeSlot(
      hourly,
      Math.min(startIndex + offset, Math.max((hourly.time?.length ?? 1) - 1, 0)),
    ),
  );
  const temps = hourly.temperature_2m ?? [];
  const decision = decideUmbrella(location, forecast);
  const precipitationMap = await fetchPrecipitationMap(location, startIndex);

  return {
    location,
    baseTime: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    high: Math.round(Math.max(...temps)),
    low: Math.round(Math.min(...temps)),
    maxPop: Math.max(...forecast.map((slot) => slot.pop)),
    forecast,
    hourly: hourlyTimeline,
    precipitationMap,
    sourceInfo: {
      weather: fallbackReason
        ? "Open-Meteo Forecast API (기상청 fallback)"
        : "Open-Meteo Forecast API",
      address: location.addressSource ?? "OpenStreetMap Nominatim",
      map: "OpenStreetMap",
      koreaRecommendation:
        fallbackReason instanceof Error
          ? `기상청 API 응답 오류로 임시 fallback 중입니다: ${fallbackReason.message}`
          : "한국 정밀 예보를 쓰려면 Vercel에 KMA_SERVICE_KEY를 설정하세요.",
    },
    decision,
  };
}

const MAP_SAMPLES = [
  { id: "nw", label: "북서 약 8km", lat: 0.055, lon: -0.07, x: 22, y: 24 },
  { id: "n", label: "북쪽 약 6km", lat: 0.06, lon: 0, x: 50, y: 19 },
  { id: "ne", label: "북동 약 8km", lat: 0.055, lon: 0.07, x: 78, y: 24 },
  { id: "w", label: "서쪽 약 7km", lat: 0, lon: -0.075, x: 17, y: 50 },
  { id: "c", label: "내 위치 격자", lat: 0, lon: 0, x: 50, y: 50 },
  { id: "e", label: "동쪽 약 7km", lat: 0, lon: 0.075, x: 83, y: 50 },
  { id: "sw", label: "남서 약 8km", lat: -0.055, lon: -0.07, x: 22, y: 76 },
  { id: "s", label: "남쪽 약 6km", lat: -0.06, lon: 0, x: 50, y: 81 },
  { id: "se", label: "남동 약 8km", lat: -0.055, lon: 0.07, x: 78, y: 76 },
];

async function fetchSpot(location: SavedLocation, sample: (typeof MAP_SAMPLES)[number], index: number) {
  const latitude = location.latitude + sample.lat;
  const longitude = location.longitude + sample.lon;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,precipitation,weather_code,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("timezone", "Asia/Seoul");
  url.searchParams.set("forecast_days", "1");

  const response = await fetch(url, { next: { revalidate: 60 * 10 } });
  if (!response.ok) throw new Error("지도용 강수량을 가져오지 못했습니다.");

  const data = (await response.json()) as OpenMeteoResponse;
  const hourly = data.hourly;
  if (!hourly?.time?.length) throw new Error("지도용 예보 데이터가 비어 있습니다.");

  const slot = makeSlot(hourly, Math.min(index, hourly.time.length - 1));

  return {
    id: sample.id,
    label: sample.label,
    latitude,
    longitude,
    x: sample.x,
    y: sample.y,
    pop: slot.pop,
    temp: slot.temp,
    precipitation: slot.precipitation,
    sky: slot.sky,
    type: slot.type,
  };
}

async function fetchPrecipitationMap(
  location: SavedLocation,
  index: number,
): Promise<PrecipitationMap> {
  try {
    const spots = await Promise.all(
      MAP_SAMPLES.map((sample) => fetchSpot(location, sample, index)),
    );

    return {
      source: "Open-Meteo 주변 좌표 샘플",
      maxPop: Math.max(...spots.map((spot) => spot.pop)),
      maxPrecipitation: Math.max(...spots.map((spot) => spot.precipitation)),
      spots,
    };
  } catch {
    const fallbackSpots = MAP_SAMPLES.map((sample) => ({
      id: sample.id,
      label: sample.label,
      latitude: location.latitude + sample.lat,
      longitude: location.longitude + sample.lon,
      x: sample.x,
      y: sample.y,
      pop: 0,
      temp: 0,
      precipitation: 0,
      sky: "확인 중",
      type: "없음",
      windDirection: 0,
    }));

    return {
      source: "Open-Meteo 주변 좌표 샘플",
      maxPop: 0,
      maxPrecipitation: 0,
      spots: fallbackSpots,
    };
  }
}
