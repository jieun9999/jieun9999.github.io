---
title: '프로덕션에서 QPS를 10배로: 실제로 효과가 있는 3가지 전략'
description: '"더 빠르게 만들어라"는 막연해 보이지만 아닙니다. 결국 같은 세 가지 수로 수렴합니다 — 캐싱, 데이터베이스 최적화, 그리고 요청에서 부수적인 일을 들어내기.'
pubDate: 2026-05-29
tags: ['system-design', 'caching', 'performance', 'optimization']
category: fundamentals
cover: /covers/scaling-qps-10x-in-production-3-strategies-that-actually-move-the-needle.webp
coverAlt: '프로덕션에서 QPS를 10배로: 실제로 효과가 있는 3가지 전략'
---
> "더 빠르게 만들어라"는 말은 막연한 지시처럼 들립니다. 하지만 그렇지 않습니다. 성능 작업은 알고 보면 백엔드 엔지니어링에서 가장 _배우기 쉬운_ 영역 중 하나인데, 거의 항상 똑같은 세 가지 수(手)로 귀결되기 때문입니다. 아래는 제가 프로덕션에 실제로 적용했던 세 가지이며, 이 작업으로 QPS를 10배 이상 끌어올렸습니다.

지금 제가 실제로 생각하는 방식 그대로 하나씩 짚어 보겠습니다. **왜 병목이 생기는가 → 어떻게 고치는가 → 실제로 얼마나 효과가 있었는가.**

## 먼저, QPS란 _무엇_이며 왜 한계에 부딪히는가?

QPS(Queries Per Second)는 그저 **초당 처리하는 요청 수**입니다. 하지만 의지만으로 높일 수는 없습니다. QPS는 다음 공식에 묶여 있습니다.

```plaintext
QPS ≈ number of concurrent workers / time to process one request
```

**계산대 비유**로 보면 바로 이해가 됩니다. 워커(스레드나 커넥션)를 _계산원_이라고 생각하고, 요청 처리 시간을 _한 명의 손님을 계산하는 데 걸리는 시간_이라고 생각해 보세요.

-   계산원 1명, 손님 한 명당 0.5초 → 초당 손님 2명 = **2 QPS**
    
-   속도를 손님 한 명당 0.1초로 높이면 → 계산원 1명이 이제 **10 QPS**를 처리 (분모를 줄인 것)
    
-   계산원 2명을 더 추가하면 → 각 0.1초로 **30 QPS** (분자를 키운 것)
    

```plaintext
QPS = cashiers / time-per-customer   →   3 / 0.1s = 30 QPS
```

문제는 손님이 그보다 빠르게 몰려들 때 시작됩니다. 30-QPS짜리 가게에 **초당 40명의 손님**이 들이닥치면, 줄은 매초 10명씩 늘어나고 → 대기 시간이 폭발하고 → 손님이 나가버리며(타임아웃) → 가게가 마비됩니다(장애). 서버도 정확히 똑같이 동작합니다.

**그래서 QPS를 높이는 방법은 딱 두 가지뿐입니다.**

1.  **분모를 줄이기** (요청당 시간) → 캐싱, DB 최적화
    
2.  **분모에서 작업을 _빼내기_** — 요청 안에서 반드시 일어날 필요가 없는 모든 것 → 비동기 / 배칭
    

아래 세 가지 전략은 정확히 이 두 개의 레버를 공략합니다. 그리고 실무에서 튜닝을 시작할 때는 이 순서대로 손을 대게 됩니다. 이것이 가장 가성비가 좋은 순서이기 때문입니다. **캐싱 → DB 최적화 → 비동기/배칭.**

* * *

## 1\. 캐싱 — "같은 것을 두 번 계산하지 마라"

### 핵심 아이디어

캐싱은 근본적으로 **비싼 연산의 결과를 값싼 곳에 저장해 두고 잠시 동안 재사용하는 것**입니다. 여기서 중요한 두 단어는 _비싼_과 _잠시 동안_입니다.

