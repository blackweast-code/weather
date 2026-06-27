import { exchangeKakaoCode } from "@/lib/kakao";

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const found = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie":
        "kakao_oauth_state=; Path=/api/kakao/callback; HttpOnly; SameSite=Lax; Max-Age=0",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const storedState = readCookie(request, "kakao_oauth_state");

  if (!code) {
    return html("<h1>카카오 인증 코드가 없습니다.</h1>", 400);
  }

  if (!state || !storedState || state !== storedState) {
    return html("<h1>카카오 인증 상태값이 일치하지 않습니다.</h1>", 400);
  }

  try {
    const token = await exchangeKakaoCode(code);
    const refreshToken = token.refresh_token ?? "";

    if (!refreshToken) {
      return html(
        "<h1>refresh token이 응답에 없습니다.</h1><p>이미 동의한 계정이면 카카오 연결을 해제한 뒤 다시 시도해보세요.</p>",
        400,
      );
    }

    return html(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>카카오 연결 완료</title>
          <style>
            body {
              background: #f6f8f3;
              color: #18201d;
              font-family: "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif;
              margin: 0;
              padding: 32px;
            }
            main {
              background: #fff;
              border: 1px solid #dce5de;
              border-radius: 8px;
              margin: 0 auto;
              max-width: 760px;
              padding: 28px;
            }
            code {
              background: #eef5f2;
              border-radius: 6px;
              display: block;
              margin-top: 12px;
              overflow-wrap: anywhere;
              padding: 14px;
            }
            a {
              color: #15543c;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>카카오 연결 완료</h1>
            <p>아래 값을 <strong>KAKAO_REFRESH_TOKEN</strong> 환경변수로 저장하면 실제 발송을 사용할 수 있습니다.</p>
            <code>KAKAO_REFRESH_TOKEN=${escapeHtml(refreshToken)}</code>
            <p>저장 후 서버를 다시 실행하거나, 배포 환경변수를 업데이트한 뒤 다시 배포하세요.</p>
            <p><a href="/">홈으로 돌아가기</a></p>
          </main>
        </body>
      </html>
    `);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "카카오 토큰 발급에 실패했습니다.";

    return html(`<h1>카카오 연결 실패</h1><p>${escapeHtml(message)}</p>`, 500);
  }
}
