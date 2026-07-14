---
crosspost: true
title: '[Threads Marketing Agent, Part 1] Designing a Crawler That Beats Three Tiers of Anti-Bot — From TLS Fingerprints to CDP Detection'
description: 'Part 1 of an engineering log on building a Threads marketing agent: the bottleneck was never LLM generation — it was crawling. Tiering the strategy by which signal the anti-bot actually inspects.'
pubDate: 2026-06-29
tags: ['webscraping', 'crawling', 'cloudflare', 'tls', 'systemdesign', 'anti-bot', 'threads']
category: systems
cover: /covers/designing-a-crawler-that-beats-three-tiers-of-anti-bot-from-tls-fingerprints-to-cdp-detection.webp
coverAlt: 'Designing a Crawler That Beats Three Tiers of Anti-Bot — From TLS Fingerprints to CDP Detection'
series: threads-agent
seriesOrder: 1
seriesTitle: 'Building a Threads Marketing Agent'
---

## TL;DR

In an agent that turns Korean car-community posts into Threads content, **the real bottleneck wasn't LLM generation — it was data acquisition (crawling).** Each target site enforces a different level of anti-bot protection, so no single collection strategy covers them all.

The key insight was to **tier the collection strategy by _which signal the anti-bot inspects_.**

| Tier | Threat signal | Representative site | Where it blocks | Solution adopted | Cost |
| --- | --- | --- | --- | --- | --- |
| **Tier 1** | IP reputation only | Site B, Site C, Site A | — (effectively none) | direct `urllib` request | lowest |
| **Tier 2** | IP + **TLS fingerprint (JA3)** | Site D | curl/requests blocked (430) | residential IP + real headless Chrome; VPS delegates via Tailscale | medium |
| **Tier 3** | \+ **CDP automation detection** | Platform U | every automation browser blocked | userscript inside a human session (Tampermonkey) | high (gives up full automation) |

Regardless of how data is fetched, the output is unified into a single normalized schema, and the caller is shielded from per-site complexity. Below, each tier is laid out as **hypothesis → experiment → conclusion.**

* * *

## 1\. Problem definition — the bottleneck is acquisition, not generation

The popular image of "AI marketing automation" puts the weight on generation (prompt → text). In practice, generation converges fast. What eats your time is securing the input: _what should we write about?_ The raw material lives on third-party communities, and those sites block bots.

Two design principles, both learned in operation, governed this whole layer.

**Principle 1 — an extraction API ≠ a structure crawler.** Early on I used a body-extraction API (e.g. Tavily). For one Site A post: raw HTML 95KB → cleaned output 5KB. Clean, but the tags, post date, and comments (the AJAX payload) were all gone. Our pipeline treats comments as a first-class input — they're central to generation quality — so an extraction API was structurally unfit.

The first fork in tooling, then, is "do I need only body text, or also structure / dynamic content?" The "tidiness" of a cleaning API _is_ information loss.

**Principle 2 — bind the scope of automation to the scale of operation.** The first design auto-discovered material ("hot tags + last N days + multi-candidate queue"). But scraping unvetted posts by volume only increases topic dispersion. Selecting posts whose engagement is already proven is something human judgment does better than a bot's heuristic scoring. So I fixed the premise to **"a human picks the source URL,"** and let the bot focus on extracting structure losslessly from that one URL.

That made the collection engine's single responsibility crisp: **"one human-chosen URL → losslessly normalize {title, body, comments, images}."** It sounds trivial, but per-site HTML structure and anti-bot all differ, so a single implementation is impossible.

* * *

## 2\. Interface design — encapsulating per-site complexity

Even when the strategy diverges per site, the caller must not know about that branching. A single helper (`fetch_source.py`) takes only a URL, dispatches internally, and returns one schema.

```bash
python3 bin/fetch_source.py "<url>"   # site-agnostic → normalized JSON
```

```plaintext
detect_site(url)   # domain → {Site A, Site B, Site C, Site D}
derive_board(url)  # derive board code / post id from the URL (never hard-code)
→ single schema: {ok, site, title, body, images[], comments[{nick,text}], recommend_count, comment_count}
```

> **Design decision — board identifiers are always derived from the URL.** Site C gallery ids, Site B board names, and Site A code/No are all encoded in the URL. Baking them in as constants means a code change for every new board. Regex derivation supports any board on the same site with zero changes — in effect, the open–closed principle applied to the data layer.

