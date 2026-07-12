export type ResolvedAddress = {
  label: string;
  address: string;
  locality: string;
  source: string;
};

type KakaoRegionDocument = {
  region_type?: string;
  address_name?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
};

type KakaoRegionResponse = {
  documents?: KakaoRegionDocument[];
};

type KakaoAddressDocument = {
  address_type?: string;
  x?: string;
  y?: string;
  address?: {
    address_name?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
  };
  road_address?: {
    address_name?: string;
    main_building_no?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    road_name?: string;
    sub_building_no?: string;
  };
};

type KakaoAddressResponse = {
  documents?: KakaoAddressDocument[];
};

type KakaoAddressSearchResponse = {
  documents?: KakaoAddressDocument[];
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
  house_number?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

function firstValue(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim();
}

function kakaoRestApiKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? "";
}

async function kakaoLocalFetch<T>(
  endpoint: "coord2regioncode" | "coord2address",
  latitude: number,
  longitude: number,
) {
  const key = kakaoRestApiKey();
  if (!key) return null;

  const url = new URL(`https://dapi.kakao.com/v2/local/geo/${endpoint}.json`);
  url.searchParams.set("x", String(longitude));
  url.searchParams.set("y", String(latitude));
  url.searchParams.set("input_coord", "WGS84");

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${key}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  return (await response.json()) as T;
}

async function kakaoAddressSearch(query: string) {
  const key = kakaoRestApiKey();
  if (!key) return null;

  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${key}`,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  return (await response.json()) as KakaoAddressSearchResponse;
}

async function reverseGeocodeWithKakao(
  latitude: number,
  longitude: number,
): Promise<ResolvedAddress | null> {
  try {
    const [regionData, addressData] = await Promise.all([
      kakaoLocalFetch<KakaoRegionResponse>("coord2regioncode", latitude, longitude),
      kakaoLocalFetch<KakaoAddressResponse>("coord2address", latitude, longitude),
    ]);

    const regionDocuments = regionData?.documents ?? [];
    const region =
      regionDocuments.find((document) => document.region_type === "H") ??
      regionDocuments[0];
    const addressDocument = addressData?.documents?.[0];
    const administrativeLocality = [
      region?.region_1depth_name,
      region?.region_2depth_name,
      region?.region_3depth_name,
    ]
      .filter(Boolean)
      .join(" ");
    let roadAddress = addressDocument?.road_address;
    const landAddress = addressDocument?.address;

    if (!roadAddress?.address_name && landAddress?.address_name) {
      const addressSearchData = await kakaoAddressSearch(landAddress.address_name);
      roadAddress = addressSearchData?.documents?.find(
        (document) => document.road_address?.address_name,
      )?.road_address;
    }
    const roadLocality = [
      roadAddress?.region_1depth_name,
      roadAddress?.region_2depth_name,
    ]
      .filter(Boolean)
      .join(" ");
    const landLocality = [
      landAddress?.region_1depth_name,
      landAddress?.region_2depth_name,
    ]
      .filter(Boolean)
      .join(" ");
    const locality = roadLocality || landLocality || administrativeLocality;
    const address =
      roadAddress?.address_name ??
      landAddress?.address_name ??
      region?.address_name ??
      locality;

    if (!locality && !address) return null;

    return {
      label: address || locality || "내 휴대폰 위치",
      address: address || locality || "내 휴대폰 위치",
      locality: locality || address || "내 휴대폰 위치",
      source: "Kakao Local API",
    };
  } catch {
    return null;
  }
}

export async function reverseGeocodeDistrict(
  latitude: number,
  longitude: number,
) {
  try {
    const regionData = await kakaoLocalFetch<KakaoRegionResponse>(
      "coord2regioncode",
      latitude,
      longitude,
    );
    const regionDocuments = regionData?.documents ?? [];
    const region =
      regionDocuments.find((document) => document.region_type === "B") ??
      regionDocuments.find((document) => document.region_type === "H") ??
      regionDocuments[0];

    return firstValue(
      region?.region_2depth_name,
      region?.region_1depth_name,
      region?.region_3depth_name,
    ) ?? null;
  } catch {
    return null;
  }
}

export async function resolveDistrictCenter(query: string) {
  try {
    const addressSearchData = await kakaoAddressSearch(query);
    const document =
      addressSearchData?.documents?.find(
        (candidate) => candidate.address_type === "REGION",
      ) ?? addressSearchData?.documents?.[0];
    const latitude = Number(document?.y);
    const longitude = Number(document?.x);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ResolvedAddress | null> {
  const kakaoAddress = await reverseGeocodeWithKakao(latitude, longitude);
  if (kakaoAddress) return kakaoAddress;

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
    const roadWithNumber = [road, firstValue(address.house_number)]
      .filter(Boolean)
      .join(" ");
    const locality = [city, district].filter(Boolean).join(" ");
    const label = [city, district, roadWithNumber]
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");

    if (!label && !data.display_name) return null;

    return {
      label: label || data.display_name || "내 휴대폰 위치",
      address: data.display_name || label || "내 휴대폰 위치",
      locality: locality || label || "내 휴대폰 위치",
      source: "OpenStreetMap Nominatim",
    };
  } catch {
    return null;
  }
}
