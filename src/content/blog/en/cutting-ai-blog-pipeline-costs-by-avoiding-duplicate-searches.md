---
title: "How I Cut AI Blog Generation Costs by Reducing Duplicate Searches and Failed Retries"
description: "I recalculated the search and full-text parsing cost for 15 topic candidates from the Chuncheon production server logs. The measured cost was about 150 KRW; the counterfactual with omitted calls added back was about 309 KRW."
subtitle: "Recomputing 15 topics from logs: ₩309 down to ₩150"
pubDate: 2026-08-18
updatedDate: 2026-09-16
tags: ["observability", "caching", "pipeline", "cost"]
category: devops
draft: false
cover: /covers/ai-blog-pipeline-cost-en.webp
coverAlt: "Cover image comparing search and full-text parsing cost for 15 topic candidates: 309 KRW without omitted calls, 150 KRW measured from logs, and 51.5% savings."
coverCaption: "309 KRW is the counterfactual estimate that adds omitted calls back at the same unit prices. 150 KRW is the actual search and parsing cost recorded in the Chuncheon server logs. This is not a separate before-and-after experiment."
---

## Introduction

> [!NOTE]
> I rechecked the logs for **15 topic candidates** on the Chuncheon production server. If I add back the calls skipped by caching and retry limits, this batch's search and full-text parsing cost drops from about 309 KRW to **150 KRW**, a **51.5% reduction**. Per topic candidate, that is about 20.6 KRW down to 10.0 KRW.

For the 15 candidates processed on September 16, 2026 between 18:48 and 18:49 KST, I joined the search cost logs with the per-topic full-text parsing logs.

The actually recorded cost was **$0.1069**. Ten supplemental platform searches were skipped by cache, and nine JavaScript rendering retries were skipped because of repeated failure history.

| Item | Omitted calls | Unit price | Estimated avoided cost |
| --- | ---: | ---: | ---: |
| Supplemental platform search | 10 | $0.010 | $0.1000 |
| JS rendering retry | 9 | $0.0015 | $0.0135 |
| Total | | | **$0.1135 ≈ 159 KRW** |

Adding the omitted-call cost of $0.1135 to the actual cost of $0.1069 gives a comparison baseline of $0.2204. The omitted portion is 51.5% of that baseline.

> [!IMPORTANT]
> The actual cost and omitted-call counts come from measured logs. The "without optimization" number is a counterfactual estimate that applies the same unit prices to calls that were skipped. It is not a separately executed before-and-after experiment.

The exchange rate is fixed at 1,400 KRW per USD. This number covers one batch's search and parsing cost only. LLM subscription fees and infrastructure costs are not included.

The blog generation pipeline I operate takes a keyword, creates candidate topics, prepares references and an outline for each candidate, and then writes the final article from the selected candidate's material.

When I opened up the cost trail, I found that we were paying multiple times to obtain the same search result. We were also spending collection cost on candidates the user would never choose. I added cost logs first, then reduced duplicate searches and retries that kept failing, and finally put a cap on unlimited candidate generation. This is the record of what I measured and which decisions changed because of it.

---

## 1\. I Did Not Know the Cost of One Article

At first I wanted to know how much one article cost to produce. Once I opened the pipeline, that question turned out to be wrong. Cost did not appear only when an article was published. It had already accumulated by the time candidates were prepared.

### Cost Starts Before Publication

The flow looked like this.

```plaintext
Keyword input
  ↓
Generate multiple topic candidates
  ↓
Collect search results, sources, and outlines for each candidate
  ↓
User selects a topic
  ↓
Write the article by reusing the selected candidate's material
```

The problem is the third line. Candidates the user does not choose have already gone through search and full-text parsing. A published article may look cheap if I only look at the selected candidate, but the real cost is distributed across every candidate prepared before selection.

So the cost formula changed too.

```plaintext
Cost of one published article
= preparation cost for one candidate × candidates created per published article
  + body generation cost
```

### The Logs Needed Four Buckets

At first, I could not see this properly. Failures, empty results, and filtering were all collapsed into a vague "did not work" bucket. To reduce cost, I first had to separate which calls actually ran, which calls were replaced by cache, and which calls failed before the next stage.

So I split the logs into four categories:

- executed calls
- calls filled by cache
- slots that were empty because no result existed
- calls that failed because of errors

