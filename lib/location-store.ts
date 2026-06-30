import { DEFAULT_LOCATION, type SavedLocation } from "@/lib/weather";

const LOCATION_COOKIE = "umbrella_location";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const PERSISTENT_LOCATION_KEY = "umbrella_agent:last_location";

type GlobalLocation = typeof globalThis & {
  __umbrellaLocation?: SavedLocation;
};

type LocationLookup = {
  location: SavedLocation;
  persisted: boolean;
  storage?: "query" | "persistent" | "memory" | "cookie" | "env" | "default";
  warning?: string;
};

type StorageSaveResult = {
  persisted: boolean;
  storage: "persistent" | "memory";
  warning?: string;
};

type RedisRestResponse<T> = {
  result?: T;
  error?: string;
};

function globalLocation() {
  return globalThis as GlobalLocation;
}

function persistentStorageConfig() {
  const url = (
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.REDIS_REST_API_URL ??
    ""
  ).trim();
  const token = (
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.REDIS_REST_API_TOKEN ??
    ""
  ).trim();

  if (!url || !token) return null;

  return { url, token };
}

async function runStorageCommand<T>(
  command: Array<string | number>,
): Promise<T | null> {
  const config = persistentStorageConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("위치 영구 저장소에 연결하지 못했습니다.");
  }

  const data = (await response.json()) as RedisRestResponse<T>;
  if (data.error) throw new Error(data.error);

  return data.result ?? null;
}

export function expectedUpdateToken() {
  return (process.env.LOCATION_UPDATE_TOKEN ?? "").trim();
}

function isValidCoordinate(latitude: unknown, longitude: unknown) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function normalizeLocation(
  label: unknown,
  latitude: unknown,
  longitude: unknown,
  accuracy?: unknown,
  updatedAt = "",
): SavedLocation | null {
  if (!isValidCoordinate(latitude, longitude)) return null;

  const normalizedLatitude = latitude as number;
  const normalizedLongitude = longitude as number;
  const normalizedAccuracy =
    typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0
      ? Math.round(accuracy)
      : undefined;

  return {
    label:
      typeof label === "string" && label.trim()
        ? label.trim()
        : "내 휴대폰 위치",
    accuracy: normalizedAccuracy,
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    updatedAt,
    source: "saved",
  };
}

export function withResolvedAddress(
  location: SavedLocation,
  address: { label: string; address: string; locality: string; source: string } | null,
) {
  if (!address) return location;

  const isGenericLabel =
    location.label === "내 휴대폰 위치" || location.label === DEFAULT_LOCATION.label;
  const looksLikeAddressLabel = /(?:시|군|구|읍|면|동|로|길)(?:\s|$|\d)/.test(
    location.label,
  );

  return {
    ...location,
    label: isGenericLabel || looksLikeAddressLabel ? address.label : location.label,
    address: address.address,
    addressSource: address.source,
    locality: address.locality,
  };
}

function requestCookies(request: Request) {
  const header = request.headers.get("cookie") ?? "";

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];

        return [
          decodeURIComponent(part.slice(0, separator)),
          decodeURIComponent(part.slice(separator + 1)),
        ];
      }),
  );
}

function locationFromCookie(request: Request) {
  const raw = requestCookies(request)[LOCATION_COOKIE];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SavedLocation>;
    const location = normalizeLocation(
      parsed.label,
      parsed.latitude,
      parsed.longitude,
      parsed.accuracy,
      parsed.updatedAt,
    );
    if (!location) return null;

    return {
      ...location,
      address: parsed.address,
      addressSource: parsed.addressSource,
      locality: parsed.locality,
    };
  } catch {
    return null;
  }
}

function locationFromQuery(request: Request) {
  const url = new URL(request.url);
  if (!url.searchParams.has("lat") || !url.searchParams.has("lon")) return null;

  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));
  const label = url.searchParams.get("label") ?? "내 휴대폰 위치";

  return normalizeLocation(label, latitude, longitude);
}

function locationFromEnv() {
  const latitude = Number(process.env.LOCATION_LATITUDE);
  const longitude = Number(process.env.LOCATION_LONGITUDE);
  const label = process.env.LOCATION_LABEL ?? "내 휴대폰 위치";

  return normalizeLocation(label, latitude, longitude);
}

async function locationFromPersistentStorage() {
  try {
    const raw = await runStorageCommand<string>(["GET", PERSISTENT_LOCATION_KEY]);
    if (!raw || typeof raw !== "string") return null;

    const parsed = JSON.parse(raw) as Partial<SavedLocation>;
    const location = normalizeLocation(
      parsed.label,
      parsed.latitude,
      parsed.longitude,
      parsed.accuracy,
      parsed.updatedAt,
    );
    if (!location) return null;

    return {
      ...location,
      address: parsed.address,
      addressSource: parsed.addressSource,
      locality: parsed.locality,
    };
  } catch {
    return null;
  }
}

async function saveLocationToPersistentStorage(location: SavedLocation) {
  if (!persistentStorageConfig()) return false;

  await runStorageCommand<string>([
    "SET",
    PERSISTENT_LOCATION_KEY,
    JSON.stringify(location),
  ]);

  return true;
}

export async function getLocation(request: Request): Promise<LocationLookup> {
  const queryLocation = locationFromQuery(request);
  if (queryLocation) {
    return { location: queryLocation, persisted: true, storage: "query" };
  }

  const persistentLocation = await locationFromPersistentStorage();
  if (persistentLocation) {
    globalLocation().__umbrellaLocation = persistentLocation;

    return {
      location: persistentLocation,
      persisted: true,
      storage: "persistent",
    };
  }

  const memoryLocation = globalLocation().__umbrellaLocation;
  if (memoryLocation) {
    return { location: memoryLocation, persisted: true, storage: "memory" };
  }

  const cookieLocation = locationFromCookie(request);
  if (cookieLocation) {
    return { location: cookieLocation, persisted: true, storage: "cookie" };
  }

  const envLocation = locationFromEnv();
  if (envLocation) return { location: envLocation, persisted: true, storage: "env" };

  return {
    location: DEFAULT_LOCATION,
    persisted: false,
    storage: "default",
    warning:
      "영구 저장소 환경변수가 없으면 위치를 브라우저 쿠키와 서버 메모리에만 저장합니다.",
  };
}

export async function saveLocation(
  location: SavedLocation,
): Promise<StorageSaveResult> {
  globalLocation().__umbrellaLocation = location;

  const persisted = await saveLocationToPersistentStorage(location);
  if (persisted) return { persisted: true, storage: "persistent" };

  return {
    persisted: false,
    storage: "memory",
    warning:
      "KV_REST_API_URL/KV_REST_API_TOKEN 또는 UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN이 없어 서버 메모리에만 저장했습니다.",
  };
}

export function locationCookieHeader(request: Request, location: SavedLocation) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const value = encodeURIComponent(JSON.stringify(location));

  return `${LOCATION_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax; HttpOnly${secure}`;
}
