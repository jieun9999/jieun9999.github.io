---
title: "Part 1 — Why We Chose a 96GB VPS Instead of Four 16GB MacBooks"
description: "The code lives on the server, the server compiles it, and the MacBook only runs the browser. Once four people started sharing one machine, we had to re-check where this structure is sound and where it is a compromise. Seeing one dev server grow from 1.2GB to 3.7GB in four hours made it clear what belongs on the server."
subtitle: "A dev server that grew from 1.2GB to 3.7GB in 4 hours"
pubDate: 2026-09-15
tags:
  ["ssh", "port-forwarding", "nextjs", "remote-development", "e2e", "devops"]
category: systems
cover: /covers/part1-three-tier-dev-environment-en.webp
coverAlt: "Diagram of a MacBook connecting by SSH to a development server, with the current :3100 app using a :8787 tunnel to production API and DB, and a future :39xx local API, DB, Redis, and Playwright stack inside the development server"
coverCaption: "The current preview path uses the production API, while e2e will later run on a separate local stack."
series: shared-dev-machine
seriesOrder: 1
seriesTitle: "Sharing One Machine Among Four People"
---

We started development on individual 16GB RAM MacBooks, but the limit showed up quickly once the codebase, development tools, and coding agents were running together. As builds got heavier, memory ran short. With multiple projects and coding agents open at the same time, the fans spun up and other work slowed down too.

Instead of continuing to upgrade each MacBook, we rented one inexpensive Linux server. We decided to keep the code there, and to run coding, compilation, and coding agents there as well. Today, four people share one 96GB, 18-core Linux machine.

As more people joined, we had to look at the structure again. Each person connects from a MacBook over SSH, the dev server runs on that Linux machine, and the data comes from production. That makes three tiers.

This post lays out where that is good design, where it becomes a compromise, and why e2e tests should not be placed on top of it.

---

## 1. The current structure

We chose a **Contabo VPS**. The important part was not the highest possible spec. It was getting enough shared memory and CPU cores for less than the cost of upgrading four 16GB MacBooks. Since we connect from Korea, we chose the Tokyo region. The round trip matters not only for SSH, but also for the browser feedback loop during HMR, so keeping the server close to the users keeps the perceived latency low.

```plaintext
MacBook                     browser only; no dev process, no source code
  │ ssh -N -L 3100:127.0.0.1:3100 server
  ▼
Server                      next dev :3100  ← frontend + BFF both here
  │ API_BASE=http://127.0.0.1:8787          18 cores / 96GB / coding agents
  │ wdot-api-tunnel (systemd) — ssh -N -L 8787:127.0.0.1:8987
  ▼
Production server           api :8987 → production DB      ★ production
```

### The MacBook is not a "screen machine"

`next dev` includes Server Components and route handlers. That is the layer I called the admin BFF in the previous post. **Half of the backend runs on the server.** The MacBook runs the browser that renders the UI; the backend processes run on the VPS.

So this is not a two-part split. It is three parts: browser, all development processes, and production data. Once I counted it that way, the third tier was clearly the problem.

---

## 2. Three reasons the first two tiers work

### Closed by default

All dev ports bind only to loopback.

```plaintext
127.0.0.1:3000
127.0.0.1:3100
127.0.0.1:8787   ← API tunnel
```

There are **no dev ports** bound to an external network interface. SSH is the only way in.

That matters a lot on a shared machine. If someone uses the wrong port or forgets a bind address, the result should be "not open," not "open to everyone."

### The viewing path and the running path are separate

The dev server runs under `nohup`, so the server process stays alive even if the SSH connection drops. The tunnel is **only a window**, not the execution path.

If I close the MacBook lid, the compile state stays on the server. When I reconnect, it is still there. If cafe Wi-Fi drops, the build does not disappear.

With a screen-sharing style remote desktop, the interactive work depends much more directly on that connection. In this structure, the server-side work keeps running through connection drops. In daily use, that difference feels bigger than it sounds. I stop thinking about the network as much.

The API tunnel to the third tier applies the same idea one layer down. A systemd service owns that tunnel through a dedicated `nologin` account, not through a person's SSH session. So the tunnel is still up at dawn when no one is connected, and it comes back after a reboot. At first, this depended on **one person's laptop**. Part 2 covers that story.

### The heavy work runs on the stronger machine

I measured the memory of one dev server over time.

```plaintext
05:28   1,259MB
08:1x   2,015MB
09:23   2,741MB
10:00   3,759MB      ← 3x growth over 4 hours
```

**A Next.js dev server grows the longer it stays on.** If that runs on a MacBook, the fans keep spinning and the rest of the machine slows down. The 18-core, 96GB server absorbs that work instead.

The code, agents, and compiler are also in one place, so there is **no sync delay**. That is the decisive difference from putting a file sync tool between a laptop and a server. When a coding agent changes a file, the dev server sees it right there.

There is also only one environment, so "it works on my Mac" is structurally harder to create.

---

## 3. There is a cost

This is not a clean layer separation. There is one leak.

