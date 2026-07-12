# Vercel 배포 안내

이 프로젝트는 Next.js 앱으로 Vercel에 배포합니다.

## 필수 환경변수

| 이름 | 설명 |
| --- | --- |
| `LOCATION_UPDATE_TOKEN` | 공개 방문자가 위치를 바꾸지 못하게 막는 관리자 토큰 |
| `CRON_SECRET` | Vercel Cron 호출을 보호하는 비밀 토큰 |
| `KMA_SERVICE_KEY` | 공공데이터포털 기상청 단기예보 서비스키 |
| `KAKAO_REST_API_KEY` | 카카오 Developers 앱의 REST API 키 |
| `KAKAO_REFRESH_TOKEN` | 카카오톡 나에게 보내기용 refresh token |

## 위치 영구 저장소

오전 6시 30분 서버 Cron은 브라우저 쿠키 없이 실행되므로 마지막 관리자 위치를 영구 저장소에서 읽어야 합니다.

아래 둘 중 한 세트를 설정합니다.

| 이름 | 설명 |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |

또는

| 이름 | 설명 |
| --- | --- |
| `KV_REST_API_URL` | Vercel KV/Redis REST URL |
| `KV_REST_API_TOKEN` | Vercel KV/Redis REST Token |

## 선택 환경변수

| 이름 | 예시 |
| --- | --- |
| `SITE_PUBLIC_URL` | `https://weather-gamma-umber-42.vercel.app` |
| `KAKAO_REDIRECT_URI` | `https://weather-gamma-umber-42.vercel.app/api/kakao/callback` |
| `KAKAO_CLIENT_SECRET` | 카카오 앱에서 client secret을 켠 경우만 사용 |
| `KAKAO_OAUTH_STATE` | 카카오 OAuth state 검증용 임의 문자열 |
| `LOCATION_LABEL` | `집` |
| `LOCATION_LATITUDE` | `37.5636` |
| `LOCATION_LONGITUDE` | `127.0365` |

## Vercel Cron

`vercel.json`에 매일 UTC 21:30 실행으로 등록되어 있습니다.

```json
{
  "path": "/api/cron/morning-alert",
  "schedule": "30 21 * * *"
}
```

UTC 21:30은 한국시간 오전 6시 30분입니다.

Vercel Hobby 요금제에서는 Cron이 지정된 시간대의 1시간 범위 안에서 실행될 수 있습니다. 오전 6시 30분 정시 호출이 필요하면 Pro 요금제 또는 외부 스케줄러를 사용하세요.

## 배포 명령

```bash
npx vercel
npx vercel --prod
```

GitHub 연동 배포라면 `main` 브랜치에 push하면 Vercel이 자동으로 재배포합니다.

## 설정 확인

1. 위치 저장 확인

```text
https://weather-gamma-umber-42.vercel.app/api/location
```

`storage: "persistent"`와 `persisted: true`가 보여야 합니다.

2. 서버 발송 수동 테스트

```text
https://weather-gamma-umber-42.vercel.app/api/cron/morning-alert?token=CRON_SECRET값
```

성공하면 카카오톡 나에게 보내기 메시지가 도착하고 응답에 `ok: true`가 표시됩니다.
