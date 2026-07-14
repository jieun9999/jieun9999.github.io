---
title: '메신저 서비스를 위한 재사용 가능한 부하 테스트 환경 구축 — Make 기반 IaC, Observability, 그리고 Auth Seeding'
description: '메신저의 send API는 몇 TPS까지 버티고, 정확히 어디서 무너지는가. 프로덕션을 복제한 7-노드 환경을 Makefile 한 줄로 언제든 다시 세울 수 있게 만들었습니다.'
pubDate: 2026-05-11
tags: ['load-testing', 'k6', 'observability', 'grafana', 'prometheus', 'postgresql', 'terraform', 'websockets', 'devops']
category: building
cover: /covers/building-a-reusable-load-test-environment-for-a-messenger-service-make-based-iac-observability-and-auth-seeding.webp
coverAlt: '메신저 서비스를 위한 재사용 가능한 부하 테스트 환경 구축 — Make 기반 IaC, Observability, 그리고 Auth Seeding'
series: messenger-load-test
seriesOrder: 1
seriesTitle: '메신저 부하 테스트 실전기'
---

> 우리 메신저의 send API가 정확히 몇 TPS까지 버틸 수 있는지, 그리고 실제로 _어디서_ 무너지는지 알고 싶었습니다. 그래서 프로덕션을 7-노드 부하 테스트 환경으로 복제했고, 이를 일회성 셋업으로 취급하는 대신 **필요할 때마다 재현 가능하도록** 설계했습니다.

이 글은 그 과정에 대한 기록입니다 — 무엇을 측정하고 싶었는지, 무엇을 먼저 준비해야 했는지, 그리고 누구나 전체 과정을 다시 실행할 수 있도록 환경 자체를 어떻게 감쌌는지에 대한 이야기입니다.

* * *

## "100 MPS"가 답이 될 수 없는 이유

사람들은 "우리 서비스는 100 MPS를 처리합니다"라고 즐겨 말합니다. 그 숫자 하나만으로 아래 질문에 답해 보세요.

-   그 100 MPS는 어떤 **WebSocket 동시 접속** 상황에서 측정된 것인가요?
    
-   어떤 **메시지 타입**인가요? (일반 텍스트? 멘션? 첨부파일?)
    
-   어떤 종류의 **채널**로 보낸 것인가요? (5명 채널? 50명 채널? 수천 명?)
    
-   그 부하는 **얼마나 오래** 유지되었나요?
    
-   실행 중 **CPU, DB 커넥션, Redis, Centrifugo**의 상태는 어땠나요?
    
-   **4xx / 5xx 비율**과 **REST→WS p95/p99 전달 지연**은 어땠나요?
    

이런 변수들을 모두 걷어낸 단일 숫자는 무의미합니다. 그래서 이 프로젝트의 목표는 "더 큰 숫자를 만들어내는 것"이 아니라 **"위의 모든 질문에 답할 수 있는 측정 환경을 만드는 것"**이었습니다.

한 가지 설계 원칙이 더 있었습니다.

> **수천 명이 있는 단일 채널에 부하를 몰지 말 것. 부하를 수백 개의 작은 채널(5명/50명 혼합)에 분산시킬 것.**

우리 메시지 API는 `msg:{userId}:{channelId}` 단위 rate limit(10초당 10요청, 즉 pair당 약 1 TPS)을 적용합니다. **단일 채널에 부하를 몰면 실제 백엔드 부하가 나타나기 훨씬 전인 100 TPS 부근에서 429를 맞습니다.** 프로덕션과 유사한 조건에서 1k TPS를 소화하려면 최소 1,000개, 이상적으로는 2,000개 이상의 서로 다른 sender/channel pair가 필요합니다. 데이터셋 자체를 프로덕션 트래픽 형태에 맞춰 설계해야 합니다.

* * *

## 토폴로지 — 프로덕션의 충실한 복제본

테스트 토폴로지가 프로덕션과 다르면 숫자도 달라집니다. 그래서 별도의 ALB 계층을 포함해, 프로덕션과 동일한 플랜의 Vultr VM 7대를 프로비저닝했습니다.

```text
k6 / WS Client
    │
    │ HTTP /api/*  +  WS /connection/*
    ▼
HAProxy ALB
    │ :80   public
    │ :8000 internal Centrifugo API
    │
    ├── /api/*, /api/centrifugo/* ──► Next.js App
    │                                      │
    │                                      │ App → HAProxy:8000 publish
    │                                      ▼
    └── /connection/* ───────────────► Centrifugo C1 / C2 (round-robin)
                                              │
                                              ▼
                                       Redis (broker / cache / rate limit)

Next.js App writes → PostgreSQL
```

