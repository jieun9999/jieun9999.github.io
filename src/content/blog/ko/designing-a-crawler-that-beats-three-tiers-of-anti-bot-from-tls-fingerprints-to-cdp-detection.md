---
title: '3단계 anti-bot을 뚫는 크롤러 설계 — TLS fingerprint부터 CDP 탐지까지'
description: 'Threads 마케팅 에이전트를 만든 엔지니어링 기록을 두 편으로 나눈 글. 1편(이 글): 데이터 수집 계층 — anti-bot 위협 모델을 중심으로 설계한 크롤러. 2편: 생성 파이프라인'
pubDate: 2026-06-29
tags: ['webscraping', 'crawling', 'cloudflare', 'tls', 'systemdesign', 'anti-bot', 'threads']
category: building
cover: /covers/designing-a-crawler-that-beats-three-tiers-of-anti-bot-from-tls-fingerprints-to-cdp-detection.webp
coverAlt: '3단계 anti-bot을 뚫는 크롤러 설계 — TLS fingerprint부터 CDP 탐지까지'
series: threads-agent
seriesOrder: 1
seriesTitle: 'Threads 마케팅 에이전트 만들기'
---
> Threads 마케팅 에이전트를 만든 엔지니어링 기록을 두 편으로 나눈 글입니다.
> 
> -   **1편 (이 글):** 데이터 수집 계층 — anti-bot 위협 모델을 중심으로 설계한 크롤러
>     
> -   [**2편:** 생성 파이프라인 — 반복적인 콘텐츠 모델 설계, 예약 발행, 성과 기여도 분석](/ko/blog/designing-a-generation-pipeline-a-4-axis-content-model-queue-based-scheduling-3-layer-attribution/)
>     

* * *

## TL;DR

한국 자동차 커뮤니티 글을 Threads 콘텐츠로 바꾸는 에이전트에서, **진짜 병목은 LLM 생성이 아니라 데이터 수집(크롤링)이었습니다.** 대상 사이트마다 anti-bot 방어 수준이 달라서, 단일 수집 전략으로는 전부 커버할 수 없습니다.

핵심 통찰은 **anti-bot이 _어떤 신호를 검사하는지_ 를 기준으로 수집 전략을 계층화하는 것**이었습니다.

| 계층 | 위협 신호 | 대표 사이트 | 차단 지점 | 채택한 해법 | 비용 |
| --- | --- | --- | --- | --- | --- |
| **Tier 1** | IP 평판만 | 클리앙, 디시인사이드, 보배드림 | — (사실상 없음) | `urllib` 직접 요청 | 가장 낮음 |
| **Tier 2** | IP + **TLS fingerprint (JA3)** | FM코리아 | curl/requests 차단(430) | residential IP + 실제 headless Chrome; VPS가 Tailscale로 위임 | 중간 |
| **Tier 3** | \+ **CDP 자동화 탐지** | Upwork | 모든 자동화 브라우저 차단 | 사람 세션 내부의 userscript (Tampermonkey) | 높음(완전 자동화 포기) |

데이터를 어떻게 가져오든 결과물은 하나의 정규화된 스키마로 통일되고, 호출부는 사이트별 복잡성으로부터 보호됩니다. 아래에서는 각 계층을 **가설 → 실험 → 결론**의 흐름으로 풀어 봅니다.

* * *

## 1\. 문제 정의 — 병목은 생성이 아니라 수집이다

흔히 떠올리는 "AI 마케팅 자동화"의 이미지는 생성(프롬프트 → 텍스트)에 무게를 둡니다. 하지만 실제로 생성은 빠르게 수렴합니다. 시간을 잡아먹는 것은 입력 확보입니다. _무엇에 대해 쓸 것인가?_ 원재료는 서드파티 커뮤니티에 있고, 그 사이트들은 봇을 차단합니다.

이 계층 전체를 지배한 두 가지 설계 원칙이 있는데, 둘 다 운영하면서 배운 것입니다.

**원칙 1 — 추출 API ≠ 구조 크롤러.** 초기에는 본문 추출 API(예: Tavily)를 썼습니다. 보배드림 글 하나 기준으로 원본 HTML 95KB → 정제된 출력 5KB. 깔끔하긴 하지만 태그, 작성 날짜, 그리고 댓글(AJAX 페이로드)이 전부 사라졌습니다. 우리 파이프라인은 댓글을 일급 입력(first-class input)으로 다룹니다 — 생성 품질의 핵심이거든요 — 그래서 추출 API는 구조적으로 맞지 않았습니다.