Every per-site hell that follows is locked behind this abstraction. The caller's contract is simply "URL in, normalized JSON out."

* * *

## 3\. Tier 1 — direct `urllib` requests (Site B, Site C, Site A)

What these three share: body and comments are server-rendered HTML, and the anti-bot is only at the IP-reputation level. So a direct `urllib` request (with a CookieJar) suffices. The only variables are the comment-collection path and the selectors.

| Site | Body | Comment strategy | Note |
| --- | --- | --- | --- |
| Site B | `post_article` | **inline** (`data-role="autolink"`) | done in a single GET |
| Site C | `write_div` | **AJAX + CSRF-style token** | extract `e_s_n_o` from the view → POST to `/board/comment/` with cookie+Referer → JSON |
| Site A | comment marker → `article-body` priority | **inline, then fallback** | if <3, separate call to `comment_list.php` |

Site C is the trickiest. The `e_s_n_o` token is a one-time value refreshed per view page, so it can't be cached — it forces a two-step dance: "extract token → POST for comments with that token." Site A is scraped via the mobile view with a mobile UA, but "best" posts need special handling: re-parse the real code/No from the inline markup to build the comment endpoint.

**Tier 1 conclusion:** bodies are all server-rendered (no JS execution needed) and there's effectively no anti-bot. The only variable is the comment path. But the fourth site breaks that premise.

* * *

## 4\. Tier 2 — Site D: IP and TLS fingerprint, a double gate ⭐

Site D's body is server-rendered too. The variable is the anti-bot. I narrowed the blocking surface with hypothesis-driven experiments.

### 4.1 Experiment log

```plaintext
hypothesis / attempt                          result
──────────────────────────────────────────────────────
H1: datacenter IP is the problem
  VPS + curl                              →  HTTP 430 (immediate)
H2: residential IP fixes it
  residential IP + curl, cold first call  →  200 (passes!)
  residential IP + curl, subsequent calls →  430 "Site D security system"
H3: header spoofing gets around it
  residential IP + curl + full browser headers + h2 → 430 (no change)
H4: a real browser passes
  residential IP + real headless Chrome   →  200, 112KB, full body + comments
```

H2's cold-pass was a trap. It tempted a hasty generalization — "residential IP means curl can automate this" — but on replay that was a lucky one-off and it converged to 430. The blocking surface was two layers: ① IP reputation (datacenter), ② TLS fingerprint (curl). The decisive clue was H3: perfect header spoofing still failed, meaning the anti-bot inspects the TLS layer beneath, not the L7 headers.

### 4.2 Why header spoofing is futile — the TLS fingerprint (JA3/JA4)

An `https` connection sends a **ClientHello** during the **TLS handshake**, before any real traffic. That ClientHello carries the cipher suites, extensions, elliptic curves, and signature algorithms the client supports — and their order. The key fact: this list and ordering are unique per implementation. curl, Chrome, and Safari each differ. Hashing it gives the **JA3/JA4 fingerprint.**

> The User-Agent is a self-reported application-layer value, freely forgeable. The TLS fingerprint, however, comes from the TLS-stack implementation itself. So even if you spoof the header to Safari, the handshake fingerprint is still curl. The anti-bot flags this mismatch ("UA says Safari but JA3 says curl") as a lying bot and returns 430. Add a behavioral signal (high frequency from one IP) and you get the immediate block right after the cold pass.

In short, L7 spoofing can't fake an L6 fingerprint. Passing requires satisfying _both_ "residential IP (reputation)" and "real browser TLS stack (fingerprint)" at once.

### 4.3 Solution architecture — delegate to a residential node via Tailscale

```plaintext
[VPS / hermes-agent]  (datacenter IP)
   ├─ Site A/Site B/Site C → direct request (Tier 1)
   └─ Site D → delegated call (Tailscale tailnet)
                  │
                  ▼
        [Mac mini fetch service]  (residential IP + real Chrome)
                  │  chrome --headless=new --dump-dom <url>
                  ▼
              site-d.example  → passes IP + TLS fingerprint → 200
```

An always-on Mac mini runs real Chrome headless to clear both gates at once; the VPS delegates to this node **only for Site D** over Tailscale and just receives the result JSON.

