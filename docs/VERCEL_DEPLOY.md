# Vercel 배포 안내

이 프로젝트는 Vercel 배포를 위해 표준 Next.js 빌드(`next build`)를 사용한다.

## 필수 환경변수

| 이름 | 설명 |
| --- | --- |
| `LOCATION_UPDATE_TOKEN` | 공개 방문자가 위치를 바꾸지 못하게 막는 관리자 토큰 |

## 선택 환경변수

서버 저장소가 초기화되거나 쿠키가 없는 요청에서도 특정 위치를 기본값으로 쓰고 싶으면 아래 값을 설정한다.

| 이름 | 예시 |
| --- | --- |
| `LOCATION_LABEL` | `집` |
| `LOCATION_LATITUDE` | `37.5636` |
| `LOCATION_LONGITUDE` | `127.0365` |

## 배포 명령

```bash
npx vercel
npx vercel --prod
```

Vercel CLI가 로그인 링크를 표시하면 브라우저에서 로그인하고 프로젝트 연결을 승인한다.

## 위치 저장 방식

Vercel 배포 버전은 별도 데이터베이스 없이 동작하도록 구성되어 있다.

* 관리자 휴대폰에서 위치 저장 시 브라우저 쿠키에 위치를 저장한다.
* 서버가 살아 있는 동안에는 서버 메모리에도 마지막 위치를 보관한다.
* 장기적으로 안정적인 PlayMCP 자동 발송을 하려면 Vercel KV, Postgres, Upstash 같은 영구 저장소를 추가하는 것이 좋다.
