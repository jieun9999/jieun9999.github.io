---
title: '[메신저 부하 테스트 2편] AI가 생성한 코드에 deadlock이 숨어 있었다 — `unreadCount`를 `lastReadAt`으로 교체한 이야기'
description: '부하 테스트 시작 9분 만에 HTTP 오류율 42.8%, 목표 TPS의 12%. 범인은 AI 보조 코딩 중 무심코 작성한 단 한 줄의 updateMany였습니다.'
pubDate: 2026-05-11
tags: ['postgresql', 'prisma', 'databases', 'concurrency', 'node-js', 'debugging']
category: fundamentals
cover: /covers/there-was-a-deadlock-hiding-in-ai-generated-code-how-we-replaced-unreadcount-with-lastreadat.webp
coverAlt: 'AI가 생성한 코드에 deadlock이 숨어 있었다 — `unreadCount`를 `lastReadAt`으로 교체한 이야기'
series: messenger-load-test
seriesOrder: 2
seriesTitle: '메신저 부하 테스트 실전기'
---

> [!NOTE]
> 부하 테스트 시작 9분 만에 HTTP 오류율 42.8%. 범인은 AI 보조 코딩 중 무심코 작성한 단 한 줄의 `updateMany`였습니다.

앞서 **1편**에서 세운 부하 테스트 환경으로, 이제 send API가 **실제로 몇 TPS까지 버티는지** 처음 측정할 차례였습니다. 목표는 채팅 전송 **75 TPS** — 그리 무리한 숫자도 아니었습니다. 그런데 테스트를 켜자마자 수치가 무너졌고, 이 글은 그 원인을 끝까지 파고든 기록입니다.

* * *

## 1\. 발견 — "목표가 75 TPS인데 왜 9.5 TPS밖에 안 나오지?"

부하 테스트 환경에서 채팅 트래픽 75 TPS를 목표로 k6를 돌렸습니다. 돌아온 수치는 처참했습니다.

| 지표 | 값 |
| --- | --- |
| 목표 TPS | 75 req/s |
| 달성 TPS | **9.5 req/s** (목표의 12%) |
| **HTTP 오류율** | **42.8%** |
| HTTP 5xx | 4.07 req/s |
| Postgres 활성 커넥션 | 11 / 최대 27 — 여유 충분 |
| Centrifugo publish 실패 | 0 |

가장 먼저 의심할 대상은 언제나 connection pool 고갈입니다. 하지만 Postgres는 27개 커넥션 중 11개만 쓰고 있었고, Centrifugo publish는 100% 성공하고 있었습니다. 모든 신호가 **앱 서버의 데이터베이스 쿼리 자체**를 가리키고 있었습니다.

## 2\. 진짜 범인 — `40P01 deadlock detected`

`docker logs witim-web`를 보니 5xx 라인이 전부 똑같은 모양이었습니다.

```plaintext
prisma:error
Error occurred during query execution:
ConnectorError(... QueryError(PostgresError {
  code: "40P01", message: "deadlock detected", severity: "ERROR",
  detail: Some("Process 111892 waits for ShareLock on transaction 158028;
                blocked by process 111881.
                Process 111881 waits for ShareLock on transaction 158027;
                blocked by process 111892.")
}))
```

`P2024`(pool timeout)도 아니고, `ETIMEDOUT`도 아니었습니다. **순수한 PostgreSQL row-lock deadlock.** 열여섯 개의 동시 트랜잭션이 같은 행 집합을 서로 다른 순서로 잠그며 충돌하고 있었던 것입니다.

## 3\. 코드 점검 — 잠깐, 메시지 하나당 쓰기를 4~5번 한다고?

문제의 핸들러인 `POST /api/channels/[id]/messages`는 **트랜잭션 래퍼도 없이 4~5번의 순차 쓰기**를 하고 있었습니다.