그러니 도구 선택의 첫 갈림길은 "본문 텍스트만 필요한가, 아니면 구조/동적 콘텐츠도 필요한가?"입니다. 정제 API의 "깔끔함"은 _곧_ 정보 손실입니다.

**원칙 2 — 자동화의 범위를 운영의 규모에 묶어라.** 첫 설계는 소재를 자동 발굴하는 방식이었습니다("인기 태그 + 최근 N일 + 다중 후보 큐"). 그러나 검증되지 않은 글을 양으로 긁어모으면 주제 분산만 커집니다. 이미 반응이 검증된 글을 고르는 일은 봇의 휴리스틱 점수 매기기보다 사람의 판단이 더 잘합니다. 그래서 전제를 **"사람이 소스 URL을 고른다"**로 고정하고, 봇은 그 한 URL에서 구조를 무손실로 추출하는 데만 집중하게 했습니다.

그 결과 수집 엔진의 단일 책임이 명확해졌습니다. **"사람이 고른 URL 하나 → {제목, 본문, 댓글, 이미지}를 무손실로 정규화."** 사소해 보이지만, 사이트마다 HTML 구조와 anti-bot이 전부 달라서 단일 구현은 불가능합니다.

* * *

## 2\. 인터페이스 설계 — 사이트별 복잡성 캡슐화

사이트마다 전략이 갈리더라도, 호출부는 그 분기를 알아서는 안 됩니다. 단일 헬퍼(`fetch_source.py`)가 URL만 받아 내부에서 디스패치하고, 하나의 스키마를 반환합니다.

```bash
python3 bin/fetch_source.py "<url>"   # site-agnostic → normalized JSON
```

```plaintext
detect_site(url)   # domain → {bobaedream, clien, dcinside, fmkorea}
derive_board(url)  # derive board code / post id from the URL (never hard-code)
→ single schema: {ok, site, title, body, images[], comments[{nick,text}], recommend_count, comment_count}
```

> **설계 결정 — 게시판 식별자는 항상 URL에서 유도한다.** 디시인사이드 갤러리 id, 클리앙 게시판 이름, 보배드림 code/No는 모두 URL에 인코딩되어 있습니다. 이를 상수로 박아두면 새 게시판마다 코드를 고쳐야 합니다. 정규식으로 유도하면 같은 사이트의 어떤 게시판이든 변경 없이 지원됩니다 — 사실상 데이터 계층에 적용한 개방-폐쇄 원칙(open–closed principle)입니다.

뒤따르는 모든 사이트별 지옥은 이 추상화 뒤에 봉인됩니다. 호출부의 계약은 그저 "URL을 넣으면 정규화된 JSON이 나온다"입니다.

* * *

## 3\. Tier 1 — `urllib` 직접 요청 (클리앙, 디시인사이드, 보배드림)

이 셋의 공통점: 본문과 댓글이 서버 렌더링된 HTML이고, anti-bot은 IP 평판 수준에만 있습니다. 그래서 `urllib` 직접 요청(CookieJar 사용)으로 충분합니다. 변수는 댓글 수집 경로와 셀렉터뿐입니다.

| 사이트 | 본문 | 댓글 전략 | 비고 |
| --- | --- | --- | --- |
| 클리앙 | `post_article` | **inline** (`data-role="autolink"`) | 단일 GET으로 완료 |
| 디시인사이드 | `write_div` | **AJAX + CSRF 방식 토큰** | 뷰에서 `e_s_n_o` 추출 → cookie+Referer와 함께 `/board/comment/`로 POST → JSON |
| 보배드림 | 댓글 마커 → `article-body` 우선 | **inline, 실패 시 fallback** | 3개 미만이면 `comment_list.php`로 별도 호출 |

디시인사이드가 가장 까다롭습니다. `e_s_n_o` 토큰은 뷰 페이지마다 갱신되는 일회성 값이라 캐싱할 수 없고, "토큰 추출 → 그 토큰으로 댓글 POST"라는 두 단계 춤을 강제합니다. 보배드림은 모바일 UA로 모바일 뷰를 긁는데, "베스트" 글은 특별 처리가 필요합니다. inline 마크업에서 실제 code/No를 다시 파싱해 댓글 엔드포인트를 만들어야 합니다.