The Google OAuth callback is registered as `http://localhost:3100/...`. If the forwarding port on the laptop changes, the page can still load, but login ends with `redirect_uri_mismatch`.

```plaintext
MacBook :3100  ──ssh──  server :3100
       ▲                    ▲
       └── these two must match ──┘
```

Once the server-side port is fixed, the MacBook-side port is effectively fixed too. The layers leak into each other.

The alternative is to make the callback origin dynamic, but OAuth providers require callback URLs to be registered ahead of time, which means maintaining that registration list. We decided that added more complexity than it removed. Instead, the startup script prints this constraint so no one has to remember it from memory.

---

## 4. The third tier is a compromise, not a fit

The preview UI is **directly connected to the production API**. Save, publish, and delete buttons change real production data.

That matched the original purpose: letting a designer see screens with real data. We can see the real UI without paying the setup cost of a separate database and seed data.

### Open the needed use, block direct editing

Designers and marketers also needed to inspect the real screens and use the API routes required for their own work. But they did not need permission to connect directly to the production DB, query it, or edit data there. So the human-facing path exposes only the allowed API routes, while DB credentials and direct editing authority stay with the development and operations boundary.

That boundary was intentional from the beginning. Screen preview and content work can happen through the API, but direct DB changes and arbitrary production-data edits require different authority. If something goes wrong, the impact can be kept at the API level, and designers or marketers do not need to receive production privileges they do not need for their work.

Still, if the API includes routes that modify production data, using the API can itself be a write operation. High-impact actions such as save, publish, and delete need separate permissions and confirmation steps. Avoiding direct DB access does not remove every write risk.

That boundary is why e2e tests cannot run on the current preview path.

---

## 5. e2e cannot sit on top of this

**e2e writes automatically, repeatedly, and without a person watching.** It creates posts, publishes them, and deletes them.

If we put that on a structure whose last line of defense is human attention, that defense disappears. And when tests fail, they usually run again, so an accident can repeat instead of happening once.

### e2e is not a fourth tier. It is a separate branch for later.

At first I thought of this as adding one more tier. It was not. It does not attach in series. It **branches**, and the e2e branch is shorter.

```plaintext
                         ┌─ next dev :3100 ─▶ 8787 tunnel ─▶ production api ─▶ production DB
MacBook ─ssh─ server ────┤                                 (preview · now)
                         │
                         └─ next dev :39xx ─▶ local api ─▶ local db/redis
                            ▲ Playwright runs here directly (e2e · future)
```

The e2e branch has **no MacBook and no production server**.

- It does not need a MacBook. Playwright runs headlessly inside the server, so no person needs to watch a browser and no SSH tunnel is needed for the test run.
- It does not need the production server. It never calls the production API. Whether the production tunnel is up or down should not matter.

If you count tiers, this is not three tiers. It is two. It starts inside the server, ends inside the server, and never leaves the machine over the network.

### What splits and what stays the same

| Item | Preview (now) | e2e (future) |
| --- | --- | --- |
| Code | Same repo | Same repo (one working directory) |
| Admin port | Per-account assigned port | **Separate number** |
| `API_BASE` | `127.0.0.1:8787` → production | **Local api container** |
| DB | Production | **Local db** |
| MacBook SSH tunnel | Required | **Not required** |
| Production server | Directly connected | **Not touched** |

Because the port and `API_BASE` differ, the two paths do not touch each other even when they run at the same time. One person can preview production-backed screens while e2e runs against a local DB on the same machine. Even with a 3.7GB dev server and three containers, 96GB leaves plenty of room.

### There are really two things to prepare

`docker-compose.yml` already defines `db`, `redis`, and `api`. **The path is designed, but not laid yet.**

1. Install Docker on the server. It is not installed there now.
2. Start only those three services and point `API_BASE` at them.

The second item matters most. If the production tunnel and the e2e stack ever share the same `API_BASE`, that is how accidents happen. They need separate ports, and the e2e side must work regardless of whether the production tunnel is running.

The test DB seed and Playwright harness come after that. Once those two pieces are in place, we have a screen that does not touch production, and from there it becomes ordinary test work.

This is not something we need to do immediately. At the current team and service size, keeping coding and screen preview stable matters more than setting up e2e first. e2e should be **set up later as a separate stack** that does not touch production data. For now, the structure is separated in advance, and when tests become necessary, we can add the local API, DB, Redis, and Playwright path.

---

## Scorecard

| Segment | Judgment |
| --- | --- |
| MacBook → server | ✅ closed, separated path, heavy work on the stronger machine |
| Server → production | ⚠️ a compromise. Good enough for preview, risky for writes |
| e2e | ❌ do not put it on the current path. The third tier must be **swapped out** |

If anything needs to change, it is only the third tier, and only when e2e starts. Coding and preview do not need to change.

This structure is not the only answer. If someone works from a place with a slow connection, every HMR round trip over the network may feel annoying. We chose this side for a simple reason: the coding agents run on the server, so **the code and agents need to live in the same place**.
