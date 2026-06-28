import type {
  ForecastSlot,
  PrecipitationMap,
  PrecipitationSpot,
  SavedLocation,
} from "@/lib/weather";

type KmaItem = {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
};

type KmaResponse = {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      items?: {
        item?: KmaItem[] | KmaItem;
      };
    };
  };
};

type KmaGrid = {
  nx: number;
  ny: number;
};

type KmaForecastBundle = {
  forecast: ForecastSlot[];
  hourly: ForecastSlot[];
  high: number;
  low: number;
  maxPop: number;
  precipitationMap: PrecipitationMap;
};

const KMA_BASE_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const VILLAGE_BASE_TIMES = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];

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

function kmaServiceKey() {
  const raw = process.env.KMA_SERVICE_KEY?.trim();
  if (!raw) return "";

  try {
    return raw.includes("%") ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

export function isKmaConfigured() {
  return Boolean(kmaServiceKey());
}

function formatKstDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${value.year}${value.month}${value.day}`;
}

function kstTimeParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hour: Number(value.hour),
    minute: Number(value.minute),
  };
}

function latestBaseDateTime() {
  const { hour, minute } = kstTimeParts();
  const nowMinutes = hour * 60 + minute;
  const bufferMinutes = 15;
  const availableTimes = VILLAGE_BASE_TIMES.map((time) => ({
    time,
    minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(2, 4)),
  }));
  const base = [...availableTimes]
    .reverse()
    .find((candidate) => nowMinutes - bufferMinutes >= candidate.minutes);

  if (base) {
    return { baseDate: formatKstDate(), baseTime: base.time };
  }

  return {
    baseDate: formatKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    baseTime: VILLAGE_BASE_TIMES.at(-1) ?? "2300",
  };
}

export function toKmaGrid(latitude: number, longitude: number): KmaGrid {
  const re = 6371.00877;
  const grid = 5.0;
  const slat1 = 30.0;
  const slat2 = 60.0;
  const olon = 126.0;
  const olat = 38.0;
  const xo = 43;
  const yo = 136;
  const degrad = Math.PI / 180.0;

  const reGrid = re / grid;
  const slat1Rad = slat1 * degrad;
  const slat2Rad = slat2 * degrad;
  const olonRad = olon * degrad;
  const olatRad = olat * degrad;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2Rad * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1Rad * 0.5);
  sn = Math.log(Math.cos(slat1Rad) / Math.cos(slat2Rad)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1Rad * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1Rad)) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olatRad * 0.5);
  ro = (reGrid * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + latitude * degrad * 0.5);
  ra = (reGrid * sf) / Math.pow(ra, sn);

  let theta = longitude * degrad - olonRad;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + xo + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + yo + 0.5),
  };
}

async function fetchVillageItems(latitude: number, longitude: number) {
  const serviceKey = kmaServiceKey();
  if (!serviceKey) throw new Error("KMA_SERVICE_KEY가 설정되지 않았습니다.");

  const { baseDate, baseTime } = latestBaseDateTime();
  const { nx, ny } = toKmaGrid(latitude, longitude);
  const url = new URL(`${KMA_BASE_URL}/getVilageFcst`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  const response = await fetch(url, { next: { revalidate: 60 * 10 } });
  if (!response.ok) throw new Error("기상청 예보를 가져오지 못했습니다.");

  const data = (await response.json()) as KmaResponse;
  const header = data.response?.header;
  if (header?.resultCode && header.resultCode !== "00") {
    throw new Error(header.resultMsg || "기상청 예보 응답이 올바르지 않습니다.");
  }

  const items = data.response?.body?.items?.item ?? [];

  return Array.isArray(items) ? items : [items];
}

function ptyLabel(value?: string) {
  if (value === "1") return "비";
  if (value === "2") return "비/눈";
  if (value === "3") return "눈";
  if (value === "4") return "소나기";
  if (value === "5") return "빗방울";
  if (value === "6") return "빗방울/눈";
  if (value === "7") return "눈날림";
  return "없음";
}

function skyLabel(value?: string) {
  if (value === "1") return "맑음";
  if (value === "3") return "구름많음";
  if (value === "4") return "흐림";
  return "확인 중";
}

function parseNumber(value?: string) {
  if (!value) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parsePrecipitation(value?: string) {
  if (!value || value.includes("강수없음")) return 0;
  if (value.includes("1mm 미만")) return 0.5;

  const match = value.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function precipitationAmount(value?: string) {
  if (!value || value.includes("강수없음")) return "0mm";
  return value;
}

function buildSlots(items: KmaItem[]) {
  const groups = new Map<string, Record<string, string>>();

  items.forEach((item) => {
    const key = `${item.fcstDate}${item.fcstTime}`;
    const group = groups.get(key) ?? {};
    group[item.category] = item.fcstValue;
    groups.set(key, group);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const type = ptyLabel(group.PTY);
      const sky = type === "없음" ? skyLabel(group.SKY) : type;
      const precipitation = parsePrecipitation(group.PCP);

      return {
        key,
        slot: {
          time: `${key.slice(8, 10)}:${key.slice(10, 12)}`,
          pop: parseNumber(group.POP),
          type,
          temp: Math.round(parseNumber(group.TMP)),
          amount: precipitationAmount(group.PCP),
          sky,
          code: parseNumber(group.PTY) * 10 + parseNumber(group.SKY),
          precipitation,
          humidity: Math.round(parseNumber(group.REH)),
          wind: Math.round(parseNumber(group.WSD)),
          windDirection: Math.round(parseNumber(group.VEC)),
        } satisfies ForecastSlot,
      };
    })
    .filter(({ slot }) => Number.isFinite(slot.temp));
}

function currentForecastKey() {
  const date = formatKstDate();
  const { hour } = kstTimeParts();

  return `${date}${String(hour).padStart(2, "0")}00`;
}

function nextSlots(items: KmaItem[]) {
  const nowKey = currentForecastKey();
  const slots = buildSlots(items);
  const upcoming = slots.filter(({ key }) => key >= nowKey).map(({ slot }) => slot);

  return upcoming.length ? upcoming : slots.map(({ slot }) => slot);
}

function pickDecisionForecast(hourly: ForecastSlot[]) {
  const targetHours = new Set(["09:00", "12:00", "15:00", "18:00", "21:00"]);
  const target = hourly.filter((slot) => targetHours.has(slot.time));

  return target.length >= 3 ? target.slice(0, 5) : hourly.slice(0, 5);
}

async function fetchKmaSpot(
  location: SavedLocation,
  sample: (typeof MAP_SAMPLES)[number],
): Promise<PrecipitationSpot> {
  const latitude = location.latitude + sample.lat;
  const longitude = location.longitude + sample.lon;
  const items = await fetchVillageItems(latitude, longitude);
  const [slot] = nextSlots(items);

  return {
    id: sample.id,
    label: sample.label,
    latitude,
    longitude,
    x: sample.x,
    y: sample.y,
    pop: slot?.pop ?? 0,
    temp: slot?.temp ?? 0,
    precipitation: slot?.precipitation ?? 0,
    sky: slot?.sky ?? "확인 중",
    type: slot?.type ?? "없음",
  };
}

async function fetchKmaPrecipitationMap(
  location: SavedLocation,
): Promise<PrecipitationMap> {
  const spots = await Promise.all(
    MAP_SAMPLES.map((sample) => fetchKmaSpot(location, sample)),
  );

  return {
    source: "기상청 주변 격자 예보",
    maxPop: Math.max(...spots.map((spot) => spot.pop)),
    maxPrecipitation: Math.max(...spots.map((spot) => spot.precipitation)),
    spots,
  };
}

export async function fetchKmaWeather(
  location: SavedLocation,
): Promise<KmaForecastBundle> {
  const items = await fetchVillageItems(location.latitude, location.longitude);
  const hourly = nextSlots(items).slice(0, 14);
  if (!hourly.length) throw new Error("기상청 시간별 예보 데이터가 비어 있습니다.");

  const forecast = pickDecisionForecast(hourly);
  const temps = hourly.map((slot) => slot.temp);
  const precipitationMap = await fetchKmaPrecipitationMap(location);

  return {
    forecast,
    hourly,
    high: Math.max(...temps),
    low: Math.min(...temps),
    maxPop: Math.max(...forecast.map((slot) => slot.pop)),
    precipitationMap,
  };
}
