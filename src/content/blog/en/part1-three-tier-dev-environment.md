---
title: "Part 1 — Why We Chose a 96GB VPS Instead of Four 16GB MacBooks"
description: "Four developers hit the limits of 16GB MacBooks, so we moved code, builds, and coding agents to a shared Tokyo VPS. This is where the three-tier setup works, where it compromises, and why e2e should be a separate branch later."
pubDate: 2026-09-16
tags:
  ["ssh", "port-forwarding", "nextjs", "remote-development", "e2e", "devops"]
category: systems
cover: /covers/part1-three-tier-dev-environment-enterprise.svg
coverAlt: "A diagram showing MacBooks connecting through a Tokyo Contabo VPS to the production API and database, with a separate future local e2e branch"
coverCaption: "The current preview path reaches the production API; e2e will be added later as an isolated local stack."
series: shared-dev-machine
seriesOrder: 1
seriesTitle: "Sharing One Machine Among Four People"
---

We started with 16GB MacBooks. As the codebase, build tools, and coding agents grew, memory became the first constraint. Multiple projects and agent sessions made the fans spin and slowed everything else down.

Instead of upgrading four laptops, we rented an affordable Linux server. Code, compilation, and coding agents all run there. Today, four people share one 96GB, 18-core Linux machine.

Each person connects from a MacBook over SSH, the dev server runs on Linux, and the data comes from production. That is a three-tier path. The question is where this is good design and where it becomes a compromise—and why e2e should not be placed on top of this path.

---

## 1. The current structure

We chose a **Contabo VPS**. The goal was not the highest specification; it was to get more shared memory and cores for less than upgrading four 16GB MacBooks. Since we connect from Korea, we chose Tokyo. SSH latency matters, but so does the repeated HMR round trip when checking a browser screen. Keeping the server close makes the interaction feel less remote.

```plaintext
MacBook                     browser only; no dev process or source code
  │ ssh -N -L 3100:127.0.0.1:3100 server
  ▼
Linux VPS                   next dev :3100  ← frontend + BFF
  │ API_BASE=http://127.0.0.1:8787          18 cores / 96GB / agents
  │ wdot-api-tunnel (systemd) — ssh -N -L 8787:127.0.0.1:8987
  ▼
Production server           api :8987 → production DB
```

The MacBook is not merely a “screen tier.” `next dev` includes server components and route handlers, so half of the backend runs on the VPS. The MacBook receives pixels; the browser, development processes, and production data form three separate responsibilities.

---

## 2. Why the first two tiers work

All dev ports bind to loopback:

```plaintext
127.0.0.1:3000
127.0.0.1:3100
127.0.0.1:8787   ← API tunnel
```

There is no externally exposed dev port. The only entrance is SSH, so a missing bind address fails closed instead of exposing a service.

The browser connection is also separate from the running process. Dev servers run in the background, so a broken Wi-Fi connection or a closed laptop does not destroy the build. The tunnel is a window into the process, not the process itself.

The heavy part is on the machine with the headroom. One Next.js dev server grew from 1,259MB to 3,759MB over four hours. Keeping it on the 96GB VPS avoids turning a laptop into a permanent heater, and code, agents, and the dev server see the same files without a sync layer.

---

## 3. The compromise: the third tier is production

The screen connects to the production API. Save, publish, and delete actions change real production data. This matches the original need—seeing the actual data—but avoids the cost of building and seeding a separate database.

The code already acknowledges the danger. A local auth bypass allows only a narrow set of reads and deliberately excludes payment and domain-provisioning routes. But that protection is partial. Other write actions and uploads can still affect production, so the remaining defense is human attention.

OAuth adds another fixed constraint. The callback is registered for `http://localhost:3100/...`; changing the laptop-side forwarding port makes the page load but breaks login with `redirect_uri_mismatch`. A dynamic callback origin would require more provider-side registration. We accepted the fixed port and made the startup script print the constraint.

---

## 4. e2e is a separate branch for later

e2e writes automatically, repeatedly, and without a person watching. Putting Playwright on a path whose last defense is human attention would remove that defense entirely.

It is not a fourth tier. It is a separate, shorter branch:

```plaintext
                 ┌─ next dev :3100 ─▶ tunnel ─▶ production API ─▶ production DB
MacBook ── SSH ──┤                                  (screen preview · now)
                 │
                 └─ next dev :39xx ─▶ local API ─▶ local DB/Redis
                    ▲ Playwright runs here (e2e · later)
```

The e2e branch does not need a MacBook or the production server. Playwright can run headlessly on the VPS, and the local API/database stack never calls production. A separate port and `API_BASE` let the preview and e2e paths run at the same time without touching each other.

The repository already has the shape for `db`, `redis`, and `api`; Docker and a test harness still need to be added. That is intentionally future work. At the current team and service size, stabilizing coding and screen preview is more valuable than setting up e2e first. When the need arrives, we will add the isolated local stack and Playwright separately.

---

## The decision in one table

| Path | Judgment |
| --- | --- |
| MacBook → VPS | ✅ closed, separated, and placed on the stronger machine |
| VPS → production | ⚠️ acceptable for real-data preview, risky for writes |
| e2e | ❌ do not put it on the production path; replace the API/DB branch |

This is not the only possible setup. It works for us because the agents, source code, and dev server need to stay together. Part 2 explains how we split accounts, homes, ports, and shared services when four people started using that VPS.
