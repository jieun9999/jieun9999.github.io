---
title: "Connecting a Custom Domain with One Click — a Pipeline Built Around 'You Can't Speed Up DNS Propagation'"
description: "I built a feature to buy a domain and attach it to a blog. Bought four with the same code; all four failed differently. One cause: we ignored a wait we can't shorten (DNS propagation) and tried to do everything synchronously. Once we accepted that wait as a given, the pipeline settled into one synchronous stage plus two worker stages."
pubDate: 2026-07-23
tags:
  [
    "dns",
    "cloudflare",
    "caddy",
    "tls",
    "automation",
    "seo",
    "google-search-console",
    "queue",
  ]
category: reliability
cover: /covers/automating-custom-domain-connection-a-delegation-gated-pipeline.webp
coverAlt: "A confirmation modal for buying and attaching a custom domain in the blog admin"
coverCaption: "Behind one buy button: DNS delegation, certificate issuance, and search-engine registration, all automatic."
---

> [!NOTE]
> Click "Buy" and the feature purchases a domain and attaches it to a blog. I thought one click was all it took. Behind it was **a wait we can't shorten with code.**

The blog platform I work on serves each blog on a subdomain like `myblog.example.com`. I built a feature to let users attach their own custom domain — `myblog.shop` — on top of that. The goal: purchase (via Dynadot), DNS, certificate, and search-engine registration, **all done in one click.**

The problem: buying four test domains with the same code, all four failed differently. One showed a parked page for 24 hours. One was up on the server but unreachable for the user. One reported "done" while the site wouldn't open. Some succeeded — but that was luck, not something reproducible.

The cause converged to one thing: **we ignored a wait we can't control and tried to do it all at once.** This is the record of accepting that wait as a given and rebuilding the pipeline.

---

## 1\. The problem — why "instant" is impossible

Attaching a domain is like moving house. Carrying the boxes isn't the end: you file a change of address, get the keys (the certificate), and tell the post office and search engines your new address so mail arrives.

The change of address here is **DNS delegation** — telling the registrar "this domain now points at Cloudflare's nameservers." And that **takes time to propagate across the world's DNS.** Measured:

```plaintext
Domain A   delegation propagation   2 min
Domain B   delegation propagation   13 min
```

Same code, over 6× apart. It's a function of the registrar, the registry, and the internet — **not a number we can shrink in code.**

So the real question isn't "how do we connect faster" but **"how do we hide this wait."** The answer is simple:

- **Finishes in seconds** → do it while the user waits (synchronous)
- **Has to wait** → hand it to a worker; the user can leave the page (asynchronous)

That split — **one synchronous stage plus two worker stages** — is the whole design. Now the stages.

---

## 2\. Stage 1 — immediate setup (synchronous, seconds)

The user is watching a spinner here, so we only do **what's irreversible or finishes in seconds.**

1. **Buy the domain** — re-check the price against what was shown, then charge (Dynadot)
2. **Write the A record** — "this name → our server" in Cloudflare
3. **Delegate (set_ns)** — tell the registrar "look at Cloudflare"
4. **Publish the verification TXT** — just leave the note Google will read later
5. **Enqueue the caddy/build jobs and return**

Two ordering rules were paid for in incidents.

**The A record must come before delegation.** Reverse them and, in the gap after delegation propagates but before the A record exists, Cloudflare authoritatively answers "no such name (NXDOMAIN)." If that answer gets cached in the user's ISP resolver, they **can't reach the domain for up to an hour** even after it's live. Lay the answer down first and the gap disappears.

**set_ns doesn't trust the "done" response.** In the first seconds after purchase the registrar hasn't fully provisioned the domain, so the API returns `success` while **actually changing nothing.** So we read the nameservers back, compare against what we expect, and retry on mismatch.

**GSC only gets the TXT note here — no verification.** At this point delegation hasn't propagated, Google can't see the note, and verification is guaranteed to fail. Why we defer it is Section 4.

Seconds later the screen shows "Connecting," and the rest moves to the worker.

---

## 3\. Stage 2 — waiting for delegation, then opening the door (worker)

This is the core. The worker opens the domain **only after it confirms delegation has propagated.**

```plaintext
caddy-reload job
  │
  ├─ ① Delegation gate ── ask public DNS (1.1.1.1 / 8.8.8.8): "are this domain's nameservers Cloudflare yet?"
  │      not yet → fail the job to retry (no config written)
  │      confirmed → continue
  │
  ├─ ② Write Caddy config → certificate auto-issues → HTTPS is up
  │
  └─ ③ Cleanup (301 from old address · edge cache purge · HTML cache rule)
```

