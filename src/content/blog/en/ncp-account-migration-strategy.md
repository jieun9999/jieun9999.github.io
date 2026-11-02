---
title: "NCP Account Migration: Why I Chose a Short Maintenance Window Over Zero Downtime"
description: "How data size and operating conditions led to choosing a short maintenance window and dump-and-restore for an NCP account migration."
subtitle: "I compared three ways to migrate PostgreSQL and Redis between NCP accounts. Data size and operating conditions favored a short pause in writes and dump-and-restore, with the resumption of writes defining the cutover boundary."
pubDate: 2026-11-02
tags: ["ncp", "data-migration", "postgresql", "redis"]
category: "reliability"
cover: "/covers/ncp-series-cover-02-migration-strategy-en.png"
coverFit: "contain"
coverBackground: "light"
coverAlt: "A comparison of data migration approaches, with the decision stage highlighted in the overall migration roadmap"
series: "ncp-account-migration"
seriesTitle: "NCP Production Account Migration"
seriesOrder: 2
---

## Introduction

Even after preparing the new production environment with Terraform and NKS, one question remained: how to move the PostgreSQL and Redis data. I first considered whether a zero-downtime cutover was possible, but ultimately chose to reserve a short maintenance window and transfer the data in one pass. This post explains the reasoning behind that decision.

[Part 1](/en/blog/ncp-account-migration-terraform-nks/) covered rebuilding the infrastructure and deployment environment while moving between NCP accounts. Servers could be recreated, but production data could not. Messages, attendance records, and approval records were stored in PostgreSQL, while login sessions and some usage information remained in Redis.

Before I took over the migration, an earlier attempt to move the login service to the new account and then roll it back had left **several days of login and audit records missing from the production database**. Important account information had not changed, and the original backup was still available. Even so, the incident made one thing clear: routing traffic back does not automatically restore the data to its previous state.

The previous owner's plan also included PostgreSQL logical replication. Replication can reduce downtime, but it introduces new connections and replication state into a running database. At the time, I had only recently taken over the infrastructure and first needed to establish how the production environment was actually configured.

So I changed the question. Rather than *Can I somehow migrate with zero downtime?*, the first question became **When should writes stop, and what cutover conditions will prevent the data from diverging?**

## 1. This Was Different From a Blue-Green Deployment That Only Replaces the App

In a typical blue-green deployment, both apps can use the same database. This migration required moving the database itself to another NCP account, along with the app.

```text
Existing app → Existing DB
New app      → New DB
```

If both environments accept writes at the same time, user records accumulate in separate databases. Returning to the old account would still leave the records created in the new database to deal with. Running apps in both environments is possible if writes are restricted to one database, but changing the data store ultimately still requires synchronization and control over writes.

Having seen the actual gap in the login service's data, I made **avoiding any interval in which both databases independently accept writes** a principle of the cutover. The more important question was not simply whether the connection path worked, but *whether writes made in the new account could be brought back to the old account*.

## 2. Comparing Three Migration Approaches

| Approach | What it offers | Additional burden in this environment |
| --- | --- | --- |
| **Dump, restore, then cut over** | A straightforward procedure and a clear cutover boundary | Service writes must stop during the final data copy |
| **Logical replication, then cut over** | A shorter pause in writes | Requires cross-account SSH tunnels, replication slots, sequence synchronization, a DDL freeze, and replication state management |
| **Move the app first, then the database** | The app cutover itself can happen without downtime | Requires network access from the new app to the existing DB and Redis, followed by another cutover to move the database |

**Logical replication** was the most direct way to reduce downtime. After synchronizing the full dataset and continuously following changes in the production database, only the final differences would need checking on cutover day. Earlier migration records also showed that tables had actually been synchronized.

But keeping table contents in sync does not complete a migration. Sequences and DDL changes require separate handling, and replication connections, slots, and lag need ongoing monitoring. Replication slots that are not cleaned up can also increase WAL retention. Because this would introduce a connection setup that would be removed after the migration, I weighed **the maintenance time saved against the additional points of failure**.

I also considered **moving the app first and the database later**. Sharing the existing database with the new app could make the first traffic cutover close to zero downtime. However, it would require additional network connectivity between the two accounts and broader access to the database and Redis. Moving the data stores would then require another cutover.

