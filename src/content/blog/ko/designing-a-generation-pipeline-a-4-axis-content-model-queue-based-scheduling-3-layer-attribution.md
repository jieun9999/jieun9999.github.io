---
title: '생성 파이프라인 설계 — 4축 콘텐츠 모델, 큐 기반 스케줄링, 3계층 어트리뷰션'
description: 'Threads 마케팅 에이전트를 만든 엔지니어링 로그, 두 편으로 나눠 정리했습니다. Part 1: 데이터 수집 계층 — 안티봇 위협 모델(TLS fingerprint · CDP 탐지)을 중심으로 설계한 크롤러'
pubDate: 2026-06-29
tags: ['threads', 'systemdesign', 'fastapi', 'sqlite', 'datamodeling', 'kpi', 'automation']
category: building
cover: /covers/designing-a-generation-pipeline-a-4-axis-content-model-queue-based-scheduling-3-layer-attribution.png
coverAlt: '생성 파이프라인 설계 — 4축 콘텐츠 모델, 큐 기반 스케줄링, 3계층 어트리뷰션'
---
> Threads 마케팅 에이전트를 만든 엔지니어링 로그, 두 편으로 나눠 정리했습니다.
> 
> -   [**Part 1:** 데이터 수집 계층 — 안티봇 위협 모델(TLS fingerprint · CDP 탐지)을 중심으로 설계한 크롤러](https://beckybuilds.hashnode.dev/designing-a-crawler-that-beats-three-tiers-of-anti-bot-from-tls-fingerprints-to-cdp-detection)
>     
> -   **Part 2 (이 글):** 생성 파이프라인 — 반복적인 콘텐츠 모델 설계, 예약 발행, 성과 어트리뷰션
>     

* * *

## TL;DR

Part 1에서는 임의의 사이트에서 게시물을 확보해 하나의 정규화된 스키마(`{title, body, comments[], images[]}`)로 만들었습니다. Part 2에서는 이것을 **운영 가능한 발행-측정 파이프라인**으로 엮어내는 세 가지 설계 결정을 다룹니다.

1.  **콘텐츠 모델** — 하나의 `content_mode`(서로 다른 기준이 한 축에 뒤섞여 있던)에서 시작해 **네 개의 직교 축(hook × persona × format × topic)**으로 반복적으로 진화했습니다. "4축"은 처음부터 설계한 것이 아니라, 커플링 / 관심사 분리 문제를 하나씩 해결한 결과물입니다.
    
2.  **예약 발행** — **build-vs-buy 관점에서 SaaS(Buffer 등)를 배제**하고 SQLite 큐 + 1분 주기 cron 워커로 구현했습니다. atomic claim으로 멱등성을 확보했습니다.
    
3.  **어트리뷰션** — Threads가 주지 않는 클릭과 전환을 **3계층(engagement → click → conversion)**으로 측정했습니다. 어려운 부분은 시각화가 아니라 중복 집계 방지, empty state, 봇 필터를 데이터 계약 수준에서 강제하는 것이었습니다.
    

> 범위 노트: 지금은 **측정 인프라 우선(measurement-infrastructure-first) 단계**입니다. 시스템 설계와 문제 해결의 기록이며, 비즈니스 성과(ER/CVR/ROAS)는 표본이 쌓여야 하므로 여기서는 의도적으로 _주장하지 않습니다_(§4 참조).

* * *

## 1\. 콘텐츠 모델 — 직교 축을 향한 반복적 진화

현재의 생성 스킬은 게시물을 네 개 축의 곱으로 정의합니다.

```plaintext
post = hook_engine × persona × format × (topic_tag*)   + voice (community vernacular, enforced)
```

-   **hook\_engine** — 후크 앵글(왜 멈추게 되는가): hot\_take, money\_truth, regret\_story, versus, rank\_bait …
    
-   **persona** — 화자/타깃: first\_car, young\_budget / purist, tuner, data\_geek …
    
-   **format** — 본문 골격("그릇"): list\_drip, confession, fill\_in\_blank, one\_line\_thread …
    
-   **topic\_tag** — 주제 도메인: EV, depreciation, options, tuning …
    

이 구조는 한 번에 설계한 것이 아닙니다. **다섯 번의 전환점**을 거쳤고, 각각은 전형적인 소프트웨어 설계 문제(관심사 분리, 직교성, 범위, 누락된 추상화)였습니다.

### 전환점 0 — 잘못된 추상화의 뿌리: 정체성(identity)

초기 정체성은 "최신 트렌드 자동차 큐레이터"였습니다. 아무리 톤 규칙을 붙여도 결과물이 "깔끔한 뉴스 리포트"로 회귀하는 걸 막지 못했습니다. 원인은 톤이 아니라 더 상위의 추상화, 즉 정체성이었습니다.

> 큐레이터는 정보를 정리하고, 오퍼레이터는 반응을 설계합니다. 플랫폼 알고리즘과 커뮤니티는 _정리된 정보_가 아니라 _감정과 참여_에 반응합니다. 정체성이 "큐레이터"라면 결과물은 구조적으로 "읽고 끝"으로 수렴합니다. 톤은 정체성의 종속변수이며 — 정체성을 바꾸지 않으면 어떤 톤 규칙도 힘을 갖지 못합니다.

"최신성(recency)" 의존의 구조적 결함도 컸습니다. 소재가 빠르게 고갈되고, 차별화가 0으로 떨어지며, 결국 보도자료에 묶이게 됩니다(사실상 PR 업무). 실제 고성과 콘텐츠는 에버그린 후크(첫차 후회, 호구 옵션, "그 돈이면…")였습니다.

그래서 정체성을 **"반응을 설계하는 커뮤니티 오퍼레이터"**로 재정의했습니다. 중요한 건, 이것이 정보를 버린 게 아니라는 점입니다 — 정보는 신뢰의 기반 계층(trust base layer)으로 유지했습니다. 정보가 너무 많으면 지루하고, 도발이 너무 많으면 역풍입니다. 목표는 그 중간입니다.

이와 함께 **SOUL(정체성 / 불변 제약)과 SKILL(실행 절차) 사이의 관심사 분리**를 강제했습니다. 당시에는 이미지 정책, 출력 포맷, 댓글 구성, 본문 길이가 두 문서에 중복돼 실제 충돌을 일으켰습니다(댓글 구성: 고정 vs 동적; 길이: 6–9줄 vs 5–7문장). 규칙은 단순합니다. 숫자/포맷/절차는 SKILL에 단일 출처로 두고, SOUL은 "이유와 상한선"만 갖습니다. Single source of truth.

### 전환점 1 — 안티패턴 진단: 한 축에 뒤섞인 네 가지 기준

초기의 네 가지 `content_mode`는 서로 다른 분류 기준을 하나의 축에 섞어 놓았습니다.

| mode | 실제 분류 축 |
| --- | --- |
| `debate_thread` | 의도(논쟁 유발) |
| `buyer_dilemma` | 주제(구매) |
| `rank_bait` | 포맷(리스트) |
| `trend_brief` | 최신성(latest) |

그 결과 분류 충돌이 발생했습니다. 한 게시물이 여러 모드에 동시에 해당된 것입니다(특히 debate vs buyer). 더 나쁘게는, "화자(누가 말하는가)" 축이 통째로 빠져 있어서 같은 자동차를 화자만 바꿔 재생성할 수 없었습니다. 여러 관심사를 하나의 enum에 몰아넣은 교과서적인 안티패턴입니다.

### 전환점 2 — 직교 분해: enum → 곱(product) 구조

뒤섞인 축을 **세 개의 직교 축(hook\_engine × persona × topic\_tag)**으로 분해했습니다. 축들이 독립적이기 때문에 조합의 다양성이 곱으로 확보됩니다. `debate_thread`는 `hot_take`로 강화했고, `money_truth` / `regret_story` / `versus`를 추가했습니다. persona는 일급 입력(first-class input)으로 승격했고(구매자 유형 6종 + 매니아 유형 6종), 댓글은 고정 3-페르소나 세트에서 동적 매핑으로 바꿔, 본문의 축에 반대되는 화자가 반론을 제기하도록 했습니다.

> **숨은 커플링 — 스키마 마이그레이션.** 발행 원장(publish-ledger) 기록 스크립트의 `validate()`가 구버전 4개 모드만 허용해서, 새 엔진으로 생성하면 `SystemExit`으로 기록이 죽었습니다. 생성은 됐지만 학습 루프(반복 방지 / 성과 가중치)의 입력이 끊긴 것입니다. 어휘를 v2로 완전히 교체하고, 과거 원장을 멱등 마이그레이션으로 정규화해 데이터 일관성을 복원했습니다. 모델 변경이 데이터 계층 마이그레이션을 수반하는 교과서적 사례입니다.

### 전환점 3 — 범위 결정: 자동 발굴(Auto-Pick)의 도입과 철회

3축 위에 Auto-Pick("간단한 입력 → 봇이 축을 자동 선택")을 추가했습니다. 동작은 했지만 운영에서는 배제했습니다.

> _소재_까지 자동 발굴하면 주제 분산이 커집니다. 마케팅 채널은 검증된 게시물을 선별해야 하고, 그 판단은 봇 휴리스틱 < 사람의 직관입니다. 그래서 범위를 **"사람이 소스 URL을 고른다"**(Part 1의 원칙 2와 동일)로 고정하고 자동 발굴을 제거했습니다. 봇은 변환과 다양성만 책임집니다 — 자동화의 범위를 운영의 규모에 묶는 결정입니다.

### 전환점 4 — 누락된 추상화의 발견: format(본문 그릇)

3축을 갖췄는데도 본문이 계속 기사체로 회귀했습니다. 왜 그런지 파고들어 보니: hook\_engine은 "왜 클릭하는가(첫 줄 / 후크)"만 결정하고, 본문 골격을 정하는 축이 없었습니다. 그래서 hook\_engine이 그 책임까지 떠안으며 정보 나열에 빠진 것입니다. 해법은 본문 골격을 강제하는 **네 번째 축 `format`**이었습니다.

| format | 골격 | 숫자 상한 |
| --- | --- | --- |
| `list_drip` | TOP/랭킹 리스트, 항목당 한 줄 촌평 | 최소 |
| `owner_stereotype` | "○○ 오너 유형" 공감형 촌평 | 0 |
| `one_line_thread` | 단타 단톡방 미끼, 끊어치는 문장 | 0–1 |
| `fill_in_blank` | "\_\_\_ 사면 \_\_\_ 된다" 식 투표 유도 | 0 |
| `confession` | 1인칭 후회/자랑 스토리 | 0–1 |
| `data_brief` | 정보 요약 형식 — **명시적 요청 시에만** | 높음 |

핵심: 정보 요약 형식(`data_brief`)을 기본값에서 제외하고 명시적 요청 시에만 허용하는 것입니다. 기본값은 5개 커뮤니티 그릇 중 하나입니다. 같은 소재도 그릇을 바꾸면 새로운 게시물이 됩니다(판매 수치 → 표가 아니라 `list_drip`으로).

### voice 하드 제약(위반 시 reject)

축이 맞더라도 기사체 문장이 나오면 실패이므로, 본문 voice에는 강제 규칙이 있습니다.

1.  **숫자 상한** — `data_brief` 외에는 본문당 핵심 숫자 ≤2개(변화율 / 여러 모델 숫자 나열은 자동 reject)
    
2.  **첫 문장은 상황/감정/도발** — 절대 데이터로 시작하지 않음
    
3.  **본문에 링크 없음** — 출처는 댓글 각주에만(이유는 §2)
    
4.  **출처 커뮤니티 노출 금지** — "보배드림에서 봤는데…" 같은 표현 금지; 1인칭으로 재작성
    

Part 1의 **댓글 N<3 DROP 게이트**도 여기서 동작합니다.

> **설계 회고:** 4축은 톱다운 설계가 아니라 _관심사 분리(TP 1–2) → 범위(3) → 누락된 추상화(4)_를 순차적으로 해결하며 나온 창발적(emergent) 구조입니다. 각 전환은 "이게 없으면 계속 같은 실패 모드에 빠진다"는 관찰에서 시작됐습니다. 콘텐츠 모델은 코드와 마찬가지로 리팩터링 대상입니다.

* * *

## 2\. 예약 발행 — build vs buy, 그리고 멱등 워커

> **결정:** 발행 SaaS(Buffer 등)를 배제했습니다. Discord 봇, VPS, SQLite가 이미 갖춰져 있고 요구사항이 단순(슬롯 스케줄링 / 자동 발행 / Discord 연동)했기에, 직접 만든 **SQLite 큐 + 1분 주기 cron 워커**가 커플링과 비용 양쪽에서 이겼습니다.

### 아키텍처

```plaintext
Discord: a human drops a source URL
   → generation skill: body + 3 comments + images
   → clarify buttons: [pick topic] [time: 14:23 / 19:47 / 🚀now]
   → threads_enqueue.py: INSERT into publish_queue (status=pending, scheduled_for)
        ┄┄┄ (async boundary) ┄┄┄
   → cron(1m) threads_publish_worker.py:
        atomically claim rows where scheduled_for ≤ now → 'publishing'
        → Threads Graph API publish (carousel ≤10)
        → update published (thread_url, published_at) + Discord notification
```

설계 포인트:

-   **멱등성** — 워커는 처리하기 전에 due 상태의 행을 먼저 `publishing`으로 잠급니다(atomic UPDATE). 1분 주기 재진입에도 이중 발행이 없습니다.
    
-   **슬롯 추천 UX** — 사람이 시간을 타이핑하지 않도록, KST 10:00–24:00 내 두 슬롯 + "지금(now)"의 3지선다를 제공합니다.
    
-   **Rate limit** — Threads API는 계정당 24시간에 250건을 허용합니다. 큐 소진 속도를 그에 맞춰 상한을 둡니다.
    

> **본문 링크 금지 규칙의 진짜 이유(§1 voice #3과 커플링됨):** 성과 수집 cron은 _발행된 본문_과 _DB에 저장된 본문_을 문자 단위로 비교해 지표를 게시물에 매칭합니다. 본문에 링크가 있으면 그 매칭이 깨집니다. 그래서 본문은 순수 텍스트로 두고 인바운드 링크는 전부 댓글(각주)로 보냅니다. 제약처럼 보이지만, §3 어트리뷰션 정확도를 위한 의도적 커플링입니다.

* * *

## 3\. 어트리뷰션 대시보드 — 데이터 계약 _자체_가 설계다

> **어려운 부분은 시각화가 아니라, 측정 무결성을 데이터 계약 수준에서 강제하는 것이었습니다.**

### 3.1 왜 직접 측정하는가 — 3계층 측정 경계

Threads 인사이트는 노출, 참여, 팔로워만 제공합니다. 마케팅 채널의 핵심 질문("클릭이 나왔는가 → 전환됐는가?")은 플랫폼 밖에서만 답할 수 있습니다.

```plaintext
Layer 3 conversion ← quote / topup        [only via PG / quote events]
Layer 2 click      ← go-redirect self-redirect  [not provided by Threads]
Layer 1 engagement ← hourly 6 metrics (views/likes/replies/reposts/quotes/shares)  [Threads API]
```

경계는 명확합니다. Threads는 기본적으로 "노출 → 프로필"까지만 책임집니다. 그 이후 **"bio 클릭 → 랜딩 → 전환"은 오직 우리 자체의 `cid`(click id)로만 추적**합니다. `go.차이사.com/{slug}` 리다이렉터가 클릭을 기록하고 `cid`를 부여하며, 그 값은 302 → 랜딩 쿠키 → 전환 이벤트(`/conv`)로 멱등하게 전파됩니다.

### 3.2 데이터 우선 설계 — 네 개의 전문가 렌즈 + 실측 근거

설계는 직관이 아니라 네 개의 병렬 관점(관리자 UX / 광고-전환 / PM-IA / 플랫폼 운영) → 조율로 이끌었습니다. 그리고 모든 결정은 실제 스냅샷에 근거했습니다.

> 스냅샷: 44개 게시물 발행(계정 1개), 유효 클릭 13개, **봇 클릭 126개(≈90%)**, 전환 0개. → 함의: 데이터가 거의 비어 있습니다. MVP의 첫 가치는 분석이 아니라 "파이프가 살아 있는가 + 봇-90% 필터를 신뢰할 수 있는가 + bio 링크가 아직 적용되지 않았다"를 가시화하는 것입니다. 학습형 분석(hook×format 히트맵)은 표본이 쌓일 때까지 미룹니다.

이 근거에서 나온 네 가지 핵심 결정:

**(1) empty state를 일급(first-class) 상태로.** 전환이 0개인 상황에서 화면이 깨지거나 오해를 주면 안 됩니다. 모든 위젯은 empty-state 카피 + 표본 크기 `n` 배지(n<5 노랑, n=0 회색)를 필수로 하고, 봇 비율을 항상 표시합니다. empty state 네 가지를 명시적으로 분류합니다(수집 중 / 표본 부족 / 빈 버킷 / 미연결).

**(2) "전환 0개 ≠ 버그"의 진단적 분리.** `/conv` 수집, 토큰, 302 cid 전파, 랜딩 쿠키까지 전체 경로를 라이브로 검증해 파이프가 건강함을 확인했습니다. POST가 0건이라는 건 단지 아직 실제 결제/견적이 없다는 뜻이므로, 전환 뷰는 "수집 대기(awaiting collection)" empty state로 시작합니다. 설계 목표: 운영자가 빈 화면을 장애로 오인하지 않게 하는 것.

**(3) 스키마에서 중복 집계 차단.** 파트너 충전금(`topup`, 선불)과 고객 견적(`quote`, 실현 매출)을 합산하면 매출이 부풀려집니다. 그래서 데이터 계약에서 "총매출" 컬럼을 의도적으로 제거했습니다. 실현 매출=`SUM(quote.value)`과 충전 유입=`SUM(topup.value)`은 물리적으로 분리된 두 행으로만 노출하고, 레이아웃에서 합계 슬롯을 비워 두어 근본에서 덧셈을 차단합니다. ROAS 분자 = quote만.

**(4) 봇 필터를 기본 분모로.** 봇이 ≈90%인 상황에서 클릭/전환 지표는 기본값이 `is_bot=0`(+ ip\_hash×slug 24시간 dedup)입니다. 분모 신뢰도가 항상 보이도록 CVR 옆에 미어트리뷰션 비율(unattributed-rate) 배지를 둡니다.

### 3.3 단일 데이터 계약(VIEW)

소스 테이블 직접 접근은 금지하고, 모든 것을 VIEW + 쿼리 시점 계산(compute-at-query)으로 처리해 단일 인터페이스를 강제합니다. 데이터가 작으므로 구체화(집계 테이블)는 미룹니다(임계치 도달 시 전환). 두 DB 조인(`clicks.db ⨝ editorial.db`)은 `ATTACH`를 사용합니다.

```plaintext
v_funnel_daily (account × audience × day):
  clicks(is_bot=0) | quote_cnt, quote_value | topup_cnt, topup_value | follower_ctr
  ※ a 'total_revenue' column is intentionally absent → blocks summation at the source
age-normalization: ROW_NUMBER() OVER(PARTITION BY short_id ORDER BY ABS(age_hours-24))
                   — no raw cumulative sort (avoids unfair comparison across post ages)
```

### 3.4 스택 라이트사이징(right-sizing)

| 항목 | 선택 | 근거 |
| --- | --- | --- |
| 배치 | go-redirect에 `/admin/*` 라우터 추가(별도 컨테이너 없음) | 읽기 전용, 데이터 충돌 없음. 분리 이득 < 복잡도 |
| 렌더 | FastAPI + Jinja2 SSR | 사용자 소수 · 6개 뷰. SPA는 오버엔지니어링 |
| 차트 | Chart.js (CDN) | 빌드 제로; bar/line/scatter/heatmap 커버 |
| 집계 | SQLite VIEW + 쿼리 시점 계산 | 소규모; 구체화는 미룸 |
| 인증 | traefik basicAuth | 운영자 소수; 앱 측 인증 코드 제로 |
| DB | `mode=ro` + `query_only=ON`, ATTACH | WAL 동시 읽기 → 수집기 cron의 쓰기와 충돌 없음 |

> **하중을 받는 함정 두 가지:** ① editorial.db를 `:ro`로 bind-mount하면 WAL 읽기가 `disk I/O error`를 던집니다 → rw 마운트 + 앱 커넥션에서만 읽기 전용으로 해결. ② go-redirect의 `@app.get("/{slug}")` catch-all이 모든 경로를 삼킵니다 → `/admin/*`을 그 위에 선언해야 합니다.

**MVP 가치 제안:** 개요의 세 위젯 — _퍼널 워터폴(views→clicks→conversions) + 봇 비율 + 신선도(freshness)_ — 이 매일 "파이프 살아 있음, 봇 90%, bio 링크 적용하라"를 전달합니다. 화려함이 아니라, 매일 가장 먼저 봐야 할 단일 시그널입니다.

* * *

## 4\. 운영 현황 — 범위와 한계(솔직하게)

이것은 잘 설계된 시스템의 기록이지, 마케팅 성과가 입증된 시스템이 아닙니다. 둘을 별개로 진술하는 것이 옳습니다.

-   **현재 단계 = 측정 인프라 우선.** 콜드 스타트입니다: 44개 게시물, 팔로워 <100, 전환 0개. 정량적 비즈니스 성과(ER 상승, CVR, ROAS)는 표본 누적과 실제 전환이 필요하며, 바로 그래서 §3은 학습 분석과 전환 뷰를 의도적으로 "수집 대기"로 둡니다. 성과를 주장하지 않는 것이 이 시점에서 정직한 태도입니다.
    
-   **다만 방향성에 대한 정성적 근거는 있습니다.** 콘텐츠 모델 변경은 직관이 아니라 운영 피드백이 이끌었습니다: "봇 댓글이 너무 정갈하고 / 부자연스럽다" → 실제 댓글 모방 + N<3 DROP; "AI 생성 이미지가 역풍을 부른다" → 실제 사진만. 즉, 봇 시그니처를 줄이는 방향으로 반복했고, 그 판단의 근거(주제 이탈 / 실제 댓글의 길이 분산)를 데이터로 기록했습니다.
    
-   **입증된 것 vs 아닌 것:** 입증됨 — 파이프라인 생존성(생성 → 큐 → 발행 → 3계층 수집의 엔드투엔드), 측정 무결성(중복 집계 / 봇 필터를 스키마에서 강제), bio 링크 이후 시작되는 인바운드 실제 클릭. 미입증 — 콘텐츠가 실제로 더 높은 참여/전환을 유발하는지(인과성). 그것이 다음 단계의 과제입니다.
    

## 5\. 회고

-   **콘텐츠 모델은 리팩터링 대상이다.** enum 뒤섞임(TP1) → 직교 분해(2) → 누락된 추상화 채우기(4)는 코드 리팩터링과 동형(isomorphic)입니다. "매번 왜 같은 실패 모드인가"를 추적하면 빠진 축이 드러납니다.
    
-   **모델 변경은 데이터 마이그레이션을 수반한다.** 원장 검증 로직은 학습 루프의 숨은 커플링 지점이었습니다(TP2). 스키마/어휘를 바꿀 때는 과거 데이터 정규화를 함께 설계하세요.
    
-   **build-vs-buy는 커플링으로 판단하라.** 발행 SaaS 대신 큐+cron을 택한 결정적 이유는 비용이 아니라 커플링이었습니다(기존 Discord/DB/cron 재사용, 멱등 워커로 단순).
    
-   **측정 무결성은 UI가 아니라 스키마에 있다.** 중복 집계는 "총매출 컬럼 제거"로, 봇 오염은 "기본 분모 is\_bot=0"으로 차단합니다 — 즉 데이터 계약에서 강제하면 화면 수준의 실수를 근본에서 막습니다.
    
-   **다음:** 표본이 충분해지면 hook×format 학습 히트맵으로 자기개선 루프를 닫고, 실제 전환이 나타나면 어트리뷰션 품질(cid 캡처율 / 미어트리뷰션 비율)을 정교화하겠습니다.
    

두 편을 관통하는 한 줄: **봇 콘텐츠에서 "자동 생성의 냄새"는 신뢰 비용이다.** Part 1은 안티봇 위협 모델이었고, Part 2는 콘텐츠 진정성과 측정 무결성이었습니다. 결국 둘은 같은 질문입니다 — "사람이 검증된 소재를 고르고, 봇이 변환하고, 시스템이 발행과 측정을 자동화한다"에서 **경계를 어디에 그을 것인가?**

> [👈 **Part 1:** "3계층 안티봇을 뚫는 크롤러 설계 — TLS Fingerprint에서 CDP 탐지까지"](https://beckybuilds.hashnode.dev/designing-a-crawler-that-beats-three-tiers-of-anti-bot-from-tls-fingerprints-to-cdp-detection)

* * *

_실제 운영 중인 Threads 마케팅 에이전트(Hermes)의 빌드 로그입니다. 피드백 환영합니다._
