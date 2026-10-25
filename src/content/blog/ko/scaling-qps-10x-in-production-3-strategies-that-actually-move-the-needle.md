---
title: '요청 처리량을 높이는 세 가지 접근 — 캐싱, DB 최적화, 비동기·배칭'
description: '캐싱, DB 최적화, 비동기·배칭이 줄이는 작업을 살펴봅니다. 부하 테스트 기록과 설명용 계산을 구분하고, 처리량 개선을 판단할 측정 조건을 정리합니다.'
subtitle: "서비스의 요청 처리량을 높이는 접근을 캐싱, 데이터베이스 최적화, 부수 작업 분리로 나누어 설명합니다. 각 전략이 줄일 수 있는 병목은 무엇이며, 적용 전에 어떤 조건을 확인해야 하는지 살펴봅니다."
pubDate: 2026-05-29
updatedDate: 2026-10-18
tags: ['system-design', 'caching', 'performance', 'optimization']
category: scaling
cover: /covers/scaling-qps-10x-in-production-3-strategies-that-actually-move-the-needle.webp
coverAlt: '요청 처리량을 높이는 세 가지 접근 — 캐싱, DB 최적화, 비동기·배칭'
draft: true
---
## 들어가며

요청 처리량을 높이려면 먼저 어떤 작업이 요청을 붙잡고 있는지 확인해야 합니다. 같은 데이터를 반복해서 조회하는지, DB 쿼리와 커넥션 대기가 긴지, 응답 전에 끝낼 필요가 없는 외부 호출이 섞여 있는지에 따라 선택이 달라집니다.

이 글에서는 캐싱, 데이터베이스 최적화, 비동기·배칭이 각각 줄이는 작업과 그 대가를 설명합니다. 아래의 코드와 시간 계산은 원리를 보여주는 예시입니다. 실제 부하 테스트 기록은 별도로 구분합니다.

> [!NOTE]
> 초판에서는 이 세 가지 적용으로 프로덕션 QPS가 10배 이상 늘었다고 서술했습니다. 2026년 10월 18일 관련 GitHub 이슈와 부하 테스트 저장소를 다시 확인했지만, 같은 API·인프라·부하 조건에서 그 개선 배수를 입증하는 전후 기록은 확인하지 못했습니다. 제목과 결론을 수정하고, 근거를 확인하지 못한 적용 사례와 수치는 설명용 예시로 구분했습니다.

### 확인한 부하 테스트 기록의 범위

| 기록 | 측정 조건 | 확인된 결과 | 해석 범위 |
| --- | --- | --- | --- |
| 2026-05-06 메시지 API smoke | 목표 100 TPS, 2분, sender-channel pair 2,720개 순환, expected trace off | 성공 전송 99.67건/초, HTTP p95 59.42ms, 5xx 1건 | 5xx 0건 기준을 충족하지 못한 실행입니다. 최적화 전후 비교가 아닙니다. |
| 같은 날 1,000 TPS smoke | 같은 메시지 전송 시나리오에서 목표 부하와 VU 설정 증가 | HTTP 177.65 RPS, 성공 전송 99.86건/초, HTTP 실패율 43.79% | 목표 부하를 10배로 올린 실행입니다. 처리량 10배 달성을 뜻하지 않습니다. |
| 2026-03-05 WebSocket pub/sub 테스트 | 서버 2대, 각각 16 vCPU·58GB, 총 10만 연결, 단계별 90초 | Step 3 합산 23,504 TPS, 두 클라이언트 중 높은 p99 905.41ms | DB 저장·HTTP 메시지 API·푸시를 제외한 인프라 테스트입니다. 메시지 API QPS와 직접 비교할 수 없습니다. |

앞의 두 기록은 `witim-load-test`의 `results/2026-05-06-100tps-off-smoke-results.md`와 `results/2026-05-06-1k-tps-smoke-results.md`, 세 번째는 `25k-tps-message-load-test`의 `pub&sub/STRESS-TEST-REPORT-2026-03-05.md`를 기준으로 확인했습니다. WebSocket Step 3에는 소량의 오류와 패킷 로스도 기록돼 있어 무손실 처리량으로 표현하지 않습니다.

