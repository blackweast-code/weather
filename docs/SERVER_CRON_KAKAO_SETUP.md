# Vercel Cron + 카카오톡 서버 자동 발송 설정

이 설정은 Codex/ChatGPT 앱이나 PC가 꺼져 있어도 매일 한국시간 오전 6시 30분에 카카오톡 알림을 보내기 위한 운영 방식입니다.

## 동작 메커니즘

```text
Vercel Cron
→ GET /api/cron/morning-alert
→ Upstash/Redis에 저장된 마지막 관리자 위치 조회
→ 기상청 초단기실황 + 초단기예보 + 단기예보 조회
→ 우산 필요 여부 계산
→ 카카오 OAuth refresh token으로 access token 갱신
→ 카카오톡 나에게 보내기 REST API 호출
```

## Vercel Cron 시간

Vercel Cron은 UTC 기준으로 실행됩니다.

한국시간 오전 6시 30분은 UTC 전날 21:30이므로 `vercel.json`에는 아래처럼 등록되어 있습니다.

```json
{
  "crons": [
    {
      "path": "/api/cron/morning-alert",
      "schedule": "30 21 * * *"
    }
  ]
}
```

> Vercel Hobby 요금제는 Cron 실행 정밀도가 한 시간 단위이므로 실제 호출이 한국시간 06:00~06:59 사이에 실행될 수 있습니다. 06:30 정시 발송이 필요하면 Pro 요금제 또는 외부 스케줄러에서 같은 API를 호출해야 합니다.

## 필요한 Vercel 환경변수

필수:

```text
CRON_SECRET=길고 예측하기 어려운 임의 문자열
KAKAO_REST_API_KEY=카카오 Developers 앱의 REST API 키
KAKAO_REFRESH_TOKEN=카카오 talk_message 권한이 포함된 refresh token
SITE_PUBLIC_URL=https://weather-gamma-umber-42.vercel.app
```

이미 설정되어 있어야 하는 날씨/위치 변수:

```text
KMA_SERVICE_KEY=공공데이터포털 기상청 단기예보 서비스키
UPSTASH_REDIS_REST_URL=Upstash Redis REST URL
UPSTASH_REDIS_REST_TOKEN=Upstash Redis REST Token
```

선택:

```text
KAKAO_REDIRECT_URI=https://weather-gamma-umber-42.vercel.app/api/kakao/callback
KAKAO_CLIENT_SECRET=카카오 앱에서 client secret을 켠 경우에만 필요
KAKAO_OAUTH_STATE=임의의 긴 문자열
```

## 카카오 refresh token 발급

1. Kakao Developers에서 앱을 엽니다.
2. `카카오 로그인`을 활성화합니다.
3. Redirect URI에 아래 주소를 등록합니다.

```text
https://weather-gamma-umber-42.vercel.app/api/kakao/callback
```

4. 동의항목에서 `카카오톡 메시지 전송` 권한을 설정합니다.
5. Vercel에 `KAKAO_REST_API_KEY`와 `KAKAO_REDIRECT_URI`를 저장하고 재배포합니다.
6. 브라우저에서 아래 주소를 엽니다.

```text
https://weather-gamma-umber-42.vercel.app/api/kakao/connect
```

7. 카카오 동의가 끝나면 callback 화면에 refresh token이 표시됩니다.
8. 표시된 값을 Vercel 환경변수 `KAKAO_REFRESH_TOKEN`에 저장합니다.
9. 다시 Vercel에서 재배포합니다.

## 수동 테스트

Vercel 환경변수 저장과 재배포가 끝나면 아래 주소를 호출해 수동 발송을 테스트할 수 있습니다.

```text
https://weather-gamma-umber-42.vercel.app/api/cron/morning-alert?token=CRON_SECRET값
```

성공 응답 예:

```json
{
  "ok": true,
  "location": {
    "label": "용인시 처인구 명지로",
    "storage": "persistent"
  },
  "decision": {
    "key": "need",
    "message": "[오늘의 우산 알림]..."
  },
  "kakao": {
    "resultCode": 0,
    "refreshTokenRotated": false
  }
}
```

`refreshTokenRotated`가 `true`로 나오면 카카오가 새 refresh token을 응답한 상태입니다. 이 프로젝트는 보안을 위해 새 refresh token을 자동 저장하지 않으므로, 토큰 만료 시점에는 다시 카카오 연결 과정을 진행해 `KAKAO_REFRESH_TOKEN`을 갱신해야 합니다.

## 기존 PlayMCP 자동화와 차이

기존 PlayMCP 방식은 Codex/ChatGPT 안에서만 실행됩니다.

```text
Codex 앱 꺼짐 / PC 절전
→ PlayMCP 자동화 실행 안 될 수 있음
```

서버 Cron 방식은 Vercel에서 실행됩니다.

```text
Codex 앱 꺼짐 / PC 꺼짐
→ Vercel 서버가 직접 실행
```
