---
title: "Different Topics, So Why Are We Getting the Same Sources?"
description: "How I replaced words extracted from the start of a title with question-focused search phrases, then changed platform-document allocation to avoid sharing the same document across topics."
subtitle: "I traced similar sources across different topics back to the actual search queries and code. Grok expresses the question, while code preserves search intent and assigns platform sources."
pubDate: 2026-10-18
tags: ["llm", "prompt-engineering", "content-automation"]
category: systems
cover: /covers/wiblog-search-intent-en-v1.png
coverFit: contain
coverBackground: dark
coverAlt: "Navy comparison of a translated outdoor-wedding example: extracting the word comes from the title versus generating the search phrase tent cost, each added to the same seed keyword."
series: wiblog-quality
seriesOrder: 2
seriesTitle: "Improving Wiblog Titles and Search"
draft: false
---

## Introduction

Wiblog takes a keyword, prepares topic candidates with descriptions, outlines, and sources, and generates an article from the topic the user chooses. We call the starting keyword a *seed keyword*. One seed usually produces three topic candidates.

[The previous post](/en/blog/making-ai-blog-titles-readable/) covered how I improved title generation so readers could tell what answer an article would provide. This post follows the search for sources that can answer that question.

While reviewing topics myself, I noticed a gap between the titles and the intended content. A title might promise something specific while the outline returned to general explanations. Topics asking different questions could also bring back similar sources.

I was the only PoC engineer and moved experiments into production almost weekly. Identifying what needed fixing took much longer. Title generation, query construction, source selection, and full-text retrieval were all involved.

Here I follow how a title's question becomes a search query, then how platform documents found through search are assigned to candidates. The order explains the problem rather than reproducing the development chronology.

The examples come from Korean inputs. English glosses explain their meaning; they are not results from a separate English-language experiment.

## 1. The Title and the Outline Were Pointing in Different Directions

### The outline did not explain what the title promised

When choosing a topic, readers use its title to anticipate the article. A title about “risks to check before investing” suggests specific risks and checks. Yet some outlines only covered earnings or forecasts.

A topic generated from `sk하이닉스 영업이익 2026`—SK hynix operating profit in 2026—showed this gap.

| Seed keyword | Generated title, translated | Main content of the saved outline |
| --- | --- | --- |
| `sk하이닉스 영업이익 2026` | SK hynix operating profit in 2026: a checklist of five risks to review before investing | Quarterly results, brokerage forecasts, margin forecasts, and differences between forecasts and actual results |

The outline was related to the seed. But describing operating profit and forecasts did not establish the five risks promised by the title. The mismatch already existed at the outline stage, before the article was written.

Having several sources did not resolve it either. A topic about the layout and floor plans of Sunbu-dong La Primo had four sources, but the saved material mainly covered the apartment complex and transaction information. It did not clearly support the detailed layout descriptions in the outline.

I could not attribute all of this to a single search query. Still, to write what the title promised, I first needed to check whether the search was looking for material that could answer it.

### Each topic added words to the seed

The general-search query followed this structure:

```text
General-search query = seed keyword anchor + topic-specific extra words
```

The seed established the basic subject. The extra words narrowed the search to what that particular topic needed to investigate.

Saved records showed different additions even for the same seed:

| Seed keyword | Extra words, with gloss | Actual saved query |
| --- | --- | --- |
| `인천 송도 아파트 뷰 현실` (realities of apartment views in Songdo, Incheon) | `프리미엄 가격 실제` (premium / price / actual) | `인천 송도 아파트 뷰 현실 프리미엄 가격 실제` |
| Same seed | `현장` (on-site) | `인천 송도 아파트 뷰 현실 현장` |
| Same seed | `실거주 후기 본` (living experience / reviews / seen) | `인천 송도 아파트 뷰 현실 실거주 후기 본` |

The problem was how those words were chosen. The code did not judge which meaning mattered most. **It scanned the title from the beginning and selected words that passed exclusion rules.** It removed words already in the seed and other excluded terms, but did not compare the remaining words against the question's intent.

Limiting the number of extra words helped avoid an overly narrow query. That alone did not make the query useful. Which words survived mattered more.

## 2. The First Word Was Not Necessarily the Point of the Question

### I needed to revisit selection before reducing word count

A comparison table of candidates A, B, and C for 300 seeds included these saved values:

| Seed keyword | Extracted extra words, with gloss | Actual saved query |
| --- | --- | --- |
| `광범위 피부질환 연고` (ointment for a broad range of skin conditions) | `구매 전 반드시` (before buying / must) | `광범위 피부질환 연고 구매 전 반드시` |
| `인천 송도 아파트 뷰 현실` | `실거주 후기 본` (living experience / reviews / seen) | `인천 송도 아파트 뷰 현실 실거주 후기 본` |

“Before buying, you must…” connects a sentence, but does not identify something to investigate, such as ingredients or side effects. The second example mixed useful terms with an unnecessary fragment.

Reducing three extra words to the first one would shorten these queries. But if that first word did not express the question, useful words later in the title would disappear too.

My initial hypothesis was to examine the full original input and choose one word naming the concrete subject of investigation, rather than taking the first eligible word. At this stage, I still treated it as a problem of choosing better extra words.

### “Package” was selected because it came first

I later reviewed a separate set of existing results: 20 seeds and 60 topics. This was different material from the earlier 300-seed comparison.

Actual search records for `홋카이도 온천 여행`—a Hokkaido hot-spring trip—used the same extra word for three different questions:

| Provisional title at search time, translated | Selected extra word | Actual general-search query |
| --- | --- | --- |
| How do Hokkaido hot-spring package prices vary by region and itinerary? | `패키지` (package) | `홋카이도 온천 여행 패키지` |
| What advantages do real reviews of Hokkaido hot-spring packages often mention? | `패키지` (package) | `홋카이도 온천 여행 패키지` |
| What cancellation fees and refund rules apply when booking a Hokkaido hot-spring package? | `패키지` (package) | `홋카이도 온천 여행 패키지` |

In all three titles, `패키지` followed the words belonging to the seed. The algorithm scanned from the start and took the first eligible word. Selection ended before it reached price, reviews, or cancellation fees.

It had not judged “package” to be the most important word. **Word order was standing in for the priority of the search intent.**

The quality review at the time nevertheless marked this word as appropriate. Under a criterion that rewarded narrowing the travel product to a package, that assessment made sense. It exposed a limitation in the evaluation criteria as well as the extraction logic.

A pricing topic needs amounts and conditions. A review topic needs accounts of actual experience. A cancellation topic needs fees and refund terms. Relevance to the broad subject did not distinguish those questions.

I changed the criterion from “Is this word related to the seed?” to “When combined with the seed, does it reveal the answer this topic needs?” A short phrase could express that question better than a single word.

### I compared both query-building methods on the same titles

In the next PoC, I asked Grok to generate two fields alongside the title:

- `core_question`: one sentence stating the question the article should answer.
- `query_focus`: a short search expression to append to the seed.

This replaced the extra-word slot with a question-focused expression. It could still be one word, or a short phrase such as `텐트 비용` (tent cost).

I submitted the same 20 seeds to the existing and improved methods, generating three candidates per seed: 60 results per method. The requested model was `grok-4`; all 40 responses identified the actual model as `grok-4.3`.

The methods could also generate different titles. To isolate differences in query construction, I held the newly generated titles fixed and applied the existing v3 algorithm to them as a separate reproduction.

| Seed keyword | Fixed title, translated | Existing v3 extra word | New search expression |
| --- | --- | --- | --- |
| `야외웨딩 우천 대비` (outdoor-wedding rain planning) | How much does tent rental cost when it rains at an outdoor wedding? | `올` (a verb fragment from “when rain comes”) | `텐트 비용` (tent cost) |
| Same seed | Rain-preparation examples from real outdoor-wedding experiences | `실제` (actual) | `실제 후기` (real reviews) |
| `아파트 욕실 방수공사` (apartment bathroom waterproofing) | The order of bathroom waterproofing work and the time required for each stage | `순서` (order) | `공사 순서` (work sequence) |

The first complete query changed as follows:

```text
Existing v3 reproduction: 야외웨딩 우천 대비 올
New method:               야외웨딩 우천 대비 텐트 비용
```

The fragment `올` came from early in the title but did not identify what to investigate. Adding “tent cost” to the same seed made the subject clear. In the second example, changing “actual” to “real reviews” made the need for experience-based sources explicit.

The bathroom-waterproofing example still omitted duration. A more natural expression did not preserve every important condition. Review notes were attached to 31 of the 60 results, but they covered repeated seeds and title issues as well as missing meaning. I did not treat that count as a failure count.

