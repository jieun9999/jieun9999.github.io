---
title: "How Can We Make AI-Generated Blog Titles Readable?"
description: "How I improved verbose AI-generated topic titles by having Grok identify the answer readers need from the input and a verified outline, then choose an appropriate title format."
subtitle: "Letting Grok judge meaning while code preserves and validates titles"
pubDate: 2026-10-18
tags: ["llm", "prompt-engineering", "content-automation"]
category: systems
cover: /covers/readable-ai-titles-en-v1.png
coverFit: contain
coverBackground: dark
coverAlt: "A navy diagram showing input and a verified outline leading to question, informational, or experience-based titles. English labels distinguish Grok's meaning judgment from preservation rules enforced in code."
series: wiblog-quality
seriesOrder: 1
seriesTitle: "Improving Wiblog Titles and Search"
draft: false
---

## Introduction

Wiblog takes a keyword, prepares topic candidates with descriptions, outlines, and sources, and generates an article from the topic the user chooses.

When I reviewed real estate topics myself, the titles often stopped me. They were long and stiff, and I could not immediately tell what answer an article would provide.

This post follows the problems I encountered in use back to the generation instructions and code. In particular, it explains which judgments I left to the LLM and which behaviors I handled in code. It ends with a complete before-and-after comparison from an additional title-generation run on 21 existing topics.

## 1. Discarding Topics Because of Their Titles Led Me to the Generation Path

### I discarded topics because I could not edit their titles

At the time, users could not edit a topic card's title before generating the article. They could edit the title of a generated article, but not while choosing a topic. As a result, I often excluded the entire topic card when I disliked its title.

The saved titles show what this verbosity looked like. The Korean titles are translated into English here and in the comparisons below.

| Area | Original topic title |
| --- | --- |
| Yongsan | Cash settlement risks and how to check contract clauses when buying a Yongsan redevelopment apartment |
| Byeongjeom | Comparing transport, living conditions, market prices, and parking by complex through Byeongjeom officetel resident reviews |
| Hannam | How to check redevelopment status by district and villa listings before a site visit to Bogwang-dong, Hannam |

The titles seemed to contain useful material, but I did not particularly want to click them. Phrases such as “how to check,” “selection criteria,” and “key information” kept recurring. Placed side by side, topics covering different subjects all looked like similar instruction sheets.

### Overlapping problems made it hard to identify what to fix

I was the only PoC engineer, and I was putting experiments into production almost weekly. Identifying what needed fixing took much longer. Awkward titles, outlines drifting away from the original question, and missing source material were appearing together.

I had to distinguish whether a title merely needed shortening, whether the outline was wrong, or whether the sources were insufficient. That meant checking not just the title on screen, but also the generation instructions and the paths where it changed.

### Titles were generated more than once

The system first generated a title from a keyword, then generated another title after gathering material and writing the outline. Improving only the initial title would still allow it to be overwritten later.

```plaintext
Keyword → Initial title → Source collection and outline → Final title regeneration
```

| Generation stage | Previous instruction or behavior | What needed attention |
| --- | --- | --- |
| Initial topic generation | Group topics into categories such as methods, steps, comparisons, and precautions, then write an instructional title | Categories and instructional wording could take precedence over a concrete question. |
| Title generation after the outline | Write a title that represents the outline | Trying to include several outline items could produce a long list. |
| Updating the topic card | Replace the title with the one generated after the outline | Both generation stages needed consistent title principles. |

Trying to represent transport, living conditions, market prices, and parking adds one item after another to the title. This helped explain the verbosity I saw on screen. Without deciding which answer the title should foreground, representing more of the outline could simply make the title longer.

This was an improvement opportunity identified from the previous code and its visible output. I did not trace every intermediate title for each topic and measure whether it grew at every stage.

## 2. Grok Chose the Title Format; Code Enforced the Rules

### Shortening titles or adding question marks was not enough

Changing “how to check” into “how can I check?” makes a sentence a little more conversational. But someone looking for the current status needs the status itself. “Where can I check the current status?” can change the promised answer into lookup instructions.

The intermediate results also leaned too heavily toward questions. Version 9 of the early comparison still produced many question titles, and it also replaced established real estate terminology: “school districts and apartment prices” became wording closer to “schools and house prices, summarized.” In trying to sound natural, it changed terms familiar to readers in the field.

