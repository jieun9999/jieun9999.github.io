---
title: "Two Months Building an AI Blog Service — From 'Can We Build It?' to 'Who Will Use It?'"
description: "A two-month retrospective on an AI blog service: validating search indexing, source-backed writing, keyword discovery, cost, UX, deployment, channel risk, retention, operations, and a pivot toward a B2B model for hospitals and real-estate businesses."
pubDate: 2026-09-18
tags: ["poc", "product-development", "pivot", "llm", "seo", "observability"]
category: systems
cover: /images/poc-pivot/pivot-whiteboard.jpg
coverAlt: "A discussion about B2C and B2B directions written on a whiteboard"
coverCaption: "September 2026, comparing B2C and B2B business directions."
---

This is a record of building and beta-testing WeBlog from **July 6 to September 9, 2026**. While editing the retrospective, I checked the search results again on September 18 and mark those observations separately.

We opened the AI blog service beta on August 18. Before that, I was focused on one question: “Will Google put this article in its search results?” After the beta opened, the question changed to “Why don’t people come back?” More precisely: “Who would pay to keep using this?”

### Current state — 75 real users and 86 blogs running on their own

The retrospective counted 75 real users and 201 blogs created. Eighty-six of those blogs were still publishing automatically, and the service had published 4,691 posts. The product worked, but those numbers alone did not tell me who would keep paying for it.

Looking back, the pre-beta period was about building. After the beta opened, I spent the time finding out why people did not use it.

The first part follows search indexing, domains, article structure, topic discovery, cost, UX, and deployment. The second follows channels, return visits, login, customer questions, operations, and the B2C/B2B fork toward the question “Who is this for?”

![The pre- and post-beta work timeline. The source says “first nine weeks,” which does not match the calendar range, so the article uses August 18 as the boundary.](/images/poc-pivot/timeline.png)

> [!NOTE]
> In the screenshots taken from the retrospective, only member names are hidden. The cover uses the original discussion photo, and the search examples use screenshots checked directly in incognito mode on September 18.

---

## 1\. Before the beta — Can a post make it into search results?

From July 6 through August 17, every pre-beta decision started with one question: “Will Google put this article in its search results?”

I was not trying to prove that an LLM could write a post. It could. The problem was whether that post could make it through everything that came after.

```plaintext
Find a topic
  ↓
Collect sources
  ↓
Generate the body and validate its structure
  ↓
Publish · connect a domain
  ↓
Watch search visibility and external access
```

A blog post is not finished when it is generated. It has to open at a public address, be readable by search engines, and contain sources that a person can trust. Before the beta, I focused on stopping uncontrolled publishing and reliably sending posts all the way to search.

### The basic address and a personal domain produced different search results

I checked posts published at the default address and at a personal domain with a `site:` query. The share of posts I could find in search was very different.

| Target | Published posts | Found in search | Rate |
| --- | ---: | ---: | ---: |
| Default `*.witim.blog` | 3,040 | 224 | 7.4% |
| Personal domain `coinmanual.blog` | 98 | 92 | 93.9% |

![Actual search screens comparing the default address and a personal domain. The left side shows 224 of 3,040 posts (7.4%); the right shows 92 of 98 (93.9%) and continues to page 9.](/images/poc-pivot/indexing-comparison.jpg)

These were numbers from a `site:` search at the time. Search-result counts are not the complete index, and this was not a controlled experiment matching topic, publication date, and external links. Still, the difference was large enough that a domain could not remain a post-publishing detail.

### So we made it possible to buy and attach a domain inside the product

![The decision that connected indexing observations to domain purchase and connection. Search → payment → registration → connection became one flow.](/images/poc-pivot/domain-purchase-flow.png)

WordPress and Inblog, which I looked at then, both emphasized buying and connecting a domain from the beginning. If a user had to buy a domain elsewhere, configure DNS, and check the connection before starting an experiment, the flow stopped even if article generation was good. We put domain search, payment, registration, and connection checks inside the product. The path went from `workb.xyz` to `witim.blog` and then to a custom domain; at the time of the retrospective, 36 of 201 blogs used their own domain.

