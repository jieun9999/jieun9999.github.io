---
title: 'Why You Should Never Use KeyDB as a Pub/Sub Broker for Centrifugo'
description: 'Introduction I was building a real-time chat system designed to handle 100K concurrent WebSocket connections at 25K+ messages per second. The architecture was a symmetric dual-stack — two identical se'
pubDate: 2026-03-29
tags: ['redis', 'websockets', 'docker', 'devops', 'system-design']
category: building
cover: /covers/why-you-should-never-use-keydb-as-a-pub-sub-broker-for-centrifugo.png
coverAlt: 'Why You Should Never Use KeyDB as a Pub/Sub Broker for Centrifugo'
---
## Introduction

I was building a real-time chat system designed to handle **100K concurrent WebSocket connections at 25K+ messages per second.** The architecture was a symmetric dual-stack — two identical servers (16 vCPU / 58 GB each) running 5 Centrifugo nodes apiece, with Cloudflare DNS splitting traffic 50/50.

The critical challenge was **cross-server message synchronization.** When a user connected to Server A sends a message, it must reach a user on Server B. Centrifugo delegates this to Redis Pub/Sub — whichever Redis-compatible store sits behind it becomes the backbone of the entire messaging pipeline.

I chose KeyDB. It was a multithreaded Redis fork with **active-replica mode**, allowing bidirectional writes. Server A and B could both write, and changes would sync automatically. It looked perfect for a symmetric architecture.

```plaintext
Server A: KeyDB Primary         (read/write)
              ↕  (bidirectional replication)
Server B: KeyDB Active-Replica  (read/write)
```

Early load tests hit 23.6K TPS. Everything seemed fine.

Then I started reading GitHub Issues.

* * *

## 1\. The Problem — 5 Years of the Same Bug

I began auditing KeyDB's issue tracker before production deployment. What I expected to find were old, resolved bugs. What I actually found was a pattern that spanned half a decade.

### A Timeline of Hangs and Deadlocks

| Date | Issue | Symptom | Status |
| --- | --- | --- | --- |
| 2019.11 | #103 | deadlock & hang | Closed (version upgrade) |
| 2023.03 | #619 | active-replica hang | **Open** |
| 2024.03 | #794 | full server hang | **Open** |
| 2024.06 | #845 | Pub/Sub freeze | **Open** |
| 2024.10 | #878 | KEYS command hang | **Open** |
| 2024.11 | #883 | replication deadlock | **Open** |

From 2019 to 2024, **the same category of hang/deadlock kept recurring.** And the latest version, v6.3.4, had not fixed any of them.

### Structural Flaw: Multithreaded Deadlock

Issue #883 was the most alarming. It wasn't a simple bug — it was a **structural flaw in KeyDB's multithreaded architecture itself.**

```plaintext
bgsaveCommand attempts to acquire global WRITE lock
  ↓
AsyncWorkerQueue thread(1): waiting for global READ lock, holding m_mutex
  ↓
AsyncWorkerQueue thread(2): holding READ lock, waiting for m_mutex
  ↓
→ 3-way deadlock
  → CPU usage drops to 0%
  → All client connections unresponsive
  → Does not respond to SIGTERM (only SIGKILL works)
```

The entire server goes silent. No automatic recovery is possible. In Issue #845, users reported that even `sudo reboot` would hang — a **hardware-level hard reboot was required.**

### A Project Effectively Abandoned

The last release, v6.3.4, was in October 2023. I was evaluating this in February 2026 — **over two years with no updates.** 233 open issues had accumulated on GitHub. Maintainer responses had virtually ceased since 2024.

I recalled what antirez, the creator of Redis, once said: "The risk of bugs in threaded code is very high, and Redis's non-threaded architecture is a design for stability."

* * *

## 2\. Why This Is Catastrophic for Centrifugo

Centrifugo uses Redis Pub/Sub as the **core path for inter-node message delivery.** This isn't a cache layer. It's not a nice-to-have. If Pub/Sub freezes, every single Centrifugo node loses its ability to relay messages.

```plaintext
When KeyDB Pub/Sub freezes:
  ├─ Inter-node message delivery: completely halted
  ├─ All 10 Centrifugo instances: unable to deliver messages
  ├─ 100K connected users: total loss of real-time functionality
  └─ KeyDB ignores SIGTERM → no automatic recovery
      → An operator must manually hard-reboot the server
```

The Centrifugo documentation explicitly states: "KeyDB compatibility in future releases is not guaranteed." Every company running Centrifugo in production that I could find — VK, Badoo, ManyChat, Grafana — was using Redis or Redis + Sentinel. **Not a single production deployment used KeyDB as a Pub/Sub broker.**

* * *

## 3\. Evaluating Alternatives — DragonflyDB vs. Valkey

KeyDB had to go. The question was what to replace it with.

### DragonflyDB — Better Multithreading, But…

DragonflyDB is designed from the ground up as a multithreaded, shared-nothing architecture. Per-shard independent threads with minimal locking. The global lock contention that causes KeyDB's deadlocks simply cannot occur structurally. When deadlock issues are reported, a full-time team patches them within days to weeks.