얼마나 비싼가? 캐싱이 가성비 1위 최적화인 이유는 이 응답 시간 격차에 있습니다.

| 데이터 소스 | 대략적인 latency | vs. DB |
| --- | --- | --- |
| 애플리케이션 메모리 (인프로세스) | ~0.001ms | ~50,000배 빠름 |
| Redis (동일 네트워크) | ~0.5–1ms | ~50–100배 빠름 |
| DB, 단순 쿼리 (인덱스 있음) | ~10ms | 기준 |
| DB, 복잡한 쿼리 (JOIN/집계) | ~50–200ms | — |

그래서 어떤 결과를 DB에서 한 번 가져오는 데 50ms가 걸렸다면, 그것을 Redis에 캐싱해 두면 그 이후부터는 ~1ms 만에 반환할 수 있습니다. **요청당 시간(분모)이 50배 줄어들고, QPS는 그에 맞춰 곧바로 뛰어오릅니다.**

### 다층 캐싱(Multi-layer caching)

프로덕션에서는 캐시를 하나만 쓰는 경우가 드뭅니다. **여러 층을 쌓아 올리며**, 요청을 사용자에게 가까운 곳에서 멈출 수 있을수록 더 좋습니다. 요청이 이들을 거쳐 가는 순서대로 보면 다음과 같습니다.

```plaintext
User request
   │
   ▼
① CDN cache (CloudFront/CloudFlare)   ← if it hits here, it never reaches your server (best)
   │ miss
   ▼
② App memory cache (in-process LRU)   ← 0.001ms, but lives per-server
   │ miss
   ▼
③ Redis (distributed cache)           ← 1ms, shared across all servers
   │ miss
   ▼
④ Database (the source of truth)      ← 50ms; reaching here is a "cache miss"
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

> ⚠️ 흔한 실수: 쓰기 후에 캐시를 **삭제하는 것**(`del`)이 보통 **갱신하는 것**(`set`)보다 안전합니다. 두 개의 쓰기가 동시에 갱신하면 오래된 값이 경쟁에서 이길 수 있습니다. 삭제하면 "다음번에 DB에서 새로 가져와라"라는 의미가 되어 항상 최신 상태를 반영합니다.

### 💡 제가 적용한 것 — 3w CMS의 "조회수 배칭"

게시글의 조회수는 교과서적인 **"읽기가 많고, 정확성은 그다지 중요하지 않은"** 종류의 데이터입니다. 그런데 원래 설계는 _조회가 발생할 때마다_ DB `UPDATE`를 날렸습니다.

**이전 — 조회 1회 = 쓰기 쿼리 1회:**

```sql
-- runs every time someone opens a post
UPDATE posts SET view_count = view_count + 1 WHERE id = ?;
```

문제는 이렇습니다. 인기 있는 게시글이 초당 500명의 독자를 받으면 **초당 500개의 쓰기 쿼리**가 _같은 행_을 두들기게 됩니다. 한 행에 대한 동시 UPDATE는 **row-lock 경합**을 일으키므로, 조회수를 하나 올리는 일이 결국 DB 전체를 느리게 만듭니다. 쓰기는 캐싱할 수도 없고 replica로 떠넘길 수도 없으니, 가장 고통스러운 종류의 부하입니다.

**이후 — Redis 카운터 + 5분마다 배치 플러시:**

```ts
// On view: increment a Redis counter, not the DB (0.5ms, no lock)
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

**결과:** 5분 동안 1,500회의 조회가 DB에는 **단 한 번의 UPDATE**로 반영됩니다. 쓰기 부하가 **1,500배** 줄었습니다. 조회수는 최대 5분까지 지연될 수 있지만, 조회수에게 그 정도 지연은 완전히 무해합니다. 트레이드오프가 완벽하게 들어맞습니다.

> 이것은 캐싱(Redis에 임시 저장)과 배칭(모아 두었다가 한 번에 플러시)을 결합한 것으로, 곧바로 전략 #3으로 이어집니다.

* * *

## 2\. 데이터베이스 최적화 — 병목의 80%가 사는 곳

