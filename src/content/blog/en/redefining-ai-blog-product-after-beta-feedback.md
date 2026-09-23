---
title: "[WeBlog Part 2] Redefining the Product Direction After Beta Feedback"
description: "How beta users' questions and behavior changed WeBlog's customer hypothesis, onboarding, B2C/B2B direction, and value proposition."
pubDate: 2026-09-23
updatedDate: 2026-09-23
tags: ["product-development", "pivot", "seo", "observability"]
category: systems
cover: /images/poc-pivot/pivot-whiteboard.jpg
coverAlt: "A whiteboard discussion comparing B2C and B2B directions for WeBlog"
coverCaption: "September 2026, comparing B2C and B2B business directions."
series: weblog-development
seriesOrder: 2
seriesTitle: "Building WeBlog"
---

## Introduction

[Part 1](/en/blog/from-content-automation-poc-to-product-pivot/) covered how WeBlog took a user's topic idea, turned it into a source-backed post, published it, and observed search and AI access. Before the beta, the question was whether the system could work. After opening the beta on August 18, 2026, the question changed.

**Did users actually want this working service? If so, who would pay for what result?**

The retrospective counted 75 real users and 201 blogs created. Eighty-six of those blogs were still publishing automatically, and the service had published 4,691 posts. The product worked, but those numbers alone did not tell me who would keep paying for it. After the beta, I paid more attention to user questions, return visits, login friction, channel risk, and why the price did or did not make sense.

![The pre- and post-beta work timeline. The source says “first nine weeks,” which does not match the calendar range, so the article uses August 18 as the boundary.](/images/poc-pivot/timeline.png)

> [!NOTE]
> The observation window in this post is July 6 through September 9, 2026. I checked the search screens again on September 18 while editing the retrospective. This is a product-direction retrospective, not a claim that the B2B pivot had already been commercially proven.

## Customer Assumptions and Beta Feedback

The first direction was B2C: a product for individual users. We expected homemakers or side-job users familiar with Naver Blog to reduce the burden of writing, publish new posts automatically, and be discovered through search or AI answers.

The problem I thought I was solving was the inconvenience of writing. A user chooses a topic, the service creates a sourced post, and the blog keeps publishing. At the time of the retrospective, that technical flow worked.

But a product working is not the same as a user paying to keep using it. Even with automatic publishing, users needed a reason to return. Many also found the idea of an independent blog, a custom domain, and Google-driven traffic unfamiliar.

**Channel Risk Exposed During the Beta**

From August 18 to September 9, I looked for reasons people did not keep using the product. When the beta opened, real users arrived. The first Threads post got a strong reaction and brought in about 50 people in a day. Early on, we connected signups through DM automation and invite codes.

![The first Threads post and its reaction. It received 112 likes and 558 comments. Checked August 26, 2026.](/images/poc-pivot/threads-account-deletion.png)

The first reaction was good. A few days later, the Threads account was deleted, possibly because of the DM automation we were running to bring in traffic from external links. While tracing the cause, I learned that an acquisition tactic could put the channel itself at risk.

| Signup period | Real users |
| --- | ---: |
| Aug 18-31 · invite-code signup | 68 |
| Sep 1-9 · open signup | 7 |

![The first Threads reaction and signup flow by channel. A retrospective view of the signup-policy and channel-operation changes.](/images/poc-pivot/channel-risk.png)

The lasting lesson was less about the signup count and more about channel risk. We started avoiding automated Threads DMs and treating Threads as a content channel rather than a DM promotion channel. We added sources to links and began watching which post led to which behavior.

**User Questions Pointed to Payback, Not Writing**

Once the B2C service was open, we could hear what customers were actually thinking. These messages appeared in the open chat:

> “Can that be monetized too?”
>
> “How do I add it? Do I need to buy a domain?”
>
> “I’m not sure I could even earn back the service fee.”

![Actual user questions in the open chat. Member names and nicknames are hidden.](/images/poc-pivot/customer-questions.png)

For homemakers and side-job users familiar with Naver Blog, the idea of reaching an independent blog through Google search was unfamiliar. Before adding more features, we had to understand that gap.

Users were asking something earlier than "can it write automatically?" They were asking, "Why should I run a blog this way?" and "How does a generated post connect to my goal?"

Products such as Inblog looked like SaaS products for companies and global markets. The way a customer recovered the cost was different. Before copying features, I had to decide what result our customer was buying. The customer filter became **someone who could recover 190,000 won**.

That changed how I heard "it is expensive." It was less about the number itself than about not seeing the payback. If creating a new blog, attaching a separate domain, and waiting to be discovered in search and AI answers do not connect to a person's revenue model, it is hard to keep using the service.

## Improving Signup and Return Flows

The feedback exposed both friction in using the service and doubts about its value. We addressed the signup and return flows as concrete usability problems.

At signup, we revisited the account system first. We first attached WeTeam Hub login. WeTeam Hub is the company's own signup and login system. Because we started with a company-account flow, it became a signup barrier for individual users. We also had not fully decided which of email, age, legal name, and phone number to collect, under what consent, or how to use them for analysis and messaging after signup.

