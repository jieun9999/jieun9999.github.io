---
title: "From Restarting One Container to Blue-Green Zero-Downtime Deploys — Cutting 100 Seconds of Downtime to Zero"
description: "Every deploy took the whole stack down for 60–100 seconds. The culprit was a single `--force-recreate` with no service names, and the real design question turned out to be what *not* to run two copies of."
pubDate: 2026-07-20
tags:
  [
    "docker-compose",
    "caddy",
    "blue-green",
    "zero-downtime",
    "cloudflare",
    "devops",
    "github-actions",
  ]
category: reliability
cover: /covers/from-restarting-one-container-to-blue-green-zero-downtime-deploys.webp
coverAlt: "A Cloudflare 523 page shown while the origin was unreachable during a deploy"
coverCaption: "The moment the origin disappeared mid-deploy. Cloudflare is Working — only Host is in Error."
---

> [!NOTE]
> Eight deploys went out in 25 minutes, and the service went down on every one of them. The culprit was a single `docker compose up -d --force-recreate` with no service names.

The blog marketing platform I work on at my company runs its entire stack on a single ARM box (2 OCPU / 12GB) under docker compose. When something merges to `main`, GitHub Actions SSHes into the server and runs `git pull → build → up -d`. A very ordinary setup.

Then two of us started merging back to back, and the problem surfaced. **Every deploy took the service down.** This is the record of chasing that down and rebuilding the deploy as blue-green.

---

## 1\. The problem — deploy times and outage times line up exactly

Measurements first. Eight deploys in 25 minutes.

```plaintext
05:34  #142  3m27s  success
05:47  #144  1m34s  success
05:50  #146  1m53s  success
05:51  #147  4m27s  success
05:56  #145  2m18s  success
05:56  #149  3m11s  success   ◀── the 05:58:54 outage happened inside this run
05:58  #148    50s  cancelled ◀── evicted when the next run arrived
05:59  #150  3m41s  success
```

`#148` being cancelled is `cancel-in-progress: false` working as designed. There is exactly one pending slot, so when a third run arrives the queued one gets cancelled. In other words, **deploys were already being silently dropped.**

Then at `05:58:54` the user-facing screens went dark. And something didn't add up: **the static blog went down too, even though it has nothing to do with the app.** On this platform, the blogs served at `{slug}.example.com` never touch the Next.js app — the reverse proxy serves build artifacts directly off disk. There's no reason for an app restart to kill them.

### What died wasn't the app, it was the reverse proxy

The error code was the giveaway. It was **521, not 502**.

| Code    | Meaning                                            | What it implies here               |
| ------- | -------------------------------------------------- | ---------------------------------- |
| 502     | Reached the origin, but the backend is down        | Only the app container is gone     |
| **521** | **Can't even open a TCP connection to the origin** | **Nothing is listening on 80/443** |

Even API paths like `/api/auth/google/start` returned 521. If only the app had died, the proxy would have been alive and answered 502. So what died was not the backend — it was **the entry point (Caddy) itself**.

On this platform Caddy isn't just a router.

```plaintext
example.com          ──► caddy ──► admin:3000     (landing, login)
admin.example.com    ──► caddy ──► admin:3000     (superadmin)
{slug}.example.com   ──► caddy ──► dist/{slug}/   ★ static files. app not involved
custom domains        ──► caddy ──► dist/{slug}/   ★ same
```

**Caddy _is_ the blog web server.** So when Caddy dies, blogs that have nothing to do with the app die with it.

---

## 2\. The cause — one `--force-recreate` with no service names

The entire deploy came down to this one line:

```bash
docker compose -f deploy/compose.yml up -d --remove-orphans --force-recreate
```

**No service names.** In compose that means "everything," and everything in this file was six services.

