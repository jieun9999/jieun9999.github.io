# NCP 운영 계정 이전 시리즈 게시 준비 검토 — 2026-11-02

로컬 반영 및 검증을 진행했습니다. commit/push와 실제 배포는 실행하지 않았습니다. 작업 시작 전 존재하던 다른 변경은 유지했습니다.

## 입력과 게시 파일

입력: `/Users/codeb_jeongjieun/Desktop/ncp-blog-series-PUBLISH-READY-20261102/`입니다. MANIFEST의 8개 파일 모두 SHA-256 및 크기가 일치했습니다.

| 편 | 최종 원고 | 게시 파일 | 예상 게시 URL |
| --- | --- | --- | --- |
| 1 | `posts/ncp-01-terraform-nks.md` | [ncp-account-migration-terraform-nks.md](../../src/content/blog/ko/ncp-account-migration-terraform-nks.md) | https://jieun.dev/ko/blog/ncp-account-migration-terraform-nks/ |
| 2 | `posts/ncp-02-migration-strategy.md` | [ncp-account-migration-strategy.md](../../src/content/blog/ko/ncp-account-migration-strategy.md) | https://jieun.dev/ko/blog/ncp-account-migration-strategy/ |
| 3 | `posts/ncp-03-safe-rehearsal.md` | [ncp-migration-safe-rehearsal.md](../../src/content/blog/ko/ncp-migration-safe-rehearsal.md) | https://jieun.dev/ko/blog/ncp-migration-safe-rehearsal/ |

세 파일과 커버·OG는 작업 시작 전에도 미추적 상태로 존재했습니다. 기존 게시물 본문은 축약·문체 수정된 버전이어서, 이번에 제공된 최종 원고의 전체 내용으로 반영했습니다. 원래 상태는 작업용 임시 디렉터리에 백업했습니다.

## 적용한 수정

- 원고의 H1은 기존 frontmatter의 같은 제목으로 사용하고, H1 뒤의 소개 문단을 `들어가며` 맨 앞으로 옮겼습니다.
- `## 본론`이라는 공통 래퍼를 제거하고 각 장을 H2, 3편 4장의 하위 절을 H3으로 올려 기존 목차 기능과 연결했습니다. 문장·의사결정 근거·코드·로그·수치는 다시 쓰거나 생략하지 않았습니다.
- 숫자 사이의 범위 기호 `~`만 `–`로 바꿨습니다. GFM이 한 행에 여러 물결표가 있는 표·문단을 취소선으로 처리하는 문제를 방지했습니다.
- 본문 대조 검사는 제목·제목 단계·도입 위치·공백·범위 기호라는 허용된 차이를 제외하고 전체 텍스트와 순서가 동일한지 확인했습니다.
- 1편 1장 마지막의 축약 로드맵만 유지했습니다. 2편은 세 방식의 비교와 선택 근거, 3편은 리허설·검증·문제 해결 구성을 그대로 유지했습니다. 제공된 커버 PNG 안에 있는 로드맵은 원본 이미지의 일부이므로 그대로 보존했습니다.
- 기존 시리즈 기능의 `series: ncp-account-migration`, `seriesTitle: NCP 운영 계정 이전`, `seriesOrder: 1/2/3`을 사용했습니다. 원고의 본문 상호 링크도 유지했습니다.
- 하단 다음 글 정렬에 홈 목록과 같은 발행일·시리즈 순서 기준을 적용해 1→2→3편으로 연결했습니다. 다음 글 썸네일에도 대상 글의 `coverFit: contain`을 전달해 이미지가 잘리지 않게 했습니다.
- 커버는 제공된 1920×1080 PNG와 바이트 단위로 동일합니다. 목록은 `contain`·밝은 여백, 상세 메인 커버는 원본 비율을 유지하는 기존 기능을 사용했습니다.

### 메타데이터

세 편의 발행일은 게시 준비일인 `2026-11-02`로 유지했습니다. 본문의 10월 작업 시점과 11월 2일 정리 시점은 변경하지 않았습니다. 1편은 `devops`, 2·3편은 `reliability`입니다. 태그는 NCP·Terraform·Kubernetes·PostgreSQL·Redis·이전·격리 관련 기존 소문자 태그 형식을 따릅니다.

