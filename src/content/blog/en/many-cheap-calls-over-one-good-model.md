---
title: "Eight Cheap Calls Beat One Good One — Why I Removed the Model That Wrote Better"
description: "I ran both engines on the same topics for ten days. Codex won on a close read of the output, and Codex is the one I deleted. No prompt could push either model past a length ceiling; what broke it was splitting the call, not swapping the model. Once the shape became many short calls, per-call latency decided everything. Grok's quality gap got closed with 4,000 characters of source and a code-level diff of every number."
pubDate: 2026-08-17
tags:
  [
    "llm",
    "benchmark",
    "pipeline",
    "concurrency",
    "grounding",
    "hallucination",
    "cost",
  ]
category: systems
cover: /covers/many-cheap-calls-over-one-good-model.webp
coverAlt: "A diagram comparing one 8,000-character request against eight 1,200-character requests — the left converges near 2,000 characters and peaks at 3,182, the right assembles eight fragments into 8,995"
coverCaption: "Same model. On the left, one request for 8,000 characters. On the right, eight requests for 1,200 each, assembled."
---

In a pipeline that writes blog posts automatically, the step after picking a keyword is deciding who writes. The step before is in [the keyword discovery post](/en/blog/sourcing-keywords-from-search-autocomplete/).

The pipeline I worked on kept two engines in this slot for ten days. Same topics through both, every article read, and Codex won on quality. Ten days later Codex is what I deleted.

Not because the output was bad. A length ceiling held no matter what the prompt asked, and what broke it was splitting the call, not swapping the model. Once the plan became "1,200 characters eight times instead of 8,000 once," the question changed: not which model writes better in one shot, but **which model survives being called eight times.**

---

## 1. The length ceiling

### 1.1 The number that was stuck

A month of published Korean articles, split by engine.

| Engine | Articles | p50   | Longest   | Over 3,500 |
| ------ | -------- | ----- | --------- | ---------- |
| Grok   | 1,485    | 1,784 | **3,182** | **0**      |
| Codex  | 591      | 2,787 | 5,140     | 11         |

Not one of Grok's 1,485 articles cleared 3,500 characters. Raising the prompt from `at least 2,000` to `at least 3,500` moved the p50 from 1,784 to 1,938 — effectively nothing, while Codex went from 2,787 to 5,500 on the same prompt. Pushing the instruction to 8,000 produced results uncorrelated with the number asked for. **The model cannot count what it just wrote.** Wording was not going to fix this, and that is when I started leaning toward a different model.

### 1.2 It wasn't the token cap either

Doubling the output cap (8192 to 16384) and the timeout (90s to 180s) produced 2,528, 2,721, and 2,420 characters. Against an overall median in the 1,900s that reads as a gain, and I read it that way at first. But the three belong to three different blogs with different natural lengths. Compared against **what each blog used to write** — 2,528, 1,960, 1,862 — the first matched to the character and the other two landed inside lengths that blog had already produced. Nothing increased.

### 1.3 Splitting the call removed the ceiling

Instead of 8,000 characters once, I asked for 1,200 several times.

```plaintext
intro call        TITLE / DESCRIPTION + 400-char opening
       ↓
section call × 7  one narrow heading each — "at least 1,200 chars on this subtopic only"
       │          under 900 chars? regenerate that section once
       ↓
FAQ + closing     5 questions + conversational wrap-up
       ↓
assemble → check the publish gate
```

8,995 characters. Eight H2s, gate passed, 14 calls in 136 seconds. With a smaller per-call ask, the habit of converging at 2,000 characters stopped mattering.

The cost is roughly 3x the time. For that trade to work, adding calls has to be cheap — and both engines ran on flat-rate subscriptions, so more calls meant no bigger bill. Time was the only constraint.

Which reframed the choice: the model that writes long in one shot, or the cheap one called many times? Both branches needed measuring under the same conditions.

---

## 2. Measuring them side by side

Three topics through both engines, six articles, same splitting code with only the lane swapped.

### 2.1 Does this material produce a publishable article?

Smooth prose is not the bar. The bar is whether the article can be published given the material it was handed. Sources here ran 657 to 1,208 characters, summary text scraped off search results. I read all six, and **not one is publishable.** They failed for different reasons.

|                          | Grok                                                                                       | Codex                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| When material runs thin  | Recycles what it has. One product price 5 times, brand rankings 4 times, single-row tables | Pads with knowledge outside the source. Reads well           |
| The failures that follow | Invented terms, a typo'd domain, a fabricated institution name                             | Calls one source by a different institution name per section |
| Independent of material  | —                                                                                          | Piles disclaimers and hedges into every paragraph            |