**Tier 1 결론:** 본문은 전부 서버 렌더링(JS 실행 불필요)이고 anti-bot은 사실상 없습니다. 유일한 변수는 댓글 경로입니다. 하지만 네 번째 사이트가 그 전제를 깹니다.

* * *

## 4\. Tier 2 — FM코리아: IP와 TLS fingerprint, 이중 관문 ⭐

FM코리아의 본문도 서버 렌더링입니다. 변수는 anti-bot입니다. 가설 기반 실험으로 차단 표면을 좁혀 나갔습니다.

### 4.1 실험 로그

```plaintext
hypothesis / attempt                          result
──────────────────────────────────────────────────────
H1: datacenter IP is the problem
  VPS + curl                              →  HTTP 430 (immediate)
H2: residential IP fixes it
  residential IP + curl, cold first call  →  200 (passes!)
  residential IP + curl, subsequent calls →  430 "FMKorea security system"
H3: header spoofing gets around it
  residential IP + curl + full browser headers + h2 → 430 (no change)
H4: a real browser passes
  residential IP + real headless Chrome   →  200, 112KB, full body + comments
```

H2의 cold-pass는 함정이었습니다. "residential IP면 curl로 자동화할 수 있다"는 성급한 일반화를 유혹했지만, 다시 실행해 보니 그건 운 좋은 일회성이었고 430으로 수렴했습니다. 차단 표면은 두 겹이었습니다. ① IP 평판(datacenter), ② TLS fingerprint(curl). 결정적 단서는 H3였습니다. 완벽한 헤더 스푸핑에도 여전히 실패했다는 것은, anti-bot이 L7 헤더가 아니라 그 아래의 TLS 계층을 검사한다는 뜻입니다.

### 4.2 헤더 스푸핑이 소용없는 이유 — TLS fingerprint (JA3/JA4)

`https` 연결은 실제 트래픽이 오가기 전에, **TLS handshake** 과정에서 **ClientHello**를 보냅니다. 이 ClientHello에는 클라이언트가 지원하는 cipher suite, extension, elliptic curve, signature algorithm — 그리고 그 순서가 담깁니다. 핵심은 이 목록과 순서가 구현체마다 고유하다는 것입니다. curl, Chrome, Safari가 각각 다릅니다. 이를 해싱하면 **JA3/JA4 fingerprint**가 나옵니다.

> User-Agent는 애플리케이션 계층이 스스로 보고하는 값이라 자유롭게 위조할 수 있습니다. 그러나 TLS fingerprint는 TLS 스택 구현 자체에서 나옵니다. 그래서 헤더를 Safari로 위장해도 handshake fingerprint는 여전히 curl입니다. anti-bot은 이 불일치("UA는 Safari라는데 JA3는 curl")를 거짓말하는 봇으로 판정하고 430을 반환합니다. 여기에 행동 신호(한 IP에서 높은 빈도)까지 더해지면, cold-pass 직후에 곧바로 차단이 걸립니다.

요컨대 L7 스푸핑으로는 L6 fingerprint를 속일 수 없습니다. 통과하려면 "residential IP(평판)"와 "실제 브라우저 TLS 스택(fingerprint)"을 _동시에_ 만족해야 합니다.

### 4.3 해법 아키텍처 — Tailscale로 residential 노드에 위임

```plaintext
[VPS / hermes-agent]  (datacenter IP)
   ├─ Bobaedream/Clien/DCInside → direct request (Tier 1)
   └─ fmkorea → delegated call (Tailscale tailnet)
                  │
                  ▼
        [Mac mini fetch service]  (residential IP + real Chrome)
                  │  chrome --headless=new --dump-dom <url>
                  ▼
              fmkorea.com  → passes IP + TLS fingerprint → 200
```

항상 켜져 있는 Mac mini가 실제 Chrome headless를 돌려 두 관문을 한 번에 통과합니다. VPS는 **FM코리아에 한해서만** Tailscale로 이 노드에 위임하고, 결과 JSON만 받습니다.