| Service  | Role                                                 | If recreated                                                    |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `db`     | Postgres (pgvector). sites, posts, schedules         | **First domino.** `depends_on` drags api and admin down with it |
| `redis`  | BullMQ queue (`noeviction` + `appendonly`)           | api and worker block on its healthcheck                         |
| `api`    | Internal API (:8787), not exposed; called by admin   | Even if admin is up, it can't fetch data → 500                  |
| `admin`  | Next.js: landing, onboarding, user admin, superadmin | The only user-facing app. 20–40s gap                            |
| `worker` | Consumes Astro build and scheduled-publish jobs      | Harmless. The queue absorbs it — jobs drain once it's back      |
| `caddy`  | Binds 80/443 + **serves the static blogs**           | **521.** The entry point disappears                             |

On top of that, `--force-recreate` turns off the "only recreate what changed" decision entirely. Normally compose hashes a service's fully-resolved config, stores it on a container label (`com.docker.compose.config-hash`), and compares on the next `up -d` so it recreates **only what differs**. `--force-recreate` skips that comparison — the docs say it plainly: _"Recreate containers even if their configuration and image haven't changed."_

So a deploy that changed one line of app code was **also destroying the database and the reverse proxy.**

### Recreate is not restart

Worth spelling out:

```plaintext
stop  →  rm  →  create  →  start
             ▲
       in this window the container does not exist at all
```

`restart` restarts the process; the container keeps existing. `recreate` deletes it and builds a new one. When Caddy is in that window, **no process is bound to the host's 80/443.** It isn't a firewall drop — the connection is refused outright, and Cloudflare surfaces that as 521.

And `depends_on` stretches this from seconds into minutes.

```plaintext
 0s   db·redis  stop→rm→create→start
10s   ├─ waiting for db healthy (pg boot)
20s   api       stop→rm→create→start
40s   ├─ waiting for api healthy
50s   admin     stop→rm→create→start
90s   caddy     stop→rm→create→start   ◀── the 521 happens only here
```

| Target                            | Down during                        | Roughly         |
| --------------------------------- | ---------------------------------- | --------------- |
| Blog (static)                     | only while caddy is recreated      | **5–10s** (521) |
| Landing / user admin / superadmin | the whole db→api→admin→caddy chain | **60–100s**     |

Five to ten seconds for the blog is short, but it isn't a number you get to ignore. Eight deploys a day means eight chances for a crawler to be handed a 521 — a number that should be zero.

---

## 3\. The design — deciding what _not_ to duplicate

"Blue-green" gets summarized as "run two copies of the app and alternate." In practice, most of the design time went into deciding **where duplication has to stop.**

```plaintext
                    ┌──────────────────────────────┐
   users ─────────► │  router (Caddy/nginx/ALB)     │  ← always alive. switching = config flip
                    └───────┬──────────────┬───────┘
                            │ (active)      │ (standby)
                    ┌───────▼──────┐  ┌────▼─────────┐
                    │  app  BLUE   │  │  app  GREEN  │   ← only the stateless tier
                    └───────┬──────┘  └────┬─────────┘
                            └───────┬───────┘
                          ┌─────────▼─────────┐
                          │  DB / Redis  ×1    │   ← stateful. never duplicated
                          └───────────────────┘
```

**Only the stateless app tier gets duplicated.** Blue-green guarantees zero downtime for _app deploys_. It guarantees nothing about restarting a database.

### ① Anything holding state does not get duplicated

Redis here is a queue, not a cache.

```plaintext
command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes", ...]
```

`noeviction` + `appendonly` is a declaration that this data must never be lost — it holds real work: Astro build jobs, scheduled-publish jobs. Split it in two and you get:

```plaintext
blue-redis  [job A, job B, job C]  ← blue-worker is processing these
green-redis [                   ]  ← empty

flip → green becomes active

green-worker sees an empty queue  →  jobs A/B/C are processed by nobody
the moment you clean up blue-redis →  permanently lost
```

A cache miss just refills itself. A queue can't. **Scheduled posts would quietly vanish, and the user would have no way to know why.**

The database is the product's single source of truth. One `pgdata` volume holds sites, posts, and schedules, so duplicating it means writes that land during the switchover end up on one side or the other, and rolling back throws away everything written in between. Doing it properly needs streaming replication plus failover — which is **an HA setup**, not blue-green deployment. Not the thing you reach for to fix deploy downtime.

