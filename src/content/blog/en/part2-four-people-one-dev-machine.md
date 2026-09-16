---
title: "Part 2 — Four People Sharing One VPS — Role-Based Access, Homes, and Ports"
description: "Developers Jieun and Sungsuk, designer Juhee, and marketer Jina share a 96GB, 18-core VPS rented to overcome the limits of 16GB MacBooks. We separated access by role, kept production behind a service account, assigned ports, and designed cron-based cleanup around work state."
pubDate: 2026-09-16
tags:
  ["linux", "cron", "systemd", "git-worktree", "ssh", "devops", "automation"]
category: systems
cover: /covers/part2-four-people-one-dev-machine-enterprise.svg
coverAlt: "A diagram showing developers and a designer connecting to a shared VPS through separate accounts, homes, and ports, with an isolated systemd tunnel and cron cleanup"
coverCaption: "People get separate workspaces; shared infrastructure belongs to services."
series: shared-dev-machine
seriesOrder: 2
seriesTitle: "Sharing One Machine Among Four People"
---

In [Part 1](/en/blog/part1-three-tier-dev-environment/), I described the MacBook–server–production three-tier path. This part is about sharing the server itself.

I am a developer. Juhee is a designer. Connecting to the same machine does not mean we need the same permissions or workspace. The developer needs a shell, coding agents, and branch-level work; the designer needs a screen and the project area relevant to her work, not production keys or someone else’s files.

The rule became: **separate people’s accounts, homes, and ports; move shared production access out of people’s accounts.** We also expected each dev server to keep consuming memory, so process reclamation was part of the design from the beginning.

## 1. Different roles need different boundaries

| Role | Needs | Must not receive | Workspace |
| --- | --- | --- | --- |
| Developers (Jieun · Sungsuk) | SSH shell, agents, dev server, own branches | production credentials, other homes/processes | each person’s home, repo, and worktrees |
| Designer (Juhee) | screen preview, scoped project work, own dev port | production key, direct DB access, other workspaces | own home and project |
| Marketer (Jina) | scoped screen preview and content work | production key, shell/agents, other workspaces | own home and project |
| Shared tunnel service | one forwarding path to the production API | shell, sudo, agents, arbitrary ports | dedicated `wdot-tunnel` home |

Juhee and Jina received separate Tokyo VPS instructions and dedicated keys. After the first SSH setup, a short alias is enough to connect. The connection is simple, but the boundary remains firm: no production privilege and no access to another person’s workspace.

The difference between developers, a designer, and a marketer is not a trust judgment. It is a surface-area decision. Seeing the real screen does not require logging into production, and running an agent does not require keeping production database credentials in a home directory.

The production tunnel therefore belongs to a `nologin` system account managed by systemd. People see only `127.0.0.1:8787`; they do not own the connection behind it. Adding another person means adding an account, home, and port slot—not copying someone else’s key.

## 2. We protected the resource that actually grows

The server is comfortable today: 96GB RAM and 18 cores leave room for four people and a future e2e stack. But unused processes accumulate. When the workload grows, reclaiming idle resources one by one becomes a tax on every new task, so cleanup had to be designed before it became urgent.

The measurements made the priority clear:

| Resource | Current state |
| --- | --- |
| Disk | 7GB of 581GB (2%) |
| Memory | 3GB of 96GB |
| Load | 0.2 on 18 cores |

| Unit | Cost |
| --- | --- |
| Worktree | 82MB of disk |
| `.git` | 112MB, shared rather than copied |
| `node_modules` | hard-linked from the pnpm store |
| Coding-agent session | about 350MB of memory |
| Dev server | 1,259MB → 3,759MB over four hours |

Folders are cheap. The expensive thing is a dev server left running—and it grows. So the cleanup design focuses on processes, while preserving folders that may still contain work. The current headroom is useful precisely because it gives us time to make this boundary safe before e2e or a larger workload arrives.

## 3. Ports prevent the wrong screen

