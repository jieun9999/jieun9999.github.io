---
title: "Why I Started Strongly Recommending Custom Domains — Notes from a Blog Indexing PoC"
description: "Search indexing observations behind the move from workb.xyz to witim.blog and a stronger recommendation for custom domains, including indexing recovery after moving unchanged content from .shop to .blog and the limits of those findings."
subtitle: "What indexing experiments and domain migrations taught me about the default address a blogging platform provides"
pubDate: 2026-08-20
tags: ["seo", "google-search-console", "custom-domain", "poc"]
category: systems
cover: /covers/from-shared-subdomains-to-custom-domains-for-search-indexing.png
coverFit: contain
coverBackground: light
coverAlt: "The domain search and purchase screen in WeBlog"
coverCaption: "Domain search results show recommendations alongside registration and renewal prices."
---

## Introduction

WeBlog, the service I was developing, collected material from a user's topic and keywords, generated articles using reference sources, and published them to a blog. Users could read their posts at a public URL without setting up a server or deployment environment themselves.

But publishing an article did not automatically make it discoverable through search. Pages loaded successfully and had sitemaps, yet search engines sometimes did not fetch the articles, or removed pages they had previously indexed. Validating article generation and validating a blog's discoverability were separate problems.

The approach to blog addresses changed from `workb.xyz` to `witim.blog`, and then toward strongly recommending a custom domain for each blog. Throughout that process, I was trying to answer one question: **Is a platform-provided address enough for users who run a blog to reach people through search?**

My conclusion from the proof of concept (PoC) was that **the product should explicitly recommend a custom domain to users seeking search traffic**. That did not mean requiring a domain purchase at signup. It meant clearly explaining the difference between an address for trying the service and an address on which to build a blog's search presence over time.

This post documents the evidence behind that decision, based on the indexing investigations, domain migrations, and operational experience I gathered from July through August 19, 2026.

## Separating publication, crawling, indexing, and search visibility

At first, it was easy to treat every absence from search results as an indexing problem. But the next action depended on where the process had stopped.

| Stage | What I wanted to establish | Evidence used |
| --- | --- | --- |
| Publication | Whether the page loaded at its public URL | HTTP responses and rendered HTML |
| Discovery and crawling | Whether the search engine knew about the URL and had actually fetched it | GSC URL Inspection and Googlebot access logs |
| Indexing | Whether the fetched page was included in the search index | GSC URL Inspection results |
| Search visibility | Whether the page appeared in results for a query | GSC search performance data and actual search results |

GSC stands for Google Search Console. I used URL Inspection to check the indexing status Google had recorded for a URL and information such as its last crawl time. Those results need to be distinguished from a live test of a newly deployed page.

