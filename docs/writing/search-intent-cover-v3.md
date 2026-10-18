# 검색 의도 개선기 커버 v3

- 생성 도구: 내장 image_gen
- 참고 이미지: `public/covers/wiblog-search-intent-ko-v2.png`
- 최종 이미지: `public/covers/wiblog-search-intent-ko-v3.png`
- 사용자 요청: 세 영역을 수직으로 나열하지 않고 기존·개선의 추가 단어와 `+`가 잘 보이도록 재생성합니다.
- 구성: 위에 같은 글감 제목을 두고, 아래에 기존·개선 패널을 좌우로 배치합니다. 각 패널에서 씨앗키워드와 추가 표현을 분리하고 큰 `+`로 연결합니다.
- 표시 사례: `야외웨딩 우천 대비 + 올` → `야외웨딩 우천 대비 + 텐트 비용`입니다.
- 검토: 한국어 문구와 좌우 비교, 덧셈 기호, 강조 칩, 잘림 여부를 확인했습니다.

## 생성 프롬프트

Redesign the attached Korean blog cover. Preserve navy background, restrained blue highlights, white Korean sans-serif typography, 16:9 landscape, ample margins. CRITICAL: replace the three vertically stacked rectangles with TWO SIDE-BY-SIDE comparison panels on the SAME horizontal row. The + sign and additional words must be exceptionally clear. Top headline modest size: '앞단어 대신, 질문을 검색합니다'. Below headline, plain text without a filled box: small label '글감 제목' then '야외웨딩 비 올 때 텐트 대여 비용은 얼마예요?'. Main central area: left panel muted dark slate blue titled '기존', subtitle '앞에서 단어 추출'; right panel blue outlined titled '개선', subtitle '질문에 맞는 구문 생성'. Within EACH panel display a horizontal equation on ONE LINE: left '야외웨딩 우천 대비' followed by a LARGE visibly separated '+' followed by an outlined chip '올'; right '야외웨딩 우천 대비' followed by a LARGE visibly separated '+' followed by a bright blue chip '텐트 비용'. Use smaller text for shared seed, largest text for '올' and '텐트 비용', plus signs clearly visible with generous breathing room. Above seed segment small label '씨앗키워드'; above chip small label '추가 단어' in left panel and '추가 검색 구문' in right panel. Both equations must fit without clipping or awkward wrapping; use spacious wide panels. Align baseline of both equations. A subtle central right arrow may connect the two panels in their gap. No third panel, no vertical before-after stack. Footer thin rule, small left text '같은 제목 · 다른 검색어', small right 'jieun.dev'. Precise Korean spelling. No extra illustrations, gradients, giant headline, or extra diagrams.