| # | 작업 | 락 영향 |
| --- | --- | --- |
| 1 | `message.create` (Message + Mention + Attachment 중첩) | Channel/User row KEY SHARE |
| 2 | `message.update` (parent.replyCount++) \[답글일 때만\] | parent Message row exclusive |
| 3 | `channel.update` (updatedAt) | Channel row exclusive |
| 4 | `channelMember.updateMany` **(다른 멤버들의 unreadCount++)** | **여러 ChannelMember row exclusive** ← deadlock 유발 지점 |
| 5 | `channelMember.updateMany` (보낸 사람 unreadCount=0) | 보낸 사람 ChannelMember row exclusive |

4번이 치명적입니다. 사용자 A와 B가 같은 채널에 동시에 메시지를 보내면 이런 일이 벌어집니다.

```plaintext
Tx-A: UPDATE ChannelMember WHERE channelId=X AND userId != A
        → locks rows B, C, D, ... one at a time, in scan order
Tx-B: UPDATE ChannelMember WHERE channelId=X AND userId != B
        → locks rows A, C, D, ... one at a time, in scan order
```

`updateMany`는 하나의 SQL 문이지만, `ORDER BY`가 **없으면** Postgres는 실행 계획에 따라 락을 잡는 순서를 정합니다. 캐시 상태, 병렬 워커 분배, 테이블 통계가 모두 이 순서에 영향을 주며, 이는 곧 **같은 SQL의 두 동시 실행 사이에서도 순서가 달라질 수 있다**는 뜻입니다.

### PG 로그에서 나온 직접적인 증거

deadlock마다 `CONTEXT` 라인이 매번 달랐습니다.

| 시각 | CONTEXT |
| --- | --- |
| 05:28:46 | `while updating tuple (44,45)` |
| 05:28:54 | `while updating tuple (105,19)` |
| 05:28:55 | `while updating tuple (89,28)` |
| 05:29:09 | `while locking tuple (214,56)` |
| 05:29:10 | `while locking tuple (1364,5)` |

`(page, slot)`이 매번 다릅니다 → **락 순서가 비결정적(non-deterministic)**입니다. 가설이 확인됐습니다.

## 4\. 솔직한 고백 — 부끄러운 AI 코딩 실수였습니다

솔직히 털어놓겠습니다. 이 `updateMany`는 **AI 보조 코딩 중에 생성된** 코드입니다.

```typescript
// Intent: "When a message is sent, bump unreadCount by 1 for every other member"
await prisma.channelMember.updateMany({
  where: { channelId, userId: { not: senderId } },
  data: { unreadCount: { increment: 1 } },
});
```

문법적으로는 완벽합니다. 단일 채널, 단일 메시지, 단일 사용자 테스트에서는 흠잡을 데 없이 동작합니다. PR 리뷰도 통과했습니다.

하지만 이 코드는 **반드시 던졌어야 할 두 가지 질문**을 조용히 건너뛰었습니다.

1.  _"메시지 하나가 올 때마다 정말로 N개의 행에 쓰기를 해야 하는가?"_ — 멤버가 200명인 채널이라면 메시지 하나당 200번의 행 쓰기가 발생합니다. 100명의 사용자가 메시지를 보내면 초당 20,000번의 쓰기입니다. 이 규모에서 메시지마다 RDBMS 행 쓰기를 하는 것은 **구조적으로 비효율적**입니다.
    
2.  _"두 사람이 같은 채널에 동시에 글을 올리면 어떻게 되는가?"_ — 이것이야말로 모든 메시징 앱의 핵심 사용 패턴입니다. AI는 이 점을 고려하지 않았습니다. 그리고 PR을 머지한 저 역시 마찬가지였습니다.
    

이것이 AI 코딩의 함정입니다. **동작하는 것처럼 보이는** 코드는 동시성 시나리오에 대한 고민을 건너뛰게 만듭니다. 부하 테스트가 없었다면 이 문제는 프로덕션에서 똑같이 터졌을 것입니다.