On feel Codex is better. But **the failures differ in kind.** Grok invented because it had nothing to work with; Codex failed on its own habits regardless of what it was given. The first is fixable from outside, the second is not — chapter 4 tests that.

A third layer belonged to neither engine: an identical closing paragraph in all six, exactly one table per section, an "according to" formula throughout. That comes from the assembly template, so swapping engines leaves it untouched.

### 2.2 Speed — one call costs 3.4x

Then five articles started at once, 34 calls per engine.

| Metric                      |      Grok |      Codex |
| --------------------------- | --------: | ---------: |
| **Mean execution per call** | **8.26s** | **27.85s** |
| Wall clock for 5 articles   |     61.9s |     330.2s |
| Throughput                  |  4.85/min |   0.91/min |
| Peak CPU (2-core box)       |    48.57% |    103.14% |

Length went the other way, Codex over 1,000 characters longer per article. H2 counts and FAQs matched on both sides — assembly is deterministic, so the model cannot touch it.

The first row is what matters. **8.26s vs 27.85s per call does not shrink when you raise the concurrency limit.** Parallelism overlaps calls; it does not make one call faster. Split an article into eight and you pay that round trip eight times.

So where does the 3.4x come from? How each engine is invoked turned up something I did not expect.

---

## 3. Why Codex was slow

### 3.1 Both subscriptions, both CLI, both rotating tokens

It is not that one is an API and the other a CLI. **Both are subscriptions, and neither uses a paid API key** — the comment on Grok's image function says so outright.

```ts title="worker/src/llm.ts"
/** Grok(xAI) image generation through OIDC refresh_token auth.json; no API key path. */
```

It calls with the subscription account's OIDC token. Grok was originally invoked through a CLI too, and that path survives as a fallback. The token rotates the same way, so logging in from two places on one account means each refresh invalidates the other. On Codex this blew up: local development and production shared an account, 876 assigned topics died at once, and the failure rate jumped from 4% to 53%.

```plaintext
codex exec exit 1: Failed to refresh token: 401 Unauthorized
"Your refresh token has already been used to generate a new access token"
```

### 3.2 Only Grok had this solved structurally

Same problem, one side already answered: a relay proxy holding the login in exactly one place.

```plaintext
[worker] --POST /v1/chat/completions--> [relay proxy] --adds auth--> [xAI]
  knows nothing about auth               owns login and token refresh
```

One login point means no rotation conflict, and an OpenAI-compatible entrance means the consumer is a single `fetch`. Grok's worker code builds the request itself and finishes in one round trip, spawning nothing. With Codex, a separate `codex` program builds the request and all the worker can do is execute it — so every call pays process creation, sandbox init, and an auth file read, with no reuse.

**The 3.4x from 2.2 is that wrapper.**

### 3.3 The same move was unavailable for Codex

Why not a proxy for Codex? The proxy could turn Grok's calls into `fetch` because xAI exposes an HTTP endpoint that accepts subscription credentials. **The ChatGPT subscription path has no HTTP entrance, and calling over HTTP means paying separately for an API key.** A proxy would still only have `codex exec` to offer; the process cost would just move. (I never built one, so this part is inference.)

Raising the concurrency limit costs different amounts too. Grok only waits for a reply, so five concurrent calls peak at 48.57% CPU; Codex launches programs, so three hit 103.14% on a **2-core box.** And Codex execution was pinned to one process-wide slot to protect the subscription quota, while the textbook fix — add accounts, split the load — was itself the incident path from 3.1.

For balance: `grokChat` has no 429 handling and no backoff, which is why pipeline concurrency still sits at 4 and has never been raised. **Grok's parallel ceiling is untested rather than fine.**

---

## 4. Grok's weakness was closed with material and code

The test 2.1 deferred: is Grok's problem really fixable from outside?

### 4.1 Regenerating with nothing changed but the material

Same topics, same path, source injection added. Instead of search snippets I parsed the body behind each source URL, taking sources from 657 to 3,513 characters and from 1,208 to 14,148.

Grok took the entire benefit. Distinct facts went from 3 to over 10, the repeated price dropped from 5 mentions to 3, single-row tables disappeared, and vague advice became real data like per-size price tables. Every broken token from 2.1 was gone. It even corrected a wrong answer: without sources it claimed a tax exemption applied to ETFs, with sources it correctly separated "ETFs are taxed on total return, only individual bonds are exempt." Given the answer in the source, it does not invent one.

Codex went differently. Hedging and disclaimer spam stayed, and calling one source by several institution names came back. What was already good just got denser. **The prediction in 2.1 held.**

### 4.2 Blocked in code, not in the prompt

"Do not use numbers absent from the source" was already in the prompt, but the results were never diffed against anything — and without a check there is no way to know whether the instruction held.

