import { sendWeatherToKakaoMe } from "@/lib/kakao-message";
import { getLocation } from "@/lib/location-store";
import { fetchWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronSecret() {
  return process.env.CRON_SECRET?.trim() ?? "";
}

function isAuthorized(request: Request) {
  const expected = cronSecret();
  if (!expected) return false;

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization === `Bearer ${expected}`) return true;

  const url = new URL(request.url);

  return url.searchParams.get("token") === expected;
}

async function runMorningAlert(request: Request) {
  if (!cronSecret()) {
    return Response.json(
      { ok: false, error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { location, storage } = await getLocation(request);
  const weather = await fetchWeather(location);
  const kakao = await sendWeatherToKakaoMe(weather);

  return Response.json({
    ok: true,
    sentAt: new Date().toISOString(),
    location: {
      label: weather.location.label,
      locality: weather.location.locality,
      latitude: weather.location.latitude,
      longitude: weather.location.longitude,
      storage,
    },
    decision: {
      key: weather.decision.key,
      message: weather.decision.message,
    },
    kakao,
  });
}

export async function GET(request: Request) {
  try {
    return await runMorningAlert(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "오전 날씨 알림 발송에 실패했습니다.";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