| 호스트 | 역할 | 플랜 |
| --- | --- | --- |
| `HAProxy` | HAProxy ALB | 2C / 8GB |
| `app` | Next.js web | 2C / 8GB |
| `centrifugo-1`, `centrifugo-2` | Centrifugo v5 (RR) | 2C / 8GB ×2 |
| `postgres` | PostgreSQL + 프로덕션 dev 덤프 | 2C / 8GB |
| `redis` | broker / cache / rate limit | 2C / 8GB |
| `client` | k6 sender + Go WS receiver | 4C / 8GB |

* * *

## 재사용 가능한 인프라 — 단일 진입점으로서의 Makefile + Terraform

부하 테스트 환경의 가장 큰 함정은 "한 번 셋업하고 다시는 손대지 않는 것"입니다. 1k TPS 스모크 테스트가 DB를 무너뜨리고, 일주일 뒤에 knee sweep을 돌리러 돌아왔을 때 PG 비밀번호나 cloud-init이 마지막으로 어디서 멈췄는지를 누군가 기억해내야 한다면, 오후 하나가 통째로 날아갑니다.

그래서 모든 것을 **하나의 Makefile 주도 흐름**으로 감쌌습니다. Terraform이 7대 호스트 전체를 단일 state로 관리하고, 그 위에서 Make가 `up → wait → cutover → smoke → down`을 순서대로 실행합니다.

```make
# standard flow
make up         # provision 7 VMs + cloud-init + auto-refresh HOSTS.env
make wait       # wait for cloud-init on all 7
make secrets-check   # verify compose/.env (HMAC, API key) consistency
make cutover    # deploy HAProxy → App → Centrifugo
make smoke      # /healthz, /api/health, publish, RR distribution checks
make down       # destroy all 7
```

중요한 디테일이 세 가지 있습니다.

**(1) Terraform output →** `scripts/HOSTS.env` **자동 갱신.** IP는 절대 하드코딩되지 않습니다 — README에도, 스크립트에도 마찬가지입니다. `make up` 이후 `HAPROXY_IP`, `APP_IP`, `CENTRIFUGO_1_IP` 같은 env 변수가 자동으로 채워지고, 모든 하위 스크립트는 `source scripts/HOSTS.env`로 시작합니다. **코드 한 줄 건드리지 않고도 IP가 바뀔 수 있습니다.**

**(2)** `secrets-check` **게이트.** App과 Centrifugo가 **서로 다른 HMAC secret**을 갖게 되면, JWT 검증이 도처에서 조용히 실패합니다. 이걸 수동으로 추적하는 데는 한 시간이 날아갑니다. 그래서 `cutover` 전에 `compose/.env.app`과 `compose/.env.centrifugo` 사이의 `CENTRIFUGO_HMAC_SECRET_KEY`가 일치하는지 자동으로 검증합니다.

```make
secrets-check:
	@A=$$(grep '^CENTRIFUGO_HMAC_SECRET_KEY=' compose/.env.app);
	 B=$$(grep '^CENTRIFUGO_HMAC_SECRET_KEY=' compose/.env.centrifugo);
	 [ "$$A" = "$$B" ] || { echo "ERR: app/centrifugo HMAC mismatch"; exit 1; }
```

