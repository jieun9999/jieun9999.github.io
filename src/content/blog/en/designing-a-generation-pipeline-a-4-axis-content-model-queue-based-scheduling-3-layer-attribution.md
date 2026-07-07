---
title: 'Designing a Generation Pipeline — A 4-Axis Content Model, Queue-Based Scheduling, 3-Layer Attribution'
description: 'An engineering log of building a Threads marketing agent, split into two parts. Part 1: The data-acquisition layer — a crawler designed around an anti-bot threat model (TLS fingerprint · CDP detectio'
pubDate: 2026-06-29
tags: ['threads', 'systemdesign', 'fastapi', 'sqlite', 'datamodeling', 'kpi', 'automation']
category: building
cover: /covers/designing-a-generation-pipeline-a-4-axis-content-model-queue-based-scheduling-3-layer-attribution.png
coverAlt: 'Designing a Generation Pipeline — A 4-Axis Content Model, Queue-Based Scheduling, 3-Layer Attribution'
series: threads-agent
seriesOrder: 2
seriesTitle: 'Building a Threads Marketing Agent'
---
> An engineering log of building a Threads marketing agent, split into two parts.
> 
> -   [**Part 1:** The data-acquisition layer — a crawler designed around an anti-bot threat model (TLS fingerprint · CDP detection)](/en/blog/designing-a-crawler-that-beats-three-tiers-of-anti-bot-from-tls-fingerprints-to-cdp-detection/)
>     
> -   **Part 2 (this post):** The generation pipeline — iterative content-model design, scheduled publishing, performance attribution
>     

* * *

## TL;DR

Part 1 secured posts from arbitrary sites into a single normalized schema (`{title, body, comments[], images[]}`). Part 2 covers three design decisions that wire it into an **operable publish-and-measure pipeline.**

1.  **Content model** — evolved iteratively from a single `content_mode` (different criteria conflated on one axis) into **four orthogonal axes (hook × persona × format × topic)**. The "4 axes" weren't designed up front; they're the result of resolving coupling / separation-of-concerns problems one at a time.
    
2.  **Scheduled publishing** — **rejected SaaS (Buffer etc.) on a build-vs-buy basis** and implemented it with a SQLite queue + a 1-minute cron worker. Idempotency via atomic claim.
    
3.  **Attribution** — measured the clicks and conversions Threads doesn't give you, in **three layers (engagement → click → conversion)**. The hard part wasn't visualization but enforcing double-counting prevention, empty states, and the bot filter at the data-contract level.
    

> Scope note: this is currently a **measurement-infrastructure-first phase.** It's a record of system design and problem-solving; business outcomes (ER/CVR/ROAS) require accumulated samples and are deliberately _not_ claimed here (see §4).

* * *

## 1\. Content model — iterative evolution toward orthogonal axes

The current generation skill defines a post as the product of four axes.

```plaintext
post = hook_engine × persona × format × (topic_tag*)   + voice (community vernacular, enforced)
```

-   **hook\_engine** — the hook angle (why you stop): hot\_take, money\_truth, regret\_story, versus, rank\_bait …
    
-   **persona** — speaker/target: first\_car, young\_budget / purist, tuner, data\_geek …
    
-   **format** — body skeleton (the "vessel"): list\_drip, confession, fill\_in\_blank, one\_line\_thread …
    
-   **topic\_tag** — topic domain: EV, depreciation, options, tuning …
    

This structure wasn't designed in one shot. It went through **five turning points**, each a classic software-design problem (separation of concerns, orthogonality, scope, a missing abstraction).

### Turning point 0 — the root of a wrong abstraction: identity

The initial identity was a "latest-trend car curator." No amount of tone rules stopped the output from regressing to a "tidy news report." The cause wasn't tone — it was the higher abstraction, identity.

> A curator organizes information; an operator designs reactions. Platform algorithms and communities respond not to _organized information_ but to _emotion and engagement_. If the identity is "curator," output structurally converges to "read-and-done." Tone is a dependent variable of identity — without changing identity, no tone rule has force.

The structural flaws of "recency" dependence were big too. Material exhausts fast, differentiation drops to zero, and you end up chained to press releases (de facto PR work). The actual high performers were evergreen hooks (first-car regret, sucker options, "for that money…").

So I redefined the identity as a **"community operator who designs reactions."** Crucially, this didn't discard information — it kept information as the trust base layer. Too much info is boring; too much provocation is backlash. The target is the middle.

