---
title: "Keyword Discovery: 25 Seconds Down to 3, by Calling Search Autocomplete"
description: "We were mining Naver Q&A threads for keyword fragments and cleaning them up with two LLM calls. Replacing that with Google and Naver autocomplete took a seed from 25.1s to 3.4s and removed the LLM entirely. But Google told people to stop using this endpoint in 2015, so there was something to check before performance."
pubDate: 2026-08-10
tags:
  [
    "autocomplete",
    "keyword-research",
    "seo",
    "reverse-engineering",
    "rrf",
    "caching",
    "rate-limiting",
  ]
category: systems
cover: /covers/sourcing-keywords-from-search-autocomplete.webp
coverAlt: "Admin keyword settings screen showing seven keywords discovered from search autocomplete, each tagged with a Google or Naver source icon"
coverCaption: "Type a seed, hit Fetch, and this list appears about 200ms later. The icon on the right says which search box the phrase came from."
---

The first stage of an automated blog pipeline is deciding what to write about, which in practice means picking keywords. If that stage is slow everything behind it waits, and if it comes back empty there is nothing to build on.

The pipeline I worked on spent 25 seconds per keyword here. Everyone knew it was slow, and the going theory was that Naver's API was the bottleneck. Nobody had measured it.

The theory was wrong, and more importantly the real problem was not speed. This is a writeup of replacing that stage with calls to Google and Naver search autocomplete.

---

## 1\. Why replace it

### Where the 25 seconds went

The old approach worked like this. Pull a large batch of Naver Q&A questions on the topic, mechanically slice two- and three-word fragments out of the titles and bodies, then run those fragments through an LLM twice: once to cluster the similar ones, once to pick which clusters look like something a person would actually search for.

Broken down by stage:

| Stage                                         | Time  | Share |
| --------------------------------------------- | ----- | ----- |
| Acquiring the API rate-limit slot             | 0.1s  | 0.4%  |
| Fetching Q&A questions (5 requests, parallel) | 2.4s  | 9.7%  |
| LLM ① clustering the fragments                | 12.4s | 49%   |
| LLM ② picking searchable phrases              | 7.5s  | 30%   |

The external API finished in 2.4 seconds. **Twenty of the twenty-five seconds were the two LLM calls we had bolted on afterwards.**

### Those LLM calls could not be removed

The tempting conclusion is "drop the LLM, then." That does not work. Slicing question sentences mechanically produces thousands of things that look like this:

```plaintext
"What are the extension terms on a youth jeonse loan?"

  → youth jeonse loan / jeonse loan extension / extension terms on / loan extension / terms on a ...
```

Those are sentence debris, not keywords. Take away the clustering and selection and the method stops working. So the 25 seconds were not waste; manufacturing keywords out of debris genuinely costs that much. We were not doing a fast thing slowly, we were doing a slow thing.

Once that was clear, it followed that optimization was not going to get us anywhere.

### And sometimes it returned nothing at all

To produce 19 keywords it read 24,558 questions and yielded 149 keywords. Roughly 0.6 keywords per hundred questions read.

A low yield is inherent to the approach. The problem was the cases where the yield was zero.

```plaintext
query: "Seoul real estate Lee Jae-myung"

  Q&A mining    read 1,000+ questions · 19.9s · 0 results
  autocomplete  read nothing          ·  0.2s · 4 results
```

If few people have asked about a topic, no phrasing repeats often enough to survive, and then there is nothing to cluster and nothing to select. Across 43 production runs the average was 1,116 questions read for 5 keywords.

**A slow answer you can wait for; this one never arrives.** That, not the 25 seconds, is what actually forced the change.

Autocomplete has the opposite property. What it returns is by definition a phrase someone typed into a search box, so if anyone searched for it, it shows up. Nothing is being manufactured, so there is no manufacturing cost to pay.

```plaintext
Q&A mining    question text → slice → LLM cluster → LLM select → keyword
autocomplete  (already a keyword)
```

---

## 2\. Where those phrases live

Type into a search box and the browser fires one request per keystroke. Typing a two-word Korean query looks like this:

