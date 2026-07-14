---
crosspost: true
title: 'There Was a Deadlock Hiding in AI-Generated Code — How We Replaced `unreadCount` with `lastReadAt`'
description: '42.8% HTTP error rate, 9 minutes into a load test, at 12% of the target TPS. The culprit was a single updateMany line written during AI-assisted coding.'
pubDate: 2026-05-11
tags: ['postgresql', 'prisma', 'databases', 'concurrency', 'node-js', 'debugging']
category: fundamentals
cover: /covers/there-was-a-deadlock-hiding-in-ai-generated-code-how-we-replaced-unreadcount-with-lastreadat.webp
coverAlt: 'There Was a Deadlock Hiding in AI-Generated Code — How We Replaced `unreadCount` with `lastReadAt`'
series: messenger-load-test
seriesOrder: 2
seriesTitle: 'Load-Testing a Messenger'
---

> [!NOTE]
> 42.8% HTTP error rate, 9 minutes into a load test. The culprit was a single `updateMany` line carelessly written during AI-assisted coding.

With the load-test environment from **Part 1** now in place, it was finally time to measure **how many TPS the send API could actually survive**. The target was a modest **75 TPS** of chat traffic. The moment the test started, the numbers fell apart — and this post is the story of tracking down why.

* * *

## 1\. Discovery — "Why are we doing 9.5 TPS when the target is 75?"

We ran k6 against a load-test environment, targeting 75 TPS of chat traffic. The numbers came back ugly.

| Metric | Value |
| --- | --- |
| Target TPS | 75 req/s |
| Achieved TPS | **9.5 req/s** (12% of target) |
| **HTTP error rate** | **42.8%** |
| HTTP 5xx | 4.07 req/s |
| Postgres active connections | 11 / 27 max — plenty of headroom |
| Centrifugo publish failures | 0 |

The first suspect was always going to be connection pool exhaustion. But Postgres was only using 11 of 27 connections, and Centrifugo publish was 100% successful. Every signal pointed at **the app server's database queries themselves**.

## 2\. The Real Culprit — `40P01 deadlock detected`

`docker logs witim-web` showed all the 5xx lines in identical shape:

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

Not `P2024` (pool timeout). Not `ETIMEDOUT`. **Pure PostgreSQL row-lock deadlock.** Sixteen concurrent transactions were locking the same set of rows in different orders and crashing into each other.

## 3\. Code Audit — Wait, We Do 4–5 Writes Per Message?

The offending handler, `POST /api/channels/[id]/messages`, was doing **four to five serial writes with no transaction wrapper**:

| # | Operation | Lock impact |
| --- | --- | --- |
| 1 | `message.create` (Message + Mention + Attachment nested) | Channel/User row KEY SHARE |
| 2 | `message.update` (parent.replyCount++) \[reply only\] | parent Message row exclusive |
| 3 | `channel.update` (updatedAt) | Channel row exclusive |
| 4 | `channelMember.updateMany` **(others' unreadCount++)** | **multiple ChannelMember rows exclusive** ← deadlock vector |
| 5 | `channelMember.updateMany` (sender unreadCount=0) | sender ChannelMember row exclusive |

#4 is the killer. When users A and B send messages to the same channel concurrently:

```plaintext
Tx-A: UPDATE ChannelMember WHERE channelId=X AND userId != A
        → locks rows B, C, D, ... one at a time, in scan order
Tx-B: UPDATE ChannelMember WHERE channelId=X AND userId != B
        → locks rows A, C, D, ... one at a time, in scan order
```

`updateMany` is one SQL statement, but with **no** `ORDER BY`, Postgres picks lock order based on the plan. Cache state, parallel worker distribution, and table statistics all influence it — meaning **the order can change between two concurrent executions of the same SQL**.

### Direct Evidence From the PG Log

Every deadlock had a different `CONTEXT` line:

| Time | CONTEXT |
| --- | --- |
| 05:28:46 | `while updating tuple (44,45)` |
| 05:28:54 | `while updating tuple (105,19)` |
| 05:28:55 | `while updating tuple (89,28)` |
| 05:29:09 | `while locking tuple (214,56)` |
| 05:29:10 | `while locking tuple (1364,5)` |

`(page, slot)` is different every time → **lock order is non-deterministic**. Hypothesis confirmed.

## 4\. Honest Confession — This Was an Embarrassing AI-Coding Mistake

Let me come clean. This `updateMany` was **generated during AI-assisted coding**.

```typescript
// Intent: "When a message is sent, bump unreadCount by 1 for every other member"
await prisma.channelMember.updateMany({
  where: { channelId, userId: { not: senderId } },
  data: { unreadCount: { increment: 1 } },
});
```

Syntactically perfect. Works flawlessly in a single-channel, single-message, single-user test. PR review passed.

But it silently skipped **two questions that should have been asked**:

1.  _"Should we really write to N rows on every single message?"_ — A channel with 200 members means 200 row writes per message. 100 users sending = 20,000 writes/sec. At that volume, RDBMS row writes per message are **structurally inefficient**.
    
2.  _"What happens when two people post to the same channel at the same time?"_ — That's the core usage pattern of any messaging app. The AI didn't think about it. And neither did I when I merged the PR.
    

This is the AI-coding trap. Code that **looks like it works** lets you skip thinking about concurrency scenarios. Without the load test, this would have detonated in production the same way.

## 5\. Prescriptions on the Table — How Far Should We Go?

The issue listed three tiers of fixes:

**P0 (immediate):**

-   Deadlock retry interceptor for `40P01`
    
-   Rewrite `updateMany` as raw SQL with `ORDER BY id FOR UPDATE` → deterministic lock order
    

**P1 (short term):**

-   Move `unreadCount` to Redis HINCRBY, periodically flushed to DB

**P2 (medium term):**

-   Partition Message INSERTs by `channelId` hash

P0 alone makes the deadlock go away. But **1 message = N row writes** stays. At 100K CCU, this will explode again — just in a different form.

P1 (Redis) is faster but introduces Redis ↔ Postgres synchronization complexity. unreadCount temporarily diverges from Postgres, and a failed Redis flush can permanently skew the count.

So we chose **a different direction**.

## 6\. What We Picked — The `lastReadAt` Column

Core idea:

> **"Don't write a counter on every message. Compute the count when you read."**

Drop the `ChannelMember.unreadCount` column. Replace it with **a single** `ChannelMember.lastReadAt` **timestamp**.

### Before — write-heavy

```plaintext
[Send 1 message]
  ├─ INSERT Message                              (write 1)
  ├─ UPDATE ChannelMember unreadCount++ for N    (write N) ← deadlock vector
  └─ UPDATE ChannelMember unreadCount=0 (sender) (write 1)

→ 1 message = (N+2) writes
```

### After — read-on-demand

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

### Why This Kills the Deadlock

`updateMany WHERE userId != sender` **disappears**. Sending a message no longer touches other users' rows. The lock-contention vector is removed from the code entirely.

`lastReadAt` updates only touch **your own row**. User A only ever updates A's `ChannelMember` row, user B only B's. **There is no scenario where two transactions compete for the same row** — it's eliminated by construction, not by retry logic.

### Why This Isn't a Performance Regression

At first glance, "running `count(*)` every time" sounds slower. It isn't, because:

1.  **Reads are cache-friendly.** With a composite index on `(channelId, createdAt)`, the count becomes an index range scan.
    
2.  **Read frequency << write frequency.** Users see the channel list when they open the app or enter a channel. Messages are sent dozens to hundreds of times per second. **Moving N writes → 1 read is an enormous win on its own.**
    
3.  **Reads can be served from a read replica.** Write locks cannot.
    

### Sequence Diagram (Conceptual)

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

## 7\. Migration Strategy — Don't Flip Everything At Once

Phased rollout for backward compatibility:

1.  **Phase 1**: Add the `lastReadAt` column. **Keep the existing** `unreadCount` **write path untouched.**
    
2.  **Phase 2**: Switch **only the read API** to the new approach (`count(*) WHERE createdAt > lastReadAt`).
    
3.  **Phase 3**: Re-run the load test. Confirm 75 TPS passes cleanly.
    
4.  **Phase 4**: Delete the `unreadCount` write code and drop the column.
    

By the end of Phase 2, **the deadlock vector is already gone**. Why? Once the read path is based on `lastReadAt`, a wrong `unreadCount` value is no longer visible to users. After that, we can clean up the write path on our own schedule, with no production pressure.

## 8\. Lessons — AI Coding and Concurrency

This incident wasn't a one-line bug. It was **a thinking-pattern trap**.

-   The AI-generated `updateMany` is a correct answer to _"How do I express this in Prisma syntax?"_
    
-   It is not an answer to _"In a messaging app, how does this SQL acquire locks when two users post to the same channel simultaneously?"_ **Because nobody asked that question.**
    
-   The faster AI-generated code lands, the more **human review of concurrency, isolation, and scalability** matters. That's the actual value of a PR review.
    

One more lesson. **Load testing belongs before production, not after.** Without an isolated load-test environment, this would have detonated under 100K CCU traffic. We'd have been chasing a 5xx storm caused by deadlock cycles in production. The environment itself prevented one incident.

* * *

> [👈 **Part 1:** "Building a Reusable Load-Test Environment for a Messenger Service — Make-based IaC, Observability, and Auth Seeding"](/en/blog/building-a-reusable-load-test-environment-for-a-messenger-service-make-based-iac-observability-and-auth-seeding/)