There's more shared state beyond db and redis — the `dist` volume (Astro output), OG images, uploads, per-domain proxy config. All of it is written by the worker and read by Caddy, so none of it is splittable either.

| Service   | Two copies? | Why                                                                                    |
| --------- | ----------- | -------------------------------------------------------------------------------------- |
| **admin** | **○ yes**   | The only user-facing path. Downtime here _is_ the outage                               |
| api       | ✕ no        | Not exposed; only admin calls it. Admin can absorb a 20s restart                       |
| worker    | ✕ no        | **The queue absorbs downtime.** Two copies just risks two versions consuming one queue |
| db        | ✕ no        | Single source of truth. Replication is HA territory                                    |
| redis     | ✕ no        | A queue. Splitting it loses jobs                                                       |
| caddy     | ✕ no        | A router is something you **reload**, not restart                                      |

The worker was a lucky case: being queue-based, **it never needed zero downtime in the first place.** While it's down jobs pile up; when it's back they drain.

> [!NOTE]
> "Two copies of admin" doesn't mean two are always running. Normally one is up; they overlap for 1–2 minutes per deploy. On a single 2 OCPU / 12GB box that also runs native arm64 builds, keeping two resident would collide head-on with the build's memory peak.

### ② A router is something you reload, not restart

Taking Caddy out of the recreate set isn't enough on its own, because **something does have to change on every deploy** — proxy config for newly created blogs, plus the blue/green upstream from ③.

Reload is not restart.

```plaintext
   [caddy process — still alive, still holding the socket]
            │
        reload
            │
   ├─ parse and validate the new config
   ├─ validation fails → keep the old config. Nothing happens
   └─ validation passes → activate the new config
            │
       in-flight requests ──► finish on the old config
       new requests       ──► handled by the new config
            │
   [the socket is never released, not for an instant]
```

The port is never empty, so **521 becomes structurally impossible.** And because `caddy validate` runs first, pushing a broken config doesn't take the service down. Recreation is the exact opposite: a bad config means the container won't boot, and that's an outage.

Here's the deflating part. **That reload step was already in the workflow.** An earlier step was force-recreating Caddy, so we had the zero-downtime tool in place and were erasing its effect ourselves.

That said, `caddy validate` only protects you when you're **pushing a new config into an already-running Caddy**. A Caddy that gets recreated and **boots from scratch** is a different story: if the config doesn't even parse, the container fails to start, falls into a restart loop, and 80/443 stays empty the whole time. So there's a second rule:

> **Caddy must always hold a config that parses, no matter when it boots.**

Whether the upstream is actually alive is a separate concern. As long as the config parses, Caddy comes up, the static blogs serve fine, and only the app returns 502. **That is a categorically smaller blast radius than 521.** The deploy script got an `--ensure` step that writes the active-color file if it's missing, and it runs _before_ `up -d`. Caddy's `depends_on: admin` is gone too — that was a path for app recreation to propagate into Caddy.

### ③ Invert the order — kill-then-create becomes create-then-kill

The app-side downtime has a simple cause: recreation kills first and builds second.

```plaintext
  stop      rm      create    start    Next.js boot    healthy
   │         │        │         │          │            │
   ▼         ▼        ▼         ▼          ▼            ▼
[admin alive] ──────── admin does not exist ────────── [admin alive]
                    └────────── 20–40s ──────────┘
                                  ▲
              caddy is alive but has nowhere to send traffic → 502
```

One common misconception is worth clearing up. The Caddyfile already had `dynamic a` in it. It's a good mechanism, but **it solves a different problem.**

| `dynamic a`        | What it does                                                                      |
| ------------------ | --------------------------------------------------------------------------------- |
| Solves             | Follows the new container **even if its IP changes**, within 5s → faster recovery |
| **Does not solve** | The 20–40 seconds where the container **doesn't exist at all**                    |

If there's no target, tracking its IP perfectly still gives you a 502. **With one slot, this is unfixable.** So we invert the order.

