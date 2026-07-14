---
title: '[Messenger Load-Testing, Part 3] There Was FCM Push Hiding in the Message-Send API — Moving It Out of the Request Path into a Dedicated Worker Queue'
description: 'Part 3 of load-testing a messenger: finding FCM push calls fired directly inside the message-send handler, and moving them into a dedicated worker queue so the request path carries only its response responsibility. The failures that used to vanish into empty catches are now observable.'
pubDate: 2026-05-17
tags: ['fcm', 'bullmq', 'node-js', 'concurrency', 'observability', 'architecture']
category: reliability
cover: /covers/fcm-push-hiding-in-the-message-send-api-moving-it-to-a-dedicated-worker-queue.webp
coverAlt: 'There Was FCM Push Hiding in the Message-Send API — Moving It Out of the Request Path into a Dedicated Worker Queue'
coverCaption: 'The image above is part of a Sentry-based monitoring dashboard.'
series: messenger-load-test
seriesOrder: 3
seriesTitle: 'Load-Testing a Messenger'
---

## TL;DR

In Part 1 I built the load-testing environment, and in Part 2 I fixed a PostgreSQL deadlock in the message-send handler. Part 3 is about the **second problem I found in that same handler while diagnosing the deadlock** — FCM push calls tangled into the request path — and how I structurally pulled them out. Three points:

1.  **The discovery** — Inside the message-send API, FCM push was being **fired directly as a floating promise**, and its failures were **completely hidden** behind empty `.catch(() => {})` blocks scattered around. Message persistence and push shared **the same process and the same Prisma pool**.

2.  **The root cause** — The responsibility boundary of "the API owns response speed (TPS), the Worker owns external I/O" had collapsed. Firebase latency or partial outages could **bleed into message-send TPS**, and even after the response returned, floating promises kept holding onto the pool.

3.  **The fix** — I moved FCM calls into a **dedicated worker queue (BullMQ)**, removing them from the request path entirely. The API only guarantees the `enqueue`; lookups, batch delivery, retries, token cleanup, and metrics all became the worker's responsibility. Along the way I also cleared out the empty `catch` blocks with structured logging, so failures became visible.

> Scope note: What actually took the service down in Part 2's load test was the DB deadlock, not this pool contention — and at that moment the connection pool wasn't even saturated. This FCM problem wasn't "a fire burning right now" so much as **a time bomb guaranteed to go off once fan-out grows and concurrency rises**. This is the story of pulling out that not-yet-detonated structure while I was already in there fixing the deadlock.

* * *

## 1\. The Discovery — Two Things Hiding in the Send API

Going line by line through the message-send handler (`POST /messages`, `POST /dm/:userId/messages`), the problem had two axes.

**(1) FCM failures were completely hidden behind empty `catch` blocks.**

Push calls were scattered across the reply, mention, and channel-notification paths in this shape:

```plaintext
sendPushToUser(userId, payload).catch(() => {});
sendPushToUsers(mentionTargets, payload).catch(() => {});
```

FCM goes out through Firebase Admin as **external HTTP I/O**. Drops, timeouts, throttling, and partial failures happen routinely — and `.catch(() => {})` swallows that rejection whole. The signal reaching operators is **zero**. Users file "I'm not getting push notifications" tickets while the dashboard stays green: the worst form of missing observability.

**(2) FCM push calls were tangled into the request path.**

The more structural problem was location. The DB work for saving a message and the DB work for push notifications shared **the same Prisma connection pool in the same API server process**. Sending a single push does all of this internally:

```plaintext
inside sendPushToUser
 ├─ query pushDevice       (Postgres)
 ├─ query presence         (Redis)
 ├─ query userPreference   (Postgres)
 ├─ FCM HTTP send          (Firebase Admin)
 └─ clean up invalid tokens (Postgres)
```

So inside the response path, push work eats DB and Redis resources too. When push piles up, a new message-save query can end up waiting in Prisma's internal queue.

## 2\. The Root Cause — The Handler Carried Too Much Responsibility

`sendPushToUser(...).catch(() => {})` is neither `await`ed nor `return`ed to the caller. An untracked async task like this is called a **floating promise**. Even **after** HTTP 201 is sent, this work keeps spinning inside the same Node process, holding onto the pool and Redis. Success or failure is unknown; there's no log and no retry.

It reduces to a single principle:

> **The API owns response speed (TPS); the Worker owns external I/O.**

When FCM sits inside the request path, that boundary breaks. If Firebase slows down by even 100ms, that latency **bleeds straight into message-send TPS**. Message persistence — the core path — becomes hostage to push, an auxiliary feature.