## 5\. 테이블에 오른 처방들 — 어디까지 손대야 하는가?

이슈에는 세 단계의 수정안이 올라왔습니다.

**P0 (즉시):**

-   `40P01`에 대한 deadlock 재시도 인터셉터
    
-   `updateMany`를 `ORDER BY id FOR UPDATE`가 포함된 raw SQL로 다시 작성 → 결정적(deterministic) 락 순서
    

**P1 (단기):**

-   `unreadCount`를 Redis HINCRBY로 옮기고 주기적으로 DB에 플러시

**P2 (중기):**

-   `channelId` 해시로 Message INSERT를 파티셔닝

P0만으로도 deadlock은 사라집니다. 하지만 **메시지 1개 = N번의 행 쓰기**라는 구조는 그대로 남습니다. 100K CCU에 도달하면 형태만 다를 뿐 다시 터질 문제입니다.

P1(Redis)은 더 빠르지만 Redis ↔ Postgres 동기화 복잡도를 끌어들입니다. unreadCount가 Postgres와 일시적으로 어긋나고, Redis 플러시가 실패하면 카운트가 영구적으로 틀어질 수 있습니다.

그래서 우리는 **다른 방향**을 선택했습니다.

## 6\. 우리가 고른 것 — `lastReadAt` 컬럼

핵심 아이디어는 이렇습니다.

> **"메시지마다 카운터를 쓰지 말고, 읽을 때 카운트를 계산하라."**

`ChannelMember.unreadCount` 컬럼을 없앱니다. 대신 **단 하나의** `ChannelMember.lastReadAt` **타임스탬프**로 교체합니다.

### 이전 — 쓰기 중심

```plaintext
[Send 1 message]
  ├─ INSERT Message                              (write 1)
  ├─ UPDATE ChannelMember unreadCount++ for N    (write N) ← deadlock vector
  └─ UPDATE ChannelMember unreadCount=0 (sender) (write 1)

→ 1 message = (N+2) writes
```

### 이후 — 필요할 때 읽기

```plaintext
[Send 1 message]
  └─ INSERT Message                              (write 1)
                                                          ← done.

[Fetch channel list]
  └─ SELECT count(*) FROM Message
       WHERE channelId = $1 AND createdAt > lastReadAt   (read, hits index)

[Enter channel / mark as read]
  └─ UPDATE ChannelMember SET lastReadAt = NOW()
       WHERE userId = \(1 AND channelId = \)2              (write 1, own row only)
```

### 왜 이 방식이 deadlock을 없애는가

`updateMany WHERE userId != sender`가 **사라집니다.** 메시지를 보내도 더 이상 다른 사용자의 행을 건드리지 않습니다. 락 경합 유발 지점이 코드에서 완전히 제거됩니다.

`lastReadAt` 업데이트는 오직 **자기 자신의 행**만 건드립니다. 사용자 A는 언제나 A의 `ChannelMember` 행만, 사용자 B는 B의 행만 업데이트합니다. **두 트랜잭션이 같은 행을 두고 경쟁하는 시나리오 자체가 존재하지 않습니다** — 재시도 로직이 아니라 구조적으로 제거된 것입니다.

### 왜 이것이 성능 저하가 아닌가

언뜻 보면 "매번 `count(*)`를 돌린다"는 것이 더 느리게 들립니다. 하지만 그렇지 않습니다. 이유는 다음과 같습니다.

1.  **읽기는 캐시 친화적입니다.** `(channelId, createdAt)` 복합 인덱스가 있으면 이 카운트는 인덱스 range scan이 됩니다.
    
2.  **읽기 빈도 << 쓰기 빈도.** 사용자는 앱을 열거나 채널에 들어갈 때 채널 목록을 봅니다. 반면 메시지는 초당 수십에서 수백 번씩 전송됩니다. **N번의 쓰기를 1번의 읽기로 바꾸는 것만으로도 엄청난 이득입니다.**
    
