# 제목 개선 글 커버 생성 기록

- 도구: 내장 image_gen
- 최초 파일: `public/covers/readable-ai-titles.png`
- 기준: 2026-09-29 Grok v11 실제 제목 재생성 비교의 41972·41975 사례입니다. 승인 글감 수동 개선표는 사용하지 않았습니다.
- 원문과 비교해 한글 제목 네 개를 확인했습니다. 기존 비용 개선 글의 남색 배경·흰 제목·파란 강조색을 참고했습니다.

## 최초 생성 프롬프트

```text
Use case: infographic-diagram. Create a new Korean technical blog cover, 16:9 landscape, restrained flat editorial typography like an engineering production-log report. Solid near-black navy #101722, white heading, light periwinkle blue highlights, muted slate-gray BEFORE rows and blue AFTER rows, ample margins. No 3D, no textures, no charts, no invented metrics. Top small "TITLE DESIGN / GROK". Large headline exactly "안 읽히는 AI 제목을 어떻게 바꿀 수 있을까", wrapped in two lines. Two stacked clean comparison panels. First panel BEFORE text exactly "송도 분양 예정 아파트 학군 좋은 단지를 찾는 기준과 확인 방법", AFTER text exactly "송도 분양 예정 아파트 학군 좋은 단지". Second panel BEFORE exactly "송도 분양 예정 아파트 청약 준비를 위한 핵심 정보", AFTER exactly "송도 분양 예정 아파트 청약 일정". Long before titles may wrap naturally, after titles prominent blue. A thin footer rule. Bottom left exact text "동일 목차·출처 기반 Grok 제목 재생성". Bottom right "jieun.dev". Korean glyph accuracy critical. These are actual model regeneration comparisons with fixed evidence; no manual edits, no claims of click gains.
```

## 수정 커버

- 두 번째 파일: `public/covers/readable-ai-titles-v2.png`
- 큰 글 제목을 없애고 용산 사례 한 쌍을 확대했습니다. 상단에는 작은 설명만 남겼습니다.
- 사례는 [추가 재현 기록](readable-ai-titles-cover-reproduction.md)의 실제 Grok 응답입니다.

### 두 번째 수정 프롬프트

```text
Redesign this Korean tech blog cover. Keep dark navy background, white/slate and periwinkle blue flat editorial style. Wide 16:9. Remove old article headline and ALL Songdo examples. The actual comparison text must dominate 85% of image. Small understated top eyebrow ONLY "안내문에서 질문으로" (about 3% canvas height). ONE example stacked vertically, full width, not side by side: upper block small label "BEFORE", large readable gray-white Korean text exactly "용산 재개발 아파트 매수 시 현금청산 위험과 계약 특약 확인법" across 2 lines. Highlight the tail "계약 특약 확인법" in muted gray to convey length, but maintain readability. Small downward arrow in narrow gap. Lower block small label "AFTER", significantly larger bold bright light-blue Korean exact text "용산 재개발 아파트 사면 현금청산 위험 있나요?" across 2 lines, emphasize question ending. Use font approximately 6% of canvas height for before and 8% for after. Both blocks have generous inner padding and subtle rectangular boundaries. No huge heading, no repeated article title, no decorative imagery. Footer tiny "동일 목차·출처 · Grok 추가 재현 · 2026.10.18", right "jieun.dev". No invented statistics, no manual-edit label. Ensure all Korean is exact and easy to read as thumbnail.
```

## 간결한 최종 커버

- 최종 파일: `public/covers/readable-ai-titles-v3.png`
- 도구: 내장 image_gen
- 예시 비교와 게시물 제목을 제거하고, 문서·짧은 제목 카드 그래픽과 ‘읽히는 제목으로’ 한 줄만 남깁니다.

### 최종 생성 프롬프트

```text
Create a minimalist, sophisticated Korean tech blog thumbnail, landscape 16:9. Solid deep navy background #101722, abundant empty space (at least 65 percent), restrained flat vector-like editorial illustration. Center a small understated composition: on left a pale slate document sheet with many fine closely spaced abstract horizontal lines; on right a compact clean periwinkle-blue title card with just one crisp white abstract line. The document and title card slightly overlap to suggest simplification; no arrows, no labels, no panels, no before-after text. Illustration occupies only about 30 percent of the canvas width, sits centered above a modest caption. The ONLY actual readable text anywhere is exactly "읽히는 제목으로" in clean Korean sans-serif, medium-small, airy, centered below illustration. Do not write the full article title, no examples, no English, no date, no brand, no numbers, no icons of AI robots, no gradients, no glow, no 3D. Quiet, uncluttered, premium and legible at thumbnail scale. Preserve generous margins.
```
