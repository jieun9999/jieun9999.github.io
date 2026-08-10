---
title: "Keyword Discovery: 25 Seconds Down to 0.2, by Calling Search Autocomplete"
description: "We mined Naver Q&A threads for keyword fragments and cleaned them up with two LLM calls. Replacing that with Google and Naver autocomplete took the button press from 25.1s to 0.2s and removed the LLM entirely. Google told people to stop using this endpoint in 2015, so there was something to settle before performance."
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

The first stage of an automated blog pipeline is picking keywords. If that stage is slow everything behind it waits, and **if it comes back empty there's nothing to build on.**

The pipeline I worked on spent 25 seconds per keyword here. Everyone knew it was slow. The working theory was that Naver's API was the bottleneck. **Nobody had measured it.**

The theory was wrong. And **the real problem wasn't speed.**

---

## 1\. Why replace it

### Where the 25 seconds went

The old approach: pull a large batch of Naver Q&A questions on the topic, mechanically slice two- and three-word fragments out of the titles and bodies, then run those fragments through an LLM twice. Once to cluster the similar ones, once to pick which clusters look like something a person would actually search for.

Measured by stage:

| Stage                                         | Time  | Share |
| --------------------------------------------- | ----- | ----- |
| Acquiring the API rate-limit slot             | 0.1s  | 0.4%  |
| Fetching Q&A questions (5 requests, parallel) | 2.4s  | 9.7%  |
| LLM ① clustering the fragments                | 12.4s | 49%   |
| LLM ② picking searchable phrases              | 7.5s  | 30%   |

The external API finished in 2.4 seconds. **Twenty of the twenty-five seconds were the two LLM calls we had bolted on afterwards.** The bottleneck was ours, not theirs.

### Those LLM calls could not be removed

The tempting conclusion is "drop the LLM, then." Wrong. Slicing question sentences mechanically produces thousands of these:

```plaintext
"What are the extension terms on a youth jeonse loan?"

  → youth jeonse loan / jeonse loan extension / extension terms on / loan extension / terms on a ...
```

**That's sentence debris, not keywords.** Take away the clustering and selection and the method stops working. The 25 seconds were not waste. They were the price of manufacturing keywords out of debris. We were not doing a fast thing slowly, we were doing a slow thing.

**Optimization was never going to get us there.** The method had to go.

### And sometimes it returned nothing

To produce 19 keywords it read 24,558 questions and yielded 149. That's **0.6 keywords per hundred questions read**.

A low yield is inherent to the approach. The problem was **the runs that yielded zero**.

```plaintext
query: "Seoul real estate Lee Jae-myung"

  Q&A mining    read 1,000+ questions · 19.9s · 0 results
  autocomplete  read nothing          ·  0.2s · 4 results
```

If few people have asked about a topic, no phrasing repeats often enough to survive, and there is nothing left to cluster or select. Across 43 production runs the average was 1,116 questions read for 5 keywords.

**A slow answer you can wait for. This one never arrives.** That, not the 25 seconds, is what forced the change.

Autocomplete has the opposite property. What it returns is by definition a phrase someone typed into a search box, so if anyone searched for it, it shows up. Nothing is manufactured, so there's no manufacturing cost to pay.

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

**The request we want to send is identical.** The only difference is timing.

The absence of authentication follows from the design. Autocomplete has to work before login, before a session exists, at the moment the first character lands. **There's nowhere to put an auth check.** Any key shipped to the browser is visible to everyone, so there is no secret to plant either.

### 2.1 Google told people to stop using it in 2015

That doesn't make it a free-for-all. Google posted a notice on 24 July 2015 and cut off third-party access on 10 August.

> We built autocomplete as a complement to Search, and never intended that it would exist disconnected from the purpose of anticipating user search queries. The content of our automatic completions are optimized and intended to be used in conjunction with web search results, and outside of the context of a web search don't provide a meaningful user benefit.

The same notice contains this line:

> Using an unsupported, unpublished API also carries the risk that the API will stop being available. This is one of those situations.

Naver never published an official API to begin with.

**The endpoint still answers, eleven years later.** I hit it directly on 10 August 2026:

```plaintext
GET /complete/search?client=chrome&hl=ko&gl=kr&oe=utf-8&q=여드름

  200 · text/javascript; charset=UTF-8 · 258ms · 15 items
  ["여드름", ["여드름 흉터","여드름 패치","여드름 약", ...]]
```

