import {
  expectedUpdateToken,
  getLocation,
  locationCookieHeader,
  normalizeLocation,
  saveLocation,
  withResolvedAddress,
} from "@/lib/location-store";
import { reverseGeocode } from "@/lib/geocode";

export const dynamic = "force-dynamic";

type LocationPayload = {
  accuracy?: number;
  label?: string;
  latitude?: number;
  longitude?: number;
  updateMode?: "auto" | "manual";
};

const MAX_LOCATION_ACCURACY_METERS = 1500;
const MAX_AUTO_UPDATE_DISTANCE_METERS = 5000;

function requestUpdateToken(request: Request) {
  return request.headers.get("x-location-update-token")?.trim() ?? "";
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function GET(request: Request) {
  return Response.json(await getLocation(request));
}

export async function POST(request: Request) {
  const expectedToken = expectedUpdateToken();
  const providedToken = requestUpdateToken(request);

  if (!expectedToken) {
    return Response.json(
      {
        error:
          "위치 저장 관리자 토큰이 설정되지 않았습니다. LOCATION_UPDATE_TOKEN 환경변수를 설정하세요.",
      },
      { status: 503 },
    );
  }

  if (providedToken !== expectedToken) {
    return Response.json(
      { error: "위치 저장 권한이 없습니다. 관리자 토큰을 확인하세요." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as LocationPayload;
  const location = normalizeLocation(
    payload.label,
    payload.latitude,
    payload.longitude,
    payload.accuracy,
    new Date().toISOString(),
  );

  if (!location) {
    return Response.json(
      { error: "유효한 위도와 경도가 필요합니다." },
      { status: 400 },
    );
  }

  const currentLocation = await getLocation(request);
  const isAutoUpdate = payload.updateMode !== "manual";

  if (
    typeof location.accuracy === "number" &&
    location.accuracy > MAX_LOCATION_ACCURACY_METERS
  ) {
    return Response.json(
      {
        error: `위치 정확도가 낮아 저장하지 않았습니다. 현재 오차 약 ${location.accuracy}m입니다. 휴대폰 GPS를 켠 뒤 다시 시도하세요.`,
      },
      { status: 400 },
    );
  }

  if (
    isAutoUpdate &&
    currentLocation.persisted &&
    currentLocation.location.source === "saved"
  ) {
    const movedDistance = distanceMeters(currentLocation.location, location);

    if (movedDistance > MAX_AUTO_UPDATE_DISTANCE_METERS) {
      return Response.json(
        {
          error: `자동 위치 저장이 차단됐습니다. 기존 저장 위치와 약 ${(movedDistance / 1000).toFixed(
            1,
          )}km 차이가 납니다. 실제 위치를 바꾸려면 휴대폰에서 '관리자 위치 저장' 버튼을 직접 눌러주세요.`,
          currentLocation: currentLocation.location,
          rejectedLocation: location,
        },
        { status: 409 },
      );
    }
  }

  const resolvedAddress = await reverseGeocode(location.latitude, location.longitude);
  const resolvedLocation = withResolvedAddress(location, resolvedAddress);

  const storage = await saveLocation(resolvedLocation);

  return Response.json(
    { location: resolvedLocation, storage },
    {
      headers: {
        "Set-Cookie": locationCookieHeader(request, resolvedLocation),
      },
    },
  );
}
