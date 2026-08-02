# CLAUDE.md — jieun.dev 블로그 운영 규칙

기술 블로그. Astro + GitHub Pages, 커스텀 도메인 **jieun.dev**, 한/영 i18n(`/en/`·`/ko/`).
새 글 작성 절차·frontmatter는 `POST_TEMPLATE.md` 참고. 이 문서는 **SEO/교차발행 규칙**을 다룬다.

## 단일 채널 SEO 전략 (jieun.dev 단독)

- **SSOT = jieun.dev(이 레포)** — 한/영 모두 여기가 콘텐츠 마스터이자 **검색 대표**.
- **canonical 은 전부 self.** 한글이든 영문이든 예외 없음. 코드에 특별 분기 없음.
- **교차발행 안 함.** Hashnode 에 새 글을 올리지 않는다.

### Hashnode 는 어떻게 정리됐나 (2026-07)

예전엔 "전략 A" — 영문 canonical 을 `beckybuilds.hashnode.dev` 로 넘겨 영어권 검색을
Hashnode 에 맡기는 2채널 구조였다. Hashnode 가 GraphQL API 를 Pro 전용으로 돌리면서
자동화가 죽었고, 운영 채널을 jieun.dev 하나로 좁히기로 하면서 **canonical 을 회수**했다.

- 기존 영문 7편은 Hashnode 에 **그대로 남아 있되**, 각 글의 `Canonical URL` 필드가
  `https://jieun.dev/en/blog/<slug>/` 를 가리킨다 → 검색 점수는 jieun.dev 로 모인다.
- 레포에서 제거된 것: `crosspost`·`hashnodeId` frontmatter 필드, `scripts/crosspost-hashnode.mjs`,
  `.github/workflows/crosspost.yml`, `npm run crosspost`, `HASHNODE_BASE` 상수.
- **🔴 새 글에 `crosspost:` 를 쓰지 않는다.** 스키마에 없어서 빌드가 깨진다.
- repo Secret `HASHNODE_PAT` 은 이제 쓰이지 않는다(지워도 무방).

## 새 글 쓸 때 규칙 (중요)

1. **파일명 = URL slug.** EN↔KO 짝은 **같은 파일명**으로 연결(`en/<slug>.md` ↔ `ko/<slug>.md`).
2. **canonical 은 건드리지 않는다.** 기본값 self 가 정답이다. `canonicalURL` 필드는
   **외부에 먼저 실린 글을 여기로 옮겨 담을 때만** 쓴다 — 평소엔 쓸 일이 없다.
3. **hreflang은 자동.** EN/KO 같은 slug면 상호 링크가 자동 생성됨. 손댈 것 없음.
   x-default 는 기본 언어(en)로 고정된다.
4. **이미지**: 본문은 `/covers/`·`/images/` 상대경로로 참조.
5. **🔴 글을 추가하면 `npm run og` 를 돌리고 결과 JPG 를 같이 커밋한다.**
   SNS 공유 카드(`public/og/<lang>/<slug>.jpg`)를 만든다. 안 돌리면 그 글은
   기본 배너로 폴백해서, 링크드인에 제목 없는 카드가 뜬다.

### SNS 공유 카드 (`public/og/`)

`scripts/gen-og.mjs` 가 frontmatter(title·category·pubDate)를 읽어 언어별로 한 장씩
만든다. 템플릿은 `scripts/og-card.html` — 색은 `global.css` 의 다크 팔레트와 같은 값이다.

- 렌더링은 **로컬 크롬 headless** 에 맡긴다. 브라우저를 `package.json` 에 넣지 않으려는
  선택이라 **CI 에서는 돌지 않는다.** 결과 JPG 를 커밋하는 게 전제다.
  (크롬 경로가 다르면 `CHROME_PATH=... npm run og`)
- 기본은 없는 것만 만든다. 템플릿을 고쳤으면 `npm run og -- --force`.
- 제목이 길면 스크립트가 폰트 크기를 줄여 맞춘다. `[시리즈 N편]` 대괄호 프리픽스는
  자동으로 초록 칩으로 빠진다.
- 빌드는 파일이 있을 때만 `og:image` 를 글별 카드로 걸고, 없으면 기본 배너
  (`/og-default-v3.jpg`)로 폴백한다 — 404 미리보기가 나가지 않게.
- `public/og/*.jpg`(언어 폴더 밖, 8장)는 **예전 경로**다. 이미 공유된 링크가
  참조하고 있어 남겨둔 것이니 지우지 않는다.

## 마크다운 함정

### 🔴 한 줄에 물결표(`~`)를 두 개 쓰지 않는다 — 취소선이 된다