Google never promised to keep it open. That it responds today is something I observed, not a guarantee, and the warning stands. **Accept it rather than argue with it.**

Sections 3 and 4 are built so this endpoint can vanish without taking anything down. Section 5 is where I checked whether it belonged in production at all.

---

## 3\. Fetching

### 3.1 Choosing parameters took longer than expected

The first rule is about what goes into `q`. Take what the user typed, truncated to the first three words.

Short seeds make Google treat the input as a character prefix rather than a word, and the results wander off. Seeding `이사` (moving house) returns `이상형 월드컵` (ideal-type tournament), `이상민`, `이상해씨` — **fifteen results, none related**. Naver handled the same seed correctly with `포장이사` and `이사짐센터`, so this is Google-side behaviour, not a general problem. Long seeds fail the other way: they sit at the leaves of the suggestion tree and the candidate count collapses. `여드름 종류` (types of acne) returned six.

For Google's `client` parameter I called all four variants before settling on `chrome`. It returns the most suggestions (15), it is the only one carrying relevance scores, and parsing is a single `JSON.parse`. `youtube` and `gws-wiz` need JSONP unwrapping, and the latter also needs `<b>` tags stripped. The reason the shape differs this much per client is obvious enough: **these are per-product internal formats, not a contract with anyone outside**.

**`oe=utf-8` isn't optional.** Without it the response comes back latin-1 encoded and every Korean character is mangled. But the status is 200 and the JSON structure is intact, so parsing succeeds and only the contents are garbage. **The logs won't catch it.**

On the Naver side: `st=100` (integrated search), `ans=1` (include the instant-answer block), `rev=4` (per-item instant-answer flag). The real search box adds `frm`, `r_enc`, `run` and others. Dropping them changed nothing.

That leaves two lines:

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

**The index isn't hardcoded** because chrome puts it fourth and firefox third. We only use chrome, so `parsed[4]` works today. The day Google inserts one more element into that array, the scores silently stop being read. This is the first place the premise from 2.1 turns into code.

Naver is simple: `items[0]` is the list and each element is `[text, instantAnswerFlag]`. The response is always UTF-8, so none of the encoding traps apply.

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

**`rank` is response order, untouched.** It is the only signal the merge in section 4 has, so reordering here throws off everything downstream.

### 3.3 Do not treat 200 as success

A normal API returns 4xx or 5xx when something is wrong, and `try/catch` handles it. But **this endpoint has no contract with us, so it has no obligation to return an error code either.**

What actually arrives:

```plaintext
expected                      actual
─────────────────────────    ─────────────────────────────────────
429 Too Many Requests    →   302 → google.com/sorry/index (captcha page)
                             200 OK + content-type: text/html
```

`fetch` follows redirects, so even a captcha bounce lands in your hands as a 200 OK. **`if (!response.ok) throw` will never fire.**

The next part is worse, because this is how the code gets written:

```ts
try {
  return JSON.parse(body).suggestions;
} catch {
  return []; // parse failed → empty list
}
```

`JSON.parse` chokes on the HTML, `catch` hands back an empty array, and everything carries on. The logs record "0 results for this keyword."

Except **zero is already a legitimate outcome here**. Naver honestly returns an empty array for combinations nobody searches for. That isn't a fault. It is a free verdict that the phrase has no demand behind it.

So **the thing to separate isn't the result but the cause**:

```plaintext
        result: 0
          ├── we were blocked     → must know immediately, must fall back
          └── nobody searches it  → normal, and worth recording
```

Conflate them and a block gets filed as "nobody searches for this," after which the cache in 4.3 freezes that lie for seven days and the seed finds nothing for a week. That is us reproducing, by hand, the exact symptom section 1 set out to eliminate.

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

**The checks belong ahead of parsing, not after.** Once `JSON.parse` has thrown, a block, a format change and a genuinely empty response are the same `SyntaxError`. Split them up front and each becomes its own exception. That's what makes alerting possible.

Back to 2.1: when the day Google warned about arrives, these three lines are what notices. A system that quietly accumulates zeros will not know the API is gone.

### 3.4 Both engines at once

The call is `Promise.allSettled`, not `Promise.all`. **One engine failing has no business taking down the other.** Timeouts are deliberately asymmetric:

```plaintext
Google   300ms   (measured p50 185ms · p95 215ms)
Naver     10s    (measured p50  24ms · p95  30ms)
```

Naver answers in 24ms. Killing that alongside a 190ms straggler is a bad trade. Sequentially the pair costs 200ms and in parallel 183ms, so the saving is 17ms. That is not why it is parallel. When Google is slow or down, Naver's answer is still in hand 20ms in. **Only a double failure counts as a failure.**

---

## 4\. Merging

### 4.1 No usable scores, so rank only

The original plan was to sort the combined list by Google's `suggestrelevance`. Looking at the values killed it:

```plaintext
14 of 16 keywords: the score spread below rank 4 was within 60
score frequency: 601(19×) 600(19×) 550(19×) 551(18×) 554(16×) ...
```

The same 550-to-601 band repeats across nearly every keyword. It is rank stamped into a score-shaped field, not a measure of intensity, and only the top three discriminate at all. Naver has no scores whatsoever. **There's no shared yardstick.**

So the merge uses positions only:

```plaintext
score(keyword) = Σ  w / (K + rank in that engine)        K = 10, w = 1
               engines
```

The reason for this form is that overlap handling comes free. A keyword present in both lists gets two terms and rises on its own. No separate "boost the overlap" branch is needed. Keywords from a single engine line up by their position in that engine, so the two lists interleave like a zipper.

Whether that ordering was right is checkable, and the data backs it. The 43 overlapping items already ranked high on both sides:

```plaintext
mean rank within Google  6.6   (vs 8.0 overall)
mean rank within Naver   4.8   (well above)
```

Two independent search logs pushing the same phrase upward is the strongest demand signal available here.

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

**Weights stay at 1:1.** Google returns roughly twice as many suggestions (12.8 vs 6.4 on average), but **volume isn't quality**. 12.7% of Google's results carry community-forum suffixes, so weighting Google up drags the noise up with it.

Merging was a requirement, not a nicety. Per-query Jaccard overlap sits between 9% and 11%, and 6 of 19 keywords had no overlap at all. For one query Naver returned 1 suggestion and Google 8, with nothing in common. **These two engines aren't substitutes.** They're two different logs.

### 4.2 A dictionary instead of an LLM

One layer of rules sits on top of the merge, all pure functions. No network, no environment.

Whitespace normalization comes first. Naver prefers compound spellings, Google prefers spaced ones. Merge without normalizing and the same keyword gets stored twice and the overlap figure is wrong. Measured overlap moved from 10% to 12% once normalization was in.

Community-forum suffixes (the Korean equivalents of "reddit", "wiki", and a handful of large local boards) are removed, not demoted. Nobody is going to write an article targeting "acne scars reddit". It is not a ranking question. No LLM judgement here either: the set is finite and well known, and a dictionary is deterministic, free, and testable.

**It has to match on word boundaries though.** Substring matching ate legitimate keywords — the short form for one board is a substring of the Korean word for "Galaxy", another collides with common place and legal terms. Short entries apply only when they stand alone as the final word. Removed keywords get logged, because recovering from a bad dictionary entry later means knowing what it ate.

Sorting is by score, then Google rank, then lexicographic. Same input, same output, or nothing is reproducible.

### 4.3 The cache is not there for speed

Results are kept for seven days. Autocomplete barely moves day to day, so that window is safe.

**The speed win is incidental.** The real reason connects to 5.3: if repeated discovery never produces an outbound call, there is no such thing as sustained traffic to detect.

Three rules attached to it:

- Empty results are never stored. Freezing an empty array that came from a transient failure leaves that seed finding nothing for a week. The distinction drawn in 3.3 applies again here.
- Stored values carry a schema version. Change the parser, bump the number, and old rows fall out of lookups on their own. No `DELETE` pass, and a rollback makes them valid again. It is an invalidation lever installed ahead of the day the response shape changes.
- A cache failure is not a discovery failure. Both read and write paths are wrapped in `catch`, so a wobbling database still leaves discovery hitting the API directly.

---

## 5\. Does it belong in production

### 5.1 One question left

Sections 3 and 4 established that it was fast and free. What remained: should an undocumented endpoint with no terms-of-service blessing be wired into production permanently.