제목·description·정확히 두 문장인 한국어 subtitle·coverAlt·시리즈 필드가 있습니다. 기존 description·subtitle은 정중한 문체로 유지했습니다. canonical은 self 기본값이고, 실제 없는 영어 번역의 글 URL은 생성하지 않았습니다. SNS용 OG JPG는 기존 생성기로 세 장 다시 만들었습니다.

### 3편 4장 보존 확인

| 문제 | 보존한 사실과 수정 시점 |
| --- | --- |
| Centrifugo | 리허설에서 새 웹의 메시지가 실제로 기존 운영 서버로 발행됐습니다. `CENTRIFUGO_API_URL`을 새 클러스터 내부 주소로 바꾸고 전환 당일 즉시 표시 여부도 확인했습니다. 단순한 잠재 위험으로 축소하지 않았습니다. |
| PostgreSQL | `vector`·`pg_stat_statements`가 `cdb_admin`에 설치돼 첫 복원이 실패했습니다. 덤프 파일에서 확장 스키마를 읽는 runner 수정 후 285개 테이블의 행 수 일치를 재검증했습니다. |
| Redis | `redis-import --replace`가 대상에만 있는 699개 키를 지우지 않았습니다. 전환 당일 수동 대조·정리로 9,587개 키 일치를 확인했습니다. 대상을 비우고 복원하는 runner의 영구 수정은 운영 전환 이후라는 설명을 보존했습니다. |

## 변경 파일 목록

게시물·게시 자산은 다음과 같습니다. PNG는 제공 원본과 동일하고, 기존 미추적 파일도 이번 게시 준비 목록에 포함했습니다.

- `src/content/blog/ko/ncp-account-migration-terraform-nks.md`
- `src/content/blog/ko/ncp-account-migration-strategy.md`
- `src/content/blog/ko/ncp-migration-safe-rehearsal.md`
- `public/covers/ncp-series-cover-01-terraform-nks.png`
- `public/covers/ncp-series-cover-02-migration-strategy.png`
- `public/covers/ncp-series-cover-03-rehearsal.png`
- `public/og/ko/ncp-account-migration-terraform-nks.jpg`
- `public/og/ko/ncp-account-migration-strategy.jpg`
- `public/og/ko/ncp-migration-safe-rehearsal.jpg`

기능 보정·문서·검증 증거는 다음과 같습니다.

- [상세 경로](../../src/pages/[lang]/blog/[...slug].astro): 같은 날 발행한 시리즈의 다음 글 순서·썸네일 옵션 전달입니다.
- [상세 레이아웃](../../src/layouts/PostLayout.astro): 다음 글 썸네일의 contain 표시입니다.
- [디자인 문서](../../design/post.md): 위 동작의 문서화입니다.
- 이 검토 보고서입니다.
- [검증 증거 폴더](ncp-series-20261102/): JSON 결과 2개와 PNG 화면 6개입니다.

## 검증 결과

- `npm run og`: 3개 생성, 기존 40개 건너뜀입니다. 결과는 1200×630 JPG입니다.
- `npm run build`: 최종 실행에서 201개 페이지 생성, 경고·오류 없이 통과했습니다. 첫 빌드의 기존 콘텐츠 캐시 중복 ID 경고는 재생성 가능한 캐시를 백업한 뒤 다시 빌드해 해소했습니다.
- `git diff --check`: 통과했습니다.
- [정적 검사 결과](ncp-series-20261102/static-results.json): 세 원고 내용·순서 보존, 1편 전용 로드맵, 핵심 문제와 수정 시점, 150개 내부 링크·이미지·앵커, canonical·OG·hreflang·사이트맵, 입력 해시 및 커버 동일성을 확인했습니다.
- [브라우저 검사 결과](ncp-series-20261102/browser-results.json): 로컬 Chrome에서 홈과 세 상세 글을 320·390·900·1280px, 밝은·어두운 테마로 검사했습니다. 32개 페이지·화면 폭·테마 조합에서 문서 가로 넘침 없음, 커버 원본 비율, 목록 hover 잘림 없음, 하단 썸네일 contain, 시리즈 순서·현재 편·다음 글, H1 단일 제목·첫/마지막 H2, 잘못 생긴 취소선 없음을 확인했습니다.
- 별도의 lint·typecheck 스크립트는 레포에 없습니다. 새 의존성을 추가하지 않고 Astro 빌드와 위 정적·브라우저 검사로 검증했습니다.
- 보안: 세 Markdown을 직접 읽고 커버 세 장을 열어 검토했습니다. 인증 토큰·개인키·비밀번호 포함 DB 접속 문자열·JWT·IPv4·이메일 원문 패턴은 발견하지 못했습니다. Secret·환경변수 이름, `cdb_admin`, 내부 연결 구조 설명은 실제 인증값과 구분했습니다.

