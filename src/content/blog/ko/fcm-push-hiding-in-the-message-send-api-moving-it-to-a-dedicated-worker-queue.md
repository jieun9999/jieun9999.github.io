---
title: '[메신저 부하 테스트 3편] 메시지 전송 API에 FCM 푸시가 숨어 있었다 — 요청 경로에서 전용 워커 큐로 걷어낸 이야기'
description: '메신저 부하 테스트 실전기 3편: 메시지 전송 핸들러 안에서 직접 호출되던 FCM 푸시를 발견하고, 전용 워커 큐로 분리해 요청 경로에는 응답 책임만 남긴 이야기. 빈 catch에 묻히던 실패도 관측 가능하게 만들었습니다.'
pubDate: 2026-05-17
tags: ['fcm', 'bullmq', 'node-js', 'concurrency', 'observability', 'architecture']
category: reliability
cover: /covers/fcm-push-hiding-in-the-message-send-api-moving-it-to-a-dedicated-worker-queue.webp
coverAlt: '메시지 전송 API에 FCM 푸시가 숨어 있었다 — 요청 경로에서 전용 워커 큐로 걷어낸 이야기'
coverCaption: '위 이미지는 Sentry 기반 모니터링 대시보드의 일부입니다.'
series: messenger-load-test
seriesOrder: 3
seriesTitle: '메신저 부하 테스트 실전기'
---

## TL;DR

1편에서 부하 테스트 환경을 세우고, 2편에서 메시지 전송 핸들러의 PostgreSQL 데드락을 잡았습니다. 3편은 **그 데드락을 진단하다 같은 핸들러에서 발견한 두 번째 문제** — 요청 경로에 섞여 있던 FCM 푸시 — 를 구조적으로 걷어낸 기록입니다. 세 가지로 요약됩니다.

1.  **발견** — 메시지 전송 API 안에서 FCM 푸시가 **floating promise로 직접 실행**되고 있었고, 그 실패는 빈 `.catch(() => {})` 여러 곳에 **완전히 은폐**돼 있었습니다. 메시지 저장과 푸시가 **같은 프로세스·같은 Prisma 풀**을 공유하는 구조였습니다.

2.  **근본 원인** — "API는 응답 속도(TPS), Worker는 외부 I/O"라는 책임 경계가 무너져 있었습니다. Firebase의 지연·부분장애가 **메시지 전송 TPS로 전이**될 수 있었고, 응답이 끝난 뒤에도 floating promise가 풀을 붙잡았습니다.

3.  **해결** — FCM 호출을 **전용 워커 큐(BullMQ)로 분리**해 요청 경로에서 완전히 들어냈습니다. API는 `enqueue`까지만 보장하고, 조회·배치 전송·재시도·토큰 정리·메트릭은 워커의 책임으로 옮겼습니다. 그 과정에서 빈 `catch`도 구조화 로그로 걷어내 실패가 보이게 만들었습니다.

> 범위 노트: 2편의 부하 테스트에서 실제로 서비스를 무너뜨린 건 이 풀 경합이 아니라 DB 데드락이었고, 그 시점엔 커넥션 풀이 포화되지도 않았습니다. 이 FCM 문제는 "지금 터진 불"이 아니라 **fan-out이 커지고 동시 접속이 늘면 반드시 물게 되는 시한폭탄**에 가까웠습니다 — 데드락을 고치는 김에, 아직 안 터진 이 구조부터 걷어낸 이야기입니다.

* * *

## 1\. 발견 — send API 안에 숨어 있던 두 가지

메시지 전송 핸들러(`POST /messages`, `POST /dm/:userId/messages`)를 한 줄씩 정리하니 문제는 두 축이었습니다.

**(1) FCM 실패가 빈 `catch`로 완전히 은폐된다.**

푸시 호출이 답글·멘션·채널 알림 곳곳에 이런 모양으로 흩어져 있었습니다.

```plaintext
sendPushToUser(userId, payload).catch(() => {});
sendPushToUsers(mentionTargets, payload).catch(() => {});
```