```plaintext
before (kill → start)
  [blue alive]────╳────────────[blue' alive]
                 └── down ──┘

blue-green (start → kill)
  [blue alive ───────────────────────]────╳
                  [green warming up ───────────────────]
                                    ▲ switch here
                   the two overlap → no gap
```

The switch is one file. The platform already imported per-domain config files, so we reused the pattern — a single `active/admin.caddy` decides the active color.

```caddy
# the deploy script rewrites only this file
(admin_upstream) {
	reverse_proxy {
		dynamic a { name admin-green  port 3000  refresh 5s  resolvers 127.0.0.11 }
		header_up Host {host}
	}
}
```

Manipulating network aliases would also have worked, but a file plus reload makes **the switch point explicit** and makes rollback as simple as a `git checkout`.

The result is that at every point in the process, at least one admin that can serve requests exists.

```plaintext
t0  blue active, no green      caddy → blue     ✔ can serve
t1  green starts               caddy → blue     ✔ blue keeps serving
t2  green booting Next.js      caddy → blue     ✔ still blue
t3  green passes healthy       caddy → blue     ✔ not switched yet
t4  caddy reload  ◀── switch   caddy → green    ✔ green is already ready
t5  drain 30s (blue kept up)   caddy → green    ✔ blue's in-flight requests finish
t6  blue stopped               caddy → green    ✔ long after the switch
```

The whole thing hinges on **the order of t3 and t4.** Traffic only moves after green reports healthy, so it never lands on something that isn't ready. Two things come along for free:

- **A failure at t3 means no switch.** Blue keeps serving, so a commit with a broken build or boot ships without users noticing. Previously, a broken commit _was_ an outage.
- **At t6 we `stop` but never `rm`.** A stopped container uses no memory, but its config and image are still there, so a `start` plus reload rolls back in 20–30 seconds. **Half the rollback time at zero memory cost.**

The healthcheck needed work too. The old one was `fetch('http://localhost:3000/')`, which goes through the middleware's host branching and doesn't really prove the app can serve — and under blue-green, **this verdict is the traffic-switch condition.** So we added `/api/healthz`, which also verifies api reachability, and registered it as a middleware-public route: if it hits the auth gate, `fetch` follows the `/login` redirect and **misreads a 200 as healthy.**

### The three changes aren't independent

Each fixes a different problem, and dropping any one of them means you don't get to zero.

```plaintext
① exclude stateful services  →  breaks the domino chain   (without it, two admins are pointless)
③ two admin slots            →  covers the swap window    (without it, 20–40s of 502 remains)
② caddy reload               →  creates the switch point  (without it, there's no way to switch)
```

① matters most, because without it the others are wasted. Admin fetches everything through `API_BASE: http://api:8787`. If the db dies, api dies; if api dies, **admin can be perfectly alive and still render 500s.** As long as a deploy touches the database, no amount of blue-green polish helps.

Force-recreating db and redis wasn't removed — it moved to a `workflow_dispatch` input. **The point was to separate "blows up automatically eight times a day" from "done deliberately when needed."**

The final deploy flow:

```plaintext
1. read ACTIVE                  →  TARGET = the other color
2. DB migrate                   →  ⚠ backward-compatible only (§5)
3. build + up  admin-$TARGET    →  --force-recreate --no-deps
4. wait for healthy (max 180s)
   └ fail → clean up TARGET and exit failed. ACTIVE untouched = no user impact
5. rewrite active/admin.caddy to TARGET
6. caddy validate  →  caddy reload      ◀── traffic switch point
7. drain 30s
8. stop the old color (never rm)
9. active/COLOR = TARGET
```

Note that `--force-recreate` **comes back** in step 3. My first instinct was "delete this flag," and that was an inaccurate diagnosis. The flag was never the problem — **the missing target was.** In blue-green you actually _want_ to force-recreate the standby color, so it comes up clean with no leftover state. `--no-deps` is what stops the dependency chain from dragging the database along.

---

## 4\. Bonus debugging — I thought we were at zero, and 12 seconds were still hiding

