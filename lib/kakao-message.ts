import type { WeatherResult } from "@/lib/weather";

type KakaoTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

type KakaoSendResponse = {
  result_code?: number;
  msg?: string;
};

type KakaoSendResult = {
  resultCode: number;
  refreshTokenRotated: boolean;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);

  return value;
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function siteUrl() {
  return (
    optionalEnv("SITE_PUBLIC_URL") || "https://weather-gamma-umber-42.vercel.app"
  ).replace(/\/$/, "");
}

function clampMessage(message: string, maxLength = 190) {
  if (message.length <= maxLength) return message;

  return `${message.slice(0, maxLength - 1)}…`;
}

function kakaoTextTemplate(weather: WeatherResult) {
  const message = clampMessage(weather.decision.message);

  return {
    object_type: "text",
    text: message,
    link: {
      web_url: siteUrl(),
      mobile_web_url: siteUrl(),
    },
    button_title: "날씨 보기",
  };
}

async function refreshKakaoAccessToken() {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("KAKAO_REST_API_KEY"),
    refresh_token: requiredEnv("KAKAO_REFRESH_TOKEN"),
  });
  const clientSecret = optionalEnv("KAKAO_CLIENT_SECRET");
  if (clientSecret) params.set("client_secret", clientSecret);

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params,
    cache: "no-store",
  });
  const payload = (await response.json()) as KakaoTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "카카오 access token 갱신에 실패했습니다.",
    );
  }

  return {
    accessToken: payload.access_token,
    refreshTokenRotated: Boolean(payload.refresh_token),
  };
}

export async function sendWeatherToKakaoMe(
  weather: WeatherResult,
): Promise<KakaoSendResult> {
  const { accessToken, refreshTokenRotated } = await refreshKakaoAccessToken();
  const params = new URLSearchParams({
    template_object: JSON.stringify(kakaoTextTemplate(weather)),
  });

  const response = await fetch(
    "https://kapi.kakao.com/v2/api/talk/memo/default/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: params,
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as KakaoSendResponse;

  if (!response.ok || payload.result_code !== 0) {
    throw new Error(payload.msg ?? "카카오톡 나에게 보내기에 실패했습니다.");
  }

  return {
    resultCode: payload.result_code,
    refreshTokenRotated,
  };
}