This comparison established changes in search expressions. It compared a reproduction of the old algorithm with new expressions on the same titles; it did not establish an improvement in actual search-result quality.

## 3. I Saved the Generated Intent and Connected It to Search

### The LLM turned the question into a search expression

The new instructions asked for a short expression someone might search for, preserving the title's subject, conditions, and comparison target. The default was one or two Korean space-separated units, with up to three when necessary.

The model was told not to drop an important subject merely to shorten the phrase, or add a region, year, or condition absent from the title. It did not have to include every detail either. Natural expressions describing the situation being searched for, such as `높을 때` (when it is high), were allowed.

These were the main fields saved for the outdoor-wedding example in the PoC:

```json
{
  "target_keyword": "야외웨딩 우천 대비",
  "title": "야외웨딩 비 올 때 텐트 대여 비용은 얼마예요?",
  "core_question": "야외웨딩 우천 대비로 텐트 대여 비용은 얼마나 들까요?",
  "query_focus": "텐트 비용"
}
```

The code combines the seed anchor with `query_focus`:

```text
야외웨딩 우천 대비 + 텐트 비용
→ 야외웨딩 우천 대비 텐트 비용
```

It does not use the entire `core_question` as the search query. That field makes the intent explicit and records it; general search appends `query_focus`.

I also stopped treating shared words as sufficient evidence that two candidates were duplicates. “Application eligibility” and “application documents” share “application” but seek different answers. Production code allows shared words and falls back when the entire normalized search expression is identical.

### Search intent survives later title changes

The generated question, search expression, and finalized query are saved together, and general search uses the saved query. A snapshot preserves the title and intent from generation time, so a later title change during outline creation does not trigger a fresh guess at the search intent.

## 4. Different Queries Could Still Lead to Similar Sources

General search returns both general documents and platform documents. The general-document path selects up to three documents after filtering. The platform path first checks the current results and the shared candidate pool. Only platforms with no document available for assignment and no completed supplementary search need another search.

![General-search results split into general documents and platform candidates. The shared pool and conditional supplementary search feed document assignment, followed by deduplication, full-text retrieval, and outline creation.](/images/search-intent/source-acquisition-flow-en-v2.png "diagram")

Documents selected through both paths are combined, then available full text is retrieved for outline creation. Documents whose full text cannot be retrieved, or whose retrieval is skipped, retain their search snippets. **Assigning a document is not the same as obtaining its full text.** The diagram summarizes this sequence and omits retries and detailed filters.

### Supplementary platform searches shared the seed

If general search did not provide material from Naver Blog, YouTube, or Namuwiki, a separate search supplemented it. These searches were already constrained by `site:` and `intitle:`. Adding more words could leave too little material, so they retained the seed's core subject. Candidates from the same seed shared cached results to reduce duplicate search costs.

**The new search expressions therefore applied only to general search.** Supplementary platform searches kept their existing queries; I changed how their documents were assigned to candidates.

### Sharing a search did not require sharing the same document

Previously, even if several platform documents passed the filters, only the top one was shared. Different topics could therefore receive the same source. I changed this to **retain up to three documents per platform and assign each candidate at most one unassigned document per platform, within the same site, generation batch, and seed.**

If only one suitable document exists, only one candidate receives it. The remaining slots stay empty rather than being filled with the same document.

Search depth remained `10`. The existing URL, commercial-content, and relevance filters also stayed in place, as did the limits of three general documents and one document per platform per card. Normalized document identities, a database lease, and UNIQUE constraints prevent duplicate allocation during concurrent processing.

Allocation follows processing order and duplicate-prevention rules, without additional LLM calls. It does not reassess the semantic match between each question and document, so it does not guarantee that a pricing question receives a pricing document.

## Conclusion

This work began with titles and outlines pointing in different directions, and different topics bringing back similar sources.

The actual queries showed that words extracted from the start of a title were standing in for its question. Even a relevant term such as “package” could erase the distinction between price, reviews, and cancellation. I shifted the criterion from word count or broad relevance to whether the phrase, combined with the seed, expressed the answer needed.

Grok generates the core question and short search expression. Code preserves that intent, uses it in general search, handles invalid fields, and assigns platform documents without duplication.

I confirmed examples of search expressions that conveyed the question more clearly, along with the changed source-allocation structure. The next question is whether the acquired material actually answers it. A change in queries and an improvement in evidence need to be evaluated separately.
