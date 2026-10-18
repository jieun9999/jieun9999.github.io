# VPS 커버 톤 통일

2026-10-18. `ai-blog-pipeline-cost.webp`를 시각 레퍼런스로 사용하고 `many-cheap-calls-blue-cover-v2.png`와 같은 남색 보고서 톤을 유지했습니다. 이미지 생성 도구로 생성했습니다.

최종 파일은 `public/covers/part1-three-tier-dev-environment-{ko,en}-v2.png`와 `public/covers/part2-four-people-one-dev-machine-{ko,en}-v2.png`입니다. 한글 Part 1 최초 결과의 맥북 실행 라벨은 VPS 역할과 혼동되어 브라우저·SSH로 수정했습니다. 본문은 변경하지 않았습니다.

## 한글 최초 생성 프롬프트

Use the reference only for visual style: dark navy #0d151f background, restrained slate and blue flat shapes, thin separators, small left-aligned typography, generous whitespace, footer jieun.dev. Wide 16:9 technical report cover. NO huge headlines or oversized numbers. Headline at most 5% image height; labels smaller. No cartoon devices, 3D, glow, decorative icons. Create a Korean remote development cover. Exact small eyebrow 'REMOTE DEVELOPMENT / VPS'. Headline '개발은 서버에서'. Three clean horizontal blocks connected left to right: '맥북 16GB', '개발 VPS 96GB', '운영 API·DB'. First connector labeled 'SSH', second '공용 터널'. The middle VPS block is blue, others slate. Small secondary label inside VPS '코드 · 빌드 · 에이전트'. Footer left '화면은 맥북 · 실행과 빌드는 VPS'. Show a simple architecture, not a memory-size chart. Do not invent performance metrics or show future e2e as implemented.

Use the reference only for visual style: dark navy #0d151f background, restrained slate and blue flat shapes, thin separators, small left-aligned typography, generous whitespace, footer jieun.dev. Wide 16:9 technical report cover. NO huge headlines or oversized numbers. Headline at most 5% image height; labels smaller. No cartoon devices, 3D, glow, decorative icons. Create a Korean shared VPS cover. Exact small eyebrow 'SHARED VPS / ACCESS ISOLATION'. Headline '한 서버, 네 작업공간'. Large thin-outlined container labeled '공유 VPS'. Inside four equal blue/slate blocks in a row with labels '개발자 1', '개발자 2', '디자이너', '마케터'. A small line below them inside container says '계정 · 홈 · 포트 분리'. The four blocks converge via thin lines to one block below labeled '공용 터널', then an arrow to a block '운영 API'. Footer left '작업공간은 분리 · 운영 연결은 서비스 계정'. All text modest in size, clear exact Korean.

## Part 1 한글 수정, Part 1 영문, Part 2 영문 프롬프트

Edit only the small secondary label inside the LEFT MacBook box. Replace '개발 · 편집 · 실행' with exactly '브라우저 · SSH'. Execution happens on VPS, not laptop. Keep every other pixel, label, layout and font size the same.

Create the English version of this exact cover. Keep navy/slate/blue layout, modest small typography, arrows and sizes. Replace ALL Korean with exact English: headline 'Development runs on the server'; left box '16GB MacBook', subtitle 'Browser · SSH'; center box '96GB Dev VPS', subtitle 'Code · Builds · Agents'; right box 'Production API · DB', subtitle 'Production services'; first arrow 'SSH', second arrow 'Shared tunnel'; footer 'Browser on the MacBook · Execution and builds on the VPS'. Eyebrow 'REMOTE DEVELOPMENT / VPS', jieun.dev unchanged. Fit English text without enlarging; no Korean remains.

Create the English version of this exact cover. Preserve navy/slate/blue layout, thin connectors, small restrained typography, boxes and whitespace. Replace ALL Korean with exact English: headline 'One server, four workspaces'; container 'Shared VPS'; four boxes 'Developer 1', 'Developer 2', 'Designer', 'Marketer'; label below boxes 'Separate accounts · Homes · Ports'; middle box 'Shared tunnel'; bottom box 'Production API'; footer 'Separate workspaces · Service-owned production access'. Eyebrow 'SHARED VPS / ACCESS ISOLATION' and jieun.dev unchanged. No Korean text remains. Text stays modest, not oversized.