3.  **읽기는 read replica에서 처리할 수 있습니다.** 쓰기 락은 그럴 수 없습니다.
    

### 시퀀스 다이어그램 (개념도)

```plaintext
[Before — count at write time]
User A ─── POST /messages ───▶ Web
                                 ├─ INSERT Message
                                 ├─ UPDATE ChannelMember(N rows) ← 💥 deadlock
                                 └─ 200 OK

[After — count at read time]
User A ─── POST /messages ───▶ Web
                                 ├─ INSERT Message
                                 └─ 200 OK                       ← done

User B ─── GET /channels  ───▶ Web
                                 ├─ SELECT channels ...
                                 ├─ SELECT count(*) FROM Message
                                 │    WHERE createdAt > lastReadAt
                                 └─ [{ id, name, unread: 3 }, ...]

User B ─── POST /channels/X/read ▶ Web
                                 └─ UPDATE ChannelMember
                                      SET lastReadAt = NOW()
                                      WHERE userId = B           ← own row only
```

## 7\. 마이그레이션 전략 — 한 번에 다 뒤엎지 마라

하위 호환성을 위한 단계적 롤아웃입니다.

1.  **Phase 1**: `lastReadAt` 컬럼을 추가합니다. **기존** `unreadCount` **쓰기 경로는 손대지 않고 그대로 둡니다.**
    
2.  **Phase 2**: **읽기 API만** 새 방식(`count(*) WHERE createdAt > lastReadAt`)으로 전환합니다.
    
3.  **Phase 3**: 부하 테스트를 다시 돌립니다. 75 TPS를 깔끔하게 통과하는지 확인합니다.
    
4.  **Phase 4**: `unreadCount` 쓰기 코드를 삭제하고 컬럼을 드롭합니다.
    

Phase 2가 끝나는 시점이면 **이미 deadlock 유발 지점은 사라진 상태**입니다. 왜일까요? 읽기 경로가 `lastReadAt` 기반으로 바뀌는 순간, 잘못된 `unreadCount` 값은 더 이상 사용자에게 보이지 않기 때문입니다. 그 이후에는 프로덕션 압박 없이 우리 일정에 맞춰 느긋하게 쓰기 경로를 정리하면 됩니다.

## 8\. 교훈 — AI 코딩과 동시성

이번 사건은 한 줄짜리 버그가 아니었습니다. **사고 패턴의 함정**이었습니다.

-   AI가 생성한 `updateMany`는 _"이걸 Prisma 문법으로 어떻게 표현하지?"_ 라는 질문에 대한 정답입니다.
    
-   하지만 _"메시징 앱에서 두 사용자가 같은 채널에 동시에 글을 올릴 때, 이 SQL은 어떻게 락을 획득하는가?"_ 라는 질문에 대한 답은 아닙니다. **아무도 그 질문을 하지 않았기 때문입니다.**
    
-   AI가 생성한 코드가 빠르게 안착할수록, **동시성, 격리성, 확장성에 대한 사람의 리뷰**가 더 중요해집니다. 그것이 바로 PR 리뷰의 진짜 가치입니다.
    

한 가지 교훈이 더 있습니다. **부하 테스트는 프로덕션 이후가 아니라 이전에 해야 합니다.** 격리된 부하 테스트 환경이 없었다면 이 문제는 100K CCU 트래픽 아래에서 터졌을 것입니다. 우리는 프로덕션에서 deadlock 사이클이 일으키는 5xx 폭풍을 쫓아다니고 있었겠죠. 그 환경 자체가 하나의 장애를 막아준 셈입니다.

* * *

> [👈 **1편:** "메신저 서비스를 위한 재사용 가능한 부하 테스트 환경 구축 — Make 기반 IaC, Observability, 그리고 Auth Seeding"](/ko/blog/building-a-reusable-load-test-environment-for-a-messenger-service-make-based-iac-observability-and-auth-seeding/)
