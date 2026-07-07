---
title: 'Centrifugo의 Pub/Sub 브로커로 KeyDB를 절대 쓰면 안 되는 이유'
description: '들어가며 저는 10만 개의 동시 WebSocket 연결을 초당 25K 이상의 메시지 처리량으로 감당하도록 설계된 실시간 채팅 시스템을 구축하고 있었습니다. 아키텍처는 대칭형 듀얼 스택이었습니다 — 동일한 서버 두 대'
pubDate: 2026-03-29
tags: ['redis', 'websockets', 'docker', 'devops', 'system-design']
category: fundamentals
cover: /covers/why-you-should-never-use-keydb-as-a-pub-sub-broker-for-centrifugo.webp
coverAlt: 'Centrifugo의 Pub/Sub 브로커로 KeyDB를 절대 쓰면 안 되는 이유'
---

> **출처:** [Snapchat/KeyDB #883 — KeyDB deadlock](https://github.com/Snapchat/KeyDB/issues/883)

## 들어가며

저는 **10만 개의 동시 WebSocket 연결을 초당 25K 이상의 메시지 처리량으로** 감당하도록 설계된 실시간 채팅 시스템을 구축하고 있었습니다. 아키텍처는 대칭형 듀얼 스택이었습니다 — 동일한 서버 두 대(각 16 vCPU / 58 GB)가 각각 5개의 Centrifugo 노드를 실행하고, Cloudflare DNS가 트래픽을 50 대 50으로 분산하는 구조였습니다.

가장 핵심적인 과제는 **서버 간 메시지 동기화**였습니다. 서버 A에 연결된 사용자가 메시지를 보내면, 그 메시지가 서버 B에 있는 사용자에게 도달해야 합니다. Centrifugo는 이 작업을 Redis Pub/Sub에 위임합니다 — 그 뒤에 어떤 Redis 호환 저장소가 자리하든, 그것이 전체 메시징 파이프라인의 근간이 됩니다.

저는 KeyDB를 선택했습니다. KeyDB는 **active-replica 모드**를 지원하는 멀티스레드 Redis 포크로, 양방향 쓰기가 가능했습니다. 서버 A와 B 양쪽 모두 쓰기가 가능하고 변경 사항이 자동으로 동기화됩니다. 대칭형 아키텍처에 완벽해 보였습니다.

```plaintext
Server A: KeyDB Primary         (read/write)
              ↕  (bidirectional replication)
Server B: KeyDB Active-Replica  (read/write)
```

초기 부하 테스트는 23.6K TPS에 도달했습니다. 모든 것이 괜찮아 보였습니다.

그러다 저는 GitHub Issues를 읽기 시작했습니다.

* * *

## 1\. 문제 — 5년간 반복된 동일한 버그

프로덕션 배포에 앞서 저는 KeyDB의 이슈 트래커를 살펴보기 시작했습니다. 제가 기대했던 것은 이미 오래전에 해결된 버그들이었습니다. 하지만 실제로 발견한 것은 무려 5년에 걸쳐 이어진 하나의 패턴이었습니다.

### 행(hang)과 deadlock의 연대기

| 날짜 | 이슈 | 증상 | 상태 |
| --- | --- | --- | --- |
| 2019.11 | #103 | deadlock & hang | Closed (버전 업그레이드) |
| 2023.03 | #619 | active-replica hang | **Open** |
| 2024.03 | #794 | 서버 전체 hang | **Open** |
| 2024.06 | #845 | Pub/Sub 멈춤 | **Open** |
| 2024.10 | #878 | KEYS 명령 hang | **Open** |
| 2024.11 | #883 | replication deadlock | **Open** |

2019년부터 2024년까지, **동일한 유형의 hang/deadlock이 계속 반복되었습니다.** 그리고 최신 버전인 v6.3.4는 그중 어느 것도 고치지 못했습니다.

### 구조적 결함: 멀티스레드 deadlock

이슈 #883이 가장 우려스러웠습니다. 이것은 단순한 버그가 아니라 **KeyDB의 멀티스레드 아키텍처 그 자체의 구조적 결함**이었습니다.

```plaintext
bgsaveCommand attempts to acquire global WRITE lock
  ↓
AsyncWorkerQueue thread(1): waiting for global READ lock, holding m_mutex
  ↓
AsyncWorkerQueue thread(2): holding READ lock, waiting for m_mutex
  ↓
→ 3-way deadlock
  → CPU usage drops to 0%
  → All client connections unresponsive
  → Does not respond to SIGTERM (only SIGKILL works)
```

서버 전체가 조용히 멈춰버립니다. 자동 복구는 불가능합니다. 이슈 #845에서 사용자들은 `sudo reboot`조차 멈춰버려 **하드웨어 수준의 강제 재부팅이 필요했다**고 보고했습니다.

### 사실상 방치된 프로젝트

마지막 릴리스인 v6.3.4는 2023년 10월이었습니다. 저는 이것을 2026년 2월에 검토하고 있었으니 — **2년 넘게 업데이트가 없었던 셈입니다.** GitHub에는 233개의 open 이슈가 쌓여 있었습니다. 메인테이너의 응답은 2024년 이후 사실상 끊긴 상태였습니다.

문득 Redis의 창시자 antirez가 했던 말이 떠올랐습니다. "스레드 기반 코드에서 버그가 발생할 위험은 매우 높으며, Redis의 비(非)스레드 아키텍처는 안정성을 위한 설계다."

* * *

## 2\. 이것이 Centrifugo에 치명적인 이유

Centrifugo는 Redis Pub/Sub을 **노드 간 메시지 전달의 핵심 경로**로 사용합니다. 이건 캐시 레이어가 아닙니다. 있으면 좋은 부가 기능도 아닙니다. Pub/Sub이 멈추면, 모든 Centrifugo 노드가 메시지를 중계하는 능력을 잃습니다.

```plaintext
When KeyDB Pub/Sub freezes:
  ├─ Inter-node message delivery: completely halted
  ├─ All 10 Centrifugo instances: unable to deliver messages
  ├─ 100K connected users: total loss of real-time functionality
  └─ KeyDB ignores SIGTERM → no automatic recovery
      → An operator must manually hard-reboot the server
```

Centrifugo 공식 문서는 다음과 같이 명시하고 있습니다. "향후 릴리스에서 KeyDB 호환성은 보장되지 않는다." 제가 찾아본 바로는, 프로덕션에서 Centrifugo를 운영하는 모든 회사 — VK, Badoo, ManyChat, Grafana — 는 Redis 또는 Redis + Sentinel을 사용하고 있었습니다. **단 한 곳도 KeyDB를 Pub/Sub 브로커로 프로덕션에 배포하지 않았습니다.**

* * *

## 3\. 대안 검토 — DragonflyDB vs. Valkey

KeyDB는 반드시 걷어내야 했습니다. 문제는 무엇으로 대체할 것인가였습니다.

### DragonflyDB — 더 나은 멀티스레딩, 하지만…

DragonflyDB는 처음부터 멀티스레드, shared-nothing 아키텍처로 설계되었습니다. 샤드별 독립 스레드에 최소한의 락만 사용합니다. KeyDB의 deadlock을 일으키는 글로벌 락 경합이 구조적으로 발생할 수 없습니다. deadlock 이슈가 보고되면 전담 팀이 며칠에서 몇 주 안에 패치합니다.

하지만 Centrifugo는 DragonflyDB에 대해 공식적으로 테스트하지 않습니다. 그리고 더 근본적으로 던져야 할 질문이 있었습니다.

### Pub/Sub에 애초에 멀티스레딩이 필요한가?

멀티스레딩이 조금이라도 이점을 주려면 전제 조건이 있습니다. **단일 코어가 100%에 도달하고 있어야 한다는 것입니다.** 멀티스레딩의 요점은, 하나의 코어로는 감당이 안 되기 때문에 작업을 여러 코어에 분산하는 데 있습니다. 그래서 진짜 질문은 이것입니다 — Centrifugo의 Pub/Sub 브로커로 사용될 때, Valkey의 단일 스레드 설계가 코어 하나를 포화시키는 상황이 과연 벌어질까요?

Centrifugo 공식 벤치마크에 따르면, **100만 개의 WebSocket 연결이 초당 500K 메시지를 전달하는 상황**에서 각 Redis 인스턴스는 대략 5%의 CPU를 사용했습니다. 개발자 본인은 이렇게 말했습니다. "10개의 Centrifugo 노드 + 1개의 Redis 인스턴스로 50만 개의 연결을 처리했는데, Redis는 단일 코어의 60%만 사용했다."

우리 환경은 10만 개의 연결입니다. 비례로 계산하면 단일 코어의 약 12~15% 수준입니다. 16 vCPU 서버에서 이는 **전체 용량의 1% 미만**입니다. Pub/Sub은 단순히 메시지를 중계할 뿐이며, Redis가 처리하는 워크로드 중 가장 가벼운 축에 속합니다.

```plaintext
CPU load by Redis workload type:

GET/SET cache (hundreds of K ops/sec)   ████████████████  ← heavy
LPUSH/RPOP queue (bulk processing)      ██████████████    ← heavy
Sorted Set operations (ranking/analytics) ████████████    ← heavy
PUBLISH/SUBSCRIBE (message relay)       ███               ← light
```

그런데 여기에 핵심적인 통찰이 있습니다. 논의를 위해, 트래픽이 급증해서 Valkey의 단일 코어가 60%에 도달했다고 가정해 봅시다. 그에 대한 대응이 "멀티스레드 데이터베이스로 갈아탄다"여야 할까요?

아닙니다. **그냥 Valkey 인스턴스를 하나 더 추가하면 됩니다.**

Centrifugo는 Redis 주소를 배열 형태로 그대로 받아들입니다. 이렇게 구성하면 채널 이름에 consistent hashing을 적용하여 트래픽을 자동으로 분산합니다. 이것은 Redis Cluster가 아닙니다 — Valkey 인스턴스들은 서로의 존재조차 알지 못합니다. 라우팅은 Centrifugo가 처리합니다. "이 채널은 A로, 저 채널은 B로."

```json
// Before: 1 Valkey instance — single core at 60%
{ "address": "redis://valkey-a:6379" }

// After: 2 Valkey instances — each core at 30%
{ "address": [
    "redis://valkey-a:6379",
    "redis://valkey-b:6379"
  ]
}
```

설정에 한 줄을 추가하니 부하가 절반이 됩니다. 인스턴스 세 개면 각각 3분의 1씩입니다. **선형적인 수평 확장입니다.**

이것이 의미하는 바는 다음과 같습니다.

```plaintext
When is multithreading needed?
  = When a single core reaches 100%

What actually happens with a Pub/Sub broker:
  Valkey's single core reaches ~60%
  → Add one more Valkey instance, add one address to Centrifugo config
  → Each instance now handles ~30%
  → A single core never reaches 100%
  → The situation that requires multithreading simply never arrives
```

**멀티스레딩으로 단일 코어의 천장을 뚫는 대신, 단일 코어 인스턴스를 여러 개 배포하는 것입니다.** 이 방식이 더 안전하고, 더 예측 가능하며, 업계 표준입니다. 그리고 Centrifugo가 이를 기본적으로 지원하는 이상 — KeyDB나 DragonflyDB 같은 멀티스레드 Redis 변종을 Pub/Sub 브로커로 사용할 이유가 없습니다.

### 결론: Valkey

| 요소 | KeyDB | DragonflyDB | Valkey |
| --- | --- | --- | --- |
| Deadlock 위험 (Pub/Sub) | 높음 | 낮음 | **불가능** |
| 프로젝트 상태 | 방치됨 | 활발함 | 활발함 |
| Centrifugo 공식 지원 | 미지원 | 미테스트 | **공식 지원** |
| 라이선스 | BSD | BSL | **BSD** |

Valkey는 Redis 7.2.4의 포크로, Linux Foundation이 주도하고 AWS, Google, Oracle의 후원을 받고 있습니다. Centrifugo의 관점에서 Valkey와 Redis는 구별할 수 없습니다 — 프로토콜, 명령어, Pub/Sub, Sentinel 지원이 모두 동일합니다.

단일 스레드라는 것은 곧 **"멀티스레드 deadlock"이라는 버그 카테고리 전체가 존재하지 않는다**는 뜻입니다. 최우선 순위가 "절대 멈추지 않는 것"이라면, Valkey + Sentinel이 가장 보수적이고 가장 안전한 선택이었습니다.

* * *

## 4\. 구축하기 — Valkey Primary + Replica + Sentinel (3-노드 쿼럼)

### 아키텍처 변경

저는 KeyDB의 active-replica(양방향 쓰기)를 버리고, Sentinel 자동 페일오버가 붙은 Valkey Primary → Replica 단방향 복제로 전환했습니다.

```plaintext
Before (KeyDB):
  Server A: KeyDB Primary    ↔ (bidirectional)  Server B: KeyDB Active-Replica
  → Deadlock risk, no automatic recovery

After (Valkey + Sentinel):
  Server A: Valkey Primary   → (unidirectional)  Server B: Valkey Replica
  Sentinel ×3 (Server A, Server B, Runner) — quorum=2

  → Deadlock impossible, automatic failover in 5–15 seconds
```

Sentinel 세 개를 서버 A, 서버 B, 그리고 월 $6짜리 Runner 서버에 배치했습니다. quorum=2로 설정하면, 서버 하나가 장애를 일으켜도 나머지 두 개의 Sentinel이 과반수를 형성하여 페일오버를 트리거할 수 있습니다.

| 장애 시나리오 | Sentinel 상태 | 결과 |
| --- | --- | --- |
| 서버 A (Primary + S1) 다운 | S2 + S3 = 2/3 | 페일오버 실행 |
| 서버 B 다운 | S1 + S3 = 2/3 | Primary 유지 |
| Runner (S3) 다운 | S1 + S2 = 2/3 | 정상 동작 |

### 어려웠던 부분: Docker 네트워킹 vs. Sentinel

마이그레이션에서 가장 고통스러웠던 부분은 Valkey 자체가 아니라 — **Docker 네트워킹**이었습니다.

Sentinel의 역할은 모든 노드에게 "현재 마스터는 여기 있다"고 알려주는 것입니다. 그런데 Sentinel이 Docker bridge 네트워크 안에서 실행되면, 마스터의 주소를 `172.18.0.2` — 즉 Docker 내부 IP로 인식합니다. 이 주소를 서버 B의 Sentinel에 전달하면, 그 주소는 완전히 다른 컨테이너를 가리키거나 아예 존재하지 않습니다. 연결이 실패합니다.

```plaintext
Sentinel inside Server-a's Docker bridge:
  "master is at 172.18.0.2!"
           ↓
Server-b's Docker bridge:
  "172.18.0.2? That doesn't exist here... → connection failed"
```

건물의 내선 번호를 알려주고서 다른 건물에서 그 번호가 통하기를 기대하는 것과 같다고 생각하면 됩니다. 내선 번호는 그 건물 안에서만 통합니다.

**해결책은 Sentinel을** `network_mode: host`**로 실행하는 것이었습니다.** Sentinel이 Docker bridge 내부가 아니라 호스트 네트워크에 직접 자리하면, 마스터를 그 VPC IP(`10.10.0.3`)로 인식합니다. VPC IP는 네트워크 내 어느 서버에서든 라우팅이 가능합니다.

```plaintext
Sentinel (host network):
  "master is at 10.10.0.3:6379!"
           ↓
Server-b:
  "10.10.0.3? That's a VPC address — reachable! → connection success"
```

하지만 또 다른 문제가 있었습니다. Centrifugo 컨테이너들은 여전히 Docker bridge 안에 있었고, Sentinel은 이제 그 바깥에 있었습니다. 안쪽에서 바깥쪽으로 도달하려면 `extra_hosts` 지시자가 필요했습니다.

```yaml
centrifugo-1:
  extra_hosts:
    - "sentinel:host-gateway"  # Route through bridge gateway to reach host's Sentinel
```

`host-gateway`는 bridge 네트워크의 게이트웨이 IP로 해석되는 특수한 Docker 키워드입니다 — 본질적으로 건물의 안과 밖을 연결하는 로비 전화기인 셈입니다. **이 한 줄을 찾는 데 마이그레이션의 다른 어떤 부분보다도 더 오랜 시간이 걸렸습니다.**

### 최소한의 설정 변경

애플리케이션 코드나 Centrifugo 설정 구조는 전혀 바꿀 필요가 없었습니다. 환경 변수 하나만 교체하면 됐습니다.

```bash
# Before
CENTRIFUGO_REDIS_ADDRESS=keydb:6379

# After
CENTRIFUGO_REDIS_ADDRESS=redis+sentinel://sentinel:26379,<server-b>:26379,<runner>:26379?master=mymaster
```

주소 형식이 `redis+sentinel://`로 바뀌었고, Centrifugo가 자동으로 Sentinel에 현재 Primary를 질의하여 연결합니다. 인프라 측면에서는 KeyDB 전용 옵션 세 개(`server-threads`, `server-thread-affinity`, `active-replica`)를 삭제하고, KeyDB conf를 Valkey conf로 교체했습니다. 그게 전부였습니다.

* * *

## 5\. 검증 — 부하 테스트 결과

마이그레이션 후, 동일한 스트레스 테스트를 실행했습니다. 10만 개의 동시 연결, 4단계 점진적 부하였습니다.

### TPS와 Latency

| 단계 | 통합 TPS | P50 | P95 | P99 | 종합 등급 |
| --- | --- | --- | --- | --- | --- |
| 1 | 15,305 | 1.7ms | 34.8ms | 692.7ms | **Good** |
| 2 | 18,591 | 2.0ms | 485.0ms | 971.0ms | **Fair** |
| 3 | 23,504 | 3.6ms | 270.5ms | 905.4ms | **Fair** |
| 4 | 31,171 | 875.0ms | 2,492ms | 4,963ms | **Fail** |

에러 없이 지속 가능한 상한선은 **약 23.5K TPS**였습니다. 3단계까지 에러율은 0.0001~0.0002% — 사실상 0에 머물렀습니다.

### Valkey와 Sentinel의 리소스 사용량

이것이 "단일 스레드가 병목이지 않은가?"에 대한 답입니다.

| 컨테이너 | Server-A (Primary) | Server-B (Replica) |
| --- | --- | --- |
| **Valkey** | 88~98% (단일 코어) | 31~35% |
| **Sentinel** | 0.4~0.5% | 0.5~1.0% |
| **HAProxy** | 114~202% | 127~216% |

Valkey Primary는 단일 코어에서 88~98%에 도달했지만, 이는 16 vCPU 서버 전체 용량의 약 6%에 불과합니다. 실제 병목은 **216%에 달한 HAProxy**였습니다. Sentinel의 오버헤드는 무시할 만한 수준이었습니다 — CPU 0.4~1.0%에 RAM 약 3.4 MB였습니다.

KeyDB 시절과 비교하면, 양방향 복제 오버헤드를 제거함으로써 Replica 측 CPU가 눈에 띄게 줄었습니다. 그리고 무엇보다 중요한 것은 — **deadlock이 발생할 수 없다는 구조적 보장**을 얻었다는 점입니다.

### 페일오버 테스트

Primary를 강제로 종료시키고 복구 시간을 측정했습니다.

| 시간 | 이벤트 |
| --- | --- |
| T+0s | Primary 프로세스 종료 |
| T+5s | Sentinel 3개: SDOWN → 투표 → ODOWN (과반수 도달) |
| T+6s | Sentinel 리더 선출 |
| T+7s | Replica가 새 Primary로 승격 (`REPLICAOF NO ONE`) |
| T+8s | Centrifugo 자동 재연결 → 서비스 복구 |

**총 다운타임: 약 5~15초.** KeyDB에서는 자동 페일오버가 없었기에, 운영자가 수동으로 개입해야 했습니다. 최악의 경우 하드웨어 수준의 강제 재부팅이 필요했습니다. 이제는 월 $6짜리 서버가 완전 자동 복구를 제공합니다.

* * *

## 배운 점

이번 마이그레이션에서 얻은 교훈은 명확합니다.

**도구를 워크로드에 맞춰라.** 캐시와 큐는 throughput에 좌우되며 — 그런 곳에서는 멀티스레딩에 실질적인 이점이 있습니다. 하지만 Pub/Sub 브로커는 다릅니다. 브로커가 멈추면, 연결된 모든 클라이언트가 동시에 실시간 기능을 잃습니다. 재시도는 의미가 없습니다 — 메시지는 이미 사라졌습니다. **안정성 > 성능**인 워크로드에서, deadlock 위험을 안은 멀티스레드 엔진은 자산이 아니라 부채입니다.

**단일 스레드는 약점이 아니라 설계 결정이다.** Redis와 Valkey가 단일 스레드인 것은 성능을 포기해서가 아니라, **멀티스레드 deadlock이라는 버그 카테고리 전체를 제거했기** 때문입니다. 더 많은 throughput이 필요하면 인스턴스를 추가하면 됩니다. 그 편이 더 안전하고, 더 예측 가능하며, 업계 표준입니다.

**GitHub Issues는 거짓말하지 않는다.** 스택을 선택하기 전에 Issues 탭을 확인했어야 했습니다. 동일한 버그가 5년째 반복되고, 마지막 릴리스가 2년 전이며, 메인테이너들이 응답을 멈춘 프로젝트 — 그런 것을 프로덕션의 critical path에 올리는 것은 째깍거리는 시한폭탄입니다.
