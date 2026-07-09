---
title: 'Why AI-Generated Posts Read Like News Articles — Refactoring a Content Model Four Times'
description: 'Twenty lines of tone rules, and the bot still wrote news reports. The culprit was not tone. It was a single enum with four different classification criteria crammed into it.'
pubDate: 2026-06-29
tags: ['llm', 'datamodeling', 'refactoring', 'prompt-engineering', 'automation']
category: building
draft: false
---

> [!NOTE]
> Twenty lines of tone rules, and the bot still wrote news reports. The culprit wasn't tone — it was a single `enum` with four different classification criteria crammed into it.

* * *

## 1\. Symptom — The More Rules I Added, the More It Read Like a News Article

I built a bot that generates car posts for a Korean community forum. Every output looked like this.

> [!NOTE]
> The two examples below are reconstructions, not verbatim production logs. They show how the same material reads in each state. The Korean originals are kept as-is — the texture is the point, and it doesn't survive translation.

```plaintext
국산 준중형 전기 SUV의 3년 감가율이 화제다.

중고차 시세 자료에 따르면 해당 모델의 3년 잔존가치는 신차가 대비 약 58%
수준으로, 동급 내연기관 모델(71%)보다 13%p 낮은 것으로 나타났다.

전문가들은 전기차 감가의 주된 원인으로 ① 배터리 열화에 대한 소비자 불안
② 신형 모델의 주행거리 개선 ③ 보조금 정책 변화에 따른 신차 가격 하락을 꼽는다.

다만 최근 3개월간 하락폭은 둔화되는 추세다. 전기차 구매를 고려한다면
감가율과 함께 총 보유 비용(TCO)을 함께 살펴볼 필요가 있다.
```

*Roughly: "The three-year depreciation of a domestic compact electric SUV is drawing attention. Used-car data shows a residual value of about 58% versus 71% for comparable combustion models, 13 points lower. Experts cite ① battery-degradation anxiety ② range improvements in newer models ③ subsidy changes. That said, the decline has slowed over the past three months. Buyers should weigh depreciation alongside total cost of ownership."*

Nothing wrong with the grammar. Nothing wrong with the facts. And nobody responded — because there was nothing to respond to.

Look at what's actually in there. The sentences end in `~다`, the declarative register of Korean newspapers. Five numbers. Causes enumerated as `①②③`. And it closes with "buyers should weigh…", offending no one. **That's the skeleton of a news article,** not a forum post.

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

Same material, different vessel, different post. Take the depreciation piece from §1, hold the material fixed, and regenerate it with `hook_engine=regret_story` / `format=confession`:

```plaintext
3년 타고 팔러 갔다가 딜러 앞에서 말을 잃었습니다.

살 때는 보조금 받아서 싸게 샀다고 좋아했어요. 충전비 아끼는 재미도 있었고.

근데 파는 날 부른 금액이, 산 값의 절반을 조금 넘겼습니다.

딜러가 그러더라고요. "배터리는 멀쩡한데, 요즘 신형이 주행거리가 훨씬 길어서요."

3년간 아낀 충전비가 얼마였더라, 집에 와서 계산해봤습니다.
감가로 날린 돈 근처에도 못 갔습니다.

전기차 사지 말라는 얘기가 아닙니다.
"유지비 싸다"는 말만 듣고 계산기를 두드린 거, 그게 제 실수였어요.

3년 뒤에 얼마 받는지부터 알아보고 사세요.
```

*Roughly: "Drove it three years, went to sell it, and lost my words in front of the dealer. When I bought it I was thrilled about the subsidy. Loved saving on charging, too. But the number he quoted was barely over half what I paid. He said: 'Battery's fine — it's just that the new ones go so much farther.' I got home and added up three years of charging savings. Didn't come close to what depreciation took. I'm not telling you not to buy an EV. My mistake was running the numbers on 'cheap to run' alone. Find out what it's worth in three years — before you buy."*

Same depreciation. Same battery. Same range story. **Not one fact changed.** Only the vessel did. Five numbers collapsed into "barely over half." The `①②③` became one line of dealer dialogue. The neutral close became regret.

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
