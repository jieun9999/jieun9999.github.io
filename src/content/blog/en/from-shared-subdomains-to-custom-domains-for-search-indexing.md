---
title: "Published but Missing from Search — Why I Started Recommending Custom Domains"
description: "A comparison of indexing results for default subdomains and custom domains, followed by domain migrations that kept the content unchanged. These observations informed a recommendation for custom domains, while leaving the causes and limits of the results unresolved."
subtitle: "How indexing observations changed Wiblog's domain recommendations"
pubDate: 2026-08-10
updatedDate: 2026-10-25
tags: ["seo", "google-search-console", "custom-domain", "poc"]
category: systems
cover: /covers/from-shared-subdomains-to-custom-domains-for-search-indexing.png
coverFit: contain
coverBackground: light
coverAlt: "The domain search and purchase screen in Wiblog"
coverCaption: "The original Korean UI shows domain recommendations alongside registration and renewal prices."
series: wiblog-custom-domains
seriesOrder: 1
seriesTitle: "Introducing custom domains in Wiblog"
---

## Introduction

**Introducing custom domains in Wiblog · Part 1**

Wiblog automatically generates and publishes blog posts from topics and keywords selected by users.

Yet many successfully published posts did not appear in Google Search. The pages loaded correctly and their sitemaps had been submitted, but Google Search Console showed that many posts were not indexed.

To investigate, I compared the platform's default subdomains with custom domains connected by users.

In a survey on July 21, 2026, 62 of 1,784 posts on default subdomains were indexed. On one blog using a custom domain, 61 of 90 posts were indexed.

The two groups did not have identical conditions, so the difference could not be attributed to domain type alone. Still, the gap was too large to ignore.

After changing the default domain and moving sites whose indexing had stalled, we decided to recommend custom domains to users seeking traffic from search.

## 1. What does it mean for a post to be missing from search?

First, I needed to establish why a successfully published post could not be found in search.

Not every missing search result points to the same problem.

| Stage | What to check |
|---|---|
| Publication | Does the page load correctly at its URL? |
| Crawling | Has Google's crawler visited the page? |
| Indexing | Has Google included the page in its search index? |
| Search visibility | Does the page appear in results when a user searches? |

Adding a post's URL to a sitemap does not mean Google will immediately fetch it. Nor does fetching a page guarantee that Google will index it.

I therefore needed to distinguish the stage at which the process had stopped.

I checked URL Inspection results in Google Search Console (GSC) and Googlebot access records in the server logs.

GSC can show whether Google knows a URL, when it last crawled the page, and whether the page is indexed.

This revealed that many URLs were not merely excluded from the index: Google did not yet know about them.

## 2. Subdomains and custom domains had very different indexing results

At the time, Wiblog provided default addresses like this so users could start blogging without buying a domain:

`myblog.workb.xyz`

Users could publish posts as soon as they created a blog. But we still needed to check how well search engines were discovering and indexing those blogs.

On July 21, I collected GSC URL Inspection results to compare default subdomains and custom domains.

| Group | Posts inspected | Indexed posts | Indexing rate |
|---|---:|---:|---:|
| `*.workb.xyz` | 1,784 | 62 | About 3.5% |
| `babynote.blog` | 90 | 61 | About 67.8% |

Of the 1,784 posts inspected on default subdomains, 1,566 were recorded as URLs unknown to Google.

Some posts had been excluded from the index, but a larger number had not been discovered at all.

In contrast, `babynote.blog` was relatively new: it had published its first post on July 13. Just eight days later, 61 of its 90 posts were indexed.

Initially, I considered whether the blogs simply needed more time because they were new. But the two results together were difficult to explain through operating age alone.

I expanded the survey to see whether this was limited to one site. On July 23, I found examples of indexing within 24 hours on all six custom-domain sites inspected.

This does not mean every post on all six sites was indexed within a day. It means that indexed posts were found on each site.

The comparison also had clear limitations.

