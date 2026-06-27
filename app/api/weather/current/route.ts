import { getLocation } from "@/lib/location-store";
import { fetchWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { location } = getLocation(request);
    const weather = await fetchWeather(location);

    return Response.json(weather);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "날씨 정보를 가져오지 못했습니다.";

    return Response.json({ error: message }, { status: 502 });
  }
}