**Gate ① is the heart of the design.** Caddy tries to issue the certificate the moment it receives the config. Attempt that before delegation has propagated and the issuer misidentifies the domain's parent zone and **caches that mistake.** The cache survives until a restart, so once it happens the domain **never opens.** One domain stayed down until I restarted the process because of exactly this.

The gate blocks that outright, with one rule: **don't write config until it's confirmed.** As a side effect, **downtime disappears too.** The config includes an "old address → new address" redirect; previously, while the new domain was dead, the old address redirected to a dead place. With the gate holding, the old address (`myblog.example.com`) keeps serving.

The retry budget is generous: **once a minute, up to six hours.** However slow propagation is, the next attempt passes as soon as it's done, and a waiting job costs nothing, so a large budget is free.

---

## 4\. Stage 3 — moving search-engine registration to the worker (backfill)

The part that took the most work. Google Search Console (GSC) goes **verify ownership → submit sitemap**, and verification is the tricky one.

Verification means Google reads a TXT note left in DNS. But to read it, delegation must have propagated. If it hasn't, Google just gets "no such domain" and refuses. **So right after purchase, GSC registration always fails.** All five test domains failed at purchase time.

We used to retry this for ~18 seconds right after purchase. But propagation takes at least two minutes, so nothing ever finished inside 18 seconds — it was just **18 seconds of the user waiting for nothing.** So we removed it and split the work:

- **Stage 1 (at purchase):** publish the TXT note only. No verify, no submit.
- **Worker (after delegation confirmed):** verify → submit, backfilled in two passes.

Why two passes:

| When                | Role                                                                |
| ------------------- | ------------------------------------------------------------------- |
| Right after gate    | **Normal path.** Register with GSC after the cert issues            |
| Every 30 min (cron) | **Safety net.** Periodically pick up domains the normal path missed |

The safety net matters because the post-gate registration can fail too — the worker was restarting, or Google's API hiccuped. One domain sat unregistered for hours for a reason like this, and I had to run a repair script by hand. A 30-minute cron catches it with no human involved.

The point isn't "try again" — it's **"try at a different moment."** Retrying at the same moment fails for the same reason every time. Once right after the gate, then periodically after — each pass covers a different failure.

---

## 5\. How the UI tracks progress

The screen shows a "Connecting" modal and polls status every five seconds. It **doesn't read a stored state — it re-checks DNS and HTTPS live** each time, because a stored value drifts from reality when the worker dies or propagation wavers.

One more thing: **before completion, we don't render the new domain as a link.** Browsers prefetch DNS for links on the page; link the not-yet-delegated new address and that lookup caches "no such name" in the ISP resolver, locking that user out even after it's live. So during connection we show the **still-live old address** as primary and the new one as plain text.

---

## 6\. Result — from three manual steps to zero

First domain vs. last domain:

| Item           | First attempt          | Last attempt |
| -------------- | ---------------------- | ------------ |
| Duration       | 38 min                 | 11 min       |
| Manual steps   | **3**                  | **0**        |
| Server restart | required               | none         |
| Old address    | redirected to dead end | stays live   |

The biggest fix wasn't code. It was **one setting: making Cloudflare the default nameservers on the registrar account.**

That's what caused the first domain's 24-hour parked page. A domain is born on the registrar's default nameservers (parking), then switches to Cloudflare later — and that brief parked state, once cached in an ISP resolver, lingered for **up to 24 hours.** Set the default to Cloudflare from the start and the parked state never exists.

Every code fix so far had been "reduce exposure after a bad state appears." This one line **kept the bad state from ever forming.** Different in kind, and the largest in effect.

Some waits can't be removed, of course. The **up-to-an-hour gap between "registered" and "live in the registry."** Query the domain during that window and "no such name" caches briefly. DNS has no way to force-clear a cache, so this can't be shrunk — the best you can do is **keep anyone from querying it** during that window, which is why the UI never surfaces the new address early.

---

Four buys with the same code went four different ways because propagation time differed each time. Trying to remove that wait was the mistake; **accepting it as a given** is what settled the design.

The principle is one line: **do nothing before it's confirmed, do everything automatically once it is, and pick up the misses on a schedule.** The delegation gate owns the first clause, the worker's cleanup the second, the 30-minute cron the third.
