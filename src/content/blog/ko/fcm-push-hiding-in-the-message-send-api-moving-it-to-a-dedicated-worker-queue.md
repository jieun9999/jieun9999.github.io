---
title: '[메신저 부하 테스트 3편] 요청 경로의 FCM은 큐로, 삼키던 실패는 Sentry로 — 메시지 전송 핸들러 정리기'
description: '메신저 부하 테스트 실전기 3편: 메시지 전송 핸들러에 섞여 있던 FCM 푸시를 전용 워커 큐로 분리하고, 빈 catch에 삼켜지던 실패를 Sentry로 관측 가능하게 만든 이야기. 외부 I/O 격리와 에러 로그 처리, 두 축을 함께 다룹니다.'
pubDate: 2026-05-17
tags: ['fcm', 'bullmq', 'sentry', 'observability', 'node-js', 'concurrency', 'architecture']
category: reliability
cover: /covers/fcm-push-hiding-in-the-message-send-api-moving-it-to-a-dedicated-worker-queue.webp
coverAlt: '메시지 전송 API의 FCM 푸시를 큐로 분리하고, 삼키던 실패는 Sentry로 관측한 이야기'
coverCaption: '위 이미지는 Sentry 기반 모니터링 대시보드의 일부입니다.'
series: messenger-load-test
seriesOrder: 3
seriesTitle: '메신저 부하 테스트 실전기'
---

## TL;DR

1편에서 부하 테스트 환경을 세우고, 2편에서 메시지 전송 핸들러의 PostgreSQL 데드락을 잡았습니다. 3편은 **그 데드락을 진단하다 같은 핸들러에서 발견한 두 번째 문제**를 다룹니다. 문제도 해결도 두 축입니다.

1.  **FCM이 요청 경로에 섞여 있었다 → 전용 워커 큐로 분리.** 푸시가 **floating promise로 응답 경로 안에서 직접 실행**되며 메시지 저장과 **같은 Prisma 풀**을 공유하고 있었습니다. FCM 호출을 **BullMQ 워커 큐로 빼내** 요청 경로에서 완전히 걷어냈습니다. (외부 I/O 격리)

2.  **실패가 빈 `.catch(() => {})`에 삼켜지고 있었다 → Sentry로 관측.** FCM·실시간 알림 실패가 여러 곳에서 **완전히 은폐**돼 운영 신호가 0이었습니다. 빈 catch를 걷어내고 **구조화 로그 + Sentry**로 바꿔, 실패가 태그·컨텍스트와 함께 검색·알림되도록 했습니다. (에러 로그 처리)

> 범위 노트: 2편의 부하 테스트에서 실제로 서비스를 무너뜨린 건 이 풀 경합이 아니라 DB 데드락이었고, 그 시점엔 커넥션 풀이 포화되지도 않았습니다. FCM 풀 경합은 "지금 터진 불"이 아니라 **fan-out이 커지고 동시 접속이 늘면 반드시 물게 되는 시한폭탄**에 가까웠습니다 — 데드락을 고치는 김에, 이 구조와 은폐된 실패를 함께 걷어낸 이야기입니다.

* * *

## 1\. 발견 — send API 안에 숨어 있던 두 가지

메시지 전송 핸들러(`POST /messages`, `POST /dm/:userId/messages`)를 한 줄씩 정리하니 문제는 두 축이었습니다.

**(1) FCM 푸시 호출이 request path 안에서 섞인다.**

메시지 저장용 DB 작업과 푸시 알림용 DB 작업이 **같은 API 서버 프로세스의 같은 Prisma 커넥션 풀**을 공유하고 있었습니다. 푸시 한 번을 보내려면 내부적으로 이만큼을 합니다.

```plaintext
sendPushToUser 내부
 ├─ pushDevice 조회        (Postgres)
 ├─ presence 조회          (Redis)
 ├─ userPreference 조회    (Postgres)
 ├─ FCM HTTP 전송          (Firebase Admin)
 └─ invalid token 정리     (Postgres)
```

즉 응답 경로 안에서 푸시 작업이 DB·Redis 자원을 같이 먹습니다. 푸시가 몰리면 새 메시지 저장 쿼리가 Prisma 내부 대기열에서 밀릴 수 있는 구조였습니다.

**(2) FCM 실패가 빈 `catch`로 완전히 은폐된다.**