> **Rejected alternatives:** ① Routing all VPS traffic through a Tailscale exit node → single point of failure, complex policy routing, latency on all traffic. Selective delegation for Site D only is far lower-coupling. ② `curl-impersonate` (a build that mimics Chrome's JA3) → works, but with a real Chrome available the operational simplicity wins. ③ An extraction API (Tavily) → its servers do the fetching, so IP evasion is moot (you only get a shell).

### 4.4 Trade-off — Chrome CLI vs Playwright

First, a common myth: **Playwright is not what beats the anti-bot.** What passes the TLS fingerprint is "real Chrome," not the driver. Playwright is just a question of _how_ you drive that Chrome.

|  | Adopted: Chrome CLI | Playwright |
| --- | --- | --- |
| Surface | `chrome --headless=new --dump-dom URL` | DevTools-Protocol driver library |
| Capability | single dump of final DOM | click / scroll / wait / network intercept |
| Dependency | none (just Chrome) | runtime + bundled browser |
| Detection surface | real Chrome as-is | bundled Chromium risks `navigator.webdriver` etc. |

Site D posts are server-rendered with title/body/comments all in the initial DOM, so no interaction is needed. A single `--dump-dom` returns 112KB including comments. So I chose the direct CLI: zero dependencies, simple code, minimal detection surface. If dynamic loading (load-more / infinite scroll / login) ever appears, escalating to Playwright then is the rational move. YAGNI.

> **Implementation detail (non-blocking termination):** a fresh-profile Chrome doesn't exit immediately after `--dump-dom` (background tasks), causing a ~45s timeout per request. The fix: stream stdout and kill the process the moment `</html>` appears, clean the profile lock per call, and serialize with a global lock. Response dropped to 3–5s.

**Tier 2's premise:** "we can launch a real browser ourselves." Tier 3 breaks that premise.

* * *

## 5\. Tier 3 — Platform U: the automation browser itself is the detection target ⭐

A separate task required collecting Platform U job data (rate/proposal distribution per keyword = a bidding price dataset). Every Tier-2 weapon was neutralized.

> ℹ️ Platform U collection is a **separate task, unrelated** to this marketing agent's material pipeline. But it presented a **fundamentally different class of anti-bot (detecting automation itself)** and therefore demanded a **completely different crawling paradigm (userscripts)** — so I record it here as the final tier of the threat model.

### 5.1 Failure matrix

```plaintext
attempt                                               result
──────────────────────────────────────────────────────────
curl / requests                                    →  403
public RSS                                         →  410 Gone (deprecated)
Playwright (bundled Chromium)                       →  Cloudflare infinite challenge
  + stealth plugin                                 →  infinite challenge
  + system Chrome (channel:chrome), headed         →  infinite challenge
  + real login profile + cf_clearance cookie       →  infinite challenge
```

The last line is the crux. Even with real Chrome + headed + a valid login session + a passing cookie (cf\_clearance) all present, Cloudflare kept re-challenging. Failure _despite_ satisfying every condition that beat Tier 2 → a signal that the blocking criterion isn't "identity" but something else.

### 5.2 Probable cause — Cloudflare's automation (agency) detection

The probable cause is **runtime detection of automation-control signals**, chiefly **CDP (Chrome DevTools Protocol)** exposure. CDP is the protocol Playwright/Puppeteer/Selenium use to drive a browser externally. In other words, an open CDP session is itself the signal that "this browser is being controlled by code."

Enterprise Cloudflare evaluates TLS, behavior, and automation markers together. Yet H4 (real Chrome + headed + login + cf\_clearance) satisfied every identity/session signal and still got blocked. That narrows the remaining variable to one: the **agency signal — "is this being controlled by automation?"**

> ⚠️ **Limits of proof (in good faith):** I did not run the experiment that _isolates_ CDP as the sole cause (e.g. a CDP-free build as control). Cloudflare uses multiple signals, so other automation markers like `navigator.webdriver` may also have contributed. What I can assert is only this: even satisfying every identity/session signal, an automation-controlled session does not pass.

The depth of the threat signal is one level different — that's the core.

-   **TLS fingerprint (Tier 2):** "who (which implementation) connected" — _identity_
    
-   **Automation detection (Tier 3):** "is this session controlled by code" — _agency_
    

cf\_clearance, real Chrome, and login all satisfy the _identity_ signal, but the _agency_ signal can't be turned off as long as you use an automation tool. → **Practical conclusion: you cannot reliably collect Platform U with Playwright/Selenium-class tools.** It's not about evasion difficulty; the fact of automation _is_ the detection surface.

### 5.3 Paradigm shift — a userscript inside a human session

If what's detected is "a CDP-controlled browser," then run the code inside a browser with no CDP — a session the user opened themselves. That's a **Tampermonkey userscript**: ordinary JS running in the page context, with no CDP connection and no `navigator.webdriver`. From Cloudflare's view there's no automation marker to detect.

```javascript
// ==UserScript==
// @name         Job Harvester → CSV
// @match        https://www.example-platform.com/nx/search/jobs/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
const TARGET_PER_KEYWORD = 200;  // auto-stop once the per-keyword target is hit
const MIN_DELAY = 4500, MAX_DELAY = 8000;  // randomized delay between page turns — avoid behavioral signals
```

Implementation points:

-   **State persistence** — accumulate data in `GM_setValue` so nothing is lost across page transitions (SPA routing). Auto-paging + dedup by job id (`~0...`).
    
-   **Behavioral-signal management** — even a real browser gets flagged on high frequency, so 4.5–8s randomized delays.
    
-   **Tiered data sources** — progressively enrich fields from list cards / the search page's `window.__NUXT__` / the detail page's `__NUXT_DATA__` (Nuxt3 flat array).
    

### 5.4 Decision framework — threat signal → strategy

Generalizing all three tiers into one decision tree:

| Top signal the anti-bot inspects | Where it blocks | Strategy | Automation loss |
| --- | --- | --- | --- |
| IP reputation | datacenter IP | route via residential node | none |
| \+ TLS fingerprint (identity) | curl/requests | **we drive a real browser** | none |
| \+ CDP (agency) | every automation browser | **inject code into a human session (userscript)** | gives up full automation |

> **The core judgment:** if the anti-bot inspects only _identity_, we drive a browser to get through. If it inspects _agency_ (whether it's automated), then the very fact that we drive the browser is grounds for blocking, so the code must be carried inside a human session. The latter trades away full automation to eliminate detection at the root. Designing well _is_ recognizing and choosing that trade-off explicitly.

* * *

## 6\. Data-trust gate — collected ≠ usable

A successful fetch isn't usable yet. A quality gate sits before generation.

**Comments N<3 → DROP (no synthetic fallback).** This is the most important rule. A bot's formulaic "empathy / rebuttal / verification" comment set is too tidy, and that tidiness itself becomes a bot signature. Real community comments are different: an off-topic top reply ("…bought 10 Samsung shares yesterday"), high length variance ("Fighting!!!"), chit-chat chains.

So I use the actually-fetched comments as the source and mimic their tone / length / off-topic distribution. Verbatim copying is banned (author protection). If fewer than 3 sources exist, the post is dropped rather than padded with synthetic fillers.

> A synthetic comment's naturalness comes not from "being well-written" but from "resembling the real thing." The closer you get to an ideal debate structure, the more it reeks of a bot — the goal is to mimic the flaws, not the polish.

Also: a hard-reject filter (death/serious injury, legal disputes, politics, hate), and images are original real photos only (no AI generation — the "🎨 AI image" label is itself a trust cost for a bot).

* * *

## 7\. Retrospective

-   **Threat-model-first design paid off.** Classifying by "what the anti-bot inspects" rather than "how do I scrape" means a new site drops cleanly into a tier via the decision tree.
    
-   **The value of hypothesis-driven debugging.** I once drew a wrong conclusion (curl can automate this), fooled by H2's cold pass. A replay experiment isolated the real cause — the TLS fingerprint. The discipline of not trusting a one-off success is the key.
    
-   **The abstraction boundary.** Locking per-site branching and anti-bot evasion behind `fetch_source` lets the generation pipeline (Part 2) consume one schema, blind to the data's origin.
    
-   **Known limits (honestly):** the Mac mini node is a single point of failure and can't fetch while asleep; Chrome runs serially (3–5s/request), a bottleneck for bulk collection → multi-node / browser-pool is the next task. `--dump-dom` captures only the initial DOM, so exhaustive comment-pagination would require escalating to Playwright.
    

**State reached:** four sites (Site A, Site B, Site C, Site D) collected through a single interface; Site D cut from ~45s to 3–5s via the delegate node; Platform U given a collection path through userscripts in an environment where automation is structurally impossible. Every source unifies into one normalized schema.

Part 2 covers turning this normalized material into community-style content without a bot signature (the iterative generation-skill design), plus scheduled publishing and performance attribution.

* * *

_A build log of a Threads marketing agent (Hermes) in actual operation. Feedback welcome._