Submitting a sitemap is a way to tell a search engine about URLs. It does not mean those URLs will immediately be crawled or indexed, and being indexed does not mean ranking near the top for a particular query. Google also describes crawling, indexing, and serving search results as separate stages in its guide to [how Search works](https://developers.google.com/search/docs/fundamentals/how-search-works).

This distinction helped me check whether search engines were reaching existing articles before asking whether publishing more would solve the problem.

## The gap I found on workb.xyz

Initially, each blog received a subdomain in the form `{slug}.workb.xyz`. Users could start immediately without buying a separate domain.

On July 21, I queried article URLs through the GSC URL Inspection API and compared them with a blog using a custom domain. The investigation into indexing differences by address type produced these results:

| Group | Article URLs inspected | Articles indexed | Indexing rate |
| --- | ---: | ---: | ---: |
| `*.workb.xyz` subdomains | 1,784 | 62 | About 3.5% |
| `babynote.blog` custom domain | 90 | 61 | About 67.8% |

The subdomain investigation was incomplete. API quotas meant spreading the checks over several days, so those numbers were interim results. The custom-domain result covered all 90 articles on one site. Both used the same generation pipeline, but this was not a controlled experiment that randomly assigned identical articles to different addresses.

Even with that limitation, the difference was substantial. Of the 1,784 subdomain URLs inspected, 1,566 were recorded as unknown to Google. The issue was not limited to content that Google had read and assessed unfavorably: **most of the articles had not yet been fetched**.

By contrast, `babynote.blog` had published its first article on July 13. Despite being a new blog, about 68% of its articles were indexed in the July 21 inspection. Simply saying that every new blog had to wait the same amount of time did not explain the two results.

I expanded the comparison to see whether the finding was specific to one site. In a follow-up investigation on July 23, I confirmed indexing within 24 hours on all six custom domains examined. This means **indexing was confirmed on six sites**, not that every article on each site was indexed within a day.

At that point, a custom domain started to look less like an optional branding feature and more like a practical choice for operating a blog aimed at search traffic. Still, removing the free trial stage was not an option. Users needed a default address where they could generate articles and evaluate the service, with guidance toward their own domain when they began expecting search results.

## The problems continued after moving to witim.blog

Starting on July 23, I migrated the platform's default domain from `workb.xyz` to `witim.blog`. Blog addresses changed to `{slug}.witim.blog`. This replaced the shared base domain; it did not give each blog an independent domain.

The migration required more than changing the address. Canonical URLs and sitemaps for static pages were generated at build time, so changing DNS and server routing alone would not update them. I first made the new domain available alongside the old one, checked certificates and routing, and then switched the primary address and redirects from the old URLs.

The landing page also had a separate missing-canonical issue. On July 28, while investigating its exclusion from search, I found that the new landing page had no user-declared canonical and that Google had selected the old `workb.xyz` URL as canonical. I corrected it. That issue needed to be kept separate from the later loss of indexing across blog subdomains.

On August 1, I observed previously indexed pages under `witim.blog` being excluded. To assess the scope, I compared the **site root URLs** of custom domains and platform subdomains on August 7.

| Group | Site root URLs inspected | Root URLs indexed |
| --- | ---: | ---: |
| Custom domains | 19 | 17 |
| Platform subdomains with the highest article counts | 15 | 0 |

The unit of measurement differs from the article-level indexing rates above. This table does not mean that 89% of articles on custom domains were indexed. The two unindexed custom-domain roots also had identifiable issues: a redirect on one and a 404 at the time of the previous crawl on the other.

During this investigation, I checked robots directives, canonical URLs, page responses, and redirects from old addresses. GSC's Manual Actions and Security Issues reports showed no detected problems either. There was therefore no basis for describing this as a manual penalty. I could not establish whether the similar timing of exclusions across multiple sites came from content patterns or signals associated with the domain.

Even so, evidence for a product decision was accumulating. **Changing the shared base domain from `.xyz` to `.blog` had not resolved the search problems, while sites using custom domains on the same platform showed different results.**

## Indexing recovered after moving two .shop sites without changing their content

There were exceptions among custom domains too: `btc-btc-btc.shop` and `smr-smr-smr-smr.shop`. Both experienced a sharp decline in indexing, and their articles were crawled less than those on other custom domains.

This should not be confused with either site having no indexed pages at all. On August 11, while investigating weak crawling activity, 10 of the Bitcoin site's 76 sitemap URLs were indexed. The problem was that discovery, crawling, and indexing of other articles were not progressing even as some pages remained in the index.

Over 18 days of access records, the Bitcoin site's sitemap received 34 requests, but only six unique article URLs were crawled. The SMR site's sitemap received 28 requests, but only five unique article URLs were crawled. The search engine appeared to be finding the sitemaps but fetching few of the articles they contained.

To investigate further, I requested indexing through GSC for nine Bitcoin articles on August 11 and left articles published around the same time unsubmitted as a comparison group. Rather than trusting a Googlebot User-Agent alone, I checked requests against Google's official IP ranges to identify genuine crawler traffic. Across six measurements through August 18, none of the nine submitted articles had been crawled or indexed.

The next experiment was to move the content to new domains without rewriting it.

| Previous domain | New domain | Migration date |
| --- | --- | --- |
| `btc-btc-btc.shop` | `coinmanual.blog` | 2026-08-18 |
| `smr-smr-smr-smr.shop` | `powerinsight.blog` | 2026-08-18 |

For the Bitcoin site, I preserved the paths of the 16 URLs I had already been tracking. Instead of rewriting the articles at the new address, I served the same content and updated canonical URLs, sitemaps, and redirects to match the new domain.

Immediately after the August 18 migration, none of the URLs being investigated on the new domains had been crawled or indexed. **The next day, August 19, I confirmed that indexing was progressing normally on the new domains.** This did not establish a final indexing rate for all articles or whether that state would persist over the long term.

What I confirmed was **indexing recovery after a domain migration that preserved the content**. Both the `.shop` top-level domain (TLD) and repetitive names such as `btc-btc-btc` changed at the same time, so I could not isolate which factor mattered. Migration signals were also being corrected, and time was passing. The outcome could not be attributed to the TLD alone.

Google's [search ranking FAQ](https://developers.google.com/search/help/site-position-in-search-faq) likewise explains that a TLD by itself does not determine search performance. This experience does not establish a general rule that all `.shop` sites are excluded from indexing or that buying a `.blog` domain guarantees inclusion.

## Turning the observations into domain recommendations and migration support

Not having isolated the cause completely did not mean I could keep postponing operational decisions. Based on repeated observations within the same platform, I adjusted both the addresses recommended to users and the migration process.

First, I changed the domain recommendation criteria. I removed `.shop` from automatic recommendations and favored `.blog`, `.site`, and `.live`, where indexing had been confirmed in the operational sample at the time. Users could still search manually, and the purchase screen included guidance to avoid repetitive names. This was **a conservative recommendation policy based on observations from that service**, not an official Google ranking of TLDs.

I also improved the path for moving from one custom domain to another. The existing code grouped all domains attached to a site into the same server configuration block and served content with a `200` response on each. Adding a new domain therefore left the old address serving the same content as well.

I changed this so that the primary domain served the content while previous domains returned a `301` redirect to it, preserving the path. During the actual migrations, I checked the following together:

1. HTTPS and page responses worked correctly on the new domain.
2. Static files were rebuilt so canonical URLs and sitemaps used the new address.
3. Each article at an old URL redirected to the same article at the new URL.
4. Cached `200` responses for the old URLs were removed from the CDN.
5. Ownership verification for the new GSC property, sitemap submission, and the change of address were completed.

Google's [site migration guide](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) also recommends aligning migration signals such as canonical URLs, permanent redirects, and sitemaps. The completion criterion was **whether search engines and users reached the same primary address**, rather than simply whether the domain purchase had finished.

I describe the automation from purchase through DNS and certificate setup in a separate post on [connecting custom domains](/en/blog/automating-custom-domain-connection-a-delegation-gated-pipeline/). The focus here is why I came to treat that feature as a standard recommendation for blogs seeking search traffic.

## New domains can still find an audience through content

Another point worth retaining from these experiments is that a domain's newness alone is not a reason to give up on search. Eight days after its first article was published, `babynote.blog` had 61 of 90 articles indexed. I also confirmed indexing recovery on the two new domains that replaced the `.shop` addresses.

During operation, I saw articles on new domains appear near the top of search results as well. However, the URL Inspection figures in this post do not prove those rankings. Indexing recovery was the outcome of the domain migration experiment described above; high placement was a separate operational observation. I am not reporting specific positions or how long they lasted.

Those experiences led me to conclude that **even a new domain can achieve both indexing and high placement with useful content that matches search intent**. That does not mean content quality alone determines rankings. Alongside changing addresses, it was necessary to produce articles that answered questions readers were actually searching for.

In the generation process I worked on, I did not judge quality only by article length or publishing volume. I prioritized direct answers to the question, references that allowed readers to check claims, and a structure that made relevant information easy to find. I did not separately measure how much those criteria explained the ranking of individual articles, but they remained important work after the address changed.

Evaluating results therefore requires looking beyond indexing: which queries produced impressions, and whether those impressions led to clicks. A custom domain does not replace content. It gives that content an address where it can be evaluated in search and build a history over time.

## Conclusion

Indexing problems continued after the move from `workb.xyz` to `witim.blog`. By contrast, blogs built on the same platform were indexed on custom domains, and I confirmed recovery after moving two unstable `.shop` sites to `.blog` domains while preserving their content.

The PoC led me to conclude that the product should strongly recommend custom domains to users seeking search traffic. It needed to distinguish between trying article generation at a trial address and building a search presence at an address of the user's own.

At the same time, a domain migration does not resolve content quality or search rankings by itself. New domains can create opportunities through useful content, but judging actual results requires checking crawling, indexing, impressions, and clicks separately. The lesson I want to retain is less about declaring one extension better than another and more about **how observed search outcomes informed domain recommendations and operational features**.