푸시 호출이 답글·멘션·채널 알림 곳곳에 이런 모양으로 흩어져 있었습니다.

```plaintext
sendPushToUser(userId, payload).catch(() => {});
sendPushToUsers(mentionTargets, payload).catch(() => {});
```

FCM은 Firebase Admin을 통해 나가는 **외부 HTTP I/O**입니다. drop·timeout·throttle·부분 실패가 일상적으로 일어나는데, `.catch(() => {})`는 그 rejection을 통째로 삼킵니다. 운영자에게 도달하는 신호는 **0**. 사용자는 "푸시가 안 와요"라고 문의하는데 대시보드는 초록불인, 관측성의 가장 나쁜 형태였습니다.

## 2\. 근본 원인 — 핸들러가 책임을 너무 많이 졌다

`sendPushToUser(...).catch(() => {})`는 `await`도 안 하고 호출자에게 `return`도 안 합니다. 이렇게 추적되지 않는 비동기 작업을 **floating promise**라고 부릅니다. HTTP 201을 내려보낸 **뒤에도** 이 작업은 같은 Node 프로세스 안에서 계속 돌며 풀과 Redis를 붙잡습니다. 성공·실패도 모르고, 로그도 재시도도 없습니다.

핵심 원칙 하나로 요약됩니다.

> **API는 응답 속도(TPS)를 책임지고, Worker는 외부 I/O를 책임진다.**

FCM이 요청 경로 안에 있으면 이 경계가 무너집니다. Firebase가 100ms만 느려져도 그 지연이 **메시지 전송 TPS로 그대로 전이**됩니다. 메시지 저장이라는 핵심 경로가, 푸시라는 부가 기능의 인질이 되는 셈입니다. 그리고 그 푸시가 실패해도 **빈 catch 때문에 아무도 모릅니다.**

```plaintext
[ Before — 응답 경로가 외부 I/O까지 떠안고, 실패는 삼켜짐 ]

POST /messages
  ├─ message 저장 (DB)
  ├─ unreadCount / replyCount (DB)
  ├─ 실시간 publish
  ├─ sendPushToUser(...).catch(()=>{})   ← FCM 직접 실행 💥 + 실패 은폐
  │     └─ pushDevice / presence / preference / FCM / token 정리
  └─ HTTP 201
        ↑ 응답 뒤에도 floating promise가 같은 풀을 붙잡고 있음

[ After — 응답 경로는 응답만, 외부 I/O는 워커로, 실패는 Sentry로 ]

POST /messages
  ├─ message 저장 (DB)
  ├─ unreadCount / replyCount (DB)
  ├─ 실시간 publish
  ├─ pushQueue.add("send-push", {...})    ← "큐에 넣었다"까지만 보장
  └─ HTTP 201

Push Worker (별도 프로세스)
  └─ pushDevice / presence / preference 조회
     → FCM 배치 전송 → 실패 재시도 → invalid token 정리
     → 실패는 Sentry로 (태그·컨텍스트 + 알림/이슈 자동화)
```

해결도 두 축입니다 — **① 큐로 자원을 격리하고, ② 실패를 신호로 남긴다.**

## 3\. 해결 ① — FCM을 전용 워커 큐로 분리하다

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

이렇게 하면 Firebase 장애·지연이 워커 안에 갇히고, 메시지 전송 TPS로 전이되지 않습니다. 큐가 "누구에게, 언제, 어떤 payload로 보낼지 결정하고 실패를 처리하는 오케스트레이터"가 되고, FCM/APNs는 최종 배달망 역할만 하게 됩니다.

## 4\. 해결 ② — 빈 catch를 걷어내고 Sentry로 관측하다

큐로 옮기는 것만으로는 부족합니다. 워커 안에서 FCM이 실패했을 때 **그 실패가 어딘가에 신호로 남아야** 비로소 문제가 해결됩니다. 그래서 같은 작업에서 빈 catch를 전부 걷어내고, 실패를 **구조화 로그 + Sentry**로 흘려보냈습니다.

**Sentry가 뭘 하냐면** — 예외를 스택트레이스뿐 아니라 **태그·컨텍스트와 함께** 수집해서, 같은 에러를 하나의 "Issue"로 묶고, 임계치를 넘으면 **Telegram/GitHub Issue로 알림·자동화**합니다. 즉 `.catch(() => {})`로 사라지던 실패가, `Sentry.captureException(error)` + 태그로 **검색되고 알림 오는 사건**이 됩니다. (이 글 커버가 바로 그 태그/컨텍스트 설정 화면입니다.)

