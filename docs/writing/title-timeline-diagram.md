# 제목 생성 타임라인 도식

2026-10-18. 한국어 제목 개선 글의 기존 6단계 타임라인 표를 이미지로 교체했습니다. 기존 용산 예시를 사용하며 실제 로그나 시간 측정 자료가 아닌 설명용 예시입니다. Grok의 의미 판단과 코드의 검증·저장 책임을 담당 라벨과 색으로 구분했습니다.

출력: public/images/title-generation/title-timeline-ko-v1.png

## 생성 프롬프트

Create a clean Korean technical article flowchart, portrait 3:4, maximum feasible resolution. Crisp sans-serif Korean text, flat white/light neutral gray background, thin gray borders, precise straight arrows, no texture, no shadow, no illustrations. Match restrained readable engineering blog diagrams. This is an illustrative example, not measured execution. Six stacked cards connected by downward arrows with small numbered circles 01–06. Muted teal for Grok judgement cards 02 and 04, neutral slate for code cards 01,05,06, neutral card03. Always explicitly label role in text, not color alone. Modest title "한 글감이 제목이 되기까지" and small subtitle "처리 흐름을 설명하기 위한 예시".
Use EXACT Korean below, generous padding and no text clipping. Card04 taller than others.
01 title "입력 전달 · 코드"
body "키워드: 용산 재개발 아파트"
02 title "초기 제목 생성 · Grok"
body wrapped naturally over 2 lines: "용산 재개발 아파트 매수 전 알아야 할 현금청산 위험과 조합원 자격, 계약 특약 및 주의사항"
03 title "출처 원문 수집 → 목차 작성·검증"
body three short lines: "① 현금청산 대상이 되는 조건" / "② 조합원 지위를 넘겨받는 조건" / "③ 계약 전 확인할 사항"
small footer inside card: "항목마다 설명·근거 출처 연결"
04 title "필요한 답 판단 → 형식·제목 작성 · Grok"
small line "핵심 질문: 샀는데 입주권을 받지 못할 수도 있나요?"
highlighted final title in medium weight, NOT huge: "용산 재개발 아파트 사면 현금청산 위험 있나요?"
small two lines: "입력 충족 평가: answered: true" / "이유: 목차가 현금청산 조건과 매수 전 확인 사항을 다룹니다."
05 title "응답 검증 · 코드"
body "응답 구조 · 필수 평가 · 제목 규칙 확인"
small line "통과 예시: status: ready → proposed_title"
06 title "확정 제목 저장·유지 · 코드"
body "글감 카드 → 본문 생성 → 재작성"
small line "검증을 통과한 제목을 그대로 사용"
Bottom small legend "Grok: 의미 판단과 표현   /   코드: 검증·저장·유지".
Do not depict a separate classifier. Do not add clocks, duration, statistics or claims of real measured results. Preserve all exact titles and key values. Use a single unambiguous top-to-bottom path.

