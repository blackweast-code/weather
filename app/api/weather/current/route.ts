import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locationSettings } from "@/db/schema";
import { DEFAULT_LOCATION, fetchWeather, type SavedLocation } from "@/lib/weather";

const PRIMARY_ID = "primary";

async function getSavedLocation(): Promise<SavedLocation> {
  try {
    const db = getDb();
    const [location] = await db
      .select()
      .from(locationSettings)
      .where(eq(locationSettings.id, PRIMARY_ID))
      .limit(1);

    if (!location) {
      return DEFAULT_LOCATION;
    }

    return {
      label: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      updatedAt: location.updatedAt,
      source: "saved",
    };
  } catch {
    return DEFAULT_LOCATION;
  }
}

export async function GET() {
  try {
    const location = await getSavedLocation();
    const weather = await fetchWeather(location);

    return Response.json(weather);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "날씨 정보를 가져오지 못했습니다.";

    return Response.json({ error: message }, { status: 502 });
  }
}
