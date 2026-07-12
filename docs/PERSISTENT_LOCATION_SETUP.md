# 관리자 위치 영구 저장 설정

이 프로젝트는 오전 6시 30분 ChatGPT 자동화가 브라우저 쿠키 없이 `/api/weather/current`를 호출합니다. 따라서 마지막으로 저장한 관리자 휴대폰 위치를 안정적으로 쓰려면 Vercel에 영구 저장소를 연결해야 합니다.

## 동작 방식

1. 관리자가 홈페이지에서 `관리자 위치 저장 토큰`을 입력합니다.
2. 브라우저 위치 권한을 허용하고 `관리자 위치 저장`을 누릅니다.
3. `/api/location`이 좌표와 주소를 저장합니다.
4. `KV_REST_API_URL`과 `KV_REST_API_TOKEN`이 설정되어 있으면 마지막 위치가 KV/Upstash Redis에 영구 저장됩니다.
5. 오전 6시 30분 자동화가 `/api/weather/current`를 호출하면 서버가 KV/Upstash Redis의 마지막 위치를 먼저 읽고, 그 위치 기준으로 날씨를 계산합니다.
6. 계산된 `decision.message`가 PlayMCP 카카오톡으로 발송됩니다.

## Vercel 환경변수

필수:

```text
LOCATION_UPDATE_TOKEN=길고 예측하기 어려운 관리자 토큰
```

영구 저장소:

```text
KV_REST_API_URL=Vercel KV 또는 Upstash Redis REST URL
KV_REST_API_TOKEN=Vercel KV 또는 Upstash Redis REST TOKEN
```

Upstash Redis 이름으로 제공되는 경우에는 아래 이름도 지원합니다.

```text
UPSTASH_REDIS_REST_URL=Upstash Redis REST URL
UPSTASH_REDIS_REST_TOKEN=Upstash Redis REST TOKEN
```

선택 fallback:

```text
LOCATION_LABEL=서울 성동구
LOCATION_LATITUDE=37.5636
LOCATION_LONGITUDE=127.0365
```

## 확인 방법

배포 후 아래 주소를 열었을 때 `storage` 값이 `persistent`이고 `persisted`가 `true`이면, 오전 6시 30분 자동화도 마지막 저장 위치를 사용합니다.

```text
https://weather-gamma-umber-42.vercel.app/api/location
```

예상 응답:

```json
{
  "location": {
    "label": "용인시 처인구",
    "latitude": 37.23456,
    "longitude": 127.12345,
    "source": "saved"
  },
  "persisted": true,
  "storage": "persistent"
}
```

`storage`가 `default`이면 아직 영구 저장소 위치가 없는 상태입니다. 이 경우 관리자가 홈페이지에서 위치 저장을 한 번 실행해야 합니다.
