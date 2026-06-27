import { eq } from "drizzle-orm";
import { ensureLocationSettingsTable, getDb } from "@/db";
import { locationSettings } from "@/db/schema";
import { DEFAULT_LOCATION } from "@/lib/weather";

const PRIMARY_ID = "primary";

type LocationPayload = {
  label?: string;
  latitude?: number;
  longitude?: number;
};

function expectedUpdateToken() {
  return process.env.LOCATION_UPDATE_TOKEN?.trim() ?? "";
}

function requestUpdateToken(request: Request) {
  return request.headers.get("x-location-update-token")?.trim() ?? "";
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

export async function GET() {
  try {
    await ensureLocationSettingsTable();
    const db = getDb();
    const [location] = await db
      .select()
      .from(locationSettings)
      .where(eq(locationSettings.id, PRIMARY_ID))
      .limit(1);

    if (!location) {
      return Response.json({ location: DEFAULT_LOCATION, persisted: false });
    }

    return Response.json({
      location: {
        label: location.label,
        latitude: location.latitude,
        longitude: location.longitude,
        updatedAt: location.updatedAt,
        source: "saved",
      },
      persisted: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "위치 설정을 읽지 못했습니다.";

    return Response.json(
      { location: DEFAULT_LOCATION, persisted: false, warning: message },
      { status: 200 },
    );
  }
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

  if (!isValidCoordinate(payload.latitude, payload.longitude)) {
    return Response.json(
      { error: "유효한 위도와 경도가 필요합니다." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const label = payload.label?.trim() || "내 휴대폰 위치";

  try {
    await ensureLocationSettingsTable();
    const db = getDb();
    await db
      .insert(locationSettings)
      .values({
        id: PRIMARY_ID,
        label,
        latitude: payload.latitude,
        longitude: payload.longitude,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: locationSettings.id,
        set: {
          label,
          latitude: payload.latitude,
          longitude: payload.longitude,
          updatedAt: now,
        },
      });

    return Response.json({
      location: {
        label,
        latitude: payload.latitude,
        longitude: payload.longitude,
        updatedAt: now,
        source: "saved",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "위치 설정을 저장하지 못했습니다.";

    return Response.json({ error: message }, { status: 500 });
  }
}