이 표는 개선 전후 비교표가 아닙니다. **목표 요청률, 실제 요청률, 성공 처리량, 전달 완료율은 서로 다른 지표**이며, 개선 배수를 계산하려면 같은 경로와 성공 기준의 전후 결과가 필요합니다.

<a id="먼저-qps란-_무엇_이며-왜-한계에-부딪히는가"></a>

## 먼저, QPS란 _무엇_이며 왜 한계에 부딪히는지

이 글에서는 QPS를 API가 초당 처리하는 요청 수라는 의미로 사용합니다. DB 쿼리 수나 WebSocket 메시지 수와는 측정 단위를 구분해야 합니다. 다음 식은 워커 하나가 한 번에 요청 하나를 처리하고 충분한 요청이 들어오는 상황을 단순화한 모델입니다.

```plaintext
QPS ≈ number of concurrent workers / time to process one request
```

**계산대 비유**로 보면 바로 이해가 됩니다. 워커(스레드나 커넥션)를 _계산원_이라고 생각하고, 요청 처리 시간을 _한 명의 손님을 계산하는 데 걸리는 시간_이라고 생각하면 됩니다.

-   계산원 1명, 손님 한 명당 0.5초 → 초당 손님 2명 = **2 QPS**
    
-   속도를 손님 한 명당 0.1초로 높이면 → 계산원 1명이 이제 **10 QPS**를 처리 (분모를 줄인 것)
    
-   계산원 2명을 더 추가하면 → 각 0.1초로 **30 QPS** (분자를 키운 것)
    

```plaintext
QPS = cashiers / time-per-customer   →   3 / 0.1s = 30 QPS
```

문제는 손님이 그보다 빠르게 몰려들 때 시작됩니다. 30-QPS짜리 가게에 **초당 40명의 손님**이 들어오면, 줄은 매초 10명씩 늘어나고 → 대기 시간이 급격히 길어지고 → 손님이 나가버리며(타임아웃) → 가게가 멈춥니다(장애). 서버도 정확히 똑같이 동작합니다.

이 글에서는 동시 처리 자원을 늘리는 방법 외에, 다음 두 방향을 살펴봅니다.

1.  **분모를 줄이기** (요청당 시간) → 캐싱, DB 최적화
    
2.  **분모에서 작업을 _빼내기_** — 요청 안에서 반드시 일어날 필요가 없는 모든 것 → 비동기 / 배칭
    

아래 세 가지 전략은 이 두 방향을 구체화합니다. 적용 순서는 고정하지 않고, 지연 시간·오류·자원 사용량을 측정해 확인한 병목에 따라 정합니다.

* * *

<a id="1-캐싱--같은-것을-두-번-계산하지-마라"></a>

## 1\. 캐싱 — "같은 것을 두 번 계산하지 않습니다"

### 핵심 아이디어

캐싱은 근본적으로 **비싼 연산의 결과를 값싼 곳에 저장해 두고 잠시 동안 재사용하는 것**입니다. 여기서 중요한 두 단어는 _비싼_과 _잠시 동안_입니다.

캐시의 효과는 적중률과 캐시 조회 비용, 원래 작업의 비용에 따라 달라집니다. 예를 들어 DB 조회 50ms를 캐시 조회 1ms로 대체한다면 **그 조회 구간**은 짧아집니다. 두 값은 설명을 위한 가정이며, 전체 API 처리 시간이 50분의 1로 줄거나 QPS가 50배 오른다는 뜻은 아닙니다. 인증·직렬화·네트워크와 다른 DB 작업은 그대로 남을 수 있습니다.

### 다층 캐싱(Multi-layer caching)

프로덕션에서는 캐시를 하나만 쓰는 경우가 드뭅니다. **여러 층을 쌓아 올리며**, 요청을 사용자에게 가까운 곳에서 멈출 수 있을수록 더 좋습니다. 요청이 이들을 거쳐 가는 순서대로 보면 다음과 같습니다.

