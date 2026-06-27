# 카카오톡 실제 연동 설정 가이드

이 프로젝트는 카카오톡 메시지 API의 `나에게 보내기` 방식으로 우산 알림을 발송한다.

## 1. 카카오 개발자 콘솔 설정

1. [Kakao Developers](https://developers.kakao.com/)에서 애플리케이션을 만든다.
2. 앱 설정에서 `REST API 키`를 확인한다.
3. 플랫폼 Web에 아래 도메인을 등록한다.
   - 로컬 테스트: `http://localhost:3000`
   - 배포 사이트: 실제 배포 URL
4. 카카오 로그인 Redirect URI에 아래 주소를 등록한다.
   - 로컬 테스트: `http://localhost:3000/api/kakao/callback`
   - 배포 사이트: `https://배포도메인/api/kakao/callback`
5. 동의항목에서 카카오톡 메시지 전송 권한을 설정한다.

## 2. 로컬 환경변수 설정

`.env.local` 파일을 만들고 아래 값을 채운다.

```env
KAKAO_REST_API_KEY=카카오_REST_API_키
KAKAO_REDIRECT_URI=http://localhost:3000/api/kakao/callback
KAKAO_CLIENT_SECRET=
KAKAO_REFRESH_TOKEN=
SITE_PUBLIC_URL=http://localhost:3000
```

`KAKAO_CLIENT_SECRET`은 카카오 앱에서 Client Secret을 사용하도록 설정한 경우에만 입력한다.

## 3. Refresh Token 발급

1. 로컬 서버를 실행한다.
2. 홈페이지의 `카카오 연결` 버튼을 누른다.
3. 카카오 로그인과 동의를 완료한다.
4. 콜백 화면에 표시되는 `KAKAO_REFRESH_TOKEN=...` 값을 복사한다.
5. `.env.local`의 `KAKAO_REFRESH_TOKEN`에 저장한다.
6. 로컬 서버를 다시 시작한다.

## 4. 테스트 발송

홈페이지에서 `테스트 발송` 버튼을 누르면 현재 화면의 우산 판단 메시지를 카카오톡 `나에게 보내기`로 발송한다.

발송이 성공하면 카카오 API 응답의 `result_code`가 `0`으로 돌아온다.

## 5. 배포 환경변수

배포된 Sites에서도 실제 발송하려면 production 환경변수에 같은 키를 등록해야 한다.

```env
KAKAO_REST_API_KEY=카카오_REST_API_키
KAKAO_REDIRECT_URI=https://배포도메인/api/kakao/callback
KAKAO_CLIENT_SECRET=
KAKAO_REFRESH_TOKEN=발급받은_refresh_token
SITE_PUBLIC_URL=https://배포도메인
```

배포 URL을 카카오 개발자 콘솔의 Web 플랫폼 도메인과 Redirect URI에도 등록해야 한다.

## 6. 구현된 API

| 경로 | 역할 |
| --- | --- |
| `/api/kakao/status` | 카카오 환경변수 설정 여부 확인 |
| `/api/kakao/auth-url` | 카카오 로그인 동의 화면으로 이동 |
| `/api/kakao/callback` | 인증 코드로 refresh token 발급 |
| `/api/kakao/send` | refresh token으로 access token을 갱신하고 메시지 발송 |

## 7. 주의사항

* `KAKAO_REFRESH_TOKEN`은 비밀값이므로 Git에 커밋하지 않는다.
* 토큰이 갱신되어 새 refresh token이 반환되면 환경변수도 갱신해야 한다.
* 여러 사용자나 단체방 발송은 카카오 권한과 정책 검토가 추가로 필요하다.