**(3) PG 데이터 보존 (**`dump-pg` **/** `restore-pg`**).** Vultr VM은 정지 상태에서도 과금되므로, 자연스러운 사이클은 "실행 후 내리고, 다음번에 다시 올리기"입니다. 하지만 그 사이에 PG seed를 잃어버린다면 이 사이클은 위험합니다.

```bash
make dump-pg           # dump current PG VM → data/postgres-dumps/
make list-dumps        # list saved dumps
make restore-pg        # auto-restore the latest dump to a fresh PG VM
make restore-pg DUMP=data/postgres-dumps/app-XXXX.dump   # pin a specific dump
```

복원 후에는 스크립트가 `ANALYZE` 결과, 테이블 수, DB 크기, 상위 테이블의 row 수를 자동으로 출력합니다 — 덕분에 누구도 "복원이 실제로 됐나?"를 수동으로 확인할 필요가 없습니다.

이렇게 촘촘하게 감싸두면, **새로운 팀원이나 미래의 스프린트에서 다섯 개의 명령으로 환경을 다시 세울 수 있습니다.** 여기서 "재사용 가능"이란 실제로 그런 의미입니다.

* * *

## Observability — 측정 없는 튜닝은 그냥 추측일 뿐

Observability는 부하가 들어가기 **전에** 살아 있어야 합니다. 눈을 가린 채 먼저 돌려보고 나서야 고장을 발견하는 것은 너무 늦습니다. 그래서 모니터링 스택을 마지막이 아니라 가장 먼저 구축했습니다.

| 레이어 | 도구 | 위치 |
| --- | --- | --- |
| Metric store | Prometheus | 로컬 Mac (`localhost:9090`) |
| Dashboard | Grafana (provisioning) | 로컬 Mac (`localhost:3000`) |
| System metrics | `node_exporter` | 전체 7대 VM (`:9100`) |
| DB metrics | `postgres_exporter` | Postgres VM (`:9187`) |
| Cache metrics | `redis_exporter` | Redis VM (`:9121`) |
| Infra metrics | HAProxy / Centrifugo `/metrics` | 각 VM |
| Load metrics | k6 → Prometheus remote-write | client VM → Mac (SSH reverse tunnel) |

셋업은 세 개의 명령입니다.

```bash
docker compose -f monitoring/docker-compose.monitor.yml up -d
./scripts/setup-monitoring-exporters.sh all
./scripts/verify-prometheus-targets.sh
```

`setup-monitoring-exporters.sh`는 짚고 넘어갈 만합니다. **이 스크립트는 PG/Redis 비밀번호를 저장소에 절대 넣지 않습니다.** 스크립트는 원격 VM에 SSH로 접속해 `/etc/postgres/postgres.env`와 `/etc/redis/redis.env`를 읽어, 그곳에서 exporter 전용 env 파일을 만듭니다. secret이 커밋에 들어갈 구조적 여지가 없습니다.

대시보드는 실행 중 운영자가 실제로 사고하는 방식에 맞춰 나뉩니다 — **세 개의 레이어**입니다.

```plaintext
(A) k6 / Sender         →  얼마나 보내려 시도했는가
(B) Delivery / Receiver →  실제로 얼마나 도착했는가
(C) Server / Resource   →  그 동안 인프라가 버텼는가
```

레이어별 핵심 패널:

-   **(A) Sender** — target TPS, achieved TPS, 성공한 MPS, HTTP p50/p95/p99, 429 / 5xx 분포, k6 dropped iterations(constant-arrival-rate가 속도를 못 따라간 빈도).
    
-   **(B) Delivery** — REST-to-WS p50/p95/p99, receiver msgs/sec, active clients/subscriptions, expected traces(registered / delivered / pending), 그리고 이상 징후(duplicate / parse failure / negative latency).
    
-   **(C) Server** — node CPU/memory/network, Redis ops/memory/latency, Postgres connections/locks/**deadlocks**, Centrifugo per-node client/channel 분포, backend별 HAProxy 5xx.
    

이 분할의 가치는 **원인을 얼마나 빨리 격리할 수 있는가**에 있습니다. 5xx가 치솟았을 때, (B) 지연은 멀쩡한데 (C)에서 Postgres 커넥션이 올라가고 있다면 — 그것은 DB pool 문제입니다. 추측이 필요 없습니다.

* * *

## 인증 / 인가 seeding — 가장 어려운 부분

이것은 전체 셋업에서 개념적으로 가장 까다로운 조각이었습니다. 별도의 섹션을 받을 만합니다.

### 로그인 플로우를 우회하는 이유

테스트 대상은 `POST /api/channels/{channelId}/messages` — 즉 **write path**입니다. 우리가 측정하는 것은 메시지를 보내는 순간의 비용, 즉 auth 미들웨어 → DB write → fanout → Centrifugo publish → WS 전달의 비용입니다.

전체 로그인 플로우(OAuth 콜백, 세션 발급, 토큰 교환)를 포함하면 auth 서비스의 비용이 메시지 write path와 섞여버려, **knee가 실제로 어디서 발생하는지 격리할 수 없게 됩니다**. 그래서 프로덕션의 auth 모델은 그대로 보존하되, **메시지 전송 이전에 벌어지는 모든 것을 미리 seeding**합니다.

### 서로 다른 두 개의 auth 모델을, 구분된 상태로 유지

제품에는 두 종류의 클라이언트 클래스가 있고, 부하 테스트는 이를 그대로 반영합니다.

| 클라이언트 | 토큰 | 검증자 | 스토리지 조회 |
| --- | --- | --- | --- |
| k6 (REST sender) | Desktop Bearer **opaque token** | Next.js auth 미들웨어 | **Redis** (token→user) + **Postgres** (채널 멤버십) |
| Go receiver (WS) | Centrifugo **JWT (HS256, self-contained)** | Centrifugo HMAC 검증 | **없음** |

비용 구조가 완전히 다릅니다.

-   **REST auth**: 메시지 _하나마다_ Redis GET + Postgres SELECT. 비용이 메시지 수만큼 곱해집니다.
    
-   **WS auth**: connect 시점에 HMAC 검증 한 번. 이후에는 비용이 0.
    

그래서 **우리는 두 토큰을 절대 합치지 않습니다**. 프로덕션의 비용 형태가 테스트까지 살아남아야 하기 때문입니다.

### "Seeding"은 곧 auth 상태를 직렬화하는 것

"직렬화(serialize)"라는 단어가 딱 맞습니다. 평소에는 메모리, DB, Redis에 흩어져 있는 auth 상태를 파일에 얼려 넣는 것입니다. 얼려야 할 상태는 다음과 같습니다.

-   어떤 사용자가 존재하는가 (`User.id`, email, name)
    
-   각 사용자가 어떤 워크스페이스에 속하는가
    
-   각 사용자가 어떤 채널의 멤버인가
    
-   각 REST 요청에 어떤 access token을 붙일 것인가
    
-   각 receiver가 어떤 Centrifugo 채널을 subscribe할 수 있는가
    

이 모든 것이 아홉 개의 `data/generated/*.jsonl` 파일로 직렬화됩니다. **이 파일들이 테스트의 SSOT입니다.** Postgres, Redis, k6는 모두 같은 시점의 같은 스냅샷을 바라보고 있어야 합니다 — 이들 사이에 drift가 생기면 즉시 401/403이 폭주합니다.

### 생성 파이프라인

```text
data/generated/users.jsonl  ← SSOT
        │
        ├──► seed-export-postgres.js
        │     → Postgres: upsert Workspace / User / WorkspaceMember /
        │                 Channel / ChannelMember
        │
        ├──► build-desktop-bearer-tokens.js
        │     → tokens.jsonl              (k6 attaches in Authorization)
        │     → redis-token-seed.jsonl    (input for Redis SETEX)
        │     → seed-redis-tokens.sh → Redis: desktop:token:access:*
        │
        └──► build-centrifugo-channel-allowlist.js
              → centrifugo-channel-allowlist.jsonl
              → mint-centrifugo-tokens.js  (HS256 sign with CENTRIFUGO_HMAC_SECRET_KEY)
              → centrifugo-jwts.jsonl     (Go receiver uses on WS connect)
```

아홉 개의 파일을 **변동성에 따라 두 그룹으로** 나눈 것이, 운영상 중요한 부분으로 드러났습니다.

**A. Auth-독립적 — Postgres seed가 살아 있는 한 재사용 가능 (6개 파일)** `users.jsonl`, `channels.jsonl`, `channel-members.jsonl`, `sender-channel-pairs.jsonl`, `mention-targets.jsonl`, `centrifugo-channel-allowlist.jsonl`

**B. 만료성 / 휘발성 — 매 사이클마다 재발급 또는 재seeding (3개 파일)** `tokens.jsonl`(1년 TTL, Redis FLUSH 시 무효화), `centrifugo-jwts.jsonl`(1년 TTL, HMAC secret 로테이션 시 무효화), `redis-token-seed.jsonl`(Redis가 비면 다시 SET해야 함).

이 그룹핑은 "전부 다시 생성해야 하나?"라는 반복적인 질문을 없애줍니다. **PG/Redis가 살아 있고 토큰이 만료되지 않은 한, 아홉 개 파일 전부가 다음 1k 스모크나 DB knee sweep에 그대로 투입됩니다.**

### 인증 플로우, 엔드투엔드

**REST sender:**

```text
k6 → Authorization: Bearer <opaque token>
   → Next.js auth middleware: Redis GET desktop:token:access:<token>
   → req.user injected
   → Postgres channel membership check
   → POST /api/channels/{id}/messages
```

**WS receiver:**

```text
Go receiver → WS connect with token=<JWT>
           → Centrifugo: HS256 signature + exp check (no Redis/PG lookup)
           → subscribe chat:*
```

미리 seeding한 인증은 message-path 부하 테스트의 표준 관행입니다. 목표는 auth 제품 자체를 벤치마크하는 것이 아니라 — **메시지 write path와 fanout path**의 knee를 찾는 것입니다.

* * *

## Sender / receiver 분리 측정 아키텍처

이것이 부하 모델의 핵심 설계 선택입니다.

```text
[ client VM ]
   k6 (REST sender)  ──HTTP──►  HAProxy ──► App ──► (publish) ──► Centrifugo
                                                                      │
                                                                      ▼ (fanout)
   Go receiver (WS)  ◄──────────────────────────  Centrifugo ◄────────┘
```

**송신과 수신이 같은 프로세스에 살지 않는 이유:**

-   k6는 HTTP 부하 생성기로 최적화되어 있습니다. 여기에 WS subscriber를 붙이면 생성기 쪽 부하 곡선이 왜곡됩니다.
    
-   Go receiver는 1,000개 이상의 동시 WS 커넥션을 유지하면서 메시지마다 traceId 매칭 + 지연 측정을 수행해야 합니다. goroutine/channel 모델이 자연스럽게 들어맞습니다.
    
-   **각 측이 자기 일만 하는 것**이야말로 "어느 쪽이 병목인가?"에 답할 수 있게 만듭니다.
    

### Trace 측정 — 진짜 REST → WS E2E 지연

k6가 메시지를 보낼 때, payload에 `metadata.clientTrace.traceId`와 `sentAt`을 심습니다. Go receiver가 Centrifugo로부터 publication을 받으면 traceId로 매칭하고 `now - sentAt`을 기록합니다.

```text
sender POST timestamp ─────────────►  receiver WS receive timestamp
                  ▲                          ▲
            sentAt recorded            latency = now - sentAt
```

그 값이 진짜 **REST-to-WS 전달 지연 p50/p95/p99**입니다 — HTTP 응답 시간이 아니라, "전송 시점부터 메시지가 다른 사람 화면에 나타나기까지 얼마나 걸리는가"입니다.

`EXPECTED_TRACE_MODE=direct`를 켜면 성공한 모든 전송이 receiver의 `/expected` 엔드포인트에 자신의 traceId를 등록하기도 합니다. 이제 receiver는 **정확히 어떤 traceId가 도착했어야 하는지** 알게 되며, 다음이 나옵니다.

-   `registered` — 등록된 traceId
    
-   `delivered` — 실제로 수신된 traceId
    
-   `pending` — 등록됐지만 끝내 전달되지 않음 (손실 후보)
    
-   `duplicate` — 같은 traceId가 여러 번 수신됨
    
-   `negativeLatency` — 시계 오차(clock skew) 의심 대상
    

실행이 끝나면 `pending`은 0으로 수렴해야 합니다. 남는 것은 무엇이든 **손실된 메시지**입니다.

### k6 시나리오 형태

```javascript
export const options = {
  scenarios: {
    chat_smoke: {
      executor: 'constant-arrival-rate',  // arrival-rate based, not VU based
      rate: targetTps,
      timeUnit: '1s',
      duration,
      preAllocatedVUs,
      maxVUs,
    },
  },
  thresholds: {
    http_req_failed:       'rate<0.01',
    http_req_duration:     'p(95)<1000',
    dropped_iterations:    'count<1',
    message_send_429_total:'count<1',
    message_send_5xx_total:'count<1',
  },
};
```

`constant-arrival-rate`가 핵심입니다. VU 기반 시나리오에서는 응답이 느려지면 그냥 arrival rate가 낮아질 뿐이라, "부하를 _생성_하는 데 실패한 건가, 아니면 서버가 그것을 _거부_한 건가"를 구분할 수 없습니다. Arrival-rate 기반이면 서버가 속도를 못 따라갈 때 `dropped_iterations`가 올라가고 진실이 눈에 보입니다.

DB knee sweep은 여기서 한 걸음 더 나아갑니다. 단계마다 1분 ramp + 5분 plateau로 `50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 650, 800, 1000` TPS를 자동으로 sweep합니다. 한 번 실행하면 knee point가 차트 위에 바로 드러납니다.

* * *

## 실행 흐름 — 고정된 12단계

환경이 진정으로 재사용 가능하려면, 사람이 기억해야 할 것의 수가 적어야 합니다. 그래서 한 번의 부하 테스트 실행을 **순서가 정해진 12단계**로 고정했습니다.

```plaintext
0.  Set working directory + source HOSTS.env
1.  Save existing PG dump          (make dump-pg)
2.  Provision 7-host infra          (make up → make ssh-test)
3.  Restore DB                      (make restore-pg)
4.  Deploy apps                     (make secrets-check → make cutover → make smoke)
5.  Bring up monitoring             (docker compose up + install exporters)
6.  Seed/export test data           (data:seed-postgres, data:validate)
7.  Refresh JWTs + Redis seed       (tokens:desktop-bearer, tokens:centrifugo)
8.  Upload artifacts to client VM   (upload-loadtest-data.sh, upload-k6-scripts.sh)
9.  Reset App connection pool       (docker restart witim-web)
10. k6 REST smoke probe             (chat-smoke.js, 30s)
11. Open the 3-terminal session     (receiver / Prom reverse tunnel / k6 sender)
12. Monitor abort criteria
```

11단계 — 세 개의 터미널 패턴 — 은 매 실행마다 사용됩니다.

-   **Terminal 1**: client VM 위의 Go receiver — WS 커넥션 + trace 매칭 + metric exporter.
    
-   **Terminal 2**: client VM의 k6가 **로컬 Mac의** Prometheus remote-write 엔드포인트에 도달할 수 있도록 하는 SSH reverse tunnel.
    
-   **Terminal 3**: client VM 위의 k6 sender — Prometheus remote-write로 메트릭을 흘려보냄.
    

```bash
# Terminal 2: SSH reverse tunnel (k6 → Mac's Prometheus)
ssh -i "\(SSH_KEY" -N -R localhost:9090:localhost:9090 "\)SSH_USER@$CLIENT_IP"
```

reverse tunnel이야말로 k6 메트릭을 로컬 Grafana 대시보드에 **실시간**으로 띄워주는 장치입니다. 부하가 무너지는 것을 움직이는 그대로 지켜보다가, 무너지는 순간 멈출 수 있습니다.

### Abort 기준

다음 중 하나라도 참이 되면, 과부하 곡선과 회복 곡선이 서로 뒤섞이기 전에 중단합니다.

```plaintext
message_send_5xx_total > 0
dropped_iterations > 0 (reproducibly)
HTTP p95 ≥ 1s
REST-to-WS p99 rising into seconds
Postgres connection exhaustion in logs
Postgres deadlocks repeating
client CPU pinned at 80–90% AND achieved TPS falling behind target
```

왜 이것들을 미리 적어두는가? 간단합니다. **"계속 진행해도 될까?"를 실행 도중 직감으로 답하기 시작하면, 그 결과 리포트는 신뢰를 잃습니다.**

* * *

## Grafana에서 실제 실행 읽기 — 75→100 TPS knee

`chat-knee-sweep.js`를 시작한 지 약 7~8분, sweep 단계가 **75 TPS에서 100 TPS로** 막 올라선 그 순간에 이 대시보드 스냅샷을 잡았습니다. 이 장면이 흥미로운 이유는 **인프라 리소스는 거의 건드려지지 않았는데도 HTTP 에러율이 42.8%까지 치솟았다**는 점입니다 — knee가 리소스 천장이 아니라 앱의 처리 경로 내부의 무언가라는 명확한 신호입니다.

대시보드는 앞서 세팅한 세 레이어 순서로 읽습니다: `(A) k6 / Sender → (B) Delivery / Receiver → (C) Server / Resource`.

_(계속 —_ "다음 글에서 앱 서버 로그를 파고들어 42.8% HTTP 에러율\*의 원인을 풀어보겠습니다.)\*

![](/images/469c2171-2a30-4c0a-8dd0-373aa02d4bec.webp) ![](/images/35960873-fdfd-46bc-b73c-31bce2c7f2e3.webp) ![](/images/c83745e8-8bc4-4fc5-b94e-00045ed3078e.webp) ![](/images/08dddcc4-0e94-4e9c-9a7c-13c7f4710088.webp)

* * *

_읽어주셔서 감사합니다. 비슷한 측정 작업을 진행하고 있다면, 이 글에서 가져갈 만한 가장 가치 있는 두 가지 패턴은 아마_ _**"IaC + 배포 + 스모크 + seeding + teardown을 하나의 Make 주도 흐름으로 감싼다"**_ _와_ _**"auth 상태를 파일로 직렬화하고 그것을 SSOT로 취급한다"**_ _일 것입니다. 이 두 가지가 환경이 재사용 가능한 것이 되는지, 아니면 그냥 일회성으로 끝나는지를 결정합니다._