**"It'll probably be fine" isn't an answer.** If it was going to get blocked, I wanted to see when and how first. So I ran load against it before adopting anything.

### 5.2 Deliberately shaped to look like a bot

Run from a server in Chuncheon. Datacenter IP.

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

The conditions were chosen on purpose. Datacenter IP, exactly uniform 2.000s spacing, fully-formed queries whose prefix never grows. None of that is producible by a human typing. **This was the easiest possible shape to flag, and nothing happened.**

### 5.3 Why it did not get blocked

The per-keystroke design is what makes this work.

Behind an office NAT or a carrier-grade NAT, a single public IP legitimately produces hundreds of requests per second. One office at lunchtime looks exactly like that. Rate-limiting per IP per second kills real users first. **That axis was never going to catch us.**

**Real blocking looks at patterns, not rates:**

```plaintext
┌─────────────────────────────────┬──────────────────────────────────┐
│ looks like typing               │ looks like a bot                 │
├─────────────────────────────────┼──────────────────────────────────┤
│ prefix grows one char at a time │ complete queries, over and over  │
│ irregular gaps                  │ exactly 2.000s apart             │
│ normal UA and Accept headers    │ no UA                            │
│ residential or mobile IP        │ datacenter IP                    │
│ busy by day, quiet at night     │ flat for 24 hours                │
└─────────────────────────────────┴──────────────────────────────────┘
```

The cache in 4.3 targets the last row on the right. It isn't a rate-limit measure. It exists so that "flat for 24 hours" never becomes true of us. If repeated discovery produces no outbound calls, there is no traffic to fit the description.

Sending a browser UA is the same idea. Naver returns 200 without one. There's still no reason to volunteer another row from the right-hand column.

### 5.4 Adopted, with the guards left in

Nothing in the PoC suggested we were being blocked, so it went into production. That is the path running today.

Production numbers. Discovery now does the autocomplete call and nothing else:

```plaintext
[Fetch]   POST /keywords/suggest   n=35   p50 206ms · p90 222ms · max 291ms
                                          (min 16ms is a 7-day cache hit)
```

**The same button took 25.1 seconds before.** Nothing appeared until both LLM calls had finished.

Evidence collection moved to the save action. In the old design discovery was also the save, so keywords landed in the database before anyone had read them, and we paid collection cost even for the ones about to be thrown away. Now only the checked keywords are saved, and evidence is gathered for the newly added ones at that moment.

```plaintext
[Save]    PUT /keywords            n=63   p50 18ms · p90 2,035ms · max 3,370ms
```

The 18ms median is the case where nothing new was added or the cache hit. When new keywords genuinely arrive, it costs 2 to 3.4 seconds.

| Axis   | Result                                                                           |
| ------ | -------------------------------------------------------------------------------- |
| Speed  | 25.1s → 0.2s to see the list. The two LLM calls holding 79% of the latency, gone |
| Volume | 7.8 → 17.2 keywords. Autocomplete led in 18 of 19 test keywords                  |
| Cost   | no auth, no quota, nothing billed per call                                       |

What's been verified is **"it isn't blocked right now," and nothing further**. That is why neither the three checks from 3.3 nor the cache from 4.3 were removed after the load test came back clean. **Never having seen it blocked does not mean the defences are unnecessary. It means they have not been tested yet.**

The remaining gaps, stated plainly:

- **Search volume was never validated.** I counted how many keywords came out, not whether anyone searches them. In principle autocomplete has the advantage, since its output is by definition a query somebody typed. That wasn't confirmed against this dataset.
- Load testing stopped at 914 requests against a target of 2,000, and nothing ran longer than a day.
- `K=10` was chosen by eye across 19 keywords. It hasn't been tuned.

Coming back to 2.1, most of the decisions here trace to that single sentence:

```plaintext
what Google warned about          →  what this ended up as
─────────────────────────────       ────────────────────────────────────
the response may disappear           only a double failure counts        (3.4)
the shape may change unannounced     metadata found by search, not index (3.2)
                                     schema version stored with cache    (4.3)
a block can arrive as a 200          three checks ahead of parsing       (3.3)
sustained polling gets noticed       7-day cache removes sustained load  (4.3)
```

Fast and free is the visible win. It isn't why this could go into production. The reason is duller: **this endpoint could be gone tomorrow, and it was written that way from the start.**