바꾼 내용은 이렇습니다.

-   채널/DM 메시지 알림의 빈 `catch`를 관측 헬퍼로 교체 — 더 이상 `.catch(() => {})`로 삼키지 않습니다.

-   rejected promise와 푸시 `success = false`는 `secureLogger.error`로 기록.

-   FCM 응답의 부분 실패(`failureCount > 0`)는 `secureLogger.warn`으로 기록 — 일부 토큰만 실패하는 흔한 케이스도 관측됩니다.

-   Firebase Admin 미설정은 production에서 푸시 실패로 반환 — 설정 누락이 조용히 무발송으로 넘어가지 않습니다.

실패에 **어느 프로젝트·앱·화면·라우트에서 일어났는지** 태그를 붙여두면, "특정 화면의 푸시만 실패한다" 같은 문제도 Sentry에서 바로 좁혀집니다.

```plaintext
try {
  await runImportantAction();
} catch (error) {
  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.setTag('screen_name', screenName);
    scope.setTag('route', route);
    scope.setContext('request', { method, endpoint, http_status, duration_ms });
    Sentry.captureException(error);
  });
}
```

큐로 옮긴 뒤, 응답 경로에 남는 유일한 실패 지점은 **enqueue 그 자체**뿐입니다. 이것도 삼키지 않고 신호로 남깁니다.

```plaintext
enqueuePush(...).catch((err) => {
  secureLogger.error("push enqueue failed", err, { operation: "push.enqueue", messageId, event });
  metrics.increment("push_enqueue_failed");
});
```

`.catch(() => {})`가 "에러 없음"을 가장하던 자리가, 이제 "무엇이 어떻게 실패했는지"가 남는 자리로 바뀌었습니다.

## 5\. 왜 이렇게 하는가 — 실서비스 관점

푸시를 요청 경로 밖 큐로 빼고, 실패를 관측 가능하게 만드는 건 취향이 아니라 메시징 서비스에서 사실상 표준입니다. 이유는 그대로 이 문제의 근거와 같습니다.

-   **외부 I/O 격리** — FCM/APNs는 지연·부분장애가 잦은 외부망입니다. 이게 메시지 전송 TPS에 전이되면 안 됩니다.

-   **fan-out 증폭** — 메시지 1건이 수신자 N명으로, 다시 푸시 N콜로 불어납니다. 큰 채널일수록 요청 안에서 감당할 수 없습니다.

-   **재시도·토큰 위생** — FCM은 실패 시 지수 백오프가 권장되고, 죽은 토큰은 꾸준히 정리해야 도달률이 유지됩니다. 요청 경로에선 둘 다 못 합니다.

-   **실패의 가시성** — 푸시는 리텐션의 핵심 채널입니다. Firebase가 부분 장애를 내면 사용자는 알림을 놓치는데, 그게 **신호 없이** 며칠 이어지면 그게 진짜 사고입니다. 실패는 반드시 관측돼야 합니다.

## 6\. 교훈

-   **빈 `catch`는 "에러 없음"이 아니라 "신호 없음"이다.** 외부 I/O를 조용히 삼키면, 정작 그게 아플 때 가장 필요한 신호가 사라집니다. 큐로 옮기는 것과 실패를 Sentry로 남기는 것은 **한 세트**입니다.

-   **floating promise는 공짜 async가 아니다.** 응답이 끝나도 같은 프로세스·같은 풀에서 살아남아 자원을 먹습니다. "await 안 했으니 요청과 무관하다"는 착각입니다.

-   **결국 2편과 같은 뿌리였습니다.** 메시지 전송 핸들러가 데이터 정합성(데드락)도, 외부 I/O(푸시)도, 실패 관측까지도 혼자 떠안고 있었습니다. 2편이 DB 책임을 트랜잭션으로 정리한 이야기라면, 3편은 **외부 I/O를 워커로 덜어내고, 그 실패를 관측 가능하게 되돌린 이야기**입니다. 핸들러가 자기 일(응답)만 하도록 경계를 다시 긋는 것 — 두 편을 관통하는 한 문장입니다.