화면 증거: [모바일 목록 1편](ncp-series-20261102/mobile-list-1.png), [2편](ncp-series-20261102/mobile-list-2.png), [3편](ncp-series-20261102/mobile-list-3.png), [모바일 상세 커버](ncp-series-20261102/mobile-post-3.png), [모바일 4장·어두운 테마](ncp-series-20261102/mobile-chapter-4-dark.png), [데스크톱 상세 커버](ncp-series-20261102/desktop-post-3.png)입니다.

## 남은 검토 사항과 검증 한계

- **문체 충돌:** 최종 원고의 자연스러운 `~다` 서술형은 사용자 요청에 따라 보존했습니다. 레포의 `~습니다·~입니다` 규칙과 충돌하지만 일괄 변환하지 않았습니다. 새로 쓰지 않은 frontmatter의 정중한 소개 문장과 본문 문체가 다르다는 점도 함께 남깁니다.
- **공개 범위:** WITIM·Orbit 이름, 배포 권한 문제와 데이터 공백 사례, 날짜·운영 수치·비용은 최종 원고의 기술적 맥락으로 보존했습니다. 실제 비밀값은 발견하지 못했으나, 조직 내부 정보의 공개 허용 여부 자체를 기술 검사로 확정하지는 못합니다.
- **커버:** 제공 PNG의 밝은 톤과 큰 제목은 현재 레포의 새 커버 생성 지침과 다릅니다. 제공 자산을 그대로 연결하라는 요청을 우선했으며 원본을 재생성하지 않았습니다. 모바일 목록에서는 작은 세부 라벨까지 크게 읽히지는 않지만 전체 이미지는 잘리지 않으며, 상세 커버는 기존 이미지 확대 기능을 사용할 수 있습니다.
- 검증 대상은 로컬 빌드 산출물입니다. 실제 배포·검색 색인·SNS 캐시 반영과 운영 이전 당시 원시 로그의 재검증은 수행하지 않았습니다.


## 후속 반영 — 가독성·흰 배경·본문 도식

위 게시 준비 검사는 최초 반영 시점의 기록입니다. 아래 내용이 이후 요청을 반영한 현재 상태입니다. 다크 테마 화면 증거는 변경 이전 기록으로만 남깁니다.