```plaintext
[ Before — the response path shoulders external I/O too ]

POST /messages
  ├─ save message (DB)
  ├─ unreadCount / replyCount (DB)
  ├─ realtime publish
  ├─ sendPushToUser(...).catch(()=>{})   ← FCM fired directly here 💥
  │     └─ pushDevice / presence / preference / FCM / token cleanup
  └─ HTTP 201
        ↑ even after the response, a floating promise still holds the pool

[ After — the response path responds only; external I/O goes to the worker ]

POST /messages
  ├─ save message (DB)
  ├─ unreadCount / replyCount (DB)
  ├─ realtime publish
  ├─ pushQueue.add("send-push", {...})    ← only guarantees "enqueued"
  └─ HTTP 201

Push Worker (separate process)
  └─ query pushDevice / presence / preference
     → FCM batch send → retry on failure → invalid token cleanup → metrics
```

## 3\. The Fix — Splitting FCM into a Dedicated Worker Queue

The direction was clear: **remove FCM from the response path entirely and move it to a worker behind a queue.**

**Here's all the API does now:**

```plaintext
// response path: delegate only "who gets what" to the queue, then respond immediately
await pushQueue.add("send-push", { recipientIds, payload, event });
// → HTTP 201
```

The API only guarantees **"the push task was put on the queue."** The actual FCM send, the lookups, and the failure handling all moved into the worker.

**The worker takes full ownership of external I/O.**

| Worker responsibility | Details |
| --- | --- |
| Target lookup | pushDevice / presence / userPreference |
| Batch send | FCM multicast (up to 500 tokens per call) |
| Failure handling | retry + exponential backoff (`server-unavailable`, etc.) |
| Token hygiene | deactivate `UNREGISTERED`/invalid tokens |
| Stability | concurrency limits, failed-job recording (DLQ) |
| Observability | push-specific metrics · structured logging |

**The empty `catch` blocks were cleared out during this migration too.** As failure handling moved to the worker, I cleaned up the silently-swallowed failures so they show up in logging/monitoring.

-   Replaced the empty `catch` blocks in channel/DM message notifications with an observability helper — no more `.catch(() => {})` swallowing.

-   Rejected promises and push `success = false` are recorded via `secureLogger.error`.

-   Partial failures in the FCM response (`failureCount > 0`) are recorded via `secureLogger.warn` — the common case where only some tokens fail is now observable.

-   A missing Firebase Admin config now returns as a push failure in production — a config gap no longer slips silently into non-delivery.

The only failure point left in the response path is the **enqueue itself**, and that one isn't swallowed — it's left as a signal:

```plaintext
enqueuePush(...).catch((err) => {
  secureLogger.error("push enqueue failed", err, { operation: "push.enqueue", messageId, event });
  metrics.increment("push_enqueue_failed");
});
```

The spot where `.catch(() => {})` used to fake "no error" is now the spot that records "what failed, and how."

## 4\. Why the Queue Is the Standard — A Production Lens

Pulling push out of the request path isn't a matter of taste; it's essentially the standard pattern in messaging services. The reasons map exactly onto the arguments behind this problem.

-   **Isolating external I/O** — FCM/APNs are external networks prone to latency and partial outages. That must not bleed into message-send TPS.

-   **Fan-out amplification** — one message expands to N recipients, which expands again to N push calls. The bigger the channel, the less the request can absorb it.

-   **Retries and token hygiene** — FCM recommends exponential backoff on failure, and dead tokens must be cleaned up continuously to keep delivery rates healthy. The request path can do neither.

-   **Batching** — batching via multicast sharply cuts the number of HTTP calls.

The queue becomes the orchestrator that decides who gets what payload and when, and handles failures — while FCM/APNs serve only as the final delivery network.

## 5\. Takeaways

-   **An empty `catch` isn't "no error" — it's "no signal."** Swallow external I/O silently, and the signal you need most disappears exactly when it starts hurting.

-   **A floating promise is not free async.** Even after the response finishes, it survives in the same process and the same pool, eating resources. "I didn't await it, so it's unrelated to the request" is an illusion.

-   **In the end, it was the same root as Part 2.** The message-send handler was carrying both data consistency (the deadlock) and external I/O (push) by itself. If Part 2 was the story of organizing DB responsibility with a transaction, Part 3 is **the story of offloading external-I/O responsibility to a worker**. Redrawing the boundary so the handler does only its own job (respond) — that's the one sentence running through both parts.