In parallel I enforced **separation of concerns between SOUL (identity / invariant constraints) and SKILL (execution procedure).** At the time, image policy, output format, comment composition, and body length were duplicated across both docs, causing real conflicts (comment composition: fixed vs dynamic; length: 6–9 lines vs 5–7 sentences). The rule is simple: numbers/format/procedure live in SKILL as the single source; SOUL holds only "the why and the ceilings." Single source of truth.

### Turning point 1 — anti-pattern diagnosis: four criteria conflated on one axis

The initial four `content_mode`s mixed different classification criteria on a single axis.

| mode | actual classification axis |
| --- | --- |
| `debate_thread` | intent (provoke debate) |
| `buyer_dilemma` | topic (purchase) |
| `rank_bait` | format (listing) |
| `trend_brief` | recency (latest) |

The result was classification collision: one post qualified for multiple modes at once (especially debate vs buyer). Worse, the "speaker (who's talking)" axis was missing entirely, so I couldn't regenerate the same car with just a different speaker. A textbook anti-pattern of cramming multiple concerns into one enum.

### Turning point 2 — orthogonal decomposition: enum → product structure

I decomposed the conflated axis into **three orthogonal axes (hook\_engine × persona × topic\_tag).** Because the axes are independent, combinatorial variety is secured as a product. `debate_thread` was strengthened into `hot_take`; `money_truth` / `regret_story` / `versus` were added; persona was promoted to a first-class input (6 buyer types + 6 enthusiast types); and comments shifted from a fixed 3-persona set to dynamic mapping, where a speaker opposed to the body's axis pushes back.

> **Hidden coupling — schema migration.** The publish-ledger recording script's `validate()` allowed only the old 4 modes, so generating with a new engine killed the record with `SystemExit`. Generation worked, but the input to the learning loop (anti-repeat / performance weighting) was severed. I fully replaced the vocabulary with v2 and normalized the past ledger via an idempotent migration to restore data consistency. A textbook case of a model change entailing a data-layer migration.

### Turning point 3 — scope decision: introducing then retracting auto-discovery (Auto-Pick)

On top of the 3 axes I added Auto-Pick ("simple input → bot auto-selects the axes"). It worked, but I rejected it in operation.