GFM에서 `~text~`·`~~text~~`는 **취소선**이다. 한국어 글에서 수 범위를 `11~14초`처럼
쓰는 습관 때문에, 한 문장에 범위가 두 개 들어가면 사이 구간이 통째로 취소선이 된다.

```plaintext
11~14초가 3~5초가 됩니다.
  ▲          ▲
  └──────────┘  이 사이가 취소선으로 렌더링된다
```

> 위 블록은 ` ```markdown `이 아니라 ` ```plaintext `여야 한다. prettier는 markdown
> 코드블록의 **내용까지 재포맷**해서, 이 예시 자체를 깨뜨린다.

frontmatter가 아니라 **본문에서만** 문제가 되고, 빌드는 성공하므로 **에러 없이 조용히
잘못 렌더링된다.** 배포된 페이지를 눈으로 봐야 발견된다. (전례: PR #20, #21)

- ✅ 범위가 하나면 안전하다 — `블로그의 5~10초는 짧지만`
- ❌ 한 줄에 둘 이상 — `11~14초가 3~5초가 됩니다`
- 해결: 문장을 나누거나(`재생성이 일어나도 3~5초에서 끝납니다`), 화살표·en dash로
  바꾸거나(`11–14초 → 3–5초`), 한쪽을 말로 풀어쓴다.

표 안에서도 같은 규칙이다. 셀 하나에 물결표가 하나면 안전하지만, **같은 줄의 다른 셀에
또 있으면 셀 경계를 넘어 취소선이 걸린다.**

글을 쓰거나 고친 뒤 `grep -n '~~' src/content/blog/*/<slug>.md`로 확인한다.
prettier가 `11~~14초`처럼 물결표를 붙여 정규화해두면 이 grep에 걸린다.

## 전 회사 지칭 규칙 (톤·표현)

이 블로그는 **전 회사에서 한 일**을 기록한다. 면접관이 볼 수 있으므로 전 회사 제품/조직을
**"우리 X"로 소유하듯 부르지 않는다.**

- **🔴 전 회사의 자산(플랫폼·제품·서비스·프로젝트·코드베이스 등)을 "우리 X"로 부르지 않는다.**
  대신 **내가 그 자산에 한 역할**을 드러내는 표현으로 쓴다.
  - ❌ `우리 플랫폼`, `우리 제품`, `우리 서비스`, `우리 코드베이스`, `Our platform`, `our codebase`
  - ✅ `제가 담당하던 플랫폼/서비스`, `제가 개선했던 코드베이스`,
    `The platform I worked on`, `the codebase I worked on`
- **순수 행위 서술의 1인칭 복수는 유지해도 된다.** `우리는 ~했다`, `우리의 결정`, `we did ~`,
  `our approach`처럼 **명사가 아니라 행위/과정**을 서술하는 경우는 자연스럽다.
  소유를 주장하는 건 **자산 명사**를 "우리 것"이라 부를 때만 문제.
- **전 회사를 깎아내리는 톤 금지.** `단순한/결함투성이`보다 `초기 버전의 ~ / 규모가 커지며
드러난 한계`처럼 **"내가 그 한계를 진단하고 개선했다"**로 무게중심을 옮긴다.
- **가상 인용은 예외.** `사람들은 "우리 서비스는 100 MPS를 처리한다"고 말한다`처럼
  일반론을 인용하는 수사적 장치는 전 회사 지칭이 아니므로 그대로 둔다.

## 배포 & 검증

- `main` push → GitHub Actions 자동 빌드·배포(`deploy.yml`). 커스텀 도메인은 `public/CNAME`.
- 새 글/SEO 변경 후 확인: 빌드된 `dist/en/blog/<slug>/index.html`에서
  `<link rel="canonical">`이 **self**인지, hreflang이 정상인지.
  전수 검사: 각 `dist/**/index.html`의 canonical 이 자기 URL 과 같은지 비교하면 된다
  (다른 게 나오면 `/`(리디렉션 스텁) 하나뿐이어야 정상).
- **색인 모니터링(팔로업)**: canonical 회수 후 영문 7편이 Google Search Console 에서
  "대체 페이지"에서 빠지고 색인으로 넘어오는지 확인(수 주 걸림).
- GSC 의 **"'NOINDEX' 태그에 의해 제외"는 `https://jieun.dev/` 한 건이 정상**이다.
  `astro.config.mjs` 의 `redirects: {'/': '/en/'}` 가 만드는 meta-refresh 스텁에 Astro 가
  `noindex` 를 자동으로 넣는다. GitHub Pages 는 서버 301 을 못 써서 이게 유일한 수단 —
  고장이 아니니 손대지 말 것.
- Search Console: `jieun.dev` 도메인 속성 등록됨, sitemap `sitemap-index.xml` 제출됨.