This approach is useful when the app changes substantially or the database is large enough to justify splitting the work. Here, I was moving the same app image, and the dataset was small. **A zero-downtime app cutover and a zero-downtime account migration were different things.**

## 3. Deciding Based on Actual Data Size and Usage Hours

These were the measurements used in the decision.

| Item checked | Measurement at the time |
| --- | --- |
| PostgreSQL actual data | About 623 MB |
| PostgreSQL dump file | 46.5 MB |
| Database restore | 43 seconds, all 285 tables matched *(from a preliminary test on October 7)* |
| Redis | About 9,000 keys |
| Messages from 03:00–08:00 | 0–18 per hour *(over the preceding four weeks)* |

Stopping and restarting the app and checking functionality in the new environment were likely to take longer than copying the data itself. The service already had a maintenance mode, and changing the origin address in the Cloudflare proxy could direct traffic to the new load balancer. This was also why I checked message counts over the preceding four weeks. Rather than assuming that nobody would use the service in the early morning, I checked which hours were actually quieter.

At the planning stage, I estimated a write pause of about 15–20 minutes for dump-and-restore and about 3–5 minutes for logical replication. These were **estimates made when selecting the approach**. Choosing logical replication would not eliminate the time needed to restart the app, migrate Redis, or check functionality. The difference therefore affected only part of the overall maintenance window.

I ultimately decided to **build and validate the new environment in advance, then transfer only the final data during maintenance**. I also kept PostgreSQL at the existing version, 15.15, rather than upgrading to 17 during the account migration. Expanding the scope would add more variables to investigate if something failed.

For Redis, I initially planned to transfer only login tokens. After classifying the production keys, I decided to move everything. Some data, such as caches, could be recreated from another source. Other information existed only in Redis, including **usage statistics that had not yet been written to the database** and mobile login state. Deciding individually what could be discarded would itself introduce a risk of omissions.

Redis state also needed a separate migration regardless of the approach chosen for PostgreSQL. Reducing the PostgreSQL write pause through logical replication would not automatically make the entire service cutover zero downtime. At roughly 9,000 keys, I judged a full copy to be practical.

## 4. When Writes Resumed Mattered More Than the Downtime

I kept the final procedure straightforward.

![The cutover procedure resumes writes only after the final data comparison and new app checks pass](/images/ncp-migration/cutover-gates-en.svg "diagram")

The important distinction in this sequence was between displaying a maintenance page and actually stopping writes. Even with external requests blocked, internal workers or scheduled jobs could continue writing to the database, changing the source data after the final dump. I therefore chose to stop the app and jobs before copying the final data.

Until user writes begin in the new environment, returning to the existing environment remains an option. But **once records have accumulated in the new database after cutover, changing DNS back is not enough to recover**. A separate decision is needed about how to handle the writes that have already occurred. I therefore designed the procedure around the point when writes resume after the data comparison and new service checks pass, rather than simply the moment the address changes.

The original plan allowed 1–2 hours for maintenance partly because checks of the new environment were included on cutover day. Moving those checks into a rehearsal the day before would let the actual cutover focus on **stopping writes, copying the final data, validating it, and switching traffic**.

The actual migration was completed on October 23 with about 13 minutes of user impact. That was within the maintenance range estimated when choosing the approach.

## Conclusion

Zero downtime is not always safer. In an environment like this one, with a small dataset and room for a short maintenance window, managing temporary networking and replication state to save a few more minutes would have added more burden.

The point is not that dump-and-restore is better than logical replication. It is that **I measured the service's scale and operating conditions first, then chose a level of complexity that fit those conditions**.

After deciding on the approach, I still needed to verify restoration and app behavior with actual production data. [Part 3](/en/blog/ncp-migration-safe-rehearsal/) covers how I implemented the decision and what problems the rehearsal uncovered without affecting production.

---

Series: [Part 1 · Moving the Production Environment With Terraform and NKS](/en/blog/ncp-account-migration-terraform-nks/) · **Part 2 · Choosing the Migration Approach** · [Part 3 · Rehearsal and Validation With Production Data](/en/blog/ncp-migration-safe-rehearsal/)