Only after that split could I distinguish work we paid for from work that passed without payment.

---

## 2\. We Were Paying for the Same Search More Than Once

The first waste was supplemental search. When preparing one topic candidate, the pipeline runs one general search. If platform slots are still missing, it runs additional platform searches for places like YouTube, Namuwiki, and Brunch.

### Platform Search Was the Expensive Repeat

By unit price, general search costs $0.002 per call, and supplemental platform search costs $0.010 per call. One supplemental search costs as much as five general searches. As the number of candidates grows, that difference shows up directly in the bill.

The original structure did not reuse platform search results well enough. Even when the keyword and platform were the same, a different candidate could buy the same search again. There was a subtler case too. Sometimes the general search result already contained a platform document from YouTube or Brunch. If that result was not stored in the platform-slot cache, the later platform supplement would run again for the same slot.

I changed the cache key from "the entire query string" to <u>`keyword + platform slot`</u>. If the YouTube slot had already been filled for the same keyword, the next candidate reused that result first.

I also stored platform documents found through general search in the same slot cache. The point was not just to cache supplemental searches, but to let later candidates reuse platform slots that had already been paid for through general search.

### Empty Results and Failures Are Different

The careful part was distinguishing empty results from failures. A search that ran and found no usable document is different from a search that failed because of an API error. The former can be stored as a negative cache entry because retrying is likely to return nothing again. The latter should not be cached because it may recover on the next attempt.

Partial hits mattered too. If two of three slots are filled by cache but one is still missing, the supplemental search still runs. To count savings, I had to look at whether the paid call was actually omitted, not how many cache rows were read.

**By that standard, the September 16, 2026 sample skipped 10 supplemental platform searches.** At $0.010 each, that is $0.1000. Most of this batch's avoided cost came from here.

---

## 3\. Failed Retries and Discarded Candidates Were Still Spending Money

The second waste was JavaScript retries during full-text parsing. Standard full-text parsing costs $0.00015 per call. But when static parsing fails, the pipeline can retry with JavaScript rendering, and that retry costs $0.0015. It is ten times the standard parsing price.

### Do Not Disable Every Retry

Turning it off entirely would be wrong. Some sites do need JS rendering to extract the body. In the August sample, 4 of 9 JS retries succeeded. So the answer was not "always disable it"; it was "skip only hosts that repeatedly fail." Retries with observed success potential stayed in place, and the expensive retry was skipped only for hosts with enough failure history.

I accumulated retry results by host. JS retry was skipped for a period of time only when both conditions were true:

- the host had at least 3 attempts
- the host had a failure rate of at least 80%

The record expires after 30 days because site structures change, and pages that used to fail may succeed later.

Again, the logs mattered. If I only looked at parsing failure, I could not tell whether the change reduced cost or damaged quality. So I counted `skippedJsRetry` separately and multiplied the skipped count by $0.0015 to calculate avoided cost.

The rule skips <u>repeated-failure hosts</u>, not JavaScript rendering itself.

**In the September 16, 2026 sample, 9 JS retries were skipped.** The estimated avoided cost is $0.0135.

It is smaller than the search cache savings, but the logs confirm that repeated-failure calls were not purchased again. This does not prove the overall quality of extracted text. Successful JS retries still remain, and the skip rule is limited to cost logs plus failure history.

### State Had to Stay Clean

I also adjusted the queue behavior while doing this. If the worker picks up a topic that should be automatically excluded and merely "skips" it, the row has already entered the queue. That makes state ambiguous and can tangle the retry path. It was simpler to avoid enqueueing automatically excluded topics in the first place. Even for cost optimization, state transitions need to stay clean enough to trust in production.

---

## 4\. Making One Run Cheaper Did Not Solve Unlimited Generation

Even after reducing search and parsing cost, total cost still grows if users can generate topic candidates endlessly. There was a monthly publication limit, but no cap on topic generation. If a user kept generating candidates and did not publish them, publication would not increase while candidate preparation cost kept accumulating.

### The Third Candidate Was Not the Problem

I first checked whether to reduce the batch from three candidates to two. If the third candidate performed worse, we could avoid unnecessary generation. The measurements by candidate position did not support that hypothesis.

| Candidate position | Planning failure rate | Publication rate |
| ---: | ---: | ---: |
| First | 8.2% | 32.8% |
| Second | 6.6% | 35.6% |
| Third | 8.4% | 33.0% |