> **기각한 대안들:** ① VPS의 모든 트래픽을 Tailscale exit node로 라우팅 → 단일 장애점, 복잡한 정책 라우팅, 모든 트래픽에 지연. FM코리아만 선택적으로 위임하는 편이 훨씬 결합도가 낮습니다. ② `curl-impersonate`(Chrome의 JA3를 흉내 내도록 빌드한 것) → 작동은 하지만, 실제 Chrome을 쓸 수 있는 상황에서는 운영 단순성이 이깁니다. ③ 추출 API(Tavily) → 그쪽 서버가 fetch를 대신하므로 IP 회피는 무의미합니다(껍데기만 얻습니다).

### 4.4 트레이드오프 — Chrome CLI vs Playwright

먼저 흔한 오해 하나: **anti-bot을 뚫는 것은 Playwright가 아닙니다.** TLS fingerprint를 통과시키는 것은 드라이버가 아니라 "실제 Chrome"입니다. Playwright는 그 Chrome을 _어떻게_ 조종하느냐의 문제일 뿐입니다.

|  | 채택: Chrome CLI | Playwright |
| --- | --- | --- |
| 표면 | `chrome --headless=new --dump-dom URL` | DevTools-Protocol 드라이버 라이브러리 |
| 능력 | 최종 DOM 단일 덤프 | 클릭 / 스크롤 / 대기 / 네트워크 인터셉트 |
| 의존성 | 없음(Chrome만) | 런타임 + 번들 브라우저 |
| 탐지 표면 | 실제 Chrome 그대로 | 번들 Chromium이 `navigator.webdriver` 등의 위험을 안음 |

FM코리아 글은 서버 렌더링이라 제목/본문/댓글이 모두 초기 DOM에 들어 있고, 상호작용이 필요 없습니다. `--dump-dom` 한 번이면 댓글 포함 112KB가 반환됩니다. 그래서 직접 CLI를 택했습니다. 의존성 제로, 단순한 코드, 최소 탐지 표면. 만약 동적 로딩(더보기 / 무한 스크롤 / 로그인)이 언젠가 등장하면, 그때 Playwright로 격상하는 것이 합리적인 선택입니다. YAGNI.

> **구현 디테일(논블로킹 종료):** fresh-profile Chrome은 `--dump-dom` 이후 바로 종료되지 않아(백그라운드 작업 때문에) 요청마다 ~45초 타임아웃이 걸렸습니다. 해법: stdout을 스트리밍하다가 `</html>`가 나타나는 순간 프로세스를 죽이고, 호출마다 프로필 잠금을 정리하며, 전역 락으로 직렬화합니다. 응답이 3~5초로 떨어졌습니다.

**Tier 2의 전제:** "우리가 직접 실제 브라우저를 띄울 수 있다." Tier 3는 이 전제를 깹니다.

* * *

## 5\. Tier 3 — Upwork: 자동화 브라우저 자체가 탐지 대상 ⭐

별도 과제로 Upwork 채용 데이터(키워드별 단가/제안 분포 = 입찰 가격 데이터셋)를 수집해야 했습니다. Tier 2의 모든 무기가 무력화됐습니다.

> ℹ️ Upwork 수집은 이 마케팅 에이전트의 소재 파이프라인과 **무관한 별도 과제**입니다. 하지만 **근본적으로 다른 부류의 anti-bot(자동화 자체를 탐지)**을 제시했고, 그래서 **완전히 다른 크롤링 패러다임(userscript)**을 요구했기에, 위협 모델의 마지막 계층으로 여기에 기록합니다.

### 5.1 실패 매트릭스

```plaintext
attempt                                               result
──────────────────────────────────────────────────────────
curl / requests                                    →  403
public RSS                                         →  410 Gone (deprecated)
Playwright (bundled Chromium)                       →  Cloudflare infinite challenge
  + stealth plugin                                 →  infinite challenge
  + system Chrome (channel:chrome), headed         →  infinite challenge
  + real login profile + cf_clearance cookie       →  infinite challenge
```

마지막 줄이 핵심입니다. 실제 Chrome + headed + 유효한 로그인 세션 + 통과 쿠키(cf\_clearance)를 전부 갖췄는데도, Cloudflare는 계속 재-챌린지를 걸었습니다. Tier 2를 뚫었던 모든 조건을 만족했음에도 실패했다는 것 → 차단 기준이 "정체성"이 아니라 다른 무엇이라는 신호입니다.

### 5.2 유력한 원인 — Cloudflare의 자동화(주체성) 탐지

