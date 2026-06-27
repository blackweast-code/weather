export type ResolvedAddress = {
  label: string;
  address: string;
  locality: string;
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  province?: string;
  borough?: string;
  city_district?: string;
  district?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  road?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

function firstValue(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim();
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ResolvedAddress | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "ko");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "umbrella-weather-agent/1.0 (https://github.com/blackweast-code/weather)",
      },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as NominatimResponse;
    const address = data.address ?? {};
    const city = firstValue(
      address.city,
      address.town,
      address.village,
      address.municipality,
      address.county,
      address.state,
      address.province,
    );
    const district = firstValue(
      address.borough,
      address.city_district,
      address.district,
      address.suburb,
      address.neighbourhood,
      address.quarter,
    );
    const road = firstValue(address.road);
    const locality = [city, district].filter(Boolean).join(" ");
    const label = [city, district, road].filter(Boolean).slice(0, 3).join(" ");

    if (!label && !data.display_name) return null;

    return {
      label: label || data.display_name || "내 휴대폰 위치",
      address: data.display_name || label || "내 휴대폰 위치",
      locality: locality || label || "내 휴대폰 위치",
    };
  } catch {
    return null;
  }
}
