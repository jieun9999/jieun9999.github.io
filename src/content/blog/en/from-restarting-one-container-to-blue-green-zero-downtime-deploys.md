---
title: "Taking Caddy Out of the Deploy Path — the Structural Problem Was Touching a SPOF Automatically"
description: "Every deploy took the whole stack down for 60–100 seconds. Blue-green removed most of it, but five seconds stayed at the reverse proxy — and the real cost of those five seconds was not five seconds. It was the variance: five seconds, or indefinitely. So we took it out of the deploy path entirely."
pubDate: 2026-07-20
updatedDate: 2026-07-22
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

The blog marketing platform I work on runs its whole stack on a single ARM box (2 OCPU / 12GB) under docker compose. Merges to `main` trigger GitHub Actions to SSH in and run `git pull → build → up -d` — a very ordinary setup. Then two of us started merging back to back and **every deploy took the service down.** This is the record of chasing that down, rebuilding as blue-green, and finally taking the reverse proxy out of the deploy path.

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

`#148` being cancelled is `cancel-in-progress: false` working as designed: one pending slot, so a third run evicts the queued one. **Deploys were already being silently dropped.**

Then at `05:58:54` the user-facing screens went dark. The odd part: **the static blog went down too, even though it has nothing to do with the app.** The blogs at `{slug}.example.com` never touch the Next.js app — the reverse proxy serves build artifacts directly off disk — so an app restart has no reason to kill them.

### What died wasn't the app, it was the reverse proxy

The error code was the giveaway. It was **521, not 502**.

| Code    | Meaning                                            | What it implies here               |
| ------- | -------------------------------------------------- | ---------------------------------- |
| 502     | Reached the origin, but the backend is down        | Only the app container is gone     |
| **521** | **Can't even open a TCP connection to the origin** | **Nothing is listening on 80/443** |

Even API paths like `/api/auth/google/start` returned 521. Had only the app died, the proxy would have answered 502. What died was **the entry point (Caddy) itself** — and on this platform Caddy isn't just a router.

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

On top of that, `--force-recreate` turns off the "only recreate what changed" decision. Compose normally hashes a service's fully-resolved config onto a container label (`com.docker.compose.config-hash`) and compares on the next `up -d` so it recreates **only what differs**; this flag skips that comparison — the docs say it plainly: _"Recreate containers even if their configuration and image haven't changed."_

So a deploy that changed one line of app code was **also destroying the database and the reverse proxy.**

### Recreate is not restart

Worth spelling out:

```plaintext
stop  →  rm  →  create  →  start
             ▲
       in this window the container does not exist at all
```

`restart` restarts the process; the container keeps existing. `recreate` deletes it and builds a new one. When Caddy is in that window, **no process is bound to the host's 80/443.** The connection is refused outright, and Cloudflare surfaces that as 521.

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

Five to ten seconds is short, but eight deploys a day means eight chances for a crawler to be handed a 521 — a number that should be zero.

---

## 3\. The design — deciding what _not_ to duplicate

"Blue-green" gets summarized as "run two copies and alternate." In practice most of the design time went into deciding **where duplication has to stop.**

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

`noeviction` + `appendonly` declares that this data must never be lost — it holds real work: Astro builds, scheduled publishes. Split it in two and you get:

```plaintext
blue-redis  [job A, job B, job C]  ← blue-worker is processing these
green-redis [                   ]  ← empty

flip → green becomes active

green-worker sees an empty queue  →  jobs A/B/C are processed by nobody
the moment you clean up blue-redis →  permanently lost
```

A cache miss refills itself. A queue can't. **Scheduled posts would quietly vanish, and the user would never know why.**

The database is clearer still. Duplicate it and switchover writes split across both sides; roll back and everything in between is gone. Doing it properly needs streaming replication plus failover — **an HA setup**, not blue-green. Shared state like the `dist` volume is no different.