We then moved to one-click Kakao login, which was familiar to individual users. We stored the name, contact information, and age range delivered with consent, and did not ask for a phone number again on screen. During implementation, a value we thought was optional appeared as required on the consent screen because of the request configuration. We aligned the requested fields with the consent screen and revised the privacy policy three times to match the actual fields.

A login button was not the whole onboarding design. Making signup easy and deciding what information and consent the later analysis and messaging needed had to be designed together.

Even with automatic publishing, users need a reason to return. We built Kakao notification and email templates to tell them about publishing status and upcoming free-period expiration.

![An email and a Kakao notification message showing publishing status. Only member names are hidden.](/images/poc-pivot/notifications.png)

Making notifications did not prove that revisits improved. It separated the question "How do we tell users why to come back?" from the rest of the product. The better the automation worked, the more important it became to report the result. We also considered web push and a community: the trigger we send and the reason a user comes back on their own are different things.

## We Split B2C and B2B, Then Narrowed the Customer Hypothesis

Easier signup and publishing notifications could not answer whether the service would pay for itself. That required revisiting the customer and value proposition, not just the interaction flow.

In September, we split the direction into B2C, aimed at individuals, and B2B, aimed at companies and business operators.

![A September 2026 discussion comparing B2C and B2B directions on a whiteboard.](/images/poc-pivot/pivot-whiteboard.jpg)

| Direction | Target | Value |
| --- | --- | --- |
| B2C | Existing Naver Blog operators | Export posts into a familiar blog |
| B2B | Businesses that already have their own site | Documents discoverable through search engine optimization (SEO) and generative engine optimization (GEO) |

For B2C, we considered exporting into an existing Naver Blog instead of asking people to start a new blog. We removed automatic topic generation from that direction. The question was how far to enter an existing operator's workflow, not how many features we could add.

For B2B, we saw businesses that had a site but were not being found enough in search or AI answers. The question moved from writing posts on someone's behalf to creating documents that could bring in business traffic.

When the customer changed, the role of existing features changed too. WeTeam login had been a barrier for individual users, but it became relevant again for company customers working as a team.

The things built earlier were still useful: source-backed article structure, search-visible publishing, domain connection, crawler observation, and deployment stability. What changed was the question "Who needs this, and why?"

```plaintext
Validated before the beta
Topic → generation → publishing → search/citation possibility

What the pivot must validate
Customer goal → needed documents → discoverability → traffic → customer value
```

The customer filter changed too. We started looking for **customers where one inquiry or contract had an explainable value**, then narrowed the target to hospitals and real-estate businesses. The self-employed plan we had written down was 190,000 won; enterprise pricing was to be discussed separately. We pictured people such as brokerage assistants or hospital office staff who manage content in practice, and we also named a specific hospital brand blog as a target.

![A whiteboard outlining a brand blog, workflow, and self-employed/enterprise pricing for hospitals and real-estate businesses.](/images/poc-pivot/target-pricing-whiteboard.jpg)

Small hospitals and real-estate businesses start from a disadvantage when people ask AI for recommendations. Larger organizations have accumulated articles, reviews, and documents; a small business may have only one homepage. Without reference documents, even a good business has little material for an AI answer to use.

So we redesigned the revenue model around specialist blogs for hospitals and real-estate businesses, with agencies partnering to operate them for customers. At the time of the retrospective, we had existing customers and were applying the source-backed structure and publishing flow to those specialist blogs. That is a record of direction and early application, not proof that traffic and inquiries had already been validated.

## The Next Thing to Validate Was Traffic and Inquiries

Choosing a direction did not prove customer value. We still had to check whether documents appearing in search led to visits, whether visits led to inquiries, and whether customers found those results valuable enough to pay for. Having customers and starting application work is different from proving a repeatable sales structure.

Operational automation was the base for continuing that validation. We monitored servers and external API usage, added cost-threshold alerts, and switched accounts automatically before quota ran out. I wrote the implementation details separately in [the post on switching LLM accounts before the quota runs out](/en/blog/switching-llm-accounts-before-the-quota-runs-out/). Stable operations alone do not prove the value customers receive.

## Conclusion

Through the beta, the question changed from "can we build it?" to "who needs this result?" Individual users were unfamiliar with independent blogs, custom domains, and Google-driven acquisition, and the price depended less on feature count than on whether payback was visible. The customer hypothesis narrowed from B2C users familiar with Naver Blog toward hospitals, real-estate businesses, and agency partnerships where one inquiry or contract has higher value.

Some things were reusable: the source-backed article structure, publishing flow, domain connection, crawler observation, and operational automation. What remained unproven was whether specialist blogs for hospitals and real-estate businesses could repeatedly create traffic and inquiries, and whether agency partnerships could become a repeatable sales motion.

The technical starting point, from generation through publishing and search observation, is covered in [Part 1](/en/blog/from-content-automation-poc-to-product-pivot/).