- 본문 색상을 `#27272a`, 기본 굵기를 `500`, 강조 굵기를 `700`으로 조정했습니다. 본문 크기는 16px입니다.
- 세 편의 표에 파랑·초록·보라 계열의 옅은 열 배경과 더 진한 헤더를 적용했습니다. 다른 시리즈의 표는 기존 색상을 유지합니다.
- 다크 모드 전환 버튼·테마 감지·스타일·댓글 테마 전환을 제거했습니다. OS 설정과 이전 브라우저 저장값에 관계없이 흰 배경을 사용합니다. 코드 블록과 댓글도 밝은 테마로 고정했습니다.
- 홈 프로필 배너에 `#e9edf1` 배경을 적용해 흰색 목록 영역과 대비를 주었습니다.
- 1편의 축약 로드맵 텍스트를 여섯 단계 SVG로 바꿨습니다. 날짜와 순서는 그대로입니다.
- 2편의 기존 전환 절차 텍스트 도식을 검증 관문과 쓰기 재개 시점이 보이는 SVG로 교체했습니다. 새 DB 쓰기 이후에는 DNS 복귀만으로 되돌릴 수 없다는 주의도 표시했습니다.
- 3편의 기존 복제 경로 텍스트 도식을 PostgreSQL 덤프·로컬 검증·새 계정 복원 경로 SVG로 교체하고, 4-1절에 Centrifugo의 잘못된 연결과 수정 후 연결을 비교하는 SVG를 추가했습니다. 전체 로드맵은 2·3편 본문에 추가하지 않았습니다.
- 이 네 곳의 도식 교체·추가를 제외한 세 원고의 본문과 frontmatter가 후속 작업 시작 전 파일과 동일함을 대조했습니다. 3편의 PostgreSQL·Redis 문제와 수정 시점도 유지했습니다. `~다` 문체 충돌에 관한 기존 검토 사항은 그대로입니다.
- 제공된 내부 HTML 가이드는 로컬 참고 자료로만 읽었습니다. 공개 도식은 역할 이름으로 새로 구성했으며 실제 주소·계정 식별자·비밀값이나 원본 HTML을 저장하지 않았습니다.

### 후속 변경 파일

- 본문: 위 세 Markdown 파일입니다.
- 도식: `public/images/ncp-migration/{roadmap,cutover-gates,rehearsal-isolation,centrifugo-routing}.svg`입니다.
- 화면: `src/styles/global.css`, `src/components/{BaseHead,BrandWordmark,Comments,Header,Hero,Particles}.astro`, `src/layouts/PostLayout.astro`, `src/pages/[lang]/blog/[...slug].astro`, `src/i18n/ui.ts`, `astro.config.mjs`입니다. 시리즈 ID를 상세 본문에 전달해 표 색상 범위를 제한했습니다.
- 제거: `src/components/ThemeToggle.astro`, `public/giscus/dark.css`입니다.
- 문서: `CLAUDE.md`, `design/{foundations,home,post,shell}.md`, 이 검토 보고서입니다. `scripts/og-card.html`은 독립적인 OG 팔레트임을 설명하는 주석만 수정했습니다.
- 검증: `scripts/test-light-reading.mjs`와 [후속 화면·결과](ncp-series-20261102/reading-update/)입니다. 새 의존성은 추가하지 않았습니다.

### 후속 검증

- [브라우저 결과](ncp-series-20261102/reading-update/results.json): 홈과 세 글을 320·390·900·1280px에서 OS 밝음·어두움 설정과 이전 다크 저장값으로 검사했습니다. 32개 조합 모두 흰 배경, 본문 가로 넘침 없음, 본문 대비 14.89:1·굵기 500, 컬러 표, 커버 비율, 시리즈 표시를 통과했습니다.
- 도식 네 장의 표시·확대·닫기, 모바일 메뉴, SVG 텍스트 경계, 다른 언어·소개·태그·카테고리의 밝은 화면을 검사했습니다. 모바일 도식과 표, 데스크톱 홈 화면을 직접 열어 읽기와 잘림 여부도 확인했습니다.
- 화면: [홈](ncp-series-20261102/reading-update/home-1280.png), [모바일 표](ncp-series-20261102/reading-update/part-1-table-390.png), [1편 로드맵](ncp-series-20261102/reading-update/roadmap-390.png), [2편 전환 절차](ncp-series-20261102/reading-update/cutover-gates-390.png), [3편 복제 경로](ncp-series-20261102/reading-update/rehearsal-isolation-390.png), [3편 Centrifugo 수정](ncp-series-20261102/reading-update/centrifugo-routing-390.png)입니다.
- 최종 `npm run build`: 201개 페이지 생성, 경고·오류 없이 통과했습니다. `git diff --check`도 통과했습니다. 빌드 산출물의 세 글 내부 링크·이미지·앵커 154개와 로컬 HTTP 200을 재확인했습니다. commit/push·실제 배포는 하지 않았습니다.