```plaintext
keystroke 1   q='여'            → 연금        (pension)
keystroke 3   q='여드름'        → 여드름 흉터  (acne scars)
keystroke 6   q='여드름 흉터'   → 여드름 흉터 없애는법  (how to remove acne scars)

6 characters = 6 requests, 1.2 seconds
```

The request we want to send is identical to those. The only difference is timing.

The absence of authentication is not surprising either. Autocomplete has to work before login, before a session exists, at the moment the first character lands. There is structurally nowhere to put an auth check, and any key shipped to the browser is visible to everyone anyway, so there is no secret to plant.

### 2.1 Google did tell people to stop using it in 2015

That does not make it a free-for-all. Google posted a notice on 24 July 2015 and cut off third-party access on 10 August. The reasoning:

> We built autocomplete as a complement to Search, and never intended that it would exist disconnected from the purpose of anticipating user search queries. The content of our automatic completions are optimized and intended to be used in conjunction with web search results, and outside of the context of a web search don't provide a meaningful user benefit.

The same notice contains this line:

> Using an unsupported, unpublished API also carries the risk that the API will stop being available. This is one of those situations.

Naver never published an official API to begin with.

And yet the endpoint still answers, eleven years later. I hit it directly on 10 August 2026:

```plaintext
GET /complete/search?client=chrome&hl=ko&gl=kr&oe=utf-8&q=여드름

  200 · text/javascript; charset=UTF-8 · 258ms · 15 items
  ["여드름", ["여드름 흉터","여드름 패치","여드름 약", ...]]
```

Google never promised to keep it open. That it responds today is something I observed, not a guarantee, and the warning above still stands. Better to accept it than argue with it.

So sections 3 and 4 are built to survive the thing disappearing, and section 5 is where I checked whether it belonged in production at all.

---

## 3\. Fetching

### 3.1 Choosing parameters took longer than expected

The first rule needed was about what goes into `q`. We take what the user typed, truncated to the first three words.

Short seeds make Google treat the input as a character prefix rather than a word, and the results wander off. Seeding `이사` (moving house) returns `이상형 월드컵` (ideal-type tournament), `이상민`, `이상해씨` — fifteen results, all unrelated. Naver handled the same seed correctly with `포장이사` and `이사짐센터`, so this is a Google-side behaviour rather than a general problem. Long seeds fail the other way: they sit at the leaves of the suggestion tree and the candidate count collapses. `여드름 종류` (types of acne) returned six.

For Google's `client` parameter I called all four variants before settling on `chrome`. It returns the most suggestions (15), it is the only one that includes relevance scores, and parsing is a single `JSON.parse`. `youtube` and `gws-wiz` need JSONP unwrapping, and the latter also needs `<b>` tags stripped. The fact that the shape differs this much per client is the point: these are internal formats tuned per product, not a public contract.

`oe=utf-8` is not optional. Without it the response comes back latin-1 encoded and every Korean character is mangled — but the status is 200 and the JSON structure is intact, so parsing succeeds and only the contents are garbage. Nothing in the logs tells you.

On the Naver side: `st=100` (integrated search), `ans=1` (include the instant-answer block), `rev=4` (per-item instant-answer flag). The real search box adds `frm`, `r_enc`, `run` and others; dropping them changed nothing.

Which leaves two lines:

```plaintext
GET google.com/complete/search?client=chrome&hl=ko&gl=kr&oe=utf-8&q=…
GET ac.search.naver.com/nx/ac?q=…&st=100&r_format=json&ans=1&rev=4
```

### 3.2 Parsing

Google's response is an array of arrays. Slot `[1]` holds the suggestions, and the metadata object carrying `google:suggestrelevance` sits somewhere near the end.

```ts title="packages/keyword-demand/src/autocomplete.ts"
// The metadata index varies by client (4 for chrome, 3 for firefox). Find the dict from the back.
const meta = [...parsed]
  .reverse()
  .find(
    (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value),
  );
```

The index is not hardcoded because chrome puts it fourth and firefox third. We only use chrome, so `parsed[4]` would work today — right up until Google inserts one more element into that array, at which point the scores silently stop being read. This is the first place the premise from 2.1 shows up as code.