| Service   | Two copies? | Why                                                                                    |
| --------- | ----------- | -------------------------------------------------------------------------------------- |
| **admin** | **○ yes**   | The only user-facing path. Downtime here _is_ the outage                               |
| api       | ✕ no        | Not exposed; only admin calls it. Admin can absorb a 20s restart                       |
| worker    | ✕ no        | **The queue absorbs downtime.** Two copies just risks two versions consuming one queue |
| db        | ✕ no        | Single source of truth. Replication is HA territory                                    |
| redis     | ✕ no        | A queue. Splitting it loses jobs                                                       |
| caddy     | ✕ no        | A router is something you **reload**, not restart                                      |

The worker is queue-based, so **it never needed zero downtime in the first place.** While it's down jobs pile up; when it's back they drain.

> [!NOTE]
> "Two copies of admin" doesn't mean two are always running. Normally one is up; they overlap for 1–2 minutes per deploy. On a single 2 OCPU / 12GB box that also runs arm64 builds, keeping two resident would collide with the build's memory peak.

### ② A router is something you reload, not restart

Taking Caddy out of the recreate set isn't enough, because **something does change every deploy** — proxy config for new blogs, plus the blue/green upstream from ③. Reload is not restart.

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

The port is never empty, so **521 becomes structurally impossible**, and `caddy validate` runs first so a broken config never takes the service down. Recreation is the opposite: a bad config means the container won't boot.

Here's the deflating part. **That reload step was already in the workflow.** An earlier step force-recreated Caddy, so we had the zero-downtime tool in place and were erasing its effect ourselves.

But `caddy validate` only protects you when **pushing config into an already-running Caddy**. A Caddy that **boots from scratch** is different: if the config doesn't parse, the container never starts, falls into a restart loop, and 80/443 stays empty. Hence a second rule:

> **Caddy must always hold a config that parses, no matter when it boots.**

Whether the upstream is alive is separate. If the config parses, Caddy comes up, the blogs serve, and only the app returns 502 — **a categorically smaller blast radius than 521.** The deploy script got an `--ensure` step that writes the active-color file if missing, running _before_ `up -d`. Caddy's `depends_on: admin` is gone too.

#### Why doesn't Caddy die when the file changes?

Doesn't a config change require rebuilding the container? Compose folds a volume's **mount path** into the config hash, not the **file's contents**.

```plaintext
./active:/etc/caddy/active:ro     →  in the hash    (change the path and it recreates)
blue / green inside admin.caddy   →  not in the hash (rewrite it as often as you like)
```

And a bind mount shares the same file as the host, so the deploy script can rewrite `active/admin.caddy` and compose still concludes "nothing changed." **Everything that changes during normal operation already lives somewhere that needs no recreation.**

Reload doesn't drop connections for the same reason: Caddy **binds the new config's listeners first and only then** tears down the old ones. The create-then-kill ordering we're about to apply to admin in ③, Caddy was already using for its own config swaps.

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

One common misconception is worth clearing up. The Caddyfile already had `dynamic a` in it, but **it solves a different problem.**

| `dynamic a`        | What it does                                                                      |
| ------------------ | --------------------------------------------------------------------------------- |
| Solves             | Follows the new container **even if its IP changes**, within 5s → faster recovery |
| **Does not solve** | The 20–40 seconds where the container **doesn't exist at all**                    |

With no target, tracking its IP perfectly still gives you a 502. **With one slot this is unfixable.** So we invert the order.

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

The switch is one file. We reused the existing per-domain `import` pattern — a single `active/admin.caddy` decides the active color.

```caddy
# the deploy script rewrites only this file
(admin_upstream) {
	reverse_proxy {
		dynamic a { name admin-green  port 3000  refresh 5s  resolvers 127.0.0.11 }
		header_up Host {host}
	}
}
```

At every point in the process, at least one admin that can serve requests exists.

```plaintext
t0  blue active, no green      caddy → blue     ✔ can serve
t1  green starts               caddy → blue     ✔ blue keeps serving
t2  green booting Next.js      caddy → blue     ✔ still blue
t3  green passes healthy       caddy → blue     ✔ not switched yet
t4  caddy reload  ◀── switch   caddy → green    ✔ green is already ready
t5  drain 30s (blue kept up)   caddy → green    ✔ blue's in-flight requests finish
t6  blue stopped               caddy → green    ✔ long after the switch
```

