# 새 글 쓰는 법 (요약)

1. 이 파일을 복사해서 **파일 이름 = URL slug** 로 저장:
   - 영어: `src/content/blog/en/<slug>.md`
   - 한국어: `src/content/blog/ko/<slug>.md`  ← **같은 파일명**이면 EN↔KO 토글로 연결됨
   - 한 언어만 써도 됩니다. (그 경우 토글은 상대 언어 홈으로 이동)
   - 예) `src/content/blog/en/my-first-post.md` → `https://jieun9999.github.io/en/blog/my-first-post/`
2. 아래 frontmatter(`---` 사이)만 채우고 본문 작성.
3. 로컬 확인: `npm run dev` → http://localhost:4321
4. 발행: `git add . && git commit -m "새 글" && git push` → 1~3분 뒤 자동 배포.

아래 `---` 아래 전체를 복사해서 새 `.md` 파일로 쓰면 됩니다. (이 안내문 3줄은 빼고)

---
title: '글 제목'
description: '검색결과·카드에 보이는 한 줄 요약 (한두 줄).'
pubDate: 2026-07-08
# updatedDate: 2026-07-10        # (선택) 수정일
tags: ['tag-one', 'tag-two']     # 소문자-하이픈 권장. 오른쪽 TAGS 패널/태그 페이지에 자동 반영
category: building               # building | open-source | fundamentals | career
# cover: /covers/my-post.webp    # (선택) 커버 이미지. 없으면 자동 블루 타일 + 제목 이니셜
# coverAlt: '커버 이미지 설명'
# series: my-series              # (선택) 시리즈로 묶기 (같은 값끼리 그룹)
# seriesOrder: 1                 #        시리즈 내 순서
# seriesTitle: '시리즈 이름'
# draft: true                    # true면 배포에서 제외(초안). 지우거나 false면 발행
---

첫 문단입니다. 여기부터 본문이에요.

> [!NOTE]
> 콜아웃 박스. NOTE / TIP / IMPORTANT / WARNING / CAUTION 5종.

## 섹션 제목 (## = h2, ### = h3 → 목차 자동 생성)

**굵게**, _기울임_, `인라인 코드`, [링크](https://example.com), 그리고 표·목록 모두 됩니다.

코드블록 — 파일명 탭 · 줄번호 · 특정 줄 강조는 선택:

```ts title="src/example.ts" showLineNumbers {2}
export function greet(name: string) {
  return `Hello, ${name}!`; // 이 줄이 강조됨
}
```

이미지: 커버는 `public/covers/`, 본문 이미지는 `public/images/` 에 넣고 `/경로`로 참조.
alt를 적으면 캡션으로 표시되고, 본문 이미지는 클릭하면 크게 볼 수 있어요.

![이미지 캡션이 됩니다](/images/example.webp)
