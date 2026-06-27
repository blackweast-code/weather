import { buildKakaoAuthorizeUrl } from "@/lib/kakao";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    const url = buildKakaoAuthorizeUrl(state);
    const response = Response.redirect(url, 302);

    response.headers.append(
      "Set-Cookie",
      `kakao_oauth_state=${state}; Path=/api/kakao/callback; HttpOnly; SameSite=Lax; Max-Age=600`,
    );

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "카카오 연결 URL 생성 실패";

    return Response.json({ error: message }, { status: 500 });
  }
}