The third candidate did not perform noticeably worse. These measurements did not justify reducing the batch size.

I added a <u>monthly generation cap</u> instead.

### Cap Generation, Then Account for It Correctly

The cap is `monthly publication limit × 5`. Measurements from August showed 3.05 to 3.36 generated candidates per published article. A factor of 5 leaves room above current usage, while still preventing unlimited generation.

The key was not row count; it was quota accounting. The system deducts generation quota before enqueueing and refunds it if enqueueing fails. Counting only the rows that survive would let the ledger drift when mid-path failures happen.

Repeated requests were another issue. I added a 60-second cooldown on the server and showed the remaining wait in the UI.

The order is:

1. cooldown check
2. deduct monthly quota
3. enqueue

Requests that arrive too soon are rejected before quota is deducted; a failed enqueue refunds the debit. Disabling a button alone would not stop requests from multiple tabs or direct API calls.

This cap does not reduce a single call the way search caching does. It prevents candidates with a low chance of becoming published articles from generating unlimited cost. Cost optimization was not only about unit prices. It was also about where the system allows cost to enter.

> [!TIP]
> The cap is a spending boundary, not a quality shortcut. The candidate-position data did not justify dropping the third candidate, so I limited unbounded generation instead.

---

<a id="5-i-recalculated-it-from-server-logs"></a>

## Conclusion

Finally, I reconciled the numbers against actual server logs. The target was the `m-wdot-worker-1` container on Chuncheon B. From the container logs, I fixed the sample to topic 40817 through 40831: 15 completed topics processed between 18:48:01 and 18:49:59 KST on September 16, 2026.

### Scope the Sample First

I joined SERP to research by query, and research to full-text parsing by topic ID. I only counted the 15 topics where search and full-text parsing were both connected. One earlier isolated SERP entry was excluded because it did not connect to any topic's research/full-text logs.

![Native Terminal screenshot of unmodified worker logs retrieved from the Chuncheon server. Ten consecutive log entries from 2026-09-16 09:48:11–09:48:39 UTC; timestamps and content are unchanged. The totals below use all 15 completed topics.](/images/ai-blog-cost/production-log-original-terminal.png)

| Item | Actual cost in logs | Estimated omitted-call cost | Counterfactual without omissions |
| --- | ---: | ---: | ---: |
| SERP | $0.08200 | 10 × $0.010 = $0.10000 | $0.18200 |
| Full-text parsing | $0.02490 | 9 × $0.0015 = $0.01350 | $0.03840 |
| Total | **$0.10690** | **$0.11350** | **$0.22040** |

### The Reduction Was 51.5% for This Batch

With the exchange rate fixed at 1,400 KRW per USD, the actual cost is 149.66 KRW and the counterfactual without omitted calls is 308.56 KRW. The difference is 158.90 KRW, and the savings rate is `0.11350 / 0.22040 = 51.5%`.

Per topic candidate, the counterfactual is 20.57 KRW and the actual cost is 9.98 KRW. In this sample, the search and parsing cost to prepare one topic candidate dropped from about 20.6 KRW to 10.0 KRW.

> [!IMPORTANT]
> This is the search and full-text parsing cost for one 15-topic batch. It does not include LLM subscription fees, server costs, database costs, or post-publication operating costs.

It is not a rerun of the old code under the same conditions either. It counts calls omitted in real logs and multiplies them by the same unit prices to estimate what we would have paid if those calls had not been skipped.

### What the Logs Changed

That was still enough to make the decision. I did not reduce expensive model calls or change servers. I stopped buying the same search again, skipped retries that had repeated-failure evidence, and limited candidate generation that was not tied to publication. The result showed up in production logs.

The next area is visible too. When multiple requests for the same keyword hit a cold cache at the same time, the first few requests can still duplicate the same search. Cache alone cannot prevent that; it needs a short lock or singleflight. Another option is to defer deep outline preparation until after the user selects a topic. The tradeoff is that the selection screen may become less useful, so UX and cost need to be evaluated together.

The main lesson was simple. Cost was not leaking only from "expensive calls." It leaked when cheap calls repeated across candidate counts, when failing retries became habitual, and when work that might never be selected was prepared in advance. I had to split the logs first. Only then could I reduce it.
