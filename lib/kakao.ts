type KakaoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type KakaoSendResponse = {
  result_code?: number;
  error?: string;
  msg?: string;
};

export type KakaoMemoInput = {
  region: string;
  decision: string;
  summary: string;
  high: number;
  low: number;
  maxPop: number;
  detailUrl?: string;
};

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_MEMO_SEND_URL =
  "https://kapi.kakao.com/v2/api/talk/memo/default/send";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function requiredEnv(name: string) {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

function optionalClientSecret(params: URLSearchParams) {
  const clientSecret = env("KAKAO_CLIENT_SECRET");
  if (clientSecret) {
    params.set("client_secret", clientSecret);
  }
}

export function getKakaoConfigStatus() {
  const restApiKey = Boolean(env("KAKAO_REST_API_KEY"));
  const redirectUri = Boolean(env("KAKAO_REDIRECT_URI"));
  const refreshToken = Boolean(env("KAKAO_REFRESH_TOKEN"));

  return {
    restApiKey,
    redirectUri,
    refreshToken,
    authReady: restApiKey && redirectUri,
    sendReady: restApiKey && refreshToken,
  };
}

export function buildKakaoAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("KAKAO_REST_API_KEY"),
    redirect_uri: requiredEnv("KAKAO_REDIRECT_URI"),
    scope: "talk_message",
    state,
  });

  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeKakaoCode(code: string) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: requiredEnv("KAKAO_REST_API_KEY"),
    redirect_uri: requiredEnv("KAKAO_REDIRECT_URI"),
    code,
  });
  optionalClientSecret(params);

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params,
  });
  const payload = (await response.json()) as KakaoTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "카카오 인증 코드를 토큰으로 교환하지 못했습니다.",
    );
  }

  return payload;
}

export async function refreshKakaoAccessToken() {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("KAKAO_REST_API_KEY"),
    refresh_token: requiredEnv("KAKAO_REFRESH_TOKEN"),
  });
  optionalClientSecret(params);

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params,
  });
  const payload = (await response.json()) as KakaoTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "카카오 access token 갱신에 실패했습니다.",
    );
  }

  return payload;
}

export function buildUmbrellaTemplate(input: KakaoMemoInput) {
  const detailUrl =
    input.detailUrl || env("SITE_PUBLIC_URL") || "https://example.com";
  const text = [
    "[오늘의 우산 알림]",
    "",
    `지역: ${input.region}`,
    `판단: ${input.decision}`,
    "",
    input.summary,
    `최고기온 ${input.high}°C / 최저기온 ${input.low}°C`,
    `강수확률 최대 ${input.maxPop}%`,
  ].join("\n");

  return {
    object_type: "text",
    text,
    link: {
      web_url: detailUrl,
      mobile_web_url: detailUrl,
    },
    button_title: "상세 보기",
  };
}

export async function sendKakaoMemo(input: KakaoMemoInput) {
  const token = await refreshKakaoAccessToken();
  const template = buildUmbrellaTemplate(input);
  const params = new URLSearchParams({
    template_object: JSON.stringify(template),
  });

  const response = await fetch(KAKAO_MEMO_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params,
  });
  const payload = (await response.json()) as KakaoSendResponse;

  if (!response.ok || payload.result_code !== 0) {
    throw new Error(
      payload.msg ||
        payload.error ||
        "카카오톡 나에게 보내기 API 호출에 실패했습니다.",
    );
  }

  return {
    result: payload,
    rotatedRefreshToken: token.refresh_token,
  };
}