> Auto-discovering the _material_ too increases topic dispersion. A marketing channel must select vetted posts, and that judgment is human intuition > bot heuristics. So I fixed the scope to **"a human picks the source URL"** (same as Part 1's Principle 2) and removed auto-discovery. The bot is responsible only for transformation and variety — a decision binding the scope of automation to the scale of operation.

### Turning point 4 — discovering the missing abstraction: format (the body vessel)

Even with 3 axes, the body kept regressing to article-speak. Digging into why: hook\_engine decides only "why you click (the first line / hook)", and there was no axis to set the body skeleton. So hook\_engine took on that responsibility too and fell into information-listing. The fix was a **fourth axis,** `format`**, to enforce the body skeleton.**

| format | skeleton | number cap |
| --- | --- | --- |
| `list_drip` | TOP/ranking list, one-line quip per item | minimal |
| `owner_stereotype` | "○○ owner type" relatable quips | 0 |
| `one_line_thread` | single group-chat bait, clipped sentences | 0–1 |
| `fill_in_blank` | "you buy \_\_\_, you \_\_\_" vote-baiting | 0 |
| `confession` | first-person regret/brag story | 0–1 |
| `data_brief` | info-summary form — **only on explicit request** | high |

Key: exclude the info-summary form (`data_brief`) from the default and allow it only on explicit request. The default is one of 5 community vessels. The same material becomes a new post by switching the vessel (sales figures → a `list_drip`, not a table).

### voice hard constraints (reject on violation)

Even with the right axes, article-speak sentences mean failure, so the body voice has enforced rules.

1.  **Number cap** — outside `data_brief`, ≤2 key numbers per body (rate-of-change / multi-model number dumps auto-rejected)
    
2.  **First sentence is situation/emotion/provocation** — never open with data
    
3.  **No links in the body** — sources go in comment footnotes only (reason in §2)
    
4.  **No source-community exposure** — banned phrasing like "I saw on Bobaedream…"; rewrite in first person
    

Part 1's **comment N<3 DROP gate** operates here too.

> **Design retrospective:** the 4 axes aren't a top-down design but an emergent structure from sequentially resolving _separation of concerns (TP 1–2) → scope (3) → a missing abstraction (4)_. Each turn began with the observation "without this, it keeps falling into the same failure mode." A content model is a refactoring target, just like code.

* * *

## 2\. Scheduled publishing — build vs buy, and an idempotent worker

> **Decision:** rejected publishing SaaS (Buffer etc.). With a Discord bot, VPS, and SQLite already in place and simple requirements (slot scheduling / auto-publish / Discord integration), a self-built **SQLite queue + 1-minute cron worker** won on both coupling and cost.

### Architecture

```plaintext
Discord: a human drops a source URL
   → generation skill: body + 3 comments + images
   → clarify buttons: [pick topic] [time: 14:23 / 19:47 / 🚀now]
   → threads_enqueue.py: INSERT into publish_queue (status=pending, scheduled_for)
        ┄┄┄ (async boundary) ┄┄┄
   → cron(1m) threads_publish_worker.py:
        atomically claim rows where scheduled_for ≤ now → 'publishing'
        → Threads Graph API publish (carousel ≤10)
        → update published (thread_url, published_at) + Discord notification
```

Design points:

-   **Idempotency** — the worker first locks a due row to `publishing` (atomic UPDATE) before processing. No double-publish even on 1-minute re-entry.
    
-   **Slot-recommendation UX** — so a human doesn't type a time, offer two slots within KST 10:00–24:00 + a "now" three-way choice.
    
-   **Rate limit** — Threads API allows 250/account/24h. The queue drain rate is capped to that.
    

> **The real reason for the no-link-in-body rule (coupled with §1 voice #3):** the performance-collection cron matches metrics to a post by comparing the _published body_ and the _DB-stored body_ character-by-character. A link in the body breaks that match. So the body is pure text and inbound links go entirely into comments (footnotes). It looks like a constraint, but it's intentional coupling for §3 attribution accuracy.

* * *

## 3\. Attribution dashboard — the data contract _is_ the design

> **The hard part wasn't visualization; it was enforcing measurement integrity at the data-contract level.**

### 3.1 Why measure it ourselves — the 3-layer measurement boundary

Threads insights provide only impressions, engagement, and followers. A marketing channel's core question ("did it produce clicks → did they convert?") can only be answered off-platform.

```plaintext
Layer 3 conversion ← quote / topup        [only via PG / quote events]
Layer 2 click      ← go-redirect self-redirect  [not provided by Threads]
Layer 1 engagement ← hourly 6 metrics (views/likes/replies/reposts/quotes/shares)  [Threads API]
```

The boundary is clear. Threads is primarily responsible only up to "impression → profile." After that, **"bio click → landing → conversion" is tracked solely via our own** `cid` **(click id).** The `go.차이사.com/{slug}` redirector records the click and assigns a `cid`, and that value propagates idempotently through 302 → landing cookie → conversion event (`/conv`).

### 3.2 Data-first design — four expert lenses + grounding in real measurements

The design was driven not by intuition but by four parallel perspectives (admin UX / ads-conversion / PM-IA / platform ops) → reconciliation. And every decision was grounded in a real snapshot.

> Snapshot: 44 posts published (1 account), 13 valid clicks, **126 bot clicks (≈90%)**, 0 conversions. → Implication: the data is nearly empty. The MVP's first value isn't analytics but making visible "is the pipe alive + can I trust the bot-90% filter + the bio link isn't applied yet." Learning-style analytics (hook×format heatmaps) are deferred until samples accumulate.

The four key decisions that came out of this grounding:

**(1) Empty state as a first-class state.** With 0 conversions, the screen must not break or mislead. Every widget mandates empty-state copy + a sample-size `n` badge (n<5 yellow, n=0 gray), with the bot ratio always shown. Four empty states are explicitly classified (collecting / under-sampled / empty bucket / not-connected).

**(2) Diagnostic separation of "0 conversions ≠ a bug."** I live-verified the whole path — `/conv` ingestion, token, 302 cid propagation, landing cookie — to confirm the pipe is healthy. Zero POSTs simply means there are no real payments/quotes yet, so the conversion view starts in an "awaiting collection" empty state. The design goal: keep the operator from mistaking an empty screen for an outage.

**(3) Blocking double-counting at the schema.** Summing partner top-ups (`topup`, prepayment) and customer quotes (`quote`, realized revenue) inflates revenue. So I deliberately removed a "total revenue" column from the data contract. Realized revenue=`SUM(quote.value)` and top-up inflow=`SUM(topup.value)` are exposed only as two physically separated rows, with the sum slot left empty in the layout to block addition at the source. ROAS numerator = quote only.

**(4) The bot filter as the default denominator.** At ≈90% bots, click/conversion metrics default to `is_bot=0` (+ ip\_hash×slug 24h dedup). An unattributed-rate badge sits next to CVR so denominator trustworthiness is always visible.

### 3.3 Single data contract (VIEW)

Direct access to source tables is forbidden; everything is a VIEW + compute-at-query to force a single interface. The data is small, so materialization (aggregate tables) is deferred (switch on reaching a threshold). The two-DB join (`clicks.db ⨝ editorial.db`) uses `ATTACH`.

```plaintext
v_funnel_daily (account × audience × day):
  clicks(is_bot=0) | quote_cnt, quote_value | topup_cnt, topup_value | follower_ctr
  ※ a 'total_revenue' column is intentionally absent → blocks summation at the source
age-normalization: ROW_NUMBER() OVER(PARTITION BY short_id ORDER BY ABS(age_hours-24))
                   — no raw cumulative sort (avoids unfair comparison across post ages)
```

### 3.4 Stack right-sizing

| Item | Choice | Rationale |
| --- | --- | --- |
| Placement | add an `/admin/*` router to go-redirect (no separate container) | read-only, no data conflict. separation benefit < complexity |
| Render | FastAPI + Jinja2 SSR | few users · 6 views. an SPA is over-engineering |
| Charts | Chart.js (CDN) | zero build; covers bar/line/scatter/heatmap |
| Aggregation | SQLite VIEW + compute-at-query | small scale; materialization deferred |
| Auth | traefik basicAuth | few operators; zero app-side auth code |
| DB | `mode=ro` + `query_only=ON`, ATTACH | WAL concurrent reads → no conflict with the collector cron's writes |

> **Two load-bearing gotchas:** ① bind-mounting editorial.db as `:ro` makes WAL reads throw `disk I/O error` → fix with an rw mount + read-only at the app connection only. ② go-redirect's `@app.get("/{slug}")` catch-all swallows all paths → `/admin/*` must be declared above it.

**MVP value proposition:** the overview's three widgets — _funnel waterfall (views→clicks→conversions) + bot ratio + freshness_ — convey daily "pipe alive, 90% bots, apply the bio link." Not flashiness; the single signal to watch every day, first.

* * *

## 4\. Operational status — scope and limits (in good faith)

This is a record of a well-designed system, not a system with proven marketing outcomes. It's right to state the two separately.

-   **Current phase = measurement-infrastructure-first.** It's a cold start: 44 posts, <100 followers, 0 conversions. Quantitative business outcomes (ER lift, CVR, ROAS) require accumulated samples and real conversions, which is exactly why §3 deliberately leaves learning analytics and the conversion view "awaiting collection." Not claiming outcomes is the honest stance at this point.
    
-   **There is, however, qualitative evidence of direction.** Content-model changes were driven by operational feedback, not intuition: "bot comments are too tidy / unnatural" → mimic real comments + N<3 DROP; "AI-generated images cause backlash" → real photos only. That is, I iterated toward reducing the bot signature, and recorded the basis for those judgments (off-topic / length-variance of real comments) as data.
    
-   **What's proven vs not:** Proven — pipeline liveness (generate → queue → publish → 3-layer collection end-to-end), measurement integrity (double-counting / bot filter enforced at the schema), inbound real clicks starting after the bio link. Unproven — whether the content actually drives higher engagement/conversion (causation). That's the next phase's task.
    

## 5\. Retrospective

-   **A content model is a refactoring target.** enum conflation (TP1) → orthogonal decomposition (2) → filling a missing abstraction (4) is isomorphic to code refactoring. Tracing "why the same failure mode every time" reveals the missing axis.
    
-   **A model change entails data migration.** The ledger validation logic was a hidden coupling point of the learning loop (TP2). When changing schema/vocabulary, design past-data normalization alongside it.
    
-   **Judge build-vs-buy by coupling.** The decisive reason for queue+cron over publishing SaaS was coupling, not cost (reuse existing Discord/DB/cron, simple via an idempotent worker).
    
-   **Measurement integrity lives in the schema, not the UI.** Double-counting is blocked by "remove the total-revenue column," bot contamination by "default denominator is\_bot=0" — i.e. enforcing it in the data contract prevents screen-level mistakes at the source.
    
-   **Next:** close the self-improvement loop with hook×format learning heatmaps once samples suffice; refine attribution quality (cid capture rate / unattributed rate) once real conversions appear.
    

The one line that runs through both parts: **in bot content, "the smell of automatic generation" is a trust cost.** Part 1 was the anti-bot threat model; Part 2 was content authenticity and measurement integrity. In the end both are the same question — in "a human picks vetted material, the bot transforms it, the system automates publishing and measurement," **where do you draw the boundary?**

> [👈 **Part 1:** "Designing a Crawler That Beats Three Tiers of Anti-Bot — From TLS Fingerprints to CDP Detection"](/en/blog/designing-a-crawler-that-beats-three-tiers-of-anti-bot-from-tls-fingerprints-to-cdp-detection/)

* * *

_A build log of a Threads marketing agent (Hermes) in actual operation. Feedback welcome._
