# 검색부터 원문 확보까지의 도식

2026-10-18. 실제 실행 결과의 화면 캡처가 아닌, 운영 코드 경로를 요약한 설명용 이미지입니다.

검토 소스: m-wdot-platform 커밋 cd26a85c의 worker/src/lib/content-plan-research-dataforseo.ts, platform-pool.ts, source-fulltext.ts와 worker/src/content-plan-worker.ts. 일반 검색 결과의 분리, 플랫폼 후보 풀과 조건부 보완 검색, 문서 병합, 원문 수집 및 스니펫 유지 경로를 확인했습니다. 원문 수집 재시도와 세부 필터, 동시성 제어는 그림에서 생략했습니다.

출력: public/images/search-intent/source-acquisition-flow-ko-v1.png

도식과 본문은 배정된 문서와 실제 원문 확보를 구분합니다. 검색 표현 개선의 효과를 측정한 자료로 사용하지 않습니다.

## 생성 프롬프트

### v2 선명도와 검색어 표기 수정

사용자 요청으로 구도·흐름은 유지하며 선과 글자를 선명하게 재생성하고, 상단을 `씨앗키워드 + 추가단어 = 저장된 검색어`로 변경했습니다. 출력은 `public/images/search-intent/source-acquisition-flow-ko-v2.png`입니다. 높은 해상도를 요청했지만 실제 출력 크기는 기존과 같으므로 픽셀 해상도 증가로 설명하지 않습니다.

Re-render this exact Korean technical flowchart at ultra crisp high resolution, target 3072 x 3840 portrait. Preserve ALL Korean wording, layout, box positions, arrows, line breaks, color roles and proportions exactly. This is a quality-only refinement, not a redesign. Replace the slightly textured/fuzzy rendering with perfectly flat light neutral background, razor-sharp clean sans-serif Korean typography, precise straight vector-like lines, smooth clean edges, uniform thin borders. No grain, no paper texture, no shadow, no blur, no gradient. Keep teal and slate connectors. Do not add/remove/change any text or arrows. Output at maximum feasible resolution for sharp zoomed reading.

Edit this exact diagram. In the very top box titled '일반 검색', replace ONLY the subtitle with this exact Korean text: '씨앗키워드 + 추가단어 = 저장된 검색어'. Preserve every other word, arrow, box and layout. Re-render at 3072x3840 pixels or highest possible resolution, with crisp flat clean typography and smooth precise vector-like lines. No fuzzy edges or texture. Do not alter other content.

### v1 최초 생성

Create a precise Korean technical blog flowchart, portrait 4:5, high resolution. Light neutral gray #fafafa background, dark charcoal text, white cards, thin gray borders and arrow connectors, one muted teal accent for the general-search path and one muted slate accent for the platform path. No navy cover style, no decorative icons, no giant heading. Readable short Korean labels with generous spacing. Exact correct typography. Diagram title small: "검색 결과가 글의 출처가 되기까지".
Layout top to bottom with two lanes in middle. All arrows unambiguous, no crossing:
TOP centered card "일반 검색" second line "저장된 검색어 · 씨앗 + 검색 표현".
Below it split arrows into LEFT lane card "일반 문서" subline "필터 통과 · 최대 3개", and RIGHT lane card "플랫폼 문서 후보" subline "네이버 블로그 · 유튜브 · 나무위키".
RIGHT next card "공유 후보 풀 확인" subline "현재 검색 문서 우선 · 플랫폼별 최대 3개".
RIGHT below diamond "배정할 문서가 있나요?".
YES branch labeled "있음" routes down to right-lane card "글감별 문서 배정" subline "미배정 문서 · 플랫폼별 최대 1개".
NO branch to side card "필요한 플랫폼만 보완 검색" two small lines "씨앗 앵커 · site: / intitle:" and "완료된 보완 검색은 재사용". Then arrow into same "글감별 문서 배정" card. Adjacent small note "문서가 없으면 빈 슬롯 유지". This branch is a conceptual summary: do not draw an infinite retry loop.
LEFT card "일반 문서" arrow and RIGHT card "글감별 문서 배정" arrow converge into wide centered lower card "선정 문서 합치기 · 중복 제거".
Then downward arrow into wide card "원문 수집" subline "수집 가능한 문서의 본문 확보".
Then downward arrow final card "확보한 자료로 목차 작성·검증" subline "원문 수집 실패·제외 시 검색 요약 유지".
Footer small "문서 배정 ≠ 원문 확보   ·   검색 깊이 10 유지".
Do not add claims that all selected URLs have fulltext or guarantee answers. Do not add code, logos, extra data, or English translations beyond site: / intitle:.

