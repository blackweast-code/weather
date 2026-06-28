# 한국 날씨/위치 API 설정

이 앱은 한국 위치 정확도를 높이기 위해 아래 API를 우선 사용한다.

| 용도 | 우선 사용 | 환경변수 |
| --- | --- | --- |
| 날씨/강수확률 | 기상청 단기예보 조회서비스 | `KMA_SERVICE_KEY` |
| 주소/행정동 역조회 | Kakao Local API | `KAKAO_REST_API_KEY` |
| 지도 표시 | OpenStreetMap embed | 없음 |

## 기상청 단기예보

공공데이터포털에서 `기상청_단기예보 조회서비스` 활용신청 후 서비스키를 발급받아 Vercel 환경변수에 넣는다.

```env
KMA_SERVICE_KEY=공공데이터포털에서_발급받은_서비스키
```

앱은 휴대폰 위도/경도를 기상청 격자 `nx`, `ny`로 변환한 뒤 `getVilageFcst`를 호출한다. 기상청 응답이 실패하거나 키가 없으면 Open-Meteo로 자동 fallback한다.

## Kakao Local API

카카오 개발자 콘솔에서 앱을 만들고 REST API 키를 발급받아 Vercel 환경변수에 넣는다.

```env
KAKAO_REST_API_KEY=카카오_REST_API_키
```

앱은 `coord2regioncode`와 `coord2address`를 사용해 좌표를 행정동/도로명 주소로 바꾼다. 카카오 응답이 실패하거나 키가 없으면 OpenStreetMap Nominatim으로 fallback한다.

## Vercel 반영 순서

1. Vercel 프로젝트의 `Settings` → `Environment Variables`로 이동
2. `KMA_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `LOCATION_UPDATE_TOKEN` 추가
3. Production 환경에 체크
4. 저장 후 최신 배포를 `Redeploy`
