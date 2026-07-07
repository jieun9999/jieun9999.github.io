---
title: 'From Short-Term Wins to Long-Term Compounding: A Non-CS Engineer''s Roadmap to Distributed Systems'
description: 'A junior engineer chasing 1–2 year wins works through the compounding mindset of Munger and Buffett, the "evidence vs. certificate" lens, realizes they were already doing distributed systems all along, and designs a learning ladder to MIT 6.824 Raft.'
pubDate: 2026-07-07
tags: ['career', 'learning', 'distributed-systems', 'cs-fundamentals']
category: career
---

> I think I've been chasing **1–2 year wins** for too long. As a result I never looked further or deeper, and I never planned any long-term investment in myself as an engineer. That short-term view was actually **shrinking my opportunities**.

This post is the full record of a brainstorm that started from that realization. A bootcamp-trained, non-CS junior with less than a year of experience, wrestling with one question: *how do I prepare for the long game and eventually reach a global-scale company?* The short answer, it turns out, isn't a flashy jump. It's **quiet compounding**.

## 1. Wisdom from the Sages — Compounding, and Never Interrupting It

### Warren Buffett — Compounding

> "Someone's sitting in the shade today because someone planted a tree a long time ago."

Buffett's real subject was never investing — it was **compounding as a way of thinking**. He reads 500 pages a day and says "knowledge builds up, like compound interest." Skill isn't linear; it's exponential. The gap between year 1 and year 8 isn't "8x experience" — it's a **gap widened by compounding**.

### Charlie Munger — Get a Little Wiser Every Day

> "Spend each day trying to be a little wiser than you were when you woke up. Do your job well. Slug it out one inch at a time, day by day. At the end of the day — if you live long enough — most people get what they deserve."

The key phrase is **"if you live long enough"** — consistency × time. Not a dramatic leap, but the daily derivative.

### Charlie Munger — The First Rule of Compounding

> "The first rule of compounding: never interrupt it unnecessarily."

Change direction every 1–2 years and the compounding **resets**. Short-term-results pressure *is* that interruption.

### Naval Ravikant — The Modern Sage for Engineers

> "Play long-term games with long-term people." / "Wealth is assets that earn while you sleep. Don't sell your time — build leverage."

For an engineer, **code is leverage that works while you sleep.** And "escape competition through authenticity" means: don't drown in competition using the exact same stack as everyone else.

```
  short-term pressure ──▶ narrow vision ──┐
   (1–2 year cycles)                       ├──▶ shrinking opportunity ──┐
             └──▶ compounding interrupted ─┘                            │
                                                                        ▼
                                            [realization] redesign for the long view
```

## 2. Munger's Inversion — "How Do I Guarantee I Never Get There?"

Munger always says: **"Invert, always invert."** Instead of "how do I reach top-tier?", ask **"how do I guarantee I never get there?"** — and the roadmap writes itself.

```
  ❌ Only ever build CRUD        →  ✅ New difficulty in every project
  ❌ Never touch traffic/scale   →  ✅ Manufacture scale experience yourself
  ❌ Assemble without fundamentals →  ✅ CS fundamentals from the ground up
  ❌ Keep postponing English     →  ✅ 30 min/day → native-level interviews in 3 yrs
```

"A company with no traffic" is a common junior weakness. If your job won't give you scale experience, **manufacture it**: open-source contributions, a personal project deployed for real + load testing + monitoring + incident response. That's the only way to compete with people from high-traffic companies.

> [!NOTE]
> **A safety net is what makes long-term thinking possible.** A bit of financial runway is the freedom to step off the short-term treadmill — the *optionality* to take a slightly lower-paying job that teaches you far more. And a long-term life partnership (family, etc.) is exactly Naval's "long-term game with long-term people."

## 3. It's Evidence, Not a Certificate

Here comes the most important shift in perspective.

> **Top-tier companies barely look at "certificates" proving you studied CS.** Online course certificates and nanodegrees earn no points with a senior interviewer.

The only "proof" that counts for them is two things:

1. **Passing their interview** (real-time proof of CS knowledge)
2. **Public artifacts** — not a certificate, but *evidence*

```
  Certificate  "trust me"    ──▷  low signal
  Evidence     "see for yourself"  ══▶  high signal
```

So what you need to build isn't a certificate — it's **evidence**. A certificate says "trust me." Evidence says "see for yourself."

### The Signal Hierarchy

What actually convinces a top-tier engineer, strongest first:

```
  ★★★★★  Things you built from scratch
           Redis data structures / a SQLite clone / a mini shell / a TCP impl
           ⭐ Implementing MIT 6.824 Raft  ← the strongest weapon
  ★★★★☆  A technical blog (evidence of understanding + thinking)  "leverage that works while you sleep"
  ★★★★☆  Open-source contributions (a merged PR = an irrefutable stamp)
  ★★★☆☆  Codeforces rating (a numeric credential that's actually recognized)
  ★★☆☆☆  Certificates (useful only as a curriculum guide. Exception: a real online MS)
```

