type KakaoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);

  return value;
}

function kakaoRedirectUri(request: Request) {
  const configured = process.env.KAKAO_REDIRECT_URI?.trim();
  if (configured) return configured;

  return new URL("/api/kakao/callback", request.url).toString();
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const expectedState = process.env.KAKAO_OAUTH_STATE?.trim();
    const returnedState = url.searchParams.get("state") ?? "";

    if (expectedState && returnedState !== expectedState) {
      return html("<h1>카카오 state 값이 일치하지 않습니다.</h1>", 403);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return html("<h1>카카오 인증 코드가 없습니다.</h1>", 400);
    }

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: requiredEnv("KAKAO_REST_API_KEY"),
      redirect_uri: kakaoRedirectUri(request),
      code,
    });
    const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();
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

    if (!response.ok || !payload.refresh_token) {
      const message =
        payload.error_description ??
        payload.error ??
        "카카오 refresh token 발급에 실패했습니다.";

      return html(`<h1>${escapeHtml(message)}</h1>`, 500);
    }

    const refreshToken = escapeHtml(payload.refresh_token);
    const scope = escapeHtml(payload.scope ?? "");

    return html(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>카카오 refresh token 발급 완료</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; margin: 32px; max-width: 860px; }
      code, textarea { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      textarea { box-sizing: border-box; min-height: 120px; padding: 12px; width: 100%; }
      .box { background: #f4f6f8; border: 1px solid #d9e0e7; border-radius: 8px; padding: 16px; }
    </style>
  </head>
  <body>
    <h1>카카오 refresh token 발급 완료</h1>
    <p>아래 값을 Vercel 환경변수 <code>KAKAO_REFRESH_TOKEN</code>에 저장하세요.</p>
    <div class="box">
      <textarea readonly>${refreshToken}</textarea>
    </div>
    <p>허용된 scope: <code>${scope}</code></p>
    <p>저장 후 Vercel에서 재배포하면 서버 Cron이 카카오톡 나에게 보내기를 직접 실행할 수 있습니다.</p>
  </body>
</html>`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "카카오 콜백 처리에 실패했습니다.";

    return html(`<h1>${escapeHtml(message)}</h1>`, 500);
  }
}