FCM은 Firebase Admin을 통해 나가는 **외부 HTTP I/O**입니다. drop·timeout·throttle·부분 실패가 일상적으로 일어나는데, `.catch(() => {})`는 그 rejection을 통째로 삼킵니다. 운영자에게 도달하는 신호는 **0**. 사용자는 "푸시가 안 와요"라고 문의하는데 대시보드는 초록불인, 관측성의 가장 나쁜 형태였습니다.

**(2) FCM 푸시 호출이 request path 안에서 섞인다.**

더 구조적인 문제는 위치였습니다. 메시지 저장용 DB 작업과 푸시 알림용 DB 작업이 **같은 API 서버 프로세스의 같은 Prisma 커넥션 풀**을 공유하고 있었습니다. 푸시 한 번을 보내려면 내부적으로 이만큼을 합니다.

```plaintext
sendPushToUser 내부
 ├─ pushDevice 조회        (Postgres)
 ├─ presence 조회          (Redis)
 ├─ userPreference 조회    (Postgres)
 ├─ FCM HTTP 전송          (Firebase Admin)
 └─ invalid token 정리     (Postgres)
```

즉 응답 경로 안에서 푸시 작업이 DB·Redis 자원을 같이 먹습니다. 푸시가 몰리면 새 메시지 저장 쿼리가 Prisma 내부 대기열에서 밀릴 수 있는 구조였습니다.

## 2\. 근본 원인 — 핸들러가 책임을 너무 많이 졌다

`sendPushToUser(...).catch(() => {})`는 `await`도 안 하고 호출자에게 `return`도 안 합니다. 이렇게 추적되지 않는 비동기 작업을 **floating promise**라고 부릅니다. HTTP 201을 내려보낸 **뒤에도** 이 작업은 같은 Node 프로세스 안에서 계속 돌며 풀과 Redis를 붙잡습니다. 성공·실패도 모르고, 로그도 재시도도 없습니다.

핵심 원칙 하나로 요약됩니다.

> **API는 응답 속도(TPS)를 책임지고, Worker는 외부 I/O를 책임진다.**

FCM이 요청 경로 안에 있으면 이 경계가 무너집니다. Firebase가 100ms만 느려져도 그 지연이 **메시지 전송 TPS로 그대로 전이**됩니다. 메시지 저장이라는 핵심 경로가, 푸시라는 부가 기능의 인질이 되는 셈입니다.

```plaintext
[ Before — 응답 경로가 외부 I/O까지 떠안음 ]

POST /messages
  ├─ message 저장 (DB)
  ├─ unreadCount / replyCount (DB)
  ├─ 실시간 publish
  ├─ sendPushToUser(...).catch(()=>{})   ← FCM이 여기서 직접 실행 💥
  │     └─ pushDevice / presence / preference / FCM / token 정리
  └─ HTTP 201
        ↑ 응답 뒤에도 floating promise가 같은 풀을 붙잡고 있음

[ After — 응답 경로는 응답만, 외부 I/O는 워커로 ]

POST /messages
  ├─ message 저장 (DB)
  ├─ unreadCount / replyCount (DB)
  ├─ 실시간 publish
  ├─ pushQueue.add("send-push", {...})    ← "큐에 넣었다"까지만 보장
  └─ HTTP 201

Push Worker (별도 프로세스)
  └─ pushDevice / presence / preference 조회
     → FCM 배치 전송 → 실패 재시도 → invalid token 정리 → 메트릭
```

## 3\. 해결 — FCM을 전용 워커 큐로 분리하다

방향은 분명했습니다. **응답 경로에서 FCM을 완전히 들어내고, 큐 뒤의 워커로 옮긴다.**

**API가 하는 일은 여기까지로 줄였습니다.**

```plaintext
// 응답 경로: "누구에게 무엇을 보낼지"만 큐에 위임하고 즉시 응답
await pushQueue.add("send-push", { recipientIds, payload, event });
// → HTTP 201
```

API는 **"푸시 작업을 큐에 넣었다"까지만 보장**합니다. 실제 FCM 전송, 조회, 실패 처리는 전부 워커의 몫으로 넘어갔습니다.

**Worker가 외부 I/O의 책임을 온전히 가져갑니다.**