For domain connection, I separated “the request was sent” from “the service is actually open.” A failed request triggered an automatic full refund, and the connection was marked complete only after the service opened. We had also once lost an entire site from indexing because its canonical address was not set. A domain was not a setting to add after publishing; it was a condition for starting the search PoC.

## 2\. Article structure — No source, no article

Next I worked on the shape of an article. I pulled apart high-ranking posts and found the same pattern: a question-shaped title, a quick answer at the top, a table of contents and body broken into 3–5 lines per item, an FAQ, and references. A “recommended guide” was too loose; the generator needed hard rules.

![The top summary and the references/FAQ at the bottom of a generated article. Only the author name is hidden.](/images/poc-pivot/article-structure.png)

The strictest rule was the source requirement. If we could not find a source, we did not create the post. A natural-sounding sentence is not enough; otherwise the product only accumulates attractive documents with no way to verify them.

This mattered most for topics such as health and finance, where incorrect information is costly. We looked for reference documents before generation and stopped the pipeline when the evidence was not ready. The example article also cites a public institution.

### AI actually picked up a published article

I saw a post built with that structure cited as a source in a Google AI Overview. That became the technical starting point when we later narrowed the PoC to hospitals and real-estate businesses.

![A Google AI Overview citing a WeBlog article as a source. Searching for “marriage vow sample writing order” shows the generated article in the source card on the right. An AEO success case.](/images/poc-pivot/aeo-citation-success.png)

![The product screen showing AI access at article level. Of 75 published posts, robots read 74, 26 were AI-answer candidates, and 24 were counted as cited. Only member names are hidden.](/images/poc-pivot/ai-crawl-dashboard.png)

We watched which AI crawlers accessed which posts through server access logs. It gave users a product view of external access that does not appear in a search-ranking table.

The read and citation counts in the crawl dashboard are observations under the product’s own counting rules. I kept them separate from the citation I verified directly in an answer screen: a crawler visit by itself does not prove that an answer cited the post.

### The posts also appeared near the top of ordinary search results

Separate from AI citation, I checked where published posts appeared in ordinary search. On September 18, I searched two terms again in Google’s logged-out incognito mode. The posts appeared in ordinary results even without a `site:` restriction.

![A search for “Yongsan redevelopment land-transaction-permit zone” in incognito mode. The blue highlight marks the published blog post. Checked September 18, 2026.](/images/poc-pivot/search-incognito-yongsan.png)

![A search for “new apartment presale in Mapo-gu” in incognito mode. A published blog post also appears for this query. Checked September 18, 2026.](/images/poc-pivot/search-incognito-mapo.png)

These screens show **that the post appeared in ordinary search results**. Whether the documents would keep ranking and turn into real traffic was still an open question.

## 3\. Topics — The hardest question was what to write about

Once the article structure was in place, the problem at the front became clearer. Users do not start with “write me a good post.” They start with “what should I write about?”

Large keywords are competitive, while a topic with no demand brings no readers. It was hard for a beginner to choose something useful in between.

After several attempts, we used Google and Naver autocomplete as the starting point for topic candidates. Entering “special health checkup,” for example, immediately produced seven candidates, with a badge showing which search engine produced each one.

![Autocomplete candidates from one keyword. G and N badges distinguish Google and Naver.](/images/poc-pivot/keyword-discovery.jpg)

Autocomplete quickly provides search-shaped candidates. More importantly, it is a signal that people have actually typed those expressions into a search box. We queried both engines at once, merged the results, paid no separate search-API fee at this step, and stored each result for seven days.

Autocomplete does not guarantee performance. A phrase appearing there does not mean a new blog will rank or receive traffic. What we needed at this stage was not a profitable keyword guarantee, but a list a user could scan quickly.

## 4\. Speed and cost — Measure before cutting

Seeing a post appear in search did not mean we could jump straight to user validation. Repeating the PoC required costs and waiting times we could actually carry.