유력한 원인은 **자동화-제어 신호의 런타임 탐지**, 그 중심은 **CDP(Chrome DevTools Protocol)** 노출입니다. CDP는 Playwright/Puppeteer/Selenium이 브라우저를 외부에서 조종할 때 쓰는 프로토콜입니다. 다시 말해, 열려 있는 CDP 세션 자체가 "이 브라우저는 코드로 제어되고 있다"는 신호입니다.

엔터프라이즈 Cloudflare는 TLS, 행동, 자동화 마커를 함께 평가합니다. 그런데 H4(실제 Chrome + headed + 로그인 + cf\_clearance)는 모든 정체성/세션 신호를 만족했는데도 차단됐습니다. 이는 남은 변수를 하나로 좁힙니다. **주체성 신호 — "이것이 자동화로 제어되고 있는가?"**

> ⚠️ **증명의 한계(솔직히):** CDP를 유일한 원인으로 _격리하는_ 실험(예: CDP 없는 빌드를 대조군으로)은 돌리지 않았습니다. Cloudflare는 여러 신호를 쓰므로 `navigator.webdriver` 같은 다른 자동화 마커도 기여했을 수 있습니다. 제가 단언할 수 있는 것은 이뿐입니다. 모든 정체성/세션 신호를 만족하더라도, 자동화로 제어되는 세션은 통과하지 못한다.

위협 신호의 깊이가 한 단계 다르다는 것 — 그것이 핵심입니다.

-   **TLS fingerprint (Tier 2):** "누가(어떤 구현체가) 연결했는가" — _정체성_
    
-   **자동화 탐지 (Tier 3):** "이 세션이 코드로 제어되는가" — _주체성_
    

cf\_clearance, 실제 Chrome, 로그인은 모두 _정체성_ 신호를 만족합니다. 하지만 _주체성_ 신호는 자동화 도구를 쓰는 한 끌 수가 없습니다. → **실무적 결론: Playwright/Selenium 계열 도구로는 Upwork를 안정적으로 수집할 수 없다.** 회피 난이도의 문제가 아니라, 자동화라는 사실 _자체_ 가 탐지 표면입니다.

### 5.3 패러다임 전환 — 사람 세션 내부의 userscript

탐지되는 것이 "CDP로 제어되는 브라우저"라면, CDP가 없는 브라우저 안에서 코드를 실행하면 됩니다 — 사용자가 직접 연 세션 말입니다. 그것이 **Tampermonkey userscript**입니다. 페이지 컨텍스트에서 도는 평범한 JS로, CDP 연결도 없고 `navigator.webdriver`도 없습니다. Cloudflare 입장에서는 탐지할 자동화 마커가 없습니다.

```javascript
// ==UserScript==
// @name         Upwork Job Harvester → CSV
// @match        https://www.upwork.com/nx/search/jobs/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
const TARGET_PER_KEYWORD = 200;  // auto-stop once the per-keyword target is hit
const MIN_DELAY = 4500, MAX_DELAY = 8000;  // randomized delay between page turns — avoid behavioral signals
```

구현 포인트:

-   **상태 영속화** — 페이지 전환(SPA 라우팅) 사이에서 아무것도 잃지 않도록 `GM_setValue`에 데이터를 누적합니다. 자동 페이징 + job id(`~0...`)로 중복 제거.
    
-   **행동 신호 관리** — 실제 브라우저라도 빈도가 높으면 플래그되므로, 4.5~8초의 랜덤 지연.
    
-   **계층형 데이터 소스** — 리스트 카드 / 검색 페이지의 `window.__NUXT__` / 상세 페이지의 `__NUXT_DATA__`(Nuxt3 flat array)에서 점진적으로 필드를 보강.
    

### 5.4 의사결정 프레임워크 — 위협 신호 → 전략

세 계층을 하나의 의사결정 트리로 일반화하면:

| anti-bot이 검사하는 최상위 신호 | 차단 지점 | 전략 | 자동화 손실 |
| --- | --- | --- | --- |
| IP 평판 | datacenter IP | residential 노드 경유 | 없음 |
| \+ TLS fingerprint(정체성) | curl/requests | **우리가 실제 브라우저를 조종** | 없음 |
| \+ CDP(주체성) | 모든 자동화 브라우저 | **사람 세션에 코드 주입(userscript)** | 완전 자동화 포기 |

