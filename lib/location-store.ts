import { DEFAULT_LOCATION, type SavedLocation } from "@/lib/weather";

const LOCATION_COOKIE = "umbrella_location";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type GlobalLocation = typeof globalThis & {
  __umbrellaLocation?: SavedLocation;
};

type LocationLookup = {
  location: SavedLocation;
  persisted: boolean;
  warning?: string;
};

function globalLocation() {
  return globalThis as GlobalLocation;
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
  updatedAt = "",
): SavedLocation | null {
  if (!isValidCoordinate(latitude, longitude)) return null;

  const normalizedLatitude = latitude as number;
  const normalizedLongitude = longitude as number;

  return {
    label: typeof label === "string" && label.trim() ? label.trim() : "내 휴대폰 위치",
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

  return {
    ...location,
    label: isGenericLabel ? address.label : location.label,
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

export function getLocation(request: Request): LocationLookup {
  const queryLocation = locationFromQuery(request);
  if (queryLocation) return { location: queryLocation, persisted: true };

  const cookieLocation = locationFromCookie(request);
  if (cookieLocation) return { location: cookieLocation, persisted: true };

  const memoryLocation = globalLocation().__umbrellaLocation;
  if (memoryLocation) return { location: memoryLocation, persisted: true };

  const envLocation = locationFromEnv();
  if (envLocation) return { location: envLocation, persisted: true };

  return {
    location: DEFAULT_LOCATION,
    persisted: false,
    warning:
      "Vercel에서는 별도 데이터베이스가 없으면 위치를 브라우저 쿠키와 서버 메모리에 저장합니다.",
  };
}

export function saveLocation(location: SavedLocation) {
  globalLocation().__umbrellaLocation = location;
}

export function locationCookieHeader(request: Request, location: SavedLocation) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const value = encodeURIComponent(JSON.stringify(location));

  return `${LOCATION_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax; HttpOnly${secure}`;
}