The slowest and most expensive step was collecting sources. DataForSEO charged on every call. We started by splitting the logs: how many times each stage was called, why it failed, whether a cache was used, and whether the request actually incurred a charge.

![Measure → split → store → watch. The cost-improvement sequence from billing logs to shared results for related topics, a seven-day cache, and balance alerts.](/images/poc-pivot/cost-measurement.png)

Only then did we see what to remove.

- Related topics share the same search results.
- A found document is cached for seven days.
- A site that keeps failing does not get an expensive retry loop.
- External API usage sends an alert before the balance becomes a problem.

Once we measured it this way, we could say what changed instead of only saying “it got faster”: which calls were skipped and how much the work fell.

### UX — Follow the flow on the right and reach publishing

The personal console showed the current step, remaining work, and next publishing time in one flow. I added motion when a step changed. But the screen could not feel smooth if the wait itself was long.

![The personal console flow from choosing a keyword to publishing. The current step and next publishing time appear on the right.](/images/poc-pivot/publishing-flow.jpg)

| Item | Before | After |
| --- | ---: | ---: |
| First onboarding wait | 21.9s | 8.6s |
| Domain search | 8.2s | 1.4s |
| First-screen data | 596KB | 189KB |
| Preview server calls | 17 | 1 |

These are the before-and-after figures recorded in the retrospective. Instead of collecting every keyword before moving to the next screen, we started first and fetched the rest behind it. We did not remove all computation; we changed what the user had to wait for first.

## 5\. Deployment — If deployment is scary, nothing gets fixed

At first the site went down for more than ten seconds on every deployment. When a customer domain pointed to our server, that outage was the customer’s blog going down.

We applied blue-green deployment to both the admin screen and the API. The new version started beside the old one, switched over only after it passed health checks, and left the old version stopped rather than deleting it. If something went wrong, we could roll back within 20–30 seconds.

This did not prove customer demand. But a pivot requires frequent experiments, and frequent experiments require a cheap rollback. If deployment is frightening, you leave known product problems untouched. Once rollback was cheap, designers could also change screens directly.

## 6\. Things we built and abandoned

Many things built before and after the beta did not survive. The retrospective timeline shows six: promotional copy, automatic topic generation, Q&A-based topics, a second writing engine, invite-code signup, and WeTeam login. Some lasted almost a month; others lasted days.

![Six approaches we built and abandoned. Bar length shows how long each approach remained.](/images/poc-pivot/discarded-experiments.png)

| Abandoned approach | Duration |
| --- | ---: |
| Promotional copy | 29 days |
| Automatic topic generation | 23 days |
| Knowledge-iN topics | 5 days |
| Second writing engine | 7 days |
| Invite-code signup | 14 days |
| WeTeam login | 12 days |

### Why we abandoned Knowledge-iN topics after five days

![The two reasons we stopped the Knowledge-iN topic experiment and the later data. Question density differed by field, and normalizing questions into search terms was slow.](/images/poc-pivot/keyword-experiment.png)

We thought extracting topics from questions people had actually asked would be closest to real demand. We wrote four design documents and built it, but two problems made it a poor default input.

**The fields were uneven.** Everyday and entertainment categories had many questions, while finance, current affairs, and politics had few. The density was not consistent enough for a basic input that should work across topics.

**Normalization was slow.** Turning question titles and body snippets into search terms took time. That did not fit a flow where users expect candidates immediately after pressing a button. Collecting more questions would not solve either problem.

When we later counted 158 sites and 4,389 posts on September 7, finance and investing had the highest views per post (**0.900**) and the highest dashboard AI-citation metric (**3.84**). Culture/hobbies and IT were at zero for those metrics. The figures are from the retrospective and cover a different population and time from the single-blog observation above. Only later did I notice that the fields performing well were the fields with thinner Knowledge-iN question data. We did not abandon it with that knowledge; we abandoned it because coverage and speed did not fit, and learned about customer response later.

## 7\. After the beta — The risk was the channel, not the signup count