The 1,784 default-subdomain posts were an interim result collected before the full survey was complete. The 90 custom-domain posts were all the posts on a single site. Site age, topics, content quality, and publishing frequency were not identical either.

Therefore, **this was not an experiment proving that custom domains caused a higher indexing rate.**

Still, blogs created by the same generation system showed markedly different results across addresses. That was reason to investigate further.

## 3. Changing the default address did not solve the problem

At the time, I wondered whether the `.blog` extension would be more suitable for a blogging service.

Starting on July 23, we changed the default domain from `workb.xyz` to `witim.blog`.

An address such as:

`myblog.workb.xyz`

would now use:

`myblog.witim.blog`

The change involved more than DNS and server routing.

Canonical URLs in static pages and sitemap URLs also needed to use the new address. These values were generated at build time, so changing DNS alone could leave the old URLs in the HTML.

On July 28, I found and fixed a missing canonical on the landing page that had led Google to select the old `workb.xyz` address as its canonical URL.

Fixing that issue did not resolve indexing across the blogs.

On August 1, I observed that pages under `witim.blog` that had already been indexed were being excluded again.

On August 7, I compared whether the home URLs of custom-domain and default-subdomain sites were indexed.

| Group | Sites inspected | Indexed home URLs |
|---|---:|---:|
| Custom domains | 19 | 17 |
| Default subdomains | 15 | 0 |

This survey inspected each blog's home URL rather than individual posts. Its results therefore cannot be compared directly with the earlier post-level indexing rates.

I also checked `robots.txt`, canonical URLs, page responses, and redirects from old addresses. GSC showed no manual actions or security issues.

However, I could not determine exactly why several subdomains were excluded from the index around the same time.

Other factors, including content similarity, quality, and the search signals accumulated by individual sites, could still have contributed.

One conclusion was supported by the observations:

**Changing the default address from `.xyz` to `.blog` alone did not solve the problem.**

## 4. Moving domains whose indexing had stalled

Custom domains did not always produce good results either.

Two sites we operated were having trouble getting their posts crawled:

- `btc-btc-btc.shop`
- `smr-smr-smr-smr.shop`

As of August 11, 10 of the 76 URLs in the first site's sitemap were already indexed. The entire site was not absent from the index.

The problem was that other posts were not being crawled sufficiently afterward.

I examined 18 days of server access records.

| Site | Sitemap requests | Distinct post URLs crawled |
|---|---:|---:|
| Bitcoin site | 34 | 6 |
| SMR site | 28 | 5 |

Google was requesting the sitemaps, but appeared to be visiting relatively few of the actual post pages.

On August 11, I requested indexing for nine posts on the Bitcoin site and tracked the changes. Other posts published around the same time were left as a comparison group.

Rather than relying only on the Googlebot name in the logs, I checked requests against Google's official IP ranges to verify that they came from its crawlers.

Across six measurements through August 18, neither crawling nor indexing was confirmed for the nine posts submitted for indexing.

### Keeping the content and moving the domains

On August 18, after reviewing the findings, we changed the domains of both sites.

| Old address | New address |
|---|---|
| `btc-btc-btc.shop` | `coinmanual.blog` |
| `smr-smr-smr-smr.shop` | `powerinsight.blog` |

![Original Korean investigation note recorded when deciding to migrate the domains on August 18, 2026](/images/custom-domain-indexing/tld-observation-2026-08-18.png)

We did not write new posts or regenerate the existing content. We served the same content from the new domains and updated canonical URLs, sitemaps, and redirects from the old addresses.

For the Bitcoin site, the URL paths of the 16 posts we had been tracking also stayed the same.

Immediately after the migration, crawling and indexing were not confirmed for the inspected URLs on the new domains.

The next day, August 19, I observed indexing progressing again on the new domains.

This was notable because publishing more posts and requesting indexing had previously produced no change.

However, it should not be interpreted as evidence that `.shop` domains are disadvantaged in search.

Several conditions changed at the same time:

- We changed the extension from `.shop` to `.blog`.
- We also replaced repetitive domain names such as `btc-btc-btc`.
- Migrating the old addresses to the new ones also involved updating the URL information supplied to search engines.
- We could not rule out indexing progressing simply as more time passed.