| 워커 책임 | 내용 |
| --- | --- |
| 대상 조회 | pushDevice / presence / userPreference |
| 배치 전송 | FCM multicast (한 번에 최대 500 토큰) |
| 실패 처리 | 재시도 + 지수 백오프 (`server-unavailable` 등) |
| 토큰 위생 | `UNREGISTERED`/invalid 토큰 비활성화 |
| 안정성 | concurrency 제한, 실패 job 기록(DLQ) |
| 관측성 | 푸시 전용 메트릭 · 구조화 로그 |

**빈 `catch`도 이 전환에서 함께 걷어냈습니다.** 실패 처리가 워커 책임으로 옮겨지면서, 조용히 묻히던 실패를 로깅/모니터링에서 볼 수 있게 정리했습니다.

-   채널/DM 메시지 알림의 빈 `catch`를 관측 헬퍼로 교체 — 더 이상 `.catch(() => {})`로 삼키지 않습니다.

-   rejected promise와 푸시 `success = false`는 `secureLogger.error`로 기록.

-   FCM 응답의 부분 실패(`failureCount > 0`)는 `secureLogger.warn`으로 기록 — 일부 토큰만 실패하는 흔한 케이스도 관측됩니다.

-   Firebase Admin 미설정은 production에서 푸시 실패로 반환 — 설정 누락이 조용히 무발송으로 넘어가지 않습니다.

응답 경로에 남는 유일한 실패 지점은 **enqueue 그 자체**뿐이고, 이건 삼키지 않고 신호로 남깁니다.

```plaintext
enqueuePush(...).catch((err) => {
  secureLogger.error("push enqueue failed", err, { operation: "push.enqueue", messageId, event });
  metrics.increment("push_enqueue_failed");
});
```

`.catch(() => {})`가 "에러 없음"을 가장하던 자리가, 이제 "무엇이 어떻게 실패했는지"가 남는 자리로 바뀌었습니다.

## 4\. 왜 큐가 정석인가 — 실서비스 관점

푸시를 요청 경로 밖으로 빼는 건 취향이 아니라 메시징 서비스에서 사실상 표준 패턴입니다. 이유는 그대로 이 문제의 근거와 같습니다.

-   **외부 I/O 격리** — FCM/APNs는 지연·부분장애가 잦은 외부망입니다. 이게 메시지 전송 TPS에 전이되면 안 됩니다.

-   **fan-out 증폭** — 메시지 1건이 수신자 N명으로, 다시 푸시 N콜로 불어납니다. 큰 채널일수록 요청 안에서 감당할 수 없습니다.

-   **재시도·토큰 위생** — FCM은 실패 시 지수 백오프가 권장되고, 죽은 토큰은 꾸준히 정리해야 도달률이 유지됩니다. 요청 경로에선 둘 다 못 합니다.

-   **배칭** — multicast로 모아 보내면 HTTP 콜 수가 급감합니다.

큐가 "누구에게, 언제, 어떤 payload로 보낼지 결정하고 실패를 처리하는 오케스트레이터"가 되고, FCM/APNs는 최종 배달망 역할만 하게 됩니다.

## 5\. 교훈

-   **빈 `catch`는 "에러 없음"이 아니라 "신호 없음"이다.** 외부 I/O를 조용히 삼키면, 정작 그게 아플 때 가장 필요한 신호가 사라집니다.

-   **floating promise는 공짜 async가 아니다.** 응답이 끝나도 같은 프로세스·같은 풀에서 살아남아 자원을 먹습니다. "await 안 했으니 요청과 무관하다"는 착각입니다.

-   **결국 2편과 같은 뿌리였습니다.** 메시지 전송 핸들러가 데이터 정합성(데드락)도, 외부 I/O(푸시)도 혼자 떠안고 있었습니다. 2편이 DB 책임을 트랜잭션으로 정리한 이야기라면, 3편은 **외부 I/O 책임을 워커로 덜어낸 이야기**입니다. 핸들러가 자기 일(응답)만 하도록 경계를 다시 긋는 것 — 두 편을 관통하는 한 문장입니다.