The switchover window really did measure zero, but 11–14 seconds remained near the start of every deploy. **It reproduced on a deploy that changed zero lines of code** — even though Caddy had been taken out of the recreate set.

The container's `Created` timestamp matched the deploy, so it was a recreation, not a restart. The trigger was the image:

| Point in time     | Image ID       | CreatedAt  |
| ----------------- | -------------- | ---------- |
| **Before** deploy | `a24f5a31f34d` | 2026-07-08 |
| **After** deploy  | `19dc2184f202` | 2026-07-08 |

**`CreatedAt` is unchanged while the ID moved.** `docker compose build` reuses every layer from cache and _still_ mints a fresh image ID, and compose folds that ID into the config hash. So **merely building makes the following `up -d` recreate Caddy.** We'd taken Caddy out of the recreate set, and a build line had quietly opened a side door.

Why it took a full 12 seconds was the other surprise. **Startup was two seconds. Shutdown was the slow part.**

```plaintext
"logger":"http","msg":"servers shutting down with eternal grace period"
```

With no `grace_period` set, the default is **infinite**. Caddy waits forever on the keep-alive connections Cloudflare holds in front of it, until docker's 10-second stop timeout SIGKILLs it. The listeners closed right at SIGTERM, so **those ten seconds are pure dead time that serves nothing but 521s.**

The fix removed the cause — hash `Dockerfile.caddy` on the server and only build when it changed — and added `grace_period 3s` plus `stop_grace_period 5s` as a cushion, capping any unavoidable recreation at 3–5 seconds.

---

## 5\. Results — and the 3–5 seconds that remain

Verification was a one-second loop against all three domains, run throughout the deploy.

```bash
while :; do printf '%s %s\n' "$(date +%T)" \
  "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 https://example.com)"; sleep 1; done
```

35 samples, **zero DOWN.** The more conclusive signal is `docker ps` right after the deploy finishes:

```plaintext
caddy   Up 4 minutes (healthy)
```

**Four minutes of uptime** means the container from the _previous_ deploy passed straight through this one. Had it been recreated, it would read `Up 20 seconds`.

| Metric                            | Before             | After                          |
| --------------------------------- | ------------------ | ------------------------------ |
| Blog                              | 521 · 5–10s        | **0**                          |
| Landing / user admin / superadmin | 502 · 60–100s      | **0**                          |
| Shipping a broken commit          | Outage             | **No impact** (never switches) |
| Rollback                          | Rebuild + redeploy | **One config line, 20–30s**    |

### The price — migrations have to be expand-contract

From the switch until the old color stops, both versions read **the same database at the same time.** So the question isn't "do I split the merge," it's **does this migration break the old version.**

Adding a nullable column is one deploy — the old version doesn't know it exists. Dropping a column, renaming, or applying `NOT NULL` immediately has to split into three deploys: add, switch the code, drop. Old and new overlap for the 30-second drain, so combining an add and a drop in one deploy means blue serves 500s for those 30 seconds. **Zero-downtime machinery doesn't save you: if the schema isn't compatible, you get the downtime anyway.**

Separately, migrations used to run **after** `up -d` — new code querying an unmigrated schema for tens of seconds. Getting away with it was mostly luck, and it moved ahead of the boot in the same pass.

### What's left

A deploy that **genuinely changes** the caddy block in `compose.yml`, `Dockerfile.caddy`, or an environment variable Caddy reads still costs 3–5 seconds. "Rare" is a more accurate word than "solved," and as long as exactly one process holds 80/443, that number is structural.

### Takeaways

- **The zero-downtime tool was already there.** The `caddy reload` step was in the workflow the whole time; an earlier step killed Caddy and erased its effect. Adopting a tool is easier than **creating the conditions under which it actually works.**

- **`--force-recreate` isn't the villain — a missing target is.** Blue-green genuinely wants that flag, scoped to one service alongside `--no-deps`.

- **Downtime only starts shrinking once you start measuring it.** Every number in this post came out of a single one-second `curl` loop. "It blips for a moment" and "11–14 seconds, starting 22 seconds into the deploy" are completely different pieces of information.
