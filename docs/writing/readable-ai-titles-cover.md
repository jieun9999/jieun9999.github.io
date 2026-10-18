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

## 세 번째 커버

- 세 번째 파일: `public/covers/readable-ai-titles-v3.png`
- 도구: 내장 image_gen
- 예시 비교와 게시물 제목을 제거하고, 문서·짧은 제목 카드 그래픽과 ‘읽히는 제목으로’ 한 줄만 남깁니다.

### 세 번째 생성 프롬프트

```text
Create a minimalist, sophisticated Korean tech blog thumbnail, landscape 16:9. Solid deep navy background #101722, abundant empty space (at least 65 percent), restrained flat vector-like editorial illustration. Center a small understated composition: on left a pale slate document sheet with many fine closely spaced abstract horizontal lines; on right a compact clean periwinkle-blue title card with just one crisp white abstract line. The document and title card slightly overlap to suggest simplification; no arrows, no labels, no panels, no before-after text. Illustration occupies only about 30 percent of the canvas width, sits centered above a modest caption. The ONLY actual readable text anywhere is exactly "읽히는 제목으로" in clean Korean sans-serif, medium-small, airy, centered below illustration. Do not write the full article title, no examples, no English, no date, no brand, no numbers, no icons of AI robots, no gradients, no glow, no 3D. Quiet, uncluttered, premium and legible at thumbnail scale. Preserve generous margins.
```

## 최종 커버 — 기존 비용 글과 같은 보고서 스타일

- 최종 파일: `public/covers/readable-ai-titles-v4.png`
- 도구: 내장 image_gen. `public/covers/ai-blog-pipeline-cost.webp`를 스타일 참고 이미지로 전달했습니다.
- 남색 배경, 슬레이트·파란색 도형, 얇은 구분선과 좌측 정렬을 유지하며 글자 크기를 줄였습니다.
- 입력·검증된 목차에서 세 제목 형식을 선택하는 흐름만 표현합니다. 비용 글의 수치와 통계 그래프는 가져오지 않습니다.

### 최종 생성 프롬프트

```text
Create a replacement blog cover using the attached image ONLY as the exact visual style reference. Match its flat dark-navy engineering report aesthetic: solid #101722 background, slate gray geometric bars, restrained periwinkle/blue accents, fine separator rules, flush-left typography, wide margins. New subject is AI title generation. Landscape 16:9. NOT a cute illustration or centered document icon. No 3D, no glow, no shadows, no textures. Text must be modest, NOT giant: heading only 4.5% of canvas height, all other Korean labels 2.5–3% height. Top-left small tracked eyebrow "TITLE GENERATION / GROK". Below at left one modest white headline "읽히는 제목으로". Middle of image: a quiet full-width slate horizontal band with centered text "입력 + 검증된 목차". Below it a tiny explanatory label "내용에 맞춰 형식 선택" and very thin connector lines branching from the band into three equally sized wide low rectangular blue-toned blocks along one row, with labels "질문형", "정보형", "후기형". This is a process schematic, not a statistical chart. Keep 50% of layout as breathing room. No giant article title, no example real-estate titles, no percentages, no numeric data or price symbols. Bottom fine horizontal rule like reference and small footer left "의미 판단은 Grok · 보존 규칙은 코드" and bottom-right "jieun.dev". Muted sophisticated palette very close to reference, uniform clean Korean sans-serif, exact Korean text. The graphic should feel like another cover in the reference's same engineering report series, with smaller typography.
```


## v5: 한글 오타 수정

- 도구: image_gen, v4 이미지를 참조한 편집
- 결과: public/covers/readable-ai-titles-v5.png
- 변경: 중앙 문구를 `입력 + 검증된 목차`로 재생성. 기존 색·배치·글자 크기 유지.

### 편집 프롬프트

```text
Edit the provided blog cover, preserving its exact navy and blue report design, layout, dimensions, typography sizes, whitespace and all other text. Correct ONLY the central slate bar's Korean text to exactly: '입력 + 검증된 목차'. The critical word is 검증된 (syllables 검 / 증 / 된), NOT 검종된 or 검중된. Render 증 with the proper ㅈ + ㅡ + ㅇ glyph, crisp clean Korean typography. Preserve small restrained text size; do not enlarge headings. All other labels unchanged: 읽히는 제목으로; 내용에 맞춰 형식 선택; 질문형; 정보형; 후기형; 의미 판단은 Grok · 보존 규칙은 코드; jieun.dev.
```


## v6: 중앙 문구 재생성·확대 확인

- image_gen으로 v5를 참조하여 중앙 문구를 다시 생성했습니다.
- `입력 + 검증된 목차`를 3배 확대해 확인했습니다.
- 결과: `public/covers/readable-ai-titles-v6.png`

```text
Regenerate this blog cover with the same restrained navy report style and same layout. IMPORTANT: previous image has a Korean typo in central bar: it looks like 검종된. Replace that entire central text with crisp correct typeset Korean '입력 + 검증된 목차'. The middle syllable MUST be 증 U+C99D (ㅈ above a flat horizontal ㅡ, with ㅇ below). There is NO vertical stroke on that horizontal vowel. Do NOT copy glyph pixels from source: redraw the whole central label in a clean Korean sans serif font. Verify exact characters 입 력 + 검 증 된 목 차. Preserve all other wording exactly: TITLE GENERATION / GROK; 읽히는 제목으로; 내용에 맞춰 형식 선택; 질문형; 정보형; 후기형; 의미 판단은 Grok · 보존 규칙은 코드; jieun.dev. Preserve subtle small text proportions, navy background, slate bar, blue three rectangles, thin branching lines. No oversized typography. Output sharp high resolution.
```