But Centrifugo doesn't officially test against DragonflyDB. And there was a more fundamental question to ask.

### Does Pub/Sub Even Need Multithreading?

For multithreading to provide any benefit, there's a prerequisite: **a single core must be hitting 100%.** The entire point of multithreading is distributing work across cores because one core can't keep up. So the real question is — when used as a Pub/Sub broker for Centrifugo, would Valkey's single-threaded design ever saturate one core?

The Centrifugo official benchmark shows that at **1 million WebSocket connections delivering 500K messages per second**, each Redis instance used roughly 5% CPU. The developer himself stated: "I handled 500K connections with 10 Centrifugo nodes + 1 Redis instance, and Redis used only 60% of a single core."

Our environment is 100K connections. Proportionally, that's about 12–15% of a single core. On a 16 vCPU server, that's **under 1% of total capacity.** Pub/Sub simply relays messages — it's one of the lightest workloads Redis handles.

```plaintext
CPU load by Redis workload type:

GET/SET cache (hundreds of K ops/sec)   ████████████████  ← heavy
LPUSH/RPOP queue (bulk processing)      ██████████████    ← heavy
Sorted Set operations (ranking/analytics) ████████████    ← heavy
PUBLISH/SUBSCRIBE (message relay)       ███               ← light
```

But here's the critical insight. Let's say, for the sake of argument, that traffic spikes and Valkey's single core reaches 60%. Should the response be "switch to a multithreaded database"?

No. **Just add another Valkey instance.**

Centrifugo natively accepts Redis addresses as an array. When configured this way, it applies consistent hashing on channel names and automatically distributes traffic. This isn't Redis Cluster — the Valkey instances don't even know about each other. Centrifugo handles the routing: "this channel goes to A, that channel goes to B."

```json
// Before: 1 Valkey instance — single core at 60%
{ "address": "redis://valkey-a:6379" }

// After: 2 Valkey instances — each core at 30%
{ "address": [
    "redis://valkey-a:6379",
    "redis://valkey-b:6379"
  ]
}
```

One line added to the config, and the load is halved. Three instances, one-third each. **Linear horizontal scaling.**

Here's what this means:

```plaintext
When is multithreading needed?
  = When a single core reaches 100%

What actually happens with a Pub/Sub broker:
  Valkey's single core reaches ~60%
  → Add one more Valkey instance, add one address to Centrifugo config
  → Each instance now handles ~30%
  → A single core never reaches 100%
  → The situation that requires multithreading simply never arrives
```

**Instead of breaking the single-core ceiling with multithreading, you deploy multiple single-core instances.** This is safer, more predictable, and the industry standard. And since Centrifugo supports this natively — there's no reason to use multithreaded Redis variants like KeyDB or DragonflyDB as a Pub/Sub broker.

### The Verdict: Valkey

| Factor | KeyDB | DragonflyDB | Valkey |
| --- | --- | --- | --- |
| Deadlock risk (Pub/Sub) | High | Low | **Impossible** |
| Project health | Abandoned | Active | Active |
| Centrifugo official support | Not supported | Not tested | **Officially supported** |
| License | BSD | BSL | **BSD** |

Valkey is a fork of Redis 7.2.4, led by the Linux Foundation with backing from AWS, Google, and Oracle. From Centrifugo's perspective, Valkey and Redis are indistinguishable — identical protocol, commands, Pub/Sub, and Sentinel support.

Being single-threaded means **the entire bug category of "multithreaded deadlock" does not exist.** If the top priority is "absolutely no freezing," Valkey + Sentinel was the most conservative and safest choice.

* * *

## 4\. Building It — Valkey Primary + Replica + Sentinel (3-Node Quorum)

### Architecture Change

I dropped KeyDB's active-replica (bidirectional writes) and switched to Valkey Primary → Replica unidirectional replication with Sentinel automatic failover.

```plaintext
Before (KeyDB):
  Server A: KeyDB Primary    ↔ (bidirectional)  Server B: KeyDB Active-Replica
  → Deadlock risk, no automatic recovery

After (Valkey + Sentinel):
  Server A: Valkey Primary   → (unidirectional)  Server B: Valkey Replica
  Sentinel ×3 (Server A, Server B, Runner) — quorum=2

  → Deadlock impossible, automatic failover in 5–15 seconds
```

Three Sentinels were placed on Server A, Server B, and a $6/month Runner server. With quorum=2, any single server failure still leaves two Sentinels to form a majority and trigger failover.

| Failure Scenario | Sentinel Status | Result |
| --- | --- | --- |
| Server A (Primary + S1) down | S2 + S3 = 2/3 | Failover executed |
| Server B down | S1 + S3 = 2/3 | Primary maintained |
| Runner (S3) down | S1 + S2 = 2/3 | Normal operation |

### The Hard Part: Docker Networking vs. Sentinel

The most painful part of the migration wasn't Valkey itself — it was **Docker networking.**

Sentinel's job is to tell every node "here's where the current master is." But when Sentinel runs inside a Docker bridge network, it sees the master's address as `172.18.0.2` — a Docker-internal IP. When it passes this address to the Sentinel on Server B, that address either points to a completely different container or doesn't exist at all. Connection fails.