From August 18 to September 9, I looked for reasons people did not keep using the product. Some things only became visible once real people arrived.

The first Threads post got a strong reaction and brought in about 50 people in a day. Early on, we connected signups through DM automation and invite codes.

![The first Threads post and its reaction. It received 112 likes and 558 comments. Checked August 26, 2026.](/images/poc-pivot/threads-account-deletion.png)

The first reaction was good. A few days later, the Threads account was deleted, possibly because of the DM automation we were running to bring in traffic from external links. While tracing the cause, I came to see automated Threads DMs as a risk and decided to avoid using them. Threads worked better as a content channel than as a DM promotion channel, so we began tracking the source of each link and what action followed each post.

| Signup period | Real users |
| --- | ---: |
| Aug 18–31 · invite-code signup | 68 |
| Sep 1–9 · open signup | 7 |

![The first Threads reaction and signup flow by channel. A retrospective view of the signup-policy and channel-operation changes.](/images/poc-pivot/channel-risk.png)

## 8\. Revisit — Build triggers that bring people back

Even with automatic publishing, users need a reason to return. We built Kakao notification and email templates to tell them about publishing status and upcoming free-period expiration.

For email, we first built the send queue and history, then prepared 21 templates covering publishing status and free-period expiration. We tracked delivery, bounces, opens, and clicks separately. Users checked Kakao notification messages more often than email.

![An email and a Kakao notification message showing publishing status. Only member names are hidden.](/images/poc-pivot/notifications.png)

Making notifications did not prove that revisits improved. It separated the question “How do we tell users why to come back?” from the rest of the product. The better the automation worked, the more important it became to report the result. We also considered web push and a community: the trigger we send and the reason a user comes back on their own are different things.

## 9\. Login and onboarding — Fix it later and it is too late

We first attached WeTeam Hub login. WeTeam Hub is the company’s own signup and login system. Because we started with a company-account flow, it became a signup barrier for individual users. We also had not fully decided which of email, age, legal name, and phone number to collect, under what consent, or how to use them for analysis and messaging after signup. Only after opening the doors did we realize we needed to see age range and acquisition source together.

We then moved to one-click Kakao login, which was familiar to individual users. We stored the name, contact information, and age range delivered with consent, and did not ask for a phone number again on screen. During implementation, a value we thought was optional appeared as required on the consent screen because of the request configuration. We aligned the requested fields with the consent screen and revised the privacy policy three times to match the actual fields.

A login button was not the whole onboarding design. Making signup easy and deciding what information and consent the later analysis and messaging needed had to be designed together.

## 10\. The limit of the B2C business — Side-job and homemaker customers could not pay 190,000 won

Once the B2C service was open, we could hear what customers were actually thinking. These messages appeared in the open chat:

> “Can that be monetized too?”
>
> “How do I add it? Do I need to buy a domain?”
>
> “I’m not sure I could even earn back the service fee.”

![Actual user questions in the open chat. Member names and nicknames are hidden.](/images/poc-pivot/customer-questions.png)

For homemakers and side-job users familiar with Naver Blog, the idea of reaching an independent blog through Google search was unfamiliar. Before adding more features, we had to understand that gap.

The problem I thought I was solving was the inconvenience of writing. Users were asking something earlier: “Why should I run a blog this way?” and “How does a generated post connect to my goal?”

Products such as Inblog looked like SaaS products for companies and global markets. The way a customer recovered the cost was different. Before copying features, I had to decide what result our customer was buying. The customer filter became **someone who could recover 190,000 won**.

That changed how I heard “it is expensive.” It was less about the number itself than about not seeing the payback. If creating a new blog, attaching a separate domain, and waiting to be discovered in search and AI answers do not connect to a person’s revenue model, it is hard to keep using the service.

## 11\. Operations — Email the developer when a resource or cost threshold is crossed

Before the beta, I was busy building features. After it opened, we needed a system that could keep operations alive. We watched server resources, external API status, and AI account usage on one screen, and sent an email to the developer when a resource or cost threshold was crossed. Grafana refreshed every 30 seconds.