```plaintext
User request
   │
   ▼
① CDN cache (CloudFront/CloudFlare)   ← if it hits here, it never reaches your server (best)
   │ miss
   ▼
② App memory cache (in-process LRU)   ← per-server cache
   │ miss
   ▼
③ Redis (distributed cache)           ← shared across servers
   │ miss
   ▼
④ Database (the source of truth)      ← queried on a cache miss
```

-   **① CDN** — 정적 자산(이미지, JS, CSS)이나 변하지 않는 공개 API 응답. 사용자 근처의 엣지에서 끝나므로, 여러분의 서버는 그 트래픽을 아예 보지도 못합니다.
    
-   **② 앱 메모리** — 가장 빠르지만 서버마다 독립적입니다. 서버가 10대면 사본이 10개이고 무효화(invalidation)가 골치 아픕니다. _아주 작고, 거의 변하지 않는_ 데이터(환율 테이블, 공용 코드)에 가장 적합합니다.
    
-   **③ Redis** — 모든 서버가 공유하므로 무효화가 한 번에 끝납니다. 프로덕션 캐싱의 주력입니다.
    

> 명명에 대한 주의: 어떤 자료들은 이것들을 **L1(앱 메모리) / L2(Redis) / L3(DB 또는 CDN)**이라고 부릅니다. 거기서는 숫자가 _데이터/CPU와의 가까움_을 기준으로 매겨지는데(L1이 앱에 가장 가까움), 이는 위의 요청 흐름 기반 번호(①CDN이 먼저)와는 **정반대 방향**입니다. 헷갈리기 쉬워서, 여기서는 순전히 요청 순서로만 번호를 매겼습니다.

### 정말로 어려운 부분: _무엇을_ 캐싱하고 _얼마나 오래_ 둘 것인가

캐시 코드를 짜는 것은 쉽습니다. 어려운 것은 **TTL과 무효화 전략**입니다. 컴퓨터 과학에서 가장 어려운 두 가지 문제는 캐시 무효화와 이름 짓기라는 오래된 농담에는 다 이유가 있습니다.

전략은 데이터의 성격에 따라 달라집니다.

| 데이터 | 변경 빈도 | 전략 | 이유 |
| --- | --- | --- | --- |
| 게시판 글 목록 | 가끔 (새 글) | TTL 5분 | 5분 지난 목록이어도 괜찮음 |
| 상품 상세 | 가끔 | **쓰기 시 무효화** | 가격 변경은 즉시 보여야 함 |
| 내 프로필 | 나만 수정함 | TTL 30초 또는 쓰기 시 무효화 | 내가 한 수정이 안 보이면 버그처럼 느껴짐 |
| 실시간 재고 | 매우 빈번함 | 캐싱 안 함 / 1초 TTL | 값이 틀리면 → 초과 판매 사고 |

**쓰기 시 무효화(Invalidate-on-write) 패턴:**

```ts
// Read: cache first, fall back to DB, then populate the cache (cache-aside)
async function getProduct(id: string) {
  const cached = await redis.get(`product:${id}`);
  if (cached) return JSON.parse(cached);          // cache hit → 1ms

  const product = await db.product.findUnique({ where: { id } }); // miss → 50ms
  await redis.set(`product:${id}`, JSON.stringify(product), "EX", 300); // 5-min TTL
  return product;
}

// Write: update the DB, then DELETE the cache (next read repopulates it)
async function updateProduct(id: string, data) {
  const product = await db.product.update({ where: { id }, data });
  await redis.del(`product:${id}`);   // ← invalidation. This one line is the point
  return product;
}
```

> ⚠️ 흔한 실수: 쓰기 후에 캐시를 **삭제하는 것**(`del`)이 보통 **갱신하는 것**(`set`)보다 안전합니다. 두 개의 쓰기가 동시에 갱신하면 오래된 값이 경쟁에서 이길 수 있습니다. 다만 읽기와 쓰기가 엇갈리면 삭제 이후에도 오래된 조회 결과가 캐시에 저장될 수 있습니다. 무효화만으로 최신성을 보장하지는 않으며, 데이터의 정합성 요구에 맞는 별도 처리가 필요합니다.