```plaintext
Sentinel inside Server-a's Docker bridge:
  "master is at 172.18.0.2!"
           ↓
Server-b's Docker bridge:
  "172.18.0.2? That doesn't exist here... → connection failed"
```

Think of it as giving someone a building's internal extension number and expecting it to work from a different building. Internal extensions only work within their own building.

**The fix was running Sentinel with** `network_mode: host`**.** When Sentinel sits directly on the host network instead of inside the Docker bridge, it sees the master at its VPC IP (`10.10.0.3`). VPC IPs are routable from any server in the network.

```plaintext
Sentinel (host network):
  "master is at 10.10.0.3:6379!"
           ↓
Server-b:
  "10.10.0.3? That's a VPC address — reachable! → connection success"
```

But there was another problem. Centrifugo containers still lived inside the Docker bridge, while Sentinel was now outside it. To reach from inside to outside, I needed the `extra_hosts` directive:

```yaml
centrifugo-1:
  extra_hosts:
    - "sentinel:host-gateway"  # Route through bridge gateway to reach host's Sentinel
```

`host-gateway` is a special Docker keyword that resolves to the bridge network's gateway IP — essentially a lobby phone that connects the inside of the building to the outside. **Finding this single line took longer than any other part of the migration.**

### Minimal Configuration Changes

No application code or Centrifugo configuration structure needed to change. One environment variable swap:

```bash
# Before
CENTRIFUGO_REDIS_ADDRESS=keydb:6379

# After
CENTRIFUGO_REDIS_ADDRESS=redis+sentinel://sentinel:26379,<server-b>:26379,<runner>:26379?master=mymaster
```

The address format changed to `redis+sentinel://`, and Centrifugo automatically queries Sentinel for the current Primary and connects. On the infrastructure side, I deleted three KeyDB-specific options (`server-threads`, `server-thread-affinity`, `active-replica`), replaced the KeyDB conf with a Valkey conf, and that was it.

* * *

## 5\. Validation — Load Test Results

After migration, I ran the same stress test: 100K concurrent connections, 4-step progressive load.

### TPS and Latency

| Step | Combined TPS | P50 | P95 | P99 | Overall Grade |
| --- | --- | --- | --- | --- | --- |
| 1 | 15,305 | 1.7ms | 34.8ms | 692.7ms | **Good** |
| 2 | 18,591 | 2.0ms | 485.0ms | 971.0ms | **Fair** |
| 3 | 23,504 | 3.6ms | 270.5ms | 905.4ms | **Fair** |
| 4 | 31,171 | 875.0ms | 2,492ms | 4,963ms | **Fail** |

The error-free sustainable ceiling was **~23.5K TPS.** Through Step 3, the error rate remained at 0.0001–0.0002% — effectively zero.

### Valkey and Sentinel Resource Usage

This is the answer to "isn't single-threaded a bottleneck?"

| Container | Server-A (Primary) | Server-B (Replica) |
| --- | --- | --- |
| **Valkey** | 88–98% (single core) | 31–35% |
| **Sentinel** | 0.4–0.5% | 0.5–1.0% |
| **HAProxy** | 114–202% | 127–216% |

Valkey Primary reached 88–98% on its single core, but that's only ~6% of the 16 vCPU server's total capacity. The actual bottleneck was **HAProxy at 216%.** Sentinel overhead was negligible — 0.4–1.0% CPU and roughly 3.4 MB RAM.

Compared to the KeyDB era, removing bidirectional replication overhead noticeably reduced Replica-side CPU. And most importantly — we gained the **structural guarantee that deadlocks cannot occur.**

### Failover Test

I forcefully killed the Primary and measured recovery time.

| Time | Event |
| --- | --- |
| T+0s | Primary process terminated |
| T+5s | 3 Sentinels: SDOWN → vote → ODOWN (majority reached) |
| T+6s | Sentinel leader elected |
| T+7s | Replica promoted to new Primary (`REPLICAOF NO ONE`) |
| T+8s | Centrifugo auto-reconnects → service restored |

**Total downtime: approximately 5–15 seconds.** Under KeyDB, there was no automatic failover — an operator had to intervene manually. In the worst case, a hardware-level hard reboot was required. Now, a $6/month server provides fully automatic recovery.

* * *

## Lessons Learned

The takeaways from this migration are clear.

**Match the tool to the workload.** Caches and queues are throughput-bound — multithreading has real benefits there. But a Pub/Sub broker is different. When a broker freezes, every connected client simultaneously loses real-time functionality. Retries are meaningless — the messages are already lost. For workloads where **stability > performance**, a multithreaded engine with deadlock risk is a liability, not an asset.

**Single-threaded is not a weakness — it's a design decision.** Redis and Valkey are single-threaded not because they gave up on performance, but because they **eliminated the entire bug category of multithreaded deadlocks.** When you need more throughput, add instances. It's safer, more predictable, and the industry standard.

**GitHub Issues don't lie.** I should have checked the Issues tab before choosing the stack. A project where the same bug recurs for five years, the last release was two years ago, and maintainers have stopped responding — putting that on a production critical path is a ticking time bomb.