> **The play: make "GitHub + blog" your diploma.** On your résumé, put a link instead of a certificate:
> `Implemented Raft consensus (MIT 6.824) — [github link]`

## 4. What That "Raft Line" Actually Means

Let's dissect that line word by word.

**`Raft` = a consensus algorithm.** A single server dies and you're done — so you replicate data across several machines. That creates a hard problem: *"even if the network partitions and some machines die, how do I make them all **agree on the same data**?"* Raft is the most famous, most understandable algorithm that solves it (Paxos was so hard that Raft was designed explicitly for "understandable consensus"). Raft handles:

- **Leader election** — pick a leader; re-elect when it dies
- **Log replication** — copy the leader's commands to the rest
- **Safety** — guarantee data stays consistent through failures

This isn't toy knowledge — it runs in the heart of **etcd (the core of Kubernetes), Consul, TiDB, and CockroachDB**.

**`(MIT 6.824)` = MIT's graduate distributed-systems course** (now 6.5840). Lectures, materials, and labs are all free and public, and its famous assignment is "implement Raft from scratch in Go" (notoriously hard). The parenthetical is the *source of trust* — "not just any Raft, but that 6.824 lab, completed."

**`— [github link]` = the link to the evidence.** Not a claim — the actual passing code, verifiable in one click.

> The whole line means: *"I implemented and passed the hard Raft lab from MIT's distributed systems course, and the code is on GitHub — see for yourself."* When a junior from a no-traffic company can put that on a résumé, it's a powerful signal: **"short on production traffic, but able to dig into the fundamentals of distributed systems on their own."**

## 5. The Twist — I Was Already Doing Distributed Systems

Then I took a cold second look at my past blog posts and found something surprising. **Every topic was already distributed systems.** I just hadn't named it.

| Past post | What it actually was |
|-----------|----------------------|
| [A deadlock hiding in AI-generated code — unreadCount → lastReadAt](/en/blog/there-was-a-deadlock-hiding-in-ai-generated-code-how-we-replaced-unreadcount-with-lastreadat/) | **Concurrency control** |
| [A crash-resilient recording pipeline — savepoints, state machine](/en/blog/building-a-crash-resilient-end-to-end-meeting-recording-pipeline-in-the-browser/) | **Durability / crash recovery (WAL, checkpointing)** |
| [KeyDB → Valkey Sentinel HA migration](/en/blog/why-you-should-never-use-keydb-as-a-pub-sub-broker-for-centrifugo/) | **Replication & leader election = the problem Raft solves** |
| [Scaling QPS 10x in production](/en/blog/scaling-qps-10x-in-production-3-strategies-that-actually-move-the-needle/) | **Performance engineering** |

```
  What I did on the job              What it actually is (CS)
  ────────────────────               ────────────────────────
  flush every 5 min (savepoint)  ─▶  checkpointing / WAL
  BullMQ delayed-job state machine ─▶ distributed job scheduling + crash recovery
  Sentinel HA failover           ─▶  replication & leader election  (= Raft!)
  found and fixed a deadlock     ─▶  concurrency theory
```

> [!IMPORTANT]
> **The conclusion inverts.** I'm not "a beginner far from 6.824." I'm someone **already doing distributed systems empirically, but with the underlying theory missing.** That makes me an *ideal* candidate for 6.824. The reason 6.824 is hard is that the concepts feel alien — but I've already touched those concepts in production.

What was actually missing was just three things: **① the Go language ② formal foundations of concurrency ③ the muscle for reading papers.**

## 6. But Shouldn't I Fill In the CS Fundamentals First?

Here a fair doubt arises: "I never took undergrad CS — shouldn't I fill in the foundations systematically first?" Partly, yes. There are two learning philosophies.

- **① Bottom-up (the degree order):** data structures → architecture → OS → networks → distributed systems. Complete but slow, exhausting without motivation, and it repeats what you already know.
- **② Top-down (pull from the goal):** set Raft as the target and pull in fundamentals as needed. Strong motivation, but risk of **gaps**.

> **The answer isn't one or the other — it's deciding what to lay down first vs. what to pull in later.** Not every foundation is equally essential.

Ranking undergrad CS coldly, against a backend/systems goal:

| Field | Priority | Why |
|-------|:---:|-----|
| **Data structures & algorithms** | 🔴 Essential, first | The true base of the pyramid + **the direct filter in top-tier interviews** |
| **Operating systems (OSTEP)** | 🔴 Essential | Concurrency, memory, persistence. The theoretical root of my deadlock/savepoint work |
| **Computer architecture (CSAPP)** | 🟡 Nice to have | Cache, memory, CPU. Not urgent |
| **Networking** | 🟡 Pull in as needed | I already have HTTP/WebSocket intuition |
| **Database internals** | 🟢 Later (via DDIA) | Already used in practice |
| **Discrete math / theory of computation** | ⚪ Skippable | Rarely used in backend/systems. Don't let it scare you |

