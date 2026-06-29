function kakaoRestApiKey() {
  return process.env.KAKAO_REST_API_KEY?.trim() ?? "";
}

function kakaoRedirectUri(request: Request) {
  const configured = process.env.KAKAO_REDIRECT_URI?.trim();
  if (configured) return configured;

  return new URL("/api/kakao/callback", request.url).toString();
}

export async function GET(request: Request) {
  const clientId = kakaoRestApiKey();
  if (!clientId) {
    return Response.json(
      { error: "KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", kakaoRedirectUri(request));
  url.searchParams.set("scope", "talk_message");

  const state = process.env.KAKAO_OAUTH_STATE?.trim();
  if (state) url.searchParams.set("state", state);

  return Response.redirect(url);
}