<a id="-제가-적용한-것--3w-cms의-조회수-배칭"></a>

### 설명용 예시 — 조회수 배칭

조회수가 즉시 반영되지 않아도 되는 게시판을 가정해 보겠습니다. 조회가 발생할 때마다 DB `UPDATE`를 실행하던 것을, 카운터를 모아 주기적으로 반영하는 방식으로 바꿀 수 있습니다. 이 절의 코드와 숫자는 실제 개선 배수를 측정한 기록이 아닙니다.

**이전 — 조회 1회 = 쓰기 쿼리 1회:**

```sql
-- runs every time someone opens a post
UPDATE posts SET view_count = view_count + 1 WHERE id = ?;
```

문제는 이렇습니다. 인기 있는 게시글이 초당 500명의 독자를 받으면 **초당 500개의 쓰기 쿼리**가 _같은 행_을 두들기게 됩니다. 한 행에 대한 동시 UPDATE는 **row-lock 경합**을 일으키므로, 조회수를 하나 올리는 일이 결국 DB 전체를 느리게 만듭니다. 쓰기는 캐싱할 수도 없고 replica로 떠넘길 수도 없으니, 가장 고통스러운 종류의 부하입니다.

**이후 — Redis 카운터 + 5분마다 배치 플러시:**

```ts
// Conceptual example: buffer view increments in Redis
await redis.incr(`view:post:${postId}`);

// A job every 5 minutes: collect and apply to the DB in one shot
async function flushViewCounts() {
  const keys = await redis.keys("view:post:*");
  for (const key of keys) {
    const postId = key.split(":")[2];
    const count = await redis.getdel(key);  // read value and delete atomically
    await db.post.update({
      where: { id: postId },
      data: { viewCount: { increment: Number(count) } },
    });
  }
}
```

**계산 예시:** 같은 게시글에 5분 동안 조회 1,500회가 발생하고 이를 한 번에 정상 반영한다면, 해당 게시글의 DB UPDATE 횟수는 1,500회에서 1회로 줄어듭니다. 이는 DB 쓰기 횟수의 감소이며 서비스 QPS 개선 배수가 아닙니다.

위 구현을 운영에 사용하려면 실패 처리도 필요합니다. `GETDEL` 뒤 DB 갱신이 실패하면 회수한 값이 유실될 수 있고, 재시도 시 중복 반영도 막아야 합니다. 5분의 반영 지연과 장애 시 허용할 손실 범위를 먼저 정해야 합니다.

> 이것은 캐싱(Redis에 임시 저장)과 배칭(모아 두었다가 한 번에 플러시)을 결합한 것으로, 곧바로 전략 #3으로 이어집니다.

* * *

<a id="2-데이터베이스-최적화--병목의-80가-사는-곳"></a>

## 2\. 데이터베이스 최적화 — 쿼리와 커넥션 대기 확인하기

DB가 병목인지는 쿼리 실행 시간, 락 대기, 커넥션 풀 대기를 나눠 확인해야 합니다. 문제가 확인된 지점에 따라 인덱스, 풀 설정, 읽기 분산을 검토합니다.

