# ably-link 운영 매뉴얼

Next.js(App Router) + Cloudflare D1 기반 링크 교환 서비스입니다.  
운영 중 점검 모드를 안전하게 켜고 끌 수 있도록 `/admin`, `middleware`, `/maintenance` 자동 복귀 로직이 포함되어 있습니다.

## 점검 모드 작동 원리

점검 ON/OFF 흐름은 아래 순서로 동작합니다.

1. 관리자가 `/admin`에서 점검 버튼을 누릅니다.
2. `app/api/admin/maintenance/route.ts`가 D1의 `settings` 테이블(`key='global'`)을 갱신합니다.
3. 일반 사용자가 페이지 접속 시 `middleware.ts`가 `/api/settings`를 조회해 `is_maintenance` 상태를 확인합니다.
4. `is_maintenance=true`이면 `/admin`을 제외한 일반 경로를 `/maintenance`로 리다이렉트합니다.

## 자동 복귀 로직 (/maintenance)

`app/maintenance/page.tsx`에 자동 상태 체크가 구현되어 있습니다.

- 페이지 진입 직후 1회 즉시 `/api/settings` 호출
- 이후 10초 간격(`setInterval`)으로 점검 상태 재확인
- `isMaintenance === false`로 바뀌면 `window.location.href = "/"`로 즉시 메인 복귀
- 화면 하단에 실시간 체크 문구와 최근 확인 시각 표시

## 캐시 설정 (트래픽 방어)

`app/api/settings/route.ts` 응답에 아래 캐시 헤더를 사용합니다.

- `Cache-Control: public, s-maxage=15, stale-while-revalidate=45`

의미:

- `s-maxage=15`: Edge 캐시에서 15초 동안 fresh 응답 사용 (D1 조회 절감)
- `stale-while-revalidate=45`: 최대 45초 동안 stale 응답을 즉시 제공하면서 백그라운드 재검증

운영 포인트:

- 점검 토글 직후 최대 수초 지연이 있을 수 있으나, 트래픽 급증 시 D1 부하를 크게 줄입니다.
- 더 빠른 반영이 필요하면 `s-maxage`를 더 짧게 조정하세요.

## 관리자 가이드

### 1) 접속

- 관리자 페이지: `/admin`
- `middleware.ts`의 Basic Auth 보호 대상:
  - `/admin`
  - `/admin/*`
  - `/api/admin/*`

필수 환경변수:

- `ADMIN_BASIC_USER`
- `ADMIN_BASIC_PASS`
- `ADMIN_TOGGLE_PASS` (없으면 `ADMIN_BASIC_PASS`를 토글 비밀번호로 사용)

### 2) 점검 ON 시 주의사항

- 일반 사용자 트래픽은 `/maintenance`로 이동
- 링크 관련 API(`app/api/links/*`)는 `503`으로 차단
- 관리자 `/admin`은 계속 접속 가능 (점검 해제용)

### 3) 점검 OFF 시 주의사항

- `/maintenance` 페이지 사용자는 최대 10초 내 자동 복귀
- 일반 페이지도 middleware 체크 결과에 따라 순차 정상화

## 로컬 실행

```bash
corepack pnpm install
corepack pnpm dev
```

## 첫 배포 준비 체크리스트

1. `wrangler.toml`의 `database_id`를 실제 D1 ID로 교체
2. D1에 `migrations/0001_init.sql` 적용
3. Cloudflare 환경변수(관리자 계정/비밀번호) 설정
4. 배포 전 점검:
   - `corepack pnpm run lint`
   - `corepack pnpm exec tsc --noEmit`
5. 운영 검증:
   - `/admin` 로그인 후 점검 ON
   - 일반 경로가 `/maintenance`로 이동하는지 확인
   - 점검 OFF 후 `/maintenance`에서 자동 복귀 확인