![The full Grafana dashboard. CPU, memory, disk, external API balance, account usage, and server load are visible on one screen.](/images/poc-pivot/monitoring.jpg)

Weekly demand was 112% of one account’s limit, so we ran two accounts. When the primary account reached 80% usage, we switched to the backup and returned after the limit reset. That automatic switch did not prove the product’s value. It did mean the server handled work a person used to do manually while no users were watching, which let the beta keep running.

The EvoLink balance in the retrospective screen was **$63.67**, with **20.8 days** remaining at the burn rate then. Showing when to act mattered more than showing the balance alone.

![A Grafana alert received when the EvoLink balance fell below five days at the recent seven-day burn rate. It included the action and a dashboard link. Only the recipient name is hidden.](/images/poc-pivot/monitoring-alert.png)

We reduced the alert rules from 24 to 21, and limited the balance alert to two emails at four-hour intervals. Too many alerts blur operational judgment. The useful alerts are the ones that require action.

## 12\. Direction — Split the B2C and B2B business paths

In September, we split the direction in two.

![A September 2026 discussion comparing B2C and B2B directions on a whiteboard. The same original photo is used for the cover.](/images/poc-pivot/pivot-whiteboard.jpg)

| Direction | Target | Value |
| --- | --- | --- |
| B2C | Existing Naver Blog operators | Export posts into a familiar blog |
| B2B | Businesses that already have their own site | Documents that can be found in search and AI answers through SEO/GEO |

For B2C, we considered exporting into an existing Naver Blog instead of asking people to start a new blog. We removed automatic topic generation from that direction. The question was how far to enter an existing operator’s workflow, not how many features we could add.

For B2B, we saw businesses that had a site but were not being found enough in search or AI answers. The question moved from writing posts on someone’s behalf to creating documents that could bring in business traffic.

Even after choosing the direction, the question remained: **Can we show how many people come in consistently?**

The things we built earlier were still useful: source-backed article structure, search-visible publishing, domain connection, crawler observation, and deployment stability. What changed was the question “Who needs this, and why?”

```plaintext
Validated before the beta
Topic → generation → publishing → search/citation possibility

What the pivot must validate
Customer goal → needed documents → discoverability → traffic → customer value
```

### We redesigned the business model around specialist blogs and agency partnerships

![A whiteboard outlining a brand blog, workflow, and self-employed/enterprise pricing for hospitals and real-estate businesses.](/images/poc-pivot/target-pricing-whiteboard.jpg)

We redesigned the business model around specialist blogs for hospitals and real-estate businesses, with agencies partnering to operate them for customers. In a period when relying on the Naver Blog algorithm alone had become difficult, there were customers who wanted a channel indexed by Google and visible near the top of search. We already had existing customers, and were applying the source-backed structure and publishing flow to those specialist blogs.

With an agency partnership, the customer does not have to create and operate every post alone, while the agency can offer search visibility as a concrete service. We provide the specialist blog and keep publishing sourced documents. The next task is to keep proving how much traffic and how many inquiries this structure can produce.

## 13\. The problem we need to solve now

Before the beta, we proved that the system could be built. We made posts that appeared in search, attached sources, saw a post cited in an AI answer, and built the operational base for repeated publishing.

After the beta, we had to find where this could be sold. Users did not move just because posts were published automatically. They needed to understand what result came back to them: where they came from, why they should return, what information signup collected, and how a document turned into a business result.

Small hospitals and real-estate businesses start from a disadvantage when people ask AI for recommendations. Larger organizations have accumulated articles, reviews, and documents; a small business may have only one homepage. Without reference documents, even a good business has little material for an AI answer to use.

### We proved we could build it, then redesigned it into something sellable

We confirmed that the technology could work and narrowed down the customers to approach. Now we need to expand the specialist-blog and agency-partnership model with the customers already secured, and validate what result we can give people who want Google indexing and high search visibility as Naver Blog becomes less predictable.