The whole thing hinges on **the order of t3 and t4.** Traffic only moves after green reports healthy, so it never lands on something unready. Two things come along for free:

- **A failure at t3 means no switch.** Blue keeps serving, so a broken commit ships without users noticing. Previously, a broken commit _was_ an outage.
- **At t6 we `stop` but never `rm`.** The config and image are still there, so a `start` plus reload rolls back in 20–30 seconds.

The healthcheck needed work too. The old `fetch('http://localhost:3000/')` goes through the middleware's host branching and doesn't really prove the app can serve — and under blue-green **this verdict is the traffic-switch condition**, so a misread is an outage. We switched to `/api/healthz`, which also verifies api reachability.

### The three changes aren't independent

Drop any one of them and you don't get to zero.

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

Note that `--force-recreate` **comes back** in step 3. My first instinct was "delete this flag," which was an inaccurate diagnosis — the flag was never the problem, **the missing target was.** You _want_ to force-recreate the standby color so it comes up clean, and `--no-deps` stops the dependency chain from dragging the database along.

---

## 4\. Isolation — the real cost of five seconds of downtime wasn't five seconds

That held up for a while, but five seconds remained. On a deploy that changed zero lines of code Caddy still got recreated, and the culprit was the image.

| Point in time     | Image ID       | CreatedAt  |
| ----------------- | -------------- | ---------- |
| **Before** deploy | `a24f5a31f34d` | 2026-07-08 |
| **After** deploy  | `19dc2184f202` | 2026-07-08 |

**`CreatedAt` is unchanged while the ID moved.** `docker compose build` reuses every layer from cache and _still_ mints a fresh image ID, which compose folds into the config hash — so merely building makes the following `up -d` recreate Caddy. We hashed the `Dockerfile` and only built when it changed.

**But that was one trigger.**

The config hash takes more than the image ID — env values, volumes, ports, labels are all inputs. Something like this was still in there:

```plaintext
same server, same files, same moment — two different hashes

  computed without the env var exported   →  cf673c18…
  computed with it (= the live container)  →  a9d8d63e…
```

Values containing spaces get truncated at the first token by compose's `${}` interpolation, so the workflow lifted that value into a shell variable to work around it. Run `docker compose up -d` once without that workaround and **the hash differs and Caddy gets recreated.** The workaround was duplicated in three places.

Every trigger we blocked produced another. That's the signal the approach is wrong.

### Not five seconds — "five seconds, or indefinitely"

Before changing direction I recalculated the cost, finally looking at what happens when a recreation **fails**.

```plaintext
succeeds  →  80/443 empty for 5 seconds  →  521  →  recovered
fails     →  config doesn't parse  →  container never boots
          →  restart: unless-stopped loops forever
          →  80/443 stays empty  →  full outage until a human fixes it
```

We lived through it once: Caddy was recreated while the active-color file was missing, `(admin_upstream)` was undefined, parsing failed, and the container fell into a restart loop. **It was resolved in three minutes because a human noticed in three minutes, not because the system recovered.**

> **The cost of a recreation isn't "five seconds." It's the variance between five seconds and indefinitely.**
> What you manage is not the average. It's the tail.

Framed that way the work changes. Shaving five seconds to four is pointless; the answer is to **reduce how often you're exposed to the tail, and drive the failure probability to zero when you are.**

### From accident to decision

First, Caddy came out of the deploy path.

```bash
# before — a wobble in the hash recreated it silently
docker compose up -d --no-deps db redis api worker caddy

# after — it isn't on the list
docker compose up -d --no-deps db redis api worker
```

Section 3 ② established why that's safe. The only thing this list uniquely covered was **a change to the Caddy block in the compose file itself**, and instead of removing that we turned it into **detection**.

```bash
DESIRED=$(docker compose config --hash caddy | awk '{print $2}')
RUNNING=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.config-hash"}}' caddy)

[ "$DESIRED" != "$RUNNING" ] && echo "::warning::Caddy config changed. The deploy did not touch it."
```

It only reports into the Actions summary; a human opens the actual apply through `workflow_dispatch` — the same policy db and redis already had. `::warning` rather than `::error` is deliberate: blocking unrelated app deploys because the Caddy config drifted is how **people start routing around the workflow.**