> **핵심 판단:** anti-bot이 _정체성_ 만 검사한다면, 우리가 브라우저를 조종해 통과합니다. 하지만 _주체성_ (자동화 여부)을 검사한다면, 우리가 브라우저를 조종한다는 사실 자체가 차단 근거가 되므로, 코드를 사람 세션 안에 실어 날라야 합니다. 후자는 완전 자동화를 내주는 대신 탐지를 뿌리째 제거합니다. 잘 설계한다는 것은 _곧_ 그 트레이드오프를 명시적으로 인식하고 선택하는 것입니다.

* * *

## 6\. 데이터 신뢰 게이트 — 수집됐다 ≠ 쓸 수 있다

성공적으로 fetch했다고 해서 바로 쓸 수 있는 건 아닙니다. 생성 앞에 품질 게이트가 놓입니다.

**댓글 N<3 → DROP(합성 fallback 없음).** 이것이 가장 중요한 규칙입니다. 봇의 정형화된 "공감 / 반박 / 검증" 댓글 세트는 지나치게 깔끔하고, 그 깔끔함 자체가 봇 시그니처가 됩니다. 실제 커뮤니티 댓글은 다릅니다. 주제와 무관한 베스트 댓글("…어제 삼성 주식 10주 샀음"), 큰 길이 편차("화이팅!!!"), 잡담 체인.

그래서 실제로 fetch한 댓글을 소스로 삼아, 그 톤 / 길이 / 주제 이탈 분포를 흉내 냅니다. 원문 그대로 복사는 금지입니다(작성자 보호). 소스가 3개 미만이면, 합성 채움말로 메우는 대신 글을 드롭합니다.

> 합성 댓글의 자연스러움은 "잘 쓰였다"가 아니라 "진짜를 닮았다"에서 나옵니다. 이상적인 토론 구조에 가까워질수록 봇 냄새가 더 짙어집니다 — 목표는 세련됨이 아니라 결함을 흉내 내는 것입니다.

또한: 하드 리젝 필터(사망/중상, 법적 분쟁, 정치, 혐오)를 두고, 이미지는 오직 원본 실사진만 씁니다(AI 생성 없음 — "🎨 AI 이미지" 라벨 자체가 봇에게는 신뢰 비용입니다).

* * *

## 7\. 회고

-   **위협 모델 우선 설계가 통했다.** "어떻게 긁을까"가 아니라 "anti-bot이 무엇을 검사하는가"로 분류하니, 새 사이트가 의사결정 트리를 통해 계층에 깔끔하게 안착합니다.
    
-   **가설 기반 디버깅의 가치.** 한번은 H2의 cold-pass에 속아 잘못된 결론(curl로 자동화 가능)을 냈습니다. 재실행 실험이 진짜 원인 — TLS fingerprint — 을 격리해 냈습니다. 일회성 성공을 신뢰하지 않는 규율이 핵심입니다.
    
-   **추상화 경계.** 사이트별 분기와 anti-bot 회피를 `fetch_source` 뒤에 봉인하니, 생성 파이프라인(2편)은 데이터의 출처를 모른 채 하나의 스키마를 소비합니다.
    
-   **알려진 한계(솔직히):** Mac mini 노드는 단일 장애점이고 슬립 상태에서는 fetch할 수 없습니다. Chrome은 직렬로 돌아(요청당 3~5초) 대량 수집에서 병목입니다 → 멀티 노드 / 브라우저 풀이 다음 과제입니다. `--dump-dom`은 초기 DOM만 캡처하므로, 댓글을 남김없이 페이지네이션하려면 Playwright로 격상해야 합니다.
    

**도달한 상태:** 네 사이트(보배드림, 클리앙, 디시인사이드, FM코리아)를 단일 인터페이스로 수집; 위임 노드로 FM코리아를 ~45초에서 3~5초로 단축; 자동화가 구조적으로 불가능한 환경에서도 userscript로 Upwork에 수집 경로를 마련. 모든 소스가 하나의 정규화된 스키마로 통일됩니다.

2편에서는 이 정규화된 소재를 봇 시그니처 없이 커뮤니티풍 콘텐츠로 바꾸는 과정(반복적인 생성 스킬 설계), 그리고 예약 발행과 성과 기여도 분석을 다룹니다.

* * *

_실제로 운영 중인 Threads 마케팅 에이전트(Hermes)의 빌드 로그입니다. 피드백 환영합니다._