What these iterations revealed was the need to distinguish **the kind of answer the reader wants**. A direct question about an amount, a request for a schedule or list, and a request for actual experiences did not all need the same instructional tone.

| Format | When to choose it | Wording direction |
| --- | --- | --- |
| Question | The reader wants a direct answer about an amount, feasibility, or a choice | Ask how much is needed, whether something is possible, or which option is better. |
| Informational | The reader wants status, lists, school districts, prices, comparisons, or schedules | State the subject and the information the article provides. |
| Experience-based | The reader wants real experiences, satisfaction, or inconveniences, and experience-based sources are available | Describe actual experiences without pretending the author personally had them. |

The word “price” did not automatically trigger a question title. Required purchase funds and a comparison of prices across areas call for different answers. There were no quotas for each format or fixed sentence endings.

### I left interpreting the input and outline to Grok

Grok was already generating the titles. The change was to **instruct Grok, within the title-generation prompt, to choose a format first and then write the title.** A separate classifier did not assign the format.

| Input to final title generation | Purpose |
| --- | --- |
| Target keyword | Identify what the topic was originally meant to address |
| A sentence saved by a person | Preserve the subject, conditions, and wording of the question |
| Verified outline items, descriptions, and source links | Establish the planned article's content and the scope of its evidence |
| The topic's reader question | Provide wording guidance when no saved sentence exists |

Grok reads the input and outline, determines what answer is being sought, and writes a title in a form that conveys that answer. The aim was to generate a natural title suited to the planned content, without forcing it into a fixed sentence template. Question, informational, and experience-based formats are criteria that help guide that judgment.

The title model does not read the entire finished article. Source texts are used to write and verify an outline, which is then passed to title generation. The reader question is also only wording guidance, not factual evidence.

### From topic to title: a step-by-step timeline

The following is an illustrative example of the processing flow. It shows how a draft covering several points narrows its focus after the outline is available.

![Illustrative six-step title pipeline: code passes the keyword, Grok drafts a title, sources support a verified outline, Grok writes the final title, and code validates, saves, and preserves it.](/images/title-generation/title-timeline-en-v2.png "diagram")

Association eligibility and contract clauses remain in the outline as material to explain. The title foregrounds the question connecting them: “Could I buy the property and still end up with cash settlement?” Grok decides what belongs in the title, while code keeps the validated title in subsequent generation steps.

### I handled mandatory behavior in code

Choosing natural wording is different from preserving saved input or checking for required response fields. I left meaning judgments to Grok, but did not rely solely on prompts for rules that code could enforce explicitly.

| Judgment or behavior | Grok's responsibility | Code's responsibility |
| --- | --- | --- |
| Title format and wording | Read the input and outline, then choose a suitable form and expression | Do not force a format based on particular words. |
| Whether the input can be answered | Assess it through `answered` and `reason` in `input_coverage` | Check for missing assessments and hold results that say the input cannot be answered. |
| A sentence saved by a person | Assess whether the question can be answered | Restore the saved wording as the title after a positive coverage assessment. |
| Preserving the original intent | Avoid substituting another question when the available material is insufficient | Block certain clear cases where a request for current status is turned into lookup instructions. |
| Subsequent generation | Write the article to match the finalized title | Use the finalized title during article generation and rewriting. |

`input_coverage` is **an LLM's assessment of meaning**. Checking its value in code does not independently verify the facts in the sources.

A saved sentence takes precedence over format selection. I did not let the model rewrite a person's question into its preferred wording. The rule blocking a change from status to lookup instructions also distinguishes inputs and saved sentences that explicitly asked for lookup instructions in the first place.

## 3. Regenerating Titles for the Same 21 Topics

These are English translations of the Korean titles, not a separate English generation experiment. “Jeonse” refers to Korea's lump-sum deposit rental arrangement; “villa” here refers to low-rise multifamily housing.