> **대전제: 가장 빠른 쿼리는 아예 실행하지 않은 쿼리입니다.** 읽기 최적화의 최우선 순위는 영리한 쿼리를 작성하는 것이 아니라, **애초에 DB에 도달하는 빈도를 줄이는 것**입니다. 그래서 실무에서는 DB를 직접 두들기기 전에 다음 순서로 읽기를 걸러냅니다.
> 
> 1.  **캐시가 답할 수 있는지 확인합니다.** — #1의 다층 캐시가 상당 부분의 읽기를 DB 전에 멈춥니다. 뜨거운(hot) 데이터는 DB에 거의 도달하지 않습니다.
>     
> 2.  **여러 쿼리를 하나로 합칠 수 있는지 확인합니다.** — N+1을 IN-쿼리 / JOIN / DataLoader로 접습니다(#3의 배칭 참고). 왕복 11번 → 2번.
>     
> 3.  **필요한 것만 가져오고 있는지 확인합니다.** — `SELECT *` 대신 특정 컬럼만, 행 수를 제한하는 페이지네이션, 불필요한 JOIN 제거.
>     
> 
> 그러니 아래의 인덱스/풀/replica는 그 모든 필터링을 거친 후에도 **여전히 DB에 도달해야 하는 쿼리들**을 빠르고 안정적으로 처리하기 위해 존재합니다. "쿼리를 더 적게 실행하라"가 항상 "쿼리를 더 빠르게 실행하라"보다 먼저입니다.

### 2-1. 인덱스 최적화 — "책 뒤의 색인"

인덱스가 없으면 DB는 원하는 행을 찾기 위해 **테이블을 처음부터 끝까지 읽어야 합니다(Full Table Scan).** 행이 백만 개면 백만 개를 전부 스캔한다는 뜻입니다. 인덱스는 책 뒤의 색인 페이지와 같습니다. "이 값은 N페이지에 있다"라고 알려주는, 미리 정렬된 구조(B-Tree)입니다.

> **테이블과 인덱스는 같은 것이 아닙니다.** 테이블은 _원본 데이터_(책의 본문)이고, 인덱스는 그것을 빠르게 찾기 위한 _보조 조회 수단_(책 뒤의 색인 페이지)입니다.
> 
> -   인덱스는 새로운 데이터가 아닙니다. 선택된 컬럼들을 정렬해 놓은 **파생 사본**입니다. 지워도 데이터는 사라지지 않고, 검색만 다시 느려질 뿐입니다 → 그래서 프로덕션에서도 자유롭게 추가/삭제합니다.
>     
> -   새 데이터를 삽입하면 DB가 **테이블 _과_ 그 인덱스들을 함께 자동으로 갱신합니다.** ↔ 이것이 바로 "인덱스가 너무 많으면 쓰기가 느려진다"는 이유입니다.
>     
> -   하나의 테이블은 서로 다른 검색 패턴을 위해 **여러 개**의 인덱스를 가질 수 있고, DB는 쿼리마다 가장 유용한 것을 고릅니다. (이것이 _같은 SQL_이 어떤 인덱스가 존재하느냐에 따라서만 빠르거나 느려질 수 있는 이유입니다.)
>     

**설명용 예시 — 10만 행짜리 테이블에서 한 사용자의 주문 가져오기:**

아래 시간은 인덱스에 따른 차이를 설명하기 위한 가정입니다. 실제 성능은 데이터 분포와 실행 계획을 측정해야 알 수 있습니다.

```sql
SELECT * FROM orders WHERE user_id = 'u_123' ORDER BY created_at DESC LIMIT 20;
```

-   **인덱스 없음**: 10만 개를 모두 읽고 → user\_id로 필터링 → 정렬. ~**120ms**.
    
-   `user_id` **에만 인덱스**: 그 사용자의 주문(가령 500개)은 빠르게 찾지만, 정렬은 여전히 메모리에서 합니다. ~**15ms**.
    
-   **복합 인덱스** `(user_id, created_at DESC)`: 찾기 _와_ 정렬이 인덱스 안에서 한 번에 끝납니다. ~**0.5ms**. 👈
    

**복합 인덱스에서 컬럼 순서가 중요합니다.** `(user_id, created_at)`는 "user\_id로 좁힌 다음 created\_at으로 정렬"에는 이상적이지만, `created_at`만으로 검색하는 쿼리는 처리할 수 없습니다. 경험칙: **동등(**`=`**) 조건 컬럼을 앞에, 범위/정렬 컬럼을 뒤에.**

> ⚠️ 트레이드오프: 인덱스는 공짜가 아닙니다. 모든 INSERT/UPDATE가 인덱스도 함께 갱신해야 하므로, **쓰기가 느려지고 저장 공간을 더 씁니다.** "혹시 몰라서" 모든 컬럼에 인덱스를 마구 붙이면 역효과가 납니다. 실제 쿼리 패턴을 보고 필요한 것만 추가해야 합니다.

<a id="2-2-커넥션-풀링--매번-새-커넥션을-열지-마라"></a>

### 2-2. 커넥션 풀링 — "매번 새 커넥션을 열지 않습니다"

새 DB 커넥션에는 TCP 연결과 인증 비용이 듭니다. 이 비용이 실제 요청 시간에서 차지하는 비중을 확인하고, 연결을 재사용해 반복 비용을 줄일 수 있습니다.

**커넥션 풀**은 N개의 커넥션을 미리 만들어 두고, 빌려주고 다시 회수해서 재사용합니다.

```plaintext
[req A] ─┐                  ┌─ [conn 1] ─┐
[req B] ─┤  Pool (reuse)    ├─ [conn 2] ─┤── DB
[req C] ─┘                  └─ [conn 3] ─┘
         (wait queue)
```

**풀 크기 정하기 — 너무 작아도, 너무 커도 아픕니다:**

-   **너무 작음**: 요청들이 커넥션을 빌리려고 줄을 섭니다 → latency.
    
-   **너무 큼**: DB에 동시 커넥션이 과도하게 몰립니다 → 각 커넥션이 DB 메모리를 잡아먹으므로 DB의 메모리/CPU 사용량이 급격히 올라갑니다.
    
-   **측정 기준**: DB의 연결 한도와 앱 프로세스 수를 함께 보고, 풀 대기 시간·DB 부하를 측정하며 조정합니다.
    

앱 서버를 늘릴수록 각 서버가 자기 풀을 갖게 되므로 전체 DB 커넥션이 곱절로 늘어납니다. 그래서 **PgBouncer** 같은 풀러(pooler)를 앞단에 별도 계층으로 두는 경우가 많습니다.

### 2-3. 읽기 replica (읽기/쓰기 분리)

읽기 비중이 높고 복제 지연을 허용할 수 있는 워크로드라면, 읽기를 여러 replica에 분산하는 방법을 검토할 수 있습니다. 먼저 해당 서비스의 실제 읽기·쓰기 비중을 측정해야 합니다.

```plaintext
                ┌─ writes (INSERT/UPDATE/DELETE) ─→ [Master DB]
[application] ──┤                                       │ replication
                └─ reads (SELECT) ─→ [Replica 1] [Replica 2] [Replica 3]
```

**기대 효과:** 읽기를 여러 replica로 분산할 수 있습니다. 다만 부하의 균등 분배, 복제 비용, 쿼리 특성에 따라 효과가 달라지므로 replica 수를 그대로 처리량 개선 배수로 볼 수는 없습니다.

> ⚠️ **복제 지연(Replication lag)**: 마스터에 쓴 데이터가 replica로 복사되기까지 수 밀리초에서 수백 밀리초가 걸립니다. 그래서 **read-after-write** 상황(예: 댓글을 달자마자 곧바로 댓글 목록을 조회)에서는 replica에서 읽어서 "어라, 내 댓글이 어디 갔지?"를 보게 됩니다. 그런 읽기는 반드시 **마스터로 강제**해야 합니다.

```ts
// Normal reads go to a replica
const posts = await readClient.post.findMany(...);

// Reads that must reflect a just-made write go to the master
await writeClient.comment.create({ data });
const comments = await writeClient.comment.findMany(...); // read from master
```

### 세 가지가 어떻게 연결되는가

**인덱스는 쿼리 실행 비용을 줄이고, 풀은 연결을 재사용하며, replica는 읽기를 분산합니다.** 한 구간이 빨라져도 다른 구간이 병목으로 남을 수 있습니다. 개별 쿼리의 개선 배수를 곱해서 전체 API 처리량을 예측하지 않고, 변경 후 같은 부하로 다시 측정해야 합니다.

* * *

## 3\. 비동기 + 배칭 — "요청에서 필수가 아닌 것을 전부 빼내라"

#1과 #2가 각 작업을 더 빠르게 만드는 것이었다면, #3은 발상의 전환입니다. **작업 자체를 사용자의 크리티컬 패스에서 완전히 들어내는 것.**

### 3-1. 메시지 큐를 통한 비동기 처리

다음은 DB 저장 10ms, 이메일 호출 500ms, 큐 등록 2ms를 가정한 설명용 예시입니다. 회원가입을 예로 들 수 있습니다. 사용자 관점에서 "가입 완료"란 **사용자가 DB에 존재한다**는 것, 그게 전부입니다. 그런데 환영 이메일 전송(외부 SMTP 호출, 500ms)을 그 요청 안에서 _동기적으로_ 하면, 사용자는 그저 이메일이 발송되기를 앉아서 기다리는 꼴이 됩니다.

**이전 — 동기 (가입 API가 510ms 소요):**

```ts
async function signup(data) {
  const user = await db.user.create({ data });   //  10ms
  await sendWelcomeEmail(user.email);            // 500ms ← the user waits on this
  return user;                                    // 510ms total
}
```

**이후 — 큐에 넣고 즉시 응답 (가입 API가 12ms 소요):**

```ts
async function signup(data) {
  const user = await db.user.create({ data });   // 10ms
  await queue.enqueue("send-welcome-email", {     //  2ms (just enqueue)
    email: user.email,
  });
  return user;                                    // 12ms total ← user response
}
// A separate worker consumes the queue and actually sends the email (in the background)
```

**계산 예시:** 이 가정에서는 응답 전 작업 시간이 510ms에서 12ms로 줄어듭니다. 실제 QPS가 같은 비율로 늘어난다는 뜻은 아닙니다. 이메일 작업은 여전히 남아 있으므로 워커 처리량, 큐 대기 시간, 최종 발송 성공률을 함께 봐야 합니다.

**큐로 밀어 넣기 좋은 후보들:**

-   이메일/SMS, 푸시 알림
    
-   이미지 리사이징 / 썸네일 생성
    
-   통계 / 분석 집계
    
-   서드파티 API 호출 (느리고 실패하기 쉬움)
    

도구: Kafka, RabbitMQ, Redis Streams, AWS SQS 등. 큐를 도입할 때는 재시도·백오프·중복 처리 방지와 실패 관측을 함께 설계해야 합니다. 큐 등록 자체가 실패하는 경우도 별도로 처리해야 합니다.

### 3-2. 배칭 — "많이 모아서 한 번에 처리하라"

모든 네트워크/DB 왕복에는 고정 비용이 있습니다. 100개 항목을 하나씩(100번 왕복) 보내는 것은 하나의 왕복으로 묶는 것보다 훨씬 비쌉니다.

**전형적인 예시 — 분석 이벤트 전송:**

```ts
// Before: send on every event → 1000 round-trips
track(event) { await http.post("/analytics", event); }

// After: buffer, then send once per 100 events or every 1s → 10 round-trips
const buffer = [];
track(event) {
  buffer.push(event);
  if (buffer.length >= 100) flush();
}
function flush() {
  http.post("/analytics/bulk", buffer.splice(0));  // everything collected, in one shot
}
setInterval(flush, 1000); // flush every 1s even if 100 isn't reached
```

**N+1 쿼리를 고치는 것도 배칭입니다 (DataLoader 패턴):**

```ts
// Before (N+1): 10 posts → 10 separate author lookups
for (const post of posts) {
  post.author = await db.user.findUnique({ where: { id: post.authorId } });
}
// 1 (posts) + 10 (authors) = 11 queries

// After (batched): collect author ids into one IN-query
const authorIds = posts.map(p => p.authorId);
const authors = await db.user.findMany({ where: { id: { in: authorIds } } });
// 1 + 1 = 2 queries  (DataLoader does this collecting automatically)
```

<a id="-제가-적용한-것--3w-cms의-50ms-윈도우-알림-집계"></a>

### 설명용 예시 — 50ms 윈도우 알림 집계

짧은 시간에 같은 사용자에게 알림 10개가 발생하는 상황을 가정합니다. 이벤트마다 푸시를 하나씩 보내면 다음 문제가 생길 수 있습니다.

-   사용자 휴대폰이 **10번** 울림 → 좋지 않은 UX
    
-   푸시 공급자(FCM/APNs)로 **10번의 외부 호출** → 부하 + 비용
    

**해결 — 50ms 윈도우 안에서 묶기:** 알림이 도착하면 즉시 쏘지 않습니다. 50ms를 기다렸다가, 같은 사용자를 위한 알림이 더 도착하면 그것들을 병합해 "새 메시지 10개"라는 **하나의** 푸시로 보냅니다.

```ts
// Open a 50ms window per user and collect notifications that arrive within it
function onNotification(userId, payload) {
  if (!windows.has(userId)) {
    windows.set(userId, { items: [] });
    setTimeout(() => flushWindow(userId), 50);  // send once, 50ms later
  }
  windows.get(userId).items.push(payload);
}

function flushWindow(userId) {
  const { items } = windows.get(userId);
  windows.delete(userId);
  // one item → send as-is; many → merge into "N new notifications" and send once
  sendPush(userId, summarize(items));
}
```

**계산 조건:** 같은 사용자의 알림 10개가 하나의 50ms 윈도우에 들어왔을 때만 호출을 10회에서 1회로 묶을 수 있습니다. 1초 동안 발생한 알림이 모두 같은 묶음에 들어가는 것은 아닙니다. 실제 감소율은 이벤트 도착 간격에 달려 있습니다. 이 사례의 적용 전후 측정 기록은 확인하지 못했으므로 운영 성과로 제시하지 않습니다.

### 3-3. 디바운싱 / 스로틀링 — 클라이언트 쪽 배칭

검색 자동완성처럼 빠르게 반복되는 요청은 **묶거나 솎아내야** 합니다.

-   **디바운스(Debounce)**: "더 이상 입력이 없는 상태가 300ms 지속된 후에만 요청을 한 번 보냅니다." 반초 안에 `S`, `Se`, `Seoul`을 입력하면 → 요청 3개가 아니라 `Seoul` 하나만 **1번**.
    
-   **스로틀(Throttle)**: "아무리 자주 발생해도 초당 최대 한 번." 초당 수백 번씩 발생하는 스크롤 이벤트 같은 것을 솎아냅니다.
    

클라이언트에서 막는 것은 모든 최적화 중 가장 값쌉니다. 왜냐하면 **요청이 서버에 아예 도달하지 않기 때문**입니다.

* * *

## 마무리하며

<a id="마무리--왜-이-순서이고-왜-효과가-곱해지는가"></a>

세 접근은 줄이는 작업과 부담하는 비용이 다릅니다. 어느 것을 먼저 적용할지는 측정에서 확인한 병목과 제품의 정합성·지연 허용 범위에 따라 정해야 합니다.

| 접근 | 줄이려는 작업 | 함께 확인할 지표 |
| --- | --- | --- |
| 캐싱 | 같은 데이터를 반복 조회·계산하는 작업 | 적중률, 데이터 최신성, API 지연 |
| DB 최적화 | 쿼리 실행·커넥션 대기 비용 | 실행 계획, 락·풀 대기, DB 자원 사용 |
| 비동기·배칭 | 응답 전에 기다리는 작업과 호출 횟수 | 큐 대기, 완료율, 중복·유실, 반영 지연 |

**지연 시간 감소, DB 호출 수 감소, 성공 요청 처리량 증가는 같은 성과가 아닙니다.** 각각의 개선 배수를 곱해 전체 QPS가 수십 배 늘었다고 결론 내릴 수 없습니다.

이번에 확인한 기록만으로는 이 세 가지 접근이 프로덕션 QPS를 10배 높였다고 말할 수 없습니다. 개선 배수를 제시하려면 같은 API·데이터셋·인프라·캐시 상태와 부하 패턴에서 변경 전후를 실행하고, 같은 지연·오류율 기준을 만족하는 성공 처리량을 비교해야 합니다. 비동기 작업이 있다면 응답 속도뿐 아니라 작업이 실제로 완료되는지도 함께 검증해야 합니다.
