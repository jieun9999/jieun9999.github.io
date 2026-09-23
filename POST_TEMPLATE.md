# 새 글 쓰는 법 (요약)

한국어 글은 **`~습니다·~입니다` 문체**로 작성합니다. 본문·요약(description)·문장형 이미지 설명·작성자의 콜아웃까지 통일합니다. 제목과 표의 짧은 명사형 표현은 유지하고, 코드·로그·직접 인용의 원문은 바꾸지 않습니다.

본문을 작성하거나 구조를 고칠 때는 [집필 기준](docs/writing/GUIDE.md)을 먼저 확인합니다. [참고 글 5편과 기존 글별 적용 제안](docs/writing/README.md)에서 맞는 구조 1~2개를 골라 사용합니다. 모든 글은 **들어가며 → 주제별 본론 → 마무리하며**를 유지합니다. 영어 글은 `Introduction`과 `Conclusion`을 사용하고, 본론 소제목은 내용에 맞게 바꿉니다.

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
description: '이 글에서 다루는 문제와 해결 과정을 한두 문장으로 소개합니다.'
subtitle: '목록에서 제목 아래 보이는 짧은 부제'  # 한글 30자·영어 60자 안팎. 넘치면 말줄임. 없으면 description 을 한 줄로 잘라 씀
pubDate: 2026-07-08
# updatedDate: 2026-07-10        # (선택) 수정일
tags: ['tag-one', 'tag-two']     # 소문자-하이픈 권장. 오른쪽 TAGS 패널/태그 페이지에 자동 반영. 목록엔 앞 3개만 보이니 대표 태그를 앞에
category: systems               # systems | scaling | reliability | devops
# cover: /covers/my-post.webp    # (선택) 커버 이미지. 없으면 자동 블루 타일 + 제목 이니셜
# coverAlt: '커버 이미지 설명'
# series: my-series              # (선택) 시리즈로 묶기 (같은 값끼리 그룹)
# seriesOrder: 1                 #        시리즈 내 순서
# seriesTitle: '시리즈 이름'
# draft: true                    # true면 배포에서 제외(초안). 지우거나 false면 발행
---

## 들어가며

제품과 대상 사용자, 내가 맡은 역할을 소개합니다. 어떤 문제를 겪었고 이 글이 무엇을 설명하는지 짧게 안내합니다.

> [!NOTE]
> 콜아웃 박스. NOTE / TIP / IMPORTANT / WARNING / CAUTION 5종.

## 문제와 기존 방식

어떤 조건에서 문제가 생겼는지, 사용자나 시스템에 어떤 영향을 줬는지 설명합니다. 실제 글에서는 내용을 드러내는 구체적인 소제목으로 바꿉니다.

## 선택한 해결 방법과 구현

관찰한 근거와 제약이 선택한 방법으로 어떻게 이어지는지 설명합니다. 아래 문법 예시는 필요한 내용으로 교체하거나 삭제합니다. H2·H3는 목차에 자동 반영됩니다.

**굵게**, _기울임_, `인라인 코드`, [링크](https://example.com), 그리고 표·목록 모두 됩니다.

코드블록 — 파일명 탭 · 줄번호 · 특정 줄 강조는 선택:

```ts title="src/example.ts" showLineNumbers {2}
export function greet(name: string) {
  return `Hello, ${name}!`; // 이 줄이 강조됨
}
```

이미지: 커버는 `public/covers/`, 본문 이미지는 `public/images/` 에 넣고 `/경로`로 참조.
alt를 적으면 캡션으로 표시되고, 본문 이미지는 클릭하면 크게 볼 수 있습니다.

![이미지 캡션이 됩니다](/images/example.webp)

## 검증 결과

측정 조건과 비교 기준, 확인한 결과와 검증하지 못한 범위를 구분합니다.

## 마무리하며

핵심 문제를 어떻게 해결했는지와 그 판단의 의미를 정리합니다. 남은 한계나 다음 과제를 덧붙이고, 본론에 없던 새로운 성과는 추가하지 않습니다.
