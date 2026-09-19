# design/ — jieun.dev 디자인 문서

jieun.dev 의 화면을 **페이지(URL)마다 한 파일**로 적은 문서다.
사람(디자이너·블로그 주인)과 AI 가 같이 읽는다.

- 사람에게는 **왜 이렇게 생겼는지**(의도·결정 이력)와 화면 스케치를,
- AI 에게는 **무엇을 쓰고 무엇을 하지 말지**(토큰 이름·파일 경로·규칙)를 준다.

값(색·크기·간격)은 **코드가 정답**이다. 문서와 코드가 다르면 코드를 따르고, 문서를 고친다.

## 읽는 순서

1. [`foundations.md`](./foundations.md) — 색·글꼴·간격·반경·화면 폭 기준·움직임·테마. 모든 페이지의 바탕.
2. [`shell.md`](./shell.md) — 헤더·푸터·히어로·검색창·맨 위로 버튼처럼 **여러 페이지가 같이 쓰는 틀**.
3. 아래 페이지 문서 — 각 페이지에만 있는 것.

페이지 문서는 공통 부분(헤더·토큰)을 다시 적지 않는다. 필요하면 위 두 문서를 가리킨다.

## 페이지 목록

| 문서 | 화면 | URL | 소스 |
| --- | --- | --- | --- |
| [`home.md`](./home.md) | 홈 (전체 글) | `/en/`, `/ko/` | `src/pages/[lang]/index.astro` |
| [`category.md`](./category.md) | 카테고리별 글 | `/[lang]/category/<id>/` | `src/pages/[lang]/category/[category].astro` |
| [`post.md`](./post.md) | 글 상세 | `/[lang]/blog/<slug>/` | `src/pages/[lang]/blog/[...slug].astro` → `src/layouts/PostLayout.astro` |
| [`tags.md`](./tags.md) | 태그 목록 | `/[lang]/tags/` | `src/pages/[lang]/tags/index.astro` |
| [`tag.md`](./tag.md) | 태그별 글 | `/[lang]/tag/<tag>/` | `src/pages/[lang]/tag/[tag].astro` |
| [`about.md`](./about.md) | 소개 | `/[lang]/about/` | `src/pages/[lang]/about.astro` |
| [`404.md`](./404.md) | 없는 페이지 | `/404` | `src/pages/404.astro` |
| [`og-card.md`](./og-card.md) | SNS 공유 카드 (사이트 밖) | `public/og/<lang>/<slug>.jpg` | `scripts/og-card.html`, `scripts/gen-og.mjs` |

`/` 는 화면이 없다. `/en/` 으로 보내는 리디렉션 스텁이다(CLAUDE.md "배포 & 검증" 참고).

## 페이지 문서의 목차

모든 페이지 문서는 같은 순서로 쓴다. 해당 없는 절은 뺀다.

1. **한눈에** — URL, 소스 파일, 쓰는 컴포넌트, 헤더에서 켜지는 메뉴, 검색 노출 여부
2. **이 페이지가 하는 일** — 누가 와서 무엇을 하고 가는가
3. **화면 구조** — 데스크톱·모바일 스케치
4. **구성 요소** — 요소별 파일과 모양
5. **반응형** — `1199px` / `809px` 기준에서 바뀌는 것
6. **다크 모드**, **한/영 차이**
7. **규칙** — 🔴 는 어기면 안 되는 것
8. **알아둘 것** — 결정 이력, 남은 숙제

## 문서를 고치는 규칙

- 화면을 바꾸는 커밋에는 **해당 페이지 문서 수정도 같이** 넣는다.
- 토큰·공용 컴포넌트를 바꾸면 `foundations.md`·`shell.md` 를 고치고, 영향을 받는 페이지 문서의 "알아둘 것"도 확인한다.
- 스케치는 ` ```plaintext ` 블록에 그린다. ` ```markdown ` 블록은 prettier 가 내용을 재포맷한다(CLAUDE.md "마크다운 함정").
- 수 범위는 `0.5–1.7px` 처럼 en dash(–)로 쓴다. 한 줄에 물결표 두 개는 취소선이 된다(CLAUDE.md).