### Prove it boots before taking it down

`caddy validate` was already running. The problem was **where**.

```plaintext
before   take Caddy down  →  bring it up  →  validate      ◀── too late
after    validate (throwaway container)  →  take it down only if that passes
```

A validate running inside a living Caddy only protects you when pushing config into a running process. The path that boots a fresh container was unguarded.

```bash
docker run --rm --network none \
  -v "$PWD/caddy:/etc/caddy:ro" \
  --entrypoint caddy "$IMG" \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

`--network none` means it binds no ports and can't collide with the running Caddy. If it fails we never start the recreation, so **user impact is zero.** What made this stronger than expected is that `validate` doesn't just parse — it **provisions modules**. Leaving out the DNS-challenge token surfaced as `API token '' appears invalid`, so **causes of broken certificate issuance** get caught before recreation too.

We also send SIGKILL instead of SIGTERM on the way down, bringing a recreation to 1–2 seconds. Caddy's `grace_period` **closes the listeners first** and then waits, so that wait is **pure dead time serving nothing but 521s.**

> ⚠️ The `grace_period` value itself stayed put. On `reload` the new config binds before the old one goes away, so there's no dead time, and the value does real work as a ceiling on in-flight requests. One setting covers both situations; lowering it only breaks the reload side.

### Know immediately if something touched it

Finally, once a deploy finishes we **assert** that Caddy survived it.

```bash
STARTED=$(docker inspect -f '{{.State.StartedAt}}' caddy)
if [ "$(date -d "$STARTED" +%s)" -gt "$JOB_START_EPOCH" ]; then
  echo "::error::Caddy was recreated during this deploy"
  exit 1
fi
```

A step printing uptime was already there, and its comment was even correct — _"if this resets every deploy, it's being recreated."_ But it **only printed, and nobody compared it.** The regression detector depended on human eyes. Only after adding the assertion did we learn Caddy had been replaced and restarted twice in the preceding two days with no trace in the logs.

---

## 5\. Results

So that an upstream cache couldn't paper over a gap at the origin, verification went **straight at the origin's 443, bypassing Cloudflare**, every 0.5 seconds. **Zero failures.** A probe that quietly dies also reports zero, so we cross-checked against the access log for the same window: **437 requests**. The most conclusive signal is the container itself.

```plaintext
before  Created 03:10:58   StartedAt 05:52:26
after   Created 03:10:58   StartedAt 05:52:26   ◀── same container, not even a restart
```

It wasn't an empty deploy either. In that same run api and worker were recreated and admin switched to green. **A normal deploy, with Caddy isolated from it.**

| Metric                            | Before             | After                            |
| --------------------------------- | ------------------ | -------------------------------- |
| Blog                              | 521 · 5–10s        | **0**                            |
| Landing / user admin / superadmin | 502 · 60–100s      | **0**                            |
| Deploys that change caddy config  | 521 · 5–10s        | **0** (the deploy never touches) |
| When a recreation fails           | Indefinite outage  | **No impact** (never recreates)  |
| Shipping a broken commit          | Outage             | **No impact** (never switches)   |
| Rollback                          | Rebuild + redeploy | **One config line, 20–30s**      |

The fourth row is the point of this work. Five seconds didn't become one second — **the tail got cut off.**

### The price — changing the database gets delicate

Zero downtime works by briefly running two versions at once, so for 30 seconds **the old and new code share one database.** Drop a column while the old code still reads it and you get 500s for 30 seconds. **A schema change has to leave the old code working.**

```plaintext
1st  add the new column and backfill it   (leave the old one alone)
2nd  switch the code to the new column    ◀── nothing reads the old one now
3rd  drop the old column
```

**Zero-downtime machinery doesn't save you from breaking this order.** Changing how we deploy ended up changing how we write code.

---

That the same word "zero-downtime" called for two different prescriptions is what stayed with me longest. Admin is supposed to change on every deploy, so **running two copies and switching between them** is right. Caddy is supposed to not change, so **detecting changes and validating them up front** is right. Both are zero-downtime, and reaching for the same tool for both would have been a mistake.