Naver is much simpler: `items[0]` is the list and each element is `[text, instantAnswerFlag]`. The response is always UTF-8, so none of the encoding traps apply.

Both parsers converge on the same shape:

```ts
interface SuggestItem {
  keyword: string;
  /** Position in that engine's response, 1-based. The only input to the merge. */
  rank: number;
  relevance?: number;
  instantAnswer?: boolean;
}
```

`rank` is response order, untouched. It is the only signal the merge in section 4 has to work with, so reordering here would throw off everything downstream.

### 3.3 Do not treat 200 as success

A normal API returns 4xx or 5xx when something is wrong, and `try/catch` handles it. But **this endpoint has no contract with us, so it has no obligation to return an error code either.**

What actually arrives:

```plaintext
expected                      actual
─────────────────────────    ─────────────────────────────────────
429 Too Many Requests    →   302 → google.com/sorry/index (captcha page)
                             200 OK + content-type: text/html
```

`fetch` follows redirects by default, so even a captcha bounce lands in your hands as a 200 OK. `if (!response.ok) throw` will never fire.

The next part is the annoying one, because this is how the code naturally gets written:

```ts
try {
  return JSON.parse(body).suggestions;
} catch {
  return []; // parse failed → empty list
}
```

`JSON.parse` chokes on the HTML, `catch` hands back an empty array, and everything carries on as if nothing happened. The logs record "0 results for this keyword."

Except zero is already a legitimate outcome in this pipeline. Naver honestly returns an empty array for combinations nobody searches for. That is not a fault; it is a free verdict that the phrase has no demand behind it.

So the thing that has to be separated is not the result but the cause:

```plaintext
        result: 0
          ├── we were blocked     → must know immediately, must fall back
          └── nobody searches it  → normal, and worth recording
```

Conflate them and a block gets filed as "nobody searches for this," after which the cache in 4.3 freezes that lie for seven days and the seed finds nothing for a week. Which would be us reproducing, by hand, the exact symptom section 1 set out to get rid of.

Hence three checks:

```plaintext
① does response.url contain '/sorry'
     fetch already followed the redirect, so the only trace of a captcha bounce is the final URL
② is content-type text/html
     a page arrived where JSON belongs, i.e. something decided to treat us as a human
③ is it the content-type we expect
     text/javascript for Google, application/json for Naver. Otherwise it is something unknown

only then do we reach JSON.parse
```

```ts title="packages/keyword-demand/src/autocomplete.ts"
function assertNotBlocked(
  engine: SuggestEngine,
  response: Response,
  expectedType: string,
): void {
  if (response.url && response.url.includes("/sorry")) {
    throw new SuggestBlockedError(
      engine,
      "Redirected to captcha.",
      response.url,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new SuggestBlockedError(engine, "Response was HTML.", contentType);
  }
  if (!contentType.includes(expectedType)) {
    throw new SuggestBlockedError(
      engine,
      "Unexpected response type.",
      contentType,
    );
  }
}
```

The checks come before parsing because afterwards the distinction is gone. Once `JSON.parse` has thrown, a block, a format change and a genuinely empty response are all the same `SyntaxError`. Split them up front and each becomes its own exception, which is what makes alerting possible.

Back to 2.1: when the day Google warned about arrives, these three lines are what notices. A system that quietly accumulates zeros will not know the API is gone.

### 3.4 Both engines at once

The call is `Promise.allSettled`, not `Promise.all` — there is no reason for one engine failing to take down the other. Timeouts are deliberately asymmetric:

```plaintext
Google   300ms   (measured p50 185ms · p95 215ms)
Naver     10s    (measured p50  24ms · p95  30ms)
```

Naver answers in 24ms; killing that alongside a 190ms straggler is a bad trade. Sequentially the pair costs 200ms and in parallel 183ms, so the saving itself is 17ms. The reason to go parallel is the other case: when Google is slow or down, Naver's answer is still there 20ms in. Only a double failure counts as a failure.

---

## 4\. Merging

### 4.1 No usable scores, so rank only

The original plan was to sort the combined list by Google's `suggestrelevance`. Looking at the actual values killed that:

```plaintext
14 of 16 keywords: the score spread below rank 4 was within 60
score frequency: 601(19×) 600(19×) 550(19×) 551(18×) 554(16×) ...
```

The same 550-to-601 band repeats across nearly every keyword. It is rank stamped into a score-shaped field, not a measure of intensity, and only the top three carry any discrimination. Naver has no scores at all. There was no shared yardstick.

So the merge uses positions only:

```plaintext
score(keyword) = Σ  w / (K + rank in that engine)        K = 10, w = 1
               engines
```

The appeal of this form is that overlap handling comes for free. A keyword present in both lists gets two terms and rises on its own; no separate "boost the overlap" branch is needed. Keywords from a single engine line up by their position in that engine, so the two lists interleave like a zipper.

Whether that ordering was actually right is checkable, and the data supports it. The 43 overlapping items already ranked high on both sides:

```plaintext
mean rank within Google  6.6   (vs 8.0 overall)
mean rank within Naver   4.8   (well above)
```

Two independent search logs pushing the same phrase upward is about the strongest demand signal available here.

Applied, it looks like this:

```plaintext
생리통 (menstrual cramps)
 1. ■ 생리통 약           0.1742      ■ = both
 2. ■ 생리통 심할때        0.1742      G = Google only
 3. ■ 생리통 완화          0.1394      N = Naver only
 ...
 7. G 생리통 줄이는법       0.0714
 8. N 생리통 완화 음식      0.0714      ← slots in level with Google's #7
 9. G 생리통 약 순위        0.0667
```

Weights stay at 1:1. Google returns roughly twice as many suggestions (12.8 vs 6.4 on average), but volume is not quality: 12.7% of Google's results carry community-forum suffixes, so weighting Google up drags the noise up with it.

Merging at all was a requirement rather than a nicety. Per-query Jaccard overlap sits between 9% and 11%, and 6 of 19 keywords had no overlap whatsoever. For one query Naver returned 1 suggestion and Google 8, with nothing in common. The two engines are not substitutes for each other; they are two different logs.

### 4.2 A dictionary instead of an LLM

One layer of rules sits on top of the merge, all pure functions — no network, no environment.

Whitespace normalization comes first. Naver prefers compound spellings, Google prefers spaced ones, and merging without normalizing stores the same keyword twice and miscounts the overlap. Measured overlap moved from 10% to 12% once normalization was in.

Community-forum suffixes (the Korean equivalents of "reddit", "wiki", and a handful of large local boards) are removed rather than demoted. Nobody is going to write an article targeting "acne scars reddit", so it is not a ranking question. No LLM judgement here: the set is finite and well known, and a dictionary is deterministic, free, and testable.

It does have to match on word boundaries though. Substring matching took out legitimate keywords — the short form for one board is a substring of the Korean word for "Galaxy", another collides with two common place and legal terms. Short entries only apply when they stand alone as the final word. Removed keywords get logged, because recovering from a bad dictionary entry later requires knowing what it ate.

Sorting is by score, then Google rank, then lexicographic. Same input, same output, or nothing is reproducible.

### 4.3 The cache is not there for speed

Results are kept for seven days. Autocomplete barely moves day to day, so that is a safe window.

The speed win is incidental. The real reason connects to 5.3, but in short: if repeated discovery never produces an outbound call, there is no such thing as sustained traffic to detect.

Three rules attached to it:

- Empty results are never stored. Freezing an empty array that came from a transient failure would leave that seed finding nothing for a week. The distinction drawn in 3.3 shows up again here.
- Stored values carry a schema version. Change the parser, bump the number, and old rows fall out of lookups on their own — no `DELETE` pass, and a rollback makes them valid again. It is an invalidation lever built in advance of the day the response shape changes.
- A cache failure is not a discovery failure. Both read and write paths are wrapped in `catch`, so a wobbling database still leaves discovery hitting the API directly.

---

## 5\. Does it belong in production

### 5.1 One question left

Sections 3 and 4 established that it was fast and free. What remained was whether an undocumented endpoint with no terms-of-service blessing should be wired into production permanently.

"It'll probably be fine" was not an acceptable basis. If it was going to get blocked, I wanted to see when and how first. So I ran load against it before adopting anything.