When several `next dev` processes share a machine, a busy port usually does not stop the command. It silently moves to the next port. A developer can open `localhost:3000` and see someone else’s screen while their own code is running on `3001`.

We assigned port slots by account and made the startup script refuse a port owned by someone else:

| Slot | Account | Admin | Web | Hub |
| --- | --- | ---: | ---: | ---: |
| 0 | A | 3000 | 4321 | 4331 |
| 1 | B | 3100 | 4421 | 4431 |
| 2 | C | 3200 | 4521 | 4531 |
| unassigned | — | 3900 | 5221 | 5231 |

`local-up.sh` checks ownership, verifies the shared tunnel and local dependencies, starts the server in the background, and checks the result with `curl`. The port table lives in one script, so changing a slot does not require searching through documentation.

## 4. Production access belongs to a service, not a person

The production API tunnel was originally pushed from one person’s laptop with reverse SSH forwarding. It was a reasonable workaround: only one person had the key, and everyone needed the same tunnel. But that laptop became a single point of failure. Sleep, travel, disconnection, or reboot could take the shared development path down.

We changed one thing: who owns port `8787`.

```plaintext
Before: one person’s MacBook ── reverse SSH ──▶ shared VPS :8787
After:  wdot-api-tunnel (systemd) ────────────▶ production API :8987
```

The service account has `nologin`, no sudo, and no wheel membership. Its key is limited to one forwarding destination. Even if that key leaked, it would provide a pipe to that destination—not a general-purpose shell on the VPS.

## 5. A worktree is a branch boundary

Several sessions should not switch branches inside one directory. One session can leave state that changes what another session sees. We use the simple invariant **one task = one branch = one folder**:

```bash
scripts/wt.sh feature-name
# → .worktrees/2026-09-16/feature-name/
```

The dated path makes recent work easy to find and old work easy to review. Because the repository’s `.git` is shared and dependencies are hard-linked, the isolation costs very little disk while keeping each task’s state separate.

## 6. Cleanup follows work state, not age

The important question is not “is this folder old?” but “is this work finished?” An old open PR may still matter; a worktree created today may already be safe to remove.

```bash
scripts/wt-gc.sh              # preview only
scripts/wt-gc.sh --apply      # perform cleanup
```

The script keeps a worktree if it has uncommitted changes, unpushed commits, or an open PR. A PR closed without merging is marked for review. Only a merged PR with none of those protections is deleted. This is why GitHub PR state is authoritative: squash merges can make Git’s local branch check say “not merged” even when the work is already in `main`.

Dev processes use a conservative split. An orphaned process whose worktree is gone can be stopped automatically; a server whose worktree still exists but has been quiet is only reported. Quietness is an inference, while an orphan is a fact.

### What cron actually does

Cron runs `scripts/wt-gc.sh --apply` once an hour under each account’s permissions. It inspects only `.worktrees/YYYY-MM-DD/` under that account’s project home and never touches production, another user’s home, or the current worktree.

In order, it finds the repository from the script location, checks each dated worktree, preserves anything with local or remote work in progress, marks unmerged closed PRs for review, deletes only merged worktrees, and stops dev processes left behind after their worktree disappeared. It does not restart the production tunnel, stop an active server, or infer that a person’s quiet work is disposable.

## The trade-off

| Criterion | Result |
| --- | --- |
| Seeing another person’s screen | ✅ account-based port assignment and ownership checks |
| Shared access depending on a person | ✅ systemd service account owns the tunnel |
| Finished work being cleaned up | ✅ merged worktrees are checked hourly |
| Work disappearing accidentally | ✅ local, push, and PR protections must all clear |
| Every idle dev server being reclaimed | ⚠️ still manual when the worktree remains |

The last limitation is intentional. With only 3GB of 96GB currently used, guessing that a quiet server is disposable is not worth the risk. If e2e or the team grows enough to make that cost real, we can add a stronger activity signal.

The larger lesson is that a shared machine does not require shared identity. Shared hardware can have role-specific accounts, homes, ports, and services—and the cleanup policy can protect work instead of merely deleting old folders.