The first fix was truncation. Even after parsing a long body, the code re-cut each source to 400 characters right before generation, flattening the density. I raised that to **4,000** and made the generation prompt and the numeric check read the same evidence block. Then the diff moved into code.

```plaintext
① pull every number with a unit out of the generated fragment   "48M KRW", "3 years", "0.2%"
② diff against the source body handed to the model
③ one number missing from the source fails that fragment
④ regenerate that fragment once → still missing, do not publish
```

Step ④ is what this buys. Nothing throws away the whole article; only the failing fragment is rebuilt.

This is **string matching, not fact checking.** It asks only whether the characters match, so an annual total computed from a monthly rate gets flagged even when the arithmetic is right. Most flags were real anyway: of 37 flagged numbers, 31 (84%) appeared nowhere in the material. One article wrote `7M KRW` while its material held 92 numbers, among them 23.84M and 20.01M. It reads a table of real transaction prices and writes down a plausible neighbor.

```plaintext
first regeneration   20 unsupported figures detected
                     → still present after fragment retry
                     → whole article blocked

new run              only a result with zero unsupported figures passed
```

The template damage from 2.1 became rules too. Tables appear only with two or more data rows, and the closing paragraph moved out of the body template into its own fragment generated after the references, with the target keyword banned.

| Metric                     | Before |  After |
| -------------------------- | -----: | -----: |
| Target keyword repetitions |     18 | **12** |
| "according to"             |     11 |  **0** |
| Table rows                 |     26 |  **7** |
| Unsupported figures        |      — |  **0** |

What changed was not the wording but where the block sits. A template telling the model to sound plausible became a structure that permits only facts inside the source and has code verify the result. Much of what Codex was better at started coming from the pipeline instead of the model.

---

## 5. What came out, and what stayed

### 5.1 Splitting and a serial lock multiply

Split generation made things worse on the Codex side.

```plaintext
perSection = clamp(600, 1200, budget / N)   ← the 1,200 cap actually binds

With N=4 headings → 3,200 across sections + 800 intro/FAQ ≈ 4,000 chars
```

Codex already writes 5,786 characters in one shot, so the per-section cap acted as a ceiling and the minimum fell from 5,328 to 4,387. Splitting is the right prescription for a low single-shot ceiling and the wrong one for an engine that already writes long.

The bigger problem is where it meets the lock from 3.3. Eight calls per article grabs a one-at-a-time lock eight times, and waiting on it is just an `await`, so the pipeline slot is never released. Grok articles, which have nothing to do with the lock, cannot even start for lack of a slot. 41 articles in 20.2 hours — two per hour.

So engine selection moved into a single config file and Codex came out, 287 lines net removed. Removing an engine is now deleting its name from the config. The first night after, 174 articles started, the failure rate was 11.5%, and **zero died on timeout.**

### 5.2 This structure assumes sources

More material does not stop Grok from inventing where the source does not reach — it still offers expense ratios that appear nowhere and writes self-contradicting table cells. **A many-call strategy only holds if there are sources.** So evidence is bought rather than generated: a search API returns the SERP, and the body behind each source URL is parsed and stored.

```plaintext
① topic collection   1 LLM call
② content plan       2-4 LLM calls + search API      ← the expensive step
③ body generation    8-11 LLM calls. reuses what ② collected
```

③ is cheap because it reuses what ② already paid for. With sources in the plan, the body step never calls the search API, so 8 to 11 calls still cost about 17.2 KRW per article. The place to cap spending was never the body — it was topic generation.

### 5.3 The wins are scattered across both columns

Ten days in one table.

| Axis                       | Grok                                  | Codex                                             |
| -------------------------- | ------------------------------------- | ------------------------------------------------- |
| Length in one shot         | 3,342 - 4,003                         | **5,074 - 5,498**                                 |
| Mean execution per call    | **8.26s**                             | 27.85s                                            |
| Throughput                 | **4.85/min**                          | 0.91/min                                          |
| How it is invoked          | one HTTP `fetch`                      | `codex exec` process launch                       |
| Concurrency                | **barely touches worker CPU**         | pinned to one slot; 103% CPU at three at once     |
| More material              | **improves sharply, corrects errors** | roughly unchanged                                 |
| Material-independent flaws | **none**                              | hedges and disclaimers, inconsistent source names |

The bold cells are scattered across both columns, which is why "which model is better" has no answer. **You get one only after fixing the criterion.**

And this conclusion attaches to **Codex used through a subscription**, not to Codex the model. Rows four and five exist because of the CLI; wire it up as a metered API and those two rows disappear.

So these ten days did not produce a choice of the better model. I measured how much is obtainable only by swapping models, found that **material and a code-level diff were worth more**, and shaped the pipeline around the second one.