### 5.2 Deliberately shaped to look like a bot

Run from a server in Chuncheon — a datacenter IP.

| Item                          | Result                                          |
| ----------------------------- | ----------------------------------------------- |
| Total requests                | 914 (Naver 457 / Google 457)                    |
| Conditions                    | uniform 2s interval · browser UA · full queries |
| Abnormal responses            | 0                                               |
| `/sorry` captcha redirects    | 0                                               |
| HTML responses (block signal) | 0                                               |
| Latency degradation           | none                                            |

Splitting the run into halves showed no drift:

```plaintext
Naver    first half  mean 24ms  p50 23  p95 31     second half  mean 23ms  p50 24  p95 30
Google   first half  mean185ms  p50 185 p95 214    second half  mean187ms  p50 186 p95 216
```

Separately, 700 requests at up to 125 req/s from a local machine produced zero 429s.

The conditions were chosen on purpose. Datacenter IP, exactly uniform 2.000s spacing, and fully-formed queries whose prefix never grows — none of which a human typing can produce. This was the easiest possible shape to flag, and nothing happened.

### 5.3 Why it did not get blocked

The per-keystroke design is what makes this work.

Behind an office NAT or a carrier-grade NAT, a single public IP legitimately produces hundreds of requests per second. One office at lunchtime looks exactly like that. Rate-limiting per IP per second kills real users first, so that axis was never going to catch us in the first place.

Real blocking looks at patterns, not rates:

```plaintext
┌──────────────────────────────┬──────────────────────────────────┐
│ looks like typing            │ looks like a bot                 │
├──────────────────────────────┼──────────────────────────────────┤
│ prefix grows one char at a time │ complete queries, over and over │
│ irregular gaps               │ exactly 2.000s apart             │
│ normal UA and Accept headers │ no UA                            │
│ residential or mobile IP     │ datacenter IP                    │
│ busy by day, quiet at night  │ flat for 24 hours                │
└──────────────────────────────┴──────────────────────────────────┘
```

The cache in 4.3 is aimed at the last row on the right. It is not a rate-limit measure; it exists so that "flat for 24 hours" never becomes true of us. If repeated discovery produces no outbound calls, there is no traffic to fit that description.

Sending a browser UA is the same idea. Naver returns 200 without one, but there is no reason to volunteer another row from the right-hand column.

### 5.4 Adopted, with the guards left in

Nothing in the PoC suggested we were being blocked, so it went into production and that is the path running today.

| Axis   | Result                                                                       |
| ------ | ---------------------------------------------------------------------------- |
| Speed  | 25.1s → 3.4s per seed. The two LLM calls holding 79% of the latency are gone |
| Volume | 7.8 → 17.2 keywords. Autocomplete led in 18 of 19 test keywords              |
| Cost   | no auth, no quota, nothing billed per call                                   |

What has been verified is "it is not blocked right now," and no further. That is why neither the three checks from 3.3 nor the cache from 4.3 were removed after the load test came back clean. **Never having seen it blocked does not mean the defences are unnecessary; it means they have not been tested yet.**

The remaining gaps, stated plainly:

- Search volume was never validated. I counted how many keywords came out, not whether anyone searches them. In principle autocomplete has the advantage here, since its output is by definition a query somebody typed — but that was not confirmed against this dataset.
- Load testing stopped at 914 requests against a target of 2,000, and nothing ran for longer than a day.
- `K=10` was chosen by eye across 19 keywords. It has not been tuned.

Coming back to 2.1, most of the decisions in this writeup trace to that single sentence:

```plaintext
what Google warned about          →  what this ended up as
─────────────────────────────       ────────────────────────────────────
the response may disappear           only a double failure counts        (3.4)
the shape may change unannounced     metadata found by search, not index (3.2)
                                     schema version stored with cache    (4.3)
a block can arrive as a 200          three checks ahead of parsing       (3.3)
sustained polling gets noticed       7-day cache removes sustained load  (4.3)
```

Being fast and free is the selling point of this approach, but for whoever inherits the code the more useful property is probably that it was written assuming the thing can vanish. We did not build this bridge.