| No. | Original title | Regenerated title or outcome |
| ---: | --- | --- |
| 1 | Cash settlement risks and how to check contract clauses when buying a Yongsan redevelopment apartment | Could buying a Yongsan redevelopment apartment leave me facing cash settlement? |
| 2 | Stages and current status of the Bangbae Imgwang 3rd Complex reconstruction project | Bangbae Imgwang 3rd Complex reconstruction: current stage and owner contributions |
| 3 | What are the sale terms and contact methods for remaining retail units at Mapo Newmad officetel? | Remaining retail units at Mapo Newmad officetel: sale terms and location |
| 4 | Checking owner-occupancy requirements and the complex environment before a Segyo 2 Jungheung S-Class jeonse contract | Segyo 2 Jungheung S-Class jeonse: owner-occupancy requirements and the appeal of the 34-pyeong layout |
| 5 | Complexes benefiting from the Osan Station GTX-C extension: Segyo New Town accessibility and price increases | Complexes benefiting from the Osan Station GTX-C extension: accessibility changes in Segyo District 2 |
| 6 | Segyo M-bus route to Gangnam Station and how to use peak-hour departure reservations | Segyo M-bus route to Gangnam Station and peak-hour service intervals |
| 7 | Checking Yongsan Park's impact on apartment prices and land transaction permit risks | How the development of Yongsan Park affects nearby apartment transaction prices |
| 8 | Reasons and investment advantages of buying a villa instead of a Yongsan redevelopment apartment | Is buying a villa better than a Yongsan redevelopment apartment? |
| 9 | Preparing the deposit and balance after winning a Seoul apartment lottery for unallocated units in October 2026 | After winning a Seoul apartment lottery for unallocated units in 2026, how much is the deposit and when is it due? |
| 10 | How to check redevelopment status by district and villa listings before a site visit to Bogwang-dong, Hannam | Bogwang-dong, Hannam site-visit route and redevelopment progress by district |
| 11 | Ansan Lake Town Prugio location, facilities, and resident reviews of drawbacks | Ansan Lake Town Prugio resident reviews |
| 12 | Yangpyeong Station location analysis: parking and living conditions through resident reviews | Resident reviews of apartments near Yangpyeong Station |
| 13 | How to check project stages and district status in the Geoyeo–Macheon redevelopment promotion area | Geoyeo–Macheon redevelopment promotion area: project stages in the 2025 notice and changes to Macheon districts |
| 14 | Aircraft noise in Jangji-dong: officetel reviews and noise-affected area support | Living with aircraft noise in a Jangji-dong officetel: resident reviews |
| 15 | Apartment jeonse prices near major companies in Dongtan: differences by location and selection criteria | No finalized title — held because the assessment found that the input question could not be answered |
| 16 | Comparing transport, living conditions, market prices, and parking by complex through Byeongjeom officetel resident reviews | Byeongjeom officetel resident reviews: transport, parking, and maintenance fees by complex |
| 17 | Jeonse apartments next to elementary schools in Byeongjeom, focusing on deposit levels and complex features | Jeonse apartments next to elementary schools in Byeongjeom: deposit levels and complex pros and cons |
| 18 | Reasons for the estimated Sanggye Jugong 5th Complex contribution, post-contract risks, and pre-purchase checks | Why the Sanggye Jugong 5th Complex contribution is estimated at ₩500–600 million |
| 19 | Realistic additional reconstruction contributions and risk checks for Nowon-gu apartments | Sanggye Jugong 5th Complex reconstruction: ₩700 million additional contribution, ₩1.4 billion total investment |
| 20 | Seongsu Strategic Redevelopment Zone progress and how to check status by district | Seongsu Strategic Redevelopment Zone: progress by district |
| 21 | Comparing the prime locations of Mokdong New Town Complexes 5 and 7: why Complex 5 leads in reconstruction | Mokdong Complexes 5 and 7: reconstruction feasibility and location comparison |

### The titles made the promised answers clearer

The clearest change was that instructional phrasing and lists receded, while the reader's question or the information provided came to the foreground.

For Seongsu, “progress by district” replaced “how to check status,” making the information available in the article immediately clear. The Jangji-dong title moved from listing noise, reviews, and support information to resident reviews of aircraft noise in an officetel, making the experience being discussed more specific.

The deposit title became longer, but replaced the vague idea of “preparing” with “how much and when?” The point of this change was **to clarify what the article answers**, rather than simply make titles shorter.

## Conclusion

The starting problem was long, stiff titles. Addressing it required both a judgment about what to keep in the title and code that preserved that judgment afterward.

I left interpreting the input and outline and selecting the title's form to Grok. I used code to preserve original wording, handle explicit errors, and retain finalized titles. That boundary let the title express the answer the planned article could provide and kept the result intact through later generation stages.

The next post covers carrying the needed answer into search queries and assigning collected platform documents across topic candidates.