These conditions prevent us from isolating which factor contributed to the recovery. The observations did not establish whether indexing would persist over the long term or what proportion of all posts would ultimately be indexed.

Google's [official FAQ](https://developers.google.com/search/help/site-position-in-search-faq) also explains that the top-level domain extension itself does not determine search ranking.

What I confirmed was limited to this: **indexing resumed on these two sites after their addresses changed while the content stayed the same.**

## 5. How the findings changed the product

Although I had not fully identified the cause, we still needed to decide which addresses to recommend to users.

Until then, custom domains had mainly been an optional way to give a blog a preferred address.

The findings made domain choice a more important consideration for users running a blog to attract search traffic.

We changed our domain recommendations accordingly.

### Recommending custom domains more actively

Users trying Wiblog could continue using the default subdomain.

Someone exploring the service did not need to be asked to buy a domain immediately.

For users aiming to build search traffic over the long term, however, we recommended a custom domain they owned.

We also kept `.blog`, `.site`, and `.live` in the recommendation list, since indexing had been observed for those extensions in the operating sample. We removed `.shop`, where we had encountered problems, from automatic recommendations.

Users could still search for and purchase a `.shop` domain themselves.

This decision did not follow any official Google rating of domain extensions. It was a conservative adjustment to Wiblog's recommendations based on the cases we had observed.

### Keeping existing post URLs connected after a domain change

We also improved the ability to replace an existing domain with another custom domain.

Previously, multiple domains attached to one blog could serve the same content with `200 OK`. Adding a new domain could therefore leave both the old and new addresses showing identical posts.

We changed this so that one canonical domain served the content, while previous domains returned a `301` redirect to the same path on the new domain.

For a domain migration, we checked:

1. Whether HTTPS and pages worked at the new address
2. Whether canonical URLs and the sitemap pointed to the new address
3. Whether old post URLs redirected to the same paths on the new domain
4. Whether cached responses from the old setup had been purged from the CDN
5. Whether ownership verification and sitemap submission for the new domain were complete in GSC

Completing a domain purchase is different from completing a blog migration.

The migration was only complete once users and search engines could reach the new canonical address correctly.

## 6. A custom domain does not guarantee search visibility

In this investigation, blogs using custom domains had better indexing results, and we observed cases where indexing resumed after an address change.

This alone does not prove that custom domains increase indexing rates.

The sites differed in operating age, content topics, quality, publishing frequency, and other conditions.

Also, **being indexed does not mean ranking near the top of search results.**

To determine whether search was bringing visitors, we needed to examine not just indexing, but the queries that produced impressions and how many clicks they generated.

I therefore do not consider connecting a custom domain a complete solution to search performance.

What did matter for the product was helping Wiblog users operate a blog at an address they owned over the long term, and continue monitoring its search status.

## Conclusion

The work began as an investigation into why successfully published posts could not be found in search.

I compared indexing results for default subdomains and custom domains, then found that changing the default domain did not stop the problem from recurring. We subsequently migrated two custom-domain sites whose indexing had stalled and observed changes in their search indexing.

Because the conditions were not fully controlled, I cannot determine how much the domains themselves affected the results.

Nevertheless, recurring differences in operating data led us to recommend custom domains to Wiblog users seeking traffic from search.

**This was less a case of completely solving search indexing than an experience in changing a product's domain recommendations using the data we could verify.**

---

### Next: Automating domain purchase and connection

Recommending custom domains also meant making them reasonably easy to buy and connect.

Immediately after a purchase, DNS changes might not yet be visible, causing certificate issuance or search-engine registration to fail.

[Part 2 — The Domain Was Purchased but Would Not Load](/en/blog/automating-custom-domain-connection-a-delegation-gated-pipeline/) covers the failures encountered while buying several domains and the automation that waits for DNS checks before proceeding.

*This series is organized around two topics—domain selection and connection automation—rather than the chronological order of all development work.*