애플리케이션 코드는 보통 마이크로초 단위로 실행되지만, DB는 밀리초에서 수백 밀리초 단위로 동작합니다. 그래서 **대부분의 백엔드 병목은 DB에서 발생합니다.** 그렇기 때문에 캐싱 다음으로 손대는 것이 바로 DB입니다. 세 가지가 한 세트로 따라옵니다.

> **대전제: 가장 빠른 쿼리는 아예 실행하지 않은 쿼리다.** 읽기 최적화의 최우선 순위는 영리한 쿼리를 작성하는 것이 아니라, **애초에 DB에 도달하는 빈도를 줄이는 것**입니다. 그래서 실무에서는 DB를 직접 두들기기 전에 다음 순서로 읽기를 걸러냅니다.
> 
> 1.  **캐시가 답할 수 있는가?** — #1의 다층 캐시가 상당 부분의 읽기를 DB 전에 멈춥니다. 뜨거운(hot) 데이터는 DB에 거의 도달하지 않습니다.
>     
> 2.  **여러 쿼리를 하나로 합칠 수 있는가?** — N+1을 IN-쿼리 / JOIN / DataLoader로 접습니다(#3의 배칭 참고). 왕복 11번 → 2번.
>     
> 3.  **필요한 것만 가져오고 있는가?** — `SELECT *` 대신 특정 컬럼만, 행 수를 제한하는 페이지네이션, 불필요한 JOIN 제거.
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

**구체적인 예시 — 10만 행짜리 테이블에서 한 사용자의 주문 가져오기:**

```sql
SELECT * FROM orders WHERE user_id = 'u_123' ORDER BY created_at DESC LIMIT 20;
```

-   **인덱스 없음**: 10만 개를 모두 읽고 → user\_id로 필터링 → 정렬. ~**120ms**.
    
-   `user_id` **에만 인덱스**: 그 사용자의 주문(가령 500개)은 빠르게 찾지만, 정렬은 여전히 메모리에서 합니다. ~**15ms**.
    
-   **복합 인덱스** `(user_id, created_at DESC)`: 찾기 _와_ 정렬이 인덱스 안에서 한 번에 끝납니다. ~**0.5ms**. 👈
    

**복합 인덱스에서 컬럼 순서가 중요합니다.** `(user_id, created_at)`는 "user\_id로 좁힌 다음 created\_at으로 정렬"에는 이상적이지만, `created_at`만으로 검색하는 쿼리는 처리할 수 없습니다. 경험칙: **동등(**`=`**) 조건 컬럼을 앞에, 범위/정렬 컬럼을 뒤에.**

> ⚠️ 트레이드오프: 인덱스는 공짜가 아닙니다. 모든 INSERT/UPDATE가 인덱스도 함께 갱신해야 하므로, **쓰기가 느려지고 저장 공간을 더 씁니다.** "혹시 몰라서" 모든 컬럼에 인덱스를 마구 붙이면 역효과가 납니다. 실제 쿼리 패턴을 보고 필요한 것만 추가하세요.

### 2-2. 커넥션 풀링 — "매번 새 커넥션을 열지 마라"

새 DB 커넥션을 여는 데는 수십 밀리초가 듭니다(**TCP handshake + 인증**). 쿼리 자체가 1ms인데 요청마다 그렇게 하는 것은 터무니없습니다. 커넥션에만 30ms를 태우게 됩니다.

**커넥션 풀**은 N개의 커넥션을 미리 만들어 두고, 빌려주고 다시 회수해서 재사용합니다.

```plaintext
[req A] ─┐                  ┌─ [conn 1] ─┐
[req B] ─┤  Pool (reuse)    ├─ [conn 2] ─┤── DB
[req C] ─┘                  └─ [conn 3] ─┘
         (wait queue)
```

**풀 크기 정하기 — 너무 작아도, 너무 커도 아픕니다:**

-   **너무 작음**: 요청들이 커넥션을 빌리려고 줄을 섭니다 → latency.
    
-   **너무 큼**: DB가 동시 커넥션 홍수를 맞습니다 → 각 커넥션이 DB 메모리를 잡아먹으므로 DB의 메모리/CPU가 폭발합니다.
    
-   **경험칙**: `CPU cores × 2–4` 정도에서 시작해 부하 테스트로 튜닝하세요.
    

앱 서버를 늘릴수록 각 서버가 자기 풀을 갖게 되므로 전체 DB 커넥션이 곱절로 늘어납니다. 그래서 **PgBouncer** 같은 풀러(pooler)를 앞단에 별도 계층으로 두는 경우가 많습니다.

### 2-3. 읽기 replica (읽기/쓰기 분리)

대부분의 서비스는 **읽기:쓰기 비율이 9:1 이상**입니다(글 하나 쓰면 수백 명이 읽습니다). 그래서 읽기를 여러 replica에 분산하면 단일 마스터의 부담을 크게 덜어줍니다.

```plaintext
                ┌─ writes (INSERT/UPDATE/DELETE) ─→ [Master DB]
[application] ──┤                                       │ replication
                └─ reads (SELECT) ─→ [Replica 1] [Replica 2] [Replica 3]
```

**효과:** 읽기를 3개의 replica로 분산하면 마스터는 쓰기에 집중하고, 읽기 처리 용량은 사실상 3배가 됩니다.

> ⚠️ **복제 지연(Replication lag)**: 마스터에 쓴 데이터가 replica로 복사되기까지 수 밀리초에서 수백 밀리초가 걸립니다. 그래서 **read-after-write** 상황(예: 댓글을 달자마자 곧바로 댓글 목록을 조회)에서는 replica에서 읽어서 "어라, 내 댓글이 어디 갔지?"를 보게 됩니다. 그런 읽기는 반드시 **마스터로 강제**해야 합니다.

```ts
// Normal reads go to a replica
const posts = await readClient.post.findMany(...);

// Reads that must reflect a just-made write go to the master
await writeClient.comment.create({ data });
const comments = await writeClient.comment.findMany(...); // read from master
```

### 세 가지가 어떻게 연결되는가

이것들은 따로 노는 것이 아니라 하나의 묶음입니다. **인덱스는 단일 쿼리를 빠르게 하고, 풀은 커넥션 낭비를 없애며, replica는 읽기를 분산합니다.** 인덱스로 쿼리를 100ms에서 1ms로 줄이면 같은 풀이 이제 100배 더 많은 요청을 처리할 수 있으니, 세 효과가 _곱해집니다_.

* * *

## 3\. 비동기 + 배칭 — "요청에서 필수가 아닌 것을 전부 빼내라"

#1과 #2가 각 작업을 더 빠르게 만드는 것이었다면, #3은 발상의 전환입니다. **작업 자체를 사용자의 크리티컬 패스에서 완전히 들어내는 것.**

### 3-1. 메시지 큐를 통한 비동기 처리

회원가입을 생각해 보세요. 사용자 관점에서 "가입 완료"란 **사용자가 DB에 존재한다**는 것, 그게 전부입니다. 그런데 환영 이메일 전송(외부 SMTP 호출, 500ms)을 그 요청 안에서 _동기적으로_ 하면, 사용자는 그저 이메일이 발송되기를 앉아서 기다리는 꼴이 됩니다.

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

**결과:** 510ms → 12ms. **요청당 시간이 ~40배 줄었고**, QPS는 그에 맞춰 올라갑니다. 이메일은 1초 뒤에 도착하고 아무도 눈치채지 못합니다.

**큐로 밀어 넣기 좋은 후보들:**

-   이메일/SMS, 푸시 알림
    
-   이미지 리사이징 / 썸네일 생성
    
-   통계 / 분석 집계
    
-   서드파티 API 호출 (느리고 실패하기 쉬움)
    

도구: Kafka, RabbitMQ, Redis Streams, AWS SQS 등. 덤으로 **재시도와 실패 격리**를 공짜로 얻습니다. 이메일 서버가 잠깐 죽더라도 작업은 큐에 쌓였다가 복구되면 발송되며, 가입 자체는 결코 블로킹되지 않습니다.

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

### 💡 제가 적용한 것 — 3w CMS의 "50ms 윈도우 알림 집계"

우리 알림 시스템에서는 한 사용자가 아주 짧은 순간에 이벤트 폭주를 겪는 경우가 있었습니다(예: 그룹 채팅에서 1초 안에 메시지 10개). 이벤트마다 푸시를 하나씩 쏘면 이렇게 됩니다.

-   사용자 휴대폰이 **10번** 울림 → 끔찍한 UX
    
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

**결과:** 폭주 상황에서 푸시 호출이 이전의 **몇 분의 일** 수준으로 떨어졌고, 사용자는 알림 폭탄 대신 깔끔한 요약 하나를 받았습니다. 성능과 UX를 한 방에 해결했습니다. 50ms는 사람이 인지할 수 없는 시간이라, 트레이드오프는 사실상 공짜였습니다.

### 3-3. 디바운싱 / 스로틀링 — 클라이언트 쪽 배칭

검색 자동완성처럼 빠르게 반복되는 요청은 **묶거나 솎아내야** 합니다.

-   **디바운스(Debounce)**: "더 이상 입력이 없는 상태가 300ms 지속된 후에만 요청을 한 번 쏜다." 반초 안에 `S`, `Se`, `Seoul`을 입력하면 → 요청 3개가 아니라 `Seoul` 하나만 **1번**.
    
-   **스로틀(Throttle)**: "아무리 자주 발생해도 초당 최대 한 번." 초당 수백 번씩 발생하는 스크롤 이벤트 같은 것을 솎아냅니다.
    

클라이언트에서 막는 것은 모든 최적화 중 가장 값쌉니다. 왜냐하면 **요청이 서버에 아예 도달하지 않기 때문**입니다.

* * *

## 마무리 — 왜 이 순서이고, 왜 효과가 곱해지는가

이 세 가지 말고도 방법은 많습니다. 수평 확장(로드 밸런서 + 다중 서버), HTTP/2, gzip/brotli 압축, 정적 자산 분리 등. 하지만 **이 세 가지만 제대로 적용해도 보통 QPS가 10배 이상 올라갑니다.** 그래서 튜닝을 시작할 때는 거의 항상 이 순서로 갑니다(가성비가 가장 좋은 것부터).

| 순서 | 전략 | 공략 대상 | 한 줄 요약 |
| --- | --- | --- | --- |
| 1 | **캐싱** | 요청당 시간 (분모) | 비싼 결과를 값싼 곳에 저장하고 재사용 |
| 2 | **DB 최적화** | 요청당 시간 (분모) | 쿼리를 인덱싱하고, 커넥션을 풀링하고, 읽기를 복제 |
| 3 | **비동기 / 배칭** | 작업의 _양_ | 필수가 아닌 작업을 응답 경로에서 빼내기 |

핵심은 **세 가지가 곱해진다**는 것입니다. 캐싱이 읽기의 80%가 DB에 아예 도달하지 못하게 막고(5배), 인덱스가 나머지 20%를 빠르게 하며(10배), 무거운 작업은 큐로 옮겨집니다. 이 이득들은 더해지는 게 아니라 복리로 쌓이며, 총 QPS는 수십 배로 뛰어오릅니다.

그리고 이 세 가지 전체를 관통하는 실:​ **자신의 트레이드오프를 의식적으로 선택하는 것.** 조회수는 5분 지연되어도 되고, 알림은 50ms 동안 묶여도 되며, 이메일은 1초 늦게 도착해도 됩니다. **무엇이 약간 틀려도, 혹은 약간 늦어도 되는지를 아는 것** — 그것이 성능 엔지니어링의 진짜 실력입니다.

* * *

_읽어 주셔서 감사합니다! 이 범주 중 하나에 들어맞는 성능 개선을 적용해 보셨거나, 혹은 이 규칙 중 하나를 어겨서 그 대가를 치르셨다면, 댓글로 이야기를 들려주시면 정말 반갑겠습니다._
