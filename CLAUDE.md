# CLAUDE.md — jieun.dev 블로그 운영 규칙

기술 블로그. Astro + GitHub Pages, 커스텀 도메인 **jieun.dev**, 한/영 i18n(`/en/`·`/ko/`).
새 글 작성 절차·frontmatter는 `POST_TEMPLATE.md` 참고. 이 문서는 **SEO/교차발행 규칙**을 다룬다.

## 2채널 SEO 전략 (전략 A)

- **SSOT = jieun.dev(이 레포)** — 콘텐츠 마스터, 완전 소유. 한/영 모두 여기 존재.
- **Hashnode(`beckybuilds.hashnode.dev`) = 영문 유통 채널** — 높은 DA로 영어권 검색 담당.
- **canonical 방향**
  | 글                                    | canonical                          |
  | ------------------------------------- | ---------------------------------- |
  | jieun.dev 한글                        | self                               |
  | jieun.dev 영문 (Hashnode에도 올린 글) | → Hashnode 대응 글                 |
  | jieun.dev 영문 (Hashnode에 없는 글)   | self                               |
  | Hashnode 영문                         | self (Canonical URL 필드 **비움**) |
- 결과: 한국어 검색 = jieun.dev / 영어 검색 = Hashnode. 서로 경쟁 안 함.
- 장기: authority 붙으면 영문 canonical을 jieun.dev로 회수(전략 B) 재검토.

## 새 글 쓸 때 규칙 (중요)

1. **파일명 = URL slug.** EN↔KO 짝은 **같은 파일명**으로 연결(`en/<slug>.md` ↔ `ko/<slug>.md`).
   Hashnode에 올릴 때도 **반드시 같은 slug**로 발행해야 canonical이 맞아떨어진다.
2. **`crosspost: true`는 "이 영문 글이 Hashnode에도 실제로 존재한다"는 뜻.** 이 플래그가 하는 일:
   - jieun.dev 그 영문 글의 canonical을 `https://beckybuilds.hashnode.dev/<slug>`로 넘김.
   - (Hashnode Pro 활성 시) GitHub Actions가 자동 발행/수정.
3. **🔴 절대 규칙: Hashnode에 실제로 발행한 뒤에만 `crosspost: true`를 켠다.**
   Hashnode에 없는데 켜면 canonical이 404를 가리켜 → 구글이 그 영문 글을 검색에서 뺄 수 있음(SEO에 해).
   확신 없으면 `crosspost` 생략(=self-canonical, 안전).
4. **한글 글에는 절대 `crosspost`를 켜지 않는다.** (self-canonical 유지)
5. **hreflang은 자동.** EN/KO 같은 slug면 상호 링크가 자동 생성됨. 손댈 것 없음.
6. **이미지**: 본문은 `/covers/`·`/images/` 상대경로로 참조. Hashnode에 **수동** 발행할 땐
   이미지 URL을 `https://jieun.dev/...` 절대경로로 바꿔서 넣어야 안 깨진다.
   (자동 발행 스크립트는 이 변환을 자동으로 함.)

## 마크다운 함정

### 🔴 한 줄에 물결표(`~`)를 두 개 쓰지 않는다 — 취소선이 된다

GFM에서 `~text~`·`~~text~~`는 **취소선**이다. 한국어 글에서 수 범위를 `11~14초`처럼
쓰는 습관 때문에, 한 문장에 범위가 두 개 들어가면 사이 구간이 통째로 취소선이 된다.

```markdown
11~~14초가 3~~5초가 됩니다.
▲ ▲
└────────┘ 이 사이가 취소선으로 렌더링된다
```

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

## Hashnode 발행: 현재 **수동**

Hashnode가 2026-05부터 **GraphQL API를 Pro 전용**으로 전환. `beckybuilds`는 현재 Pro 아님
→ **자동 발행 불가, 수동으로 올린다.**

- 수동 발행 순서: Hashnode에서 새 글 → 마크다운 붙여넣기 → **slug를 파일명과 동일하게** →
  이미지 URL은 `https://jieun.dev/...` 절대경로 → Canonical URL 필드는 **비워둠** →
  발행 → 그다음 jieun.dev 해당 영문 글 frontmatter에 `crosspost: true` 추가하고 push.

### 자동화(선택, Pro 켜면 부활)

- `scripts/crosspost-hashnode.mjs` + `.github/workflows/crosspost.yml`이 이미 있음.
  Pro 아니면 워크플로우는 경고 후 스킵(green). Pro로 업그레이드하면 코드 수정 없이 자동 작동.
- 활성화 시: repo Secret `HASHNODE_PAT` 설정(등록돼 있음) → 먼저
  `DRY_RUN=1 HASHNODE_PAT=xxx npm run crosspost`로 기존 글이 **UPDATE**로 뜨는지 확인
  (PUBLISH면 중복 위험 → 중단) → 실제 1회 실행해 `hashnodeId` 시드+커밋 → 이후 Actions 자동.
- 상수 `HASHNODE_BASE`/`PUBLICATION_HOST`(스크립트·`src/pages/[lang]/blog/[...slug].astro`)가
  같아야 함. Hashnode에 커스텀 도메인 붙이면 이 값들 갱신.

## 배포 & 검증

- `main` push → GitHub Actions 자동 빌드·배포(`deploy.yml`). 커스텀 도메인은 `public/CNAME`.
- 새 글/SEO 변경 후 확인: 빌드된 `dist/en/blog/<slug>/index.html`에서
  `<link rel="canonical">`이 의도대로(→Hashnode 또는 self)인지, hreflang이 정상인지.
- **색인 모니터링(팔로업)**: canonical을 Hashnode로 넘긴 영문 글이 Google Search Console에서
  검색에서 사라지지 않는지 주기적으로 확인. Hashnode 대응 글이 색인돼야 안전.
- Search Console: `jieun.dev` 도메인 속성 등록됨, sitemap `sitemap-index.xml` 제출됨.
