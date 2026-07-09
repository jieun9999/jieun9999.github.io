# jieun9999.github.io

한국어/영어 토글을 지원하는 개발 기술 블로그. [Astro](https://astro.build)로 만들었고, GitHub Pages로 자동 배포됩니다.

**라이브 주소:** https://jieun9999.github.io

## 글 쓰는 법

1. `src/content/blog/en/` 와 `src/content/blog/ko/` 에 **같은 파일명**으로 마크다운을 만든다.
   - 예) `en/my-post.md` + `ko/my-post.md` → 서로 번역 짝으로 연결되어 토글됨.
   - 한 언어만 써도 됨(그 경우 토글은 상대 언어 홈으로 이동).
2. frontmatter 예시:

   ```yaml
   ---
   title: '글 제목'
   description: '검색결과/SNS에 뜨는 한 줄 요약'
   pubDate: 2026-07-06      # 발행일 (과거 날짜 그대로 넣으면 그 시점 글로 정렬)
   updatedDate: 2026-07-10  # (선택) 수정일
   tags: ['astro', 'web']
   draft: false             # true면 배포에서 제외
   ---
   ```
3. `git add . && git commit -m "새 글" && git push` → 1~3분 뒤 자동 반영.

## 로컬에서 미리보기

```bash
npm install      # 최초 1회
npm run dev      # http://localhost:4321
npm run build    # 배포와 동일하게 빌드 (문제 없는지 확인)
```

## 구조

| 경로 | 역할 |
|------|------|
| `src/content/blog/{en,ko}/` | 글(마크다운) |
| `src/pages/[lang]/` | 언어별 홈/글 페이지 라우팅 |
| `src/components/` | 헤더, 언어 토글, 다크모드 토글, SEO(head) |
| `src/layouts/` | 공통 레이아웃, 글 레이아웃(목차 포함) |
| `src/i18n/ui.ts` | UI 문자열 + 언어 헬퍼 |
| `.github/workflows/deploy.yml` | GitHub Pages 자동배포 |

## 포함된 것

- 한/영 언어 토글 (같은 글 즉시 전환)
- SEO: 메타/OG 태그, `sitemap`, 언어별 `RSS`, **hreflang**, canonical
- 코드 문법 강조(라이트/다크), 다크 모드, 글 목차(TOC)
- DB·서버 없음 — 글은 전부 마크다운 파일

## 테스트

테스트용 첫 번째 줄입니다.
테스트용 두 번째 줄입니다.