> The foundation you actually need to fill is **data structures & algorithms + OS — two things.** Not a four-year degree. The rest you pull in, already have, or can skip for now.

**Why put DS&A first?** Because it's two birds with one stone: ① it's the base of everything, and ② it's the hard filter in top-tier interviews (half of Google/Meta interviews). It's "filling foundations" *and* "interview prep" — the time pays back twice.

## 7. The Final Ladder — From Here to Raft

```
                 ┌─────────────────────────────┐
      [peak]     │   6.824 / DDIA (implement Raft) │  ← distributed systems
                 └──────────────▲──────────────┘
                 ┌──────────────┴──────────────┐
      [L3]       │   Networking (pull in as needed) │
                 └──────────────▲──────────────┘
                 ┌──────────────┴──────────────┐
      [L2]       │   OS (OSTEP) + arch (CSAPP)  │  ← theory for my experience
                 └──────────────▲──────────────┘
                 ┌──────────────┴──────────────┐
      [L1]       │  ★ Data structures & algorithms ★ │  ← start here
                 └─────────────────────────────┘

  * I already have "empirical footholds" on L2/L3 (HA failover, crash recovery, QPS).
    So I front-load only L1 (DS&A) and interleave L2/L3 with projects.
```

Tie each rung to **something I've already done**, and it stops being someone else's story.

| 🪜 | Step | Content | Link to my experience |
|----|------|---------|----------------------|
| 0 | Reframe (now, free) | Redefine my blog as **"distributed-systems field notes,"** not "web-dev logs" | Past posts are the evidence |
| 1 | DS&A (2–4 mo, first) | Think in Big-O; implement hash/tree/graph/sort by hand | QPS scaling |
| 2 | OS foundations (4–6 wk) | OSTEP: concurrency (locks, CVs) + persistence (WAL, journaling) | deadlock / savepoint |
| 3 | Networking / RPC feel (2–3 wk, light) | "The network drops; messages are lost, duplicated, delayed. Still be correct?" | WebSocket work |
| 4 | Go (3–4 wk) | goroutines, channels, mutexes. The 6.824 lab language | new |
| 5 | Paper-reading muscle (2–3 wk) | MapReduce → Raft paper. Visuals first | failover = leader election |
| 6 | 6.824 itself (3–5 mo) | Lab 1 MapReduce → **Lab 2 Raft (the goal)** → Lab 3 KV | reuse queue/worker experience |

### Realistic timeline (8–10 hrs/week)

```
  Month: 0   1   2   3   4   5   6   7   8   9  10  11  12
         │──── DS&A (first) ────│
                       │── OS + Go (parallel) ──│
                                 │──── 6.824 Lab 2 Raft ────│
                                                            ▲
                                     "Implemented Raft" line becomes real
```

In **8–12 months** that résumé line becomes true. DS&A isn't wasted — you need it for interviews anyway. Lifelong parallel tracks: **30 min of English a day, open-source contributions, and keep writing the blog.**

## 8. The Resource List

- **DS&A:** *Grokking Algorithms* (gentle) → MIT 6.006 (free OCW) / Tim Roughgarden's *Algorithms Illuminated* → LeetCode (by pattern), Codeforces
- **OS / architecture:** [OSTEP](https://pages.cs.wisc.edu/~remzi/OSTEP/) (free) — Concurrency + Persistence / CSAPP
- **Networking:** Stanford CS144 (early parts) / *Computer Networking: A Top-Down Approach*
- **Go:** A Tour of Go → Go by Example (goroutines, channels, mutexes)
- **Distributed systems:** MapReduce paper → Raft paper → [thesecretlivesofdata.com/raft](http://thesecretlivesofdata.com/raft/) (visual) → [MIT 6.824](https://pdos.csail.mit.edu/6.824/) → later, DDIA
- **Build from scratch:** [Build Your Own X](https://github.com/codecrafters-io/build-your-own-x) / [SQLite-clone tutorial](https://cstack.github.io/db_tutorial/)

## 9. Lines to Keep

> **Get a little wiser every day (Munger), never interrupt the compounding (Munger), build leverage that works while you sleep (Naval), and invert the "no-traffic company" weakness with experience you manufacture yourself (inversion).**

> **What "seeing wide" really means is trusting small daily accumulations over 5- and 10-year horizons. Not a flashy jump — quiet compounding.**

> **Don't collect certificates; manufacture evidence. To a top-tier company, the best diploma is code you built from scratch, sitting on GitHub.**

> **The inferiority of "no degree" is really the absence of a delivery mechanism, not of knowledge. You can buy the contents without the box — and top-tier hiring inspects the contents, not the box.**

## Just One Thing, Right Now

**Open the Persistence part of OSTEP (the crash-consistency chapters) this week.** The savepoint/recovery system I built by hand shows up there as formal, established theory. The moment you feel "what I did by experience was already codified CS," the rest of the ladder stops being scary. That's the first place experience and theory meet.
