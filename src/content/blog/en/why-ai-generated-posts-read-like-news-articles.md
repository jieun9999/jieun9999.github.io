---
title: 'Why AI-Generated Posts Read Like News Articles — Refactoring a Content Model Four Times'
description: 'Twenty lines of tone rules, and the bot still wrote news reports. The culprit was not tone. It was a single enum with four different classification criteria crammed into it.'
pubDate: 2026-06-29
tags: ['llm', 'datamodeling', 'refactoring', 'prompt-engineering', 'automation']
category: building
draft: true
---

> [!NOTE]
> Twenty lines of tone rules, and the bot still wrote news reports. The culprit wasn't tone — it was a single `enum` with four different classification criteria crammed into it.

* * *

## 1\. Symptom — The More Rules I Added, the More It Read Like a News Article

I built a bot that generates car posts for a community forum. Every output looked like this.

<!-- TODO: paste one real "news-article-voice" generation verbatim. This is the single most important piece of evidence in the post. -->

```plaintext
(the failed generation, verbatim)
```

Nothing wrong with the grammar. Nothing wrong with the facts. And nobody responded — because there was nothing to respond to.

So I added tone rules. *Write casually. Drop the formal register. Use interjections.* Each rule made the sentences a little more relaxed, but **the skeleton stayed a news report.** Intro, body, wrap-up. Numbers in a row. Neutral closing.

A problem that twenty rules can't fix isn't a problem with the rules.

## 2\. First Misdiagnosis — Tone Was the Symptom, Not the Cause

I had defined the bot's identity like this: **"a curator of the latest car trends."**

Everything followed from that. A curator organizes information, and the better it organizes, the closer the output gets to a clean report. Tone rules were paint on top, and paint doesn't change the shape of a building.

> A curator organizes information. An operator designs a reaction. Communities don't respond to *organized information* — they respond to *feeling*. As long as the identity is "curator," the output structurally converges on read-it-and-move-on.

Leaning on *recency* was the same root problem wearing a different coat. Curate the latest news and your material runs dry in days, differentiation drops to zero, and you end up paraphrasing press releases. That's PR work. Meanwhile, every post that actually landed was timeless: first-car regret, options that rip you off, "for that money, you could've…".

I redefined the identity as **"a community operator who designs reactions."** That didn't throw information away — it demoted information to a trust base layer. Too much information is boring; too much provocation backfires. The target is the space between.

Things got better. They didn't get fixed. The real lesion was further down.

## 3\. The Culprit — Four Criteria Crammed Into One Enum

To generate a post, the bot picked a single `content_mode`. There were four values.

```python
content_mode = "debate_thread" | "buyer_dilemma" | "rank_bait" | "trend_brief"
```

Looks fine? Write down what each value is actually classified *by*:

| mode | what it's really classified by |
| --- | --- |
| `debate_thread` | **intent** (provoke an argument) |
| `buyer_dilemma` | **topic** (buying) |
| `rank_bait` | **format** (a list) |
| `trend_brief` | **recency** (it's new) |

Four values, each pulled from a different axis, lined up in one row. A textbook anti-pattern: multiple concerns shoved into one enum.

It surfaced two ways.

**Classification collision.** Is "an argument about buying" a `debate_thread` or a `buyer_dilemma`? Both. The bot picked differently every time, and the same material came out as a debate one day and a buying guide the next.

**A missing axis.** More decisively, **there was no axis for *who is speaking*.** So I couldn't take the same car and render it once in the voice of a twenty-something buying their first car and once in the voice of a fifteen-year enthusiast. Swapping the speaker produces an entirely different post — and the model had no handle for it at all.

## 4\. The Fix — Decompose the Enum Into a Product

I pulled the tangled axis apart into **three independent axes**.

```plaintext
post = hook_engine × persona × topic_tag
```

- **hook\_engine** — why you stop scrolling: `hot_take`, `money_truth`, `regret_story`, `versus`, `rank_bait` …
- **persona** — who's talking: `first_car`, `young_budget`, `purist`, `tuner`, `data_geek` …
- **topic\_tag** — what it's about: EVs, depreciation, options, tuning …

Because the axes are independent, variety grows as a **product, not a sum**. `debate_thread` was sharpened into `hot_take`; `money_truth` / `regret_story` / `versus` were added. Persona was promoted to a first-class input — six buyer types, six enthusiast types. Comments dropped the fixed three-persona set for dynamic mapping, so a speaker **opposed** to the body's axis pushes back.

> **And here the data layer quietly broke.** The `validate()` in the publish-ledger script still accepted only the four legacy modes. Generating with the new engine worked, but the ledger write died with `SystemExit`. That ledger fed the learning loop — repetition avoidance and performance weighting. So the system sat in a state where **posts came out and the bot learned nothing.** I replaced the vocabulary wholesale with v2 and normalized the historical ledger with an idempotent migration. Change the model, and a data migration comes with it. Also textbook.

## 5\. It Still Wrote Like a News Article — One More Axis Was Missing

With three axes in place, the body kept regressing to information-listing. Digging in, here's why.

`hook_engine` decides the **first line**. Why you click. But **nothing decided what shape the body took after that line.** Empty slots don't stay empty — the nearest axis picks up the responsibility. So `hook_engine` started deciding the body skeleton too, and slid toward the safest default it knew: listing information.

I added a fourth axis, `format` — the **vessel** the body is poured into.

| format | skeleton | number cap |
| --- | --- | --- |
| `list_drip` | TOP/ranking list, one-line jab per item | minimal |
| `owner_stereotype` | "the ○○ owner type," relatable jabs | 0 |
| `one_line_thread` | short, clipped lines; group-chat bait | 0–1 |
| `fill_in_blank` | "Buy \_\_\_ and you'll \_\_\_" poll bait | 0 |
| `confession` | first-person regret or brag | 0–1 |
| `data_brief` | information summary — **only on explicit request** | high |

The last row is the whole point. **Take the information-summary format out of the default set.** The default is one of the other five community vessels; `data_brief` opens only when a human explicitly asks for it. News-article voice is no longer a state you can reach by accident.

Same material, different vessel, different post. Sales figures in a table are an article. The same figures dripped through `list_drip` are a post.

<!-- TODO: the same material as §1, regenerated as confession or list_drip. The before/after pair is the post's real conclusion. -->

```plaintext
(same material, regenerated with a different format)
```

Even with the axes right, article-voice sentences mean failure — so the body voice has hard rules that trigger a reject.

1.  **Number cap** — outside `data_brief`, at most two key numbers per body. Percentage deltas or a row of model-by-model figures auto-reject.
2.  **Open on situation, feeling, or provocation** — never on data.
3.  **No links in the body** — sources go in a comment footnote.
4.  **Never name the source community** — no "I saw this on some forum…". Rewrite it in first person.

## 6\. What I Chose Not to Build — Auto-Pick

I stacked Auto-Pick on the four axes: *drop a link, the bot picks the axes itself.* It worked. I pulled it out of production anyway.

Let the bot source the *material* too and the topics scatter. A marketing channel needs material with proven traction, and for that judgment, human intuition beats bot heuristics. So I fixed the boundary: **a human picks the source. The bot owns transformation and variety.**

That ties the scope of automation to the scale of the operation, not to what's technically possible.

## 7\. So — Four Axes

```plaintext
post = hook_engine × persona × format × (topic_tag*)   + voice (hard constraints)
```

I didn't design this up front. It's what was left after hurting, one at a time, in order.

The identity was wrong, so tone wouldn't hold → four criteria were crammed into one enum, so classification collided → there was no speaker axis, so I couldn't regenerate → there was no body-skeleton axis, so it slid back into article voice. The four axes aren't a blueprint. They're **four autopsies**.

## 8\. Lessons

-   **A content model is a refactoring target.** Enum conflation → orthogonal decomposition → filling a missing abstraction. It's the same work you do in code. Treat prompts as prose and this structure stays invisible.

-   **When the same failure repeats, suspect the axis, not the rules.** Trace "why the same failure mode every time" and you find a missing axis at the end of it. Twenty rules didn't fix it because there was no handle to turn.

-   **Change the model and the data follows.** The ledger's `validate()` was a hidden coupling point into the learning loop. When you change a vocabulary, design the historical-data normalization alongside it.

-   **The default *is* the policy.** What stopped the article voice wasn't a rule. It was one line: `data_brief` removed from the default set.
