import {
  expectedUpdateToken,
  getLocation,
  locationCookieHeader,
  normalizeLocation,
  saveLocation,
} from "@/lib/location-store";

export const dynamic = "force-dynamic";

type LocationPayload = {
  label?: string;
  latitude?: number;
  longitude?: number;
};

function requestUpdateToken(request: Request) {
  return request.headers.get("x-location-update-token")?.trim() ?? "";
}

export async function GET(request: Request) {
  return Response.json(getLocation(request));
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
    new Date().toISOString(),
  );

  if (!location) {
    return Response.json(
      { error: "유효한 위도와 경도가 필요합니다." },
      { status: 400 },
    );
  }

  saveLocation(location);

  return Response.json(
    { location },
    {
      headers: {
        "Set-Cookie": locationCookieHeader(request, location),
      },
    },
  );
}
