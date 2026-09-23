---
title: "인앱 브라우저에서 간편로그인 버튼이 사라진다 — 로그인이 어려우면 사용자는 그냥 나갑니다"
description: "스레드 인앱 브라우저로 들어오면 '카카오톡으로 로그인' 버튼이 사라지고 아이디·비밀번호 폼만 남습니다. 에러 로그에도 안 잡히는 이탈이라, 감지·탈출·폴백 세 단으로 사용자를 진짜 브라우저로 빼냈습니다."
subtitle: "에러 로그에 안 잡히는 이탈을 감지·탈출·폴백으로"
pubDate: 2026-09-08
tags:
  [
    "in-app-browser",
    "oauth",
    "kakao-login",
    "user-agent",
    "webview",
    "frontend",
    "ux",
  ]
category: systems
cover: /covers/escaping-in-app-browsers-so-login-does-not-lose-users.webp
coverAlt: "카카오 로그인 화면 두 장 비교. 왼쪽 Threads 인앱 브라우저에는 아이디·비밀번호 폼만 있고, 오른쪽 Safari 에는 '카카오톡으로 로그인' 버튼이 맨 위에 있다"
coverCaption: "같은 URL, 같은 로그인 페이지입니다. 다른 건 어느 브라우저로 들어왔느냐뿐입니다."
---

## 들어가며

로그인은 제품에서 가장 얇은 관문입니다. 여기서 한 번 막히면 사용자는 이유를 알아보려 하지 않고 그냥 나갑니다.

그런데 이 관문이 **어디서 들어왔느냐에 따라 다르게 생겼습니다.** 스레드에서 링크를 눌러 들어온 사용자에게는 "카카오톡으로 로그인" 버튼이 아예 보이지 않았습니다.

---

## 1\. 버튼 하나가 사라지면 이탈이 됩니다

| 들어온 경로                | 카카오 로그인 화면                        |
| -------------------------- | ----------------------------------------- |
| Safari·Chrome 직접 접속    | "카카오톡으로 로그인" 버튼 + 계정 입력 폼 |
| Threads 인앱 브라우저 링크 | 계정·비밀번호 입력 폼**만** 남는다        |

![카카오 로그인 화면 두 장. 왼쪽은 Threads 인앱 브라우저(상단에 X·뒤로가기·⋯ 버튼과 'Threads' 표시)로 아이디·비밀번호 폼만 보이고, 오른쪽은 Safari 주소창 아래 '카카오톡으로 로그인' 버튼이 맨 위에 있다](/images/kakao-login-in-app-vs-safari.webp)

같은 URL이고, 같은 서버이고, 같은 로그인 페이지입니다. 다른 건 브라우저뿐입니다.

이 차이가 왜 이탈이 되냐면, 오른쪽은 **탭 한 번**이고 왼쪽은 **기억해내는 일**이기 때문입니다. 폼만 남은 화면에서 사용자는 카카오 계정의 이메일과 비밀번호를 떠올려야 합니다. 그런데 소셜 로그인만 써온 사용자는 그 비밀번호를 대개 모릅니다. 몇 년 전에 만들었거나, 애초에 만든 적이 없습니다. 그다음은 비밀번호 찾기, 메일함 열기, 인증번호입니다. 여기까지 따라오는 사용자는 거의 없습니다.

더 나쁜 건 **이 손실이 어디에도 안 남는다**는 점입니다. 서버는 정상이고, 500도 없고, 로그인 실패 로그조차 안 쌓입니다. 시도를 안 하고 나가기 때문입니다. 개발자는 크롬에서 테스트하니 영영 못 봅니다.

---

## 2\. 원인은 이쪽 요청이 아니라 상대 페이지의 판단입니다

버튼을 숨긴 건 카카오 로그인 페이지(`accounts.kakao.com`) 자신입니다. `/oauth/authorize` 에 무슨 파라미터를 붙여도 이 판단은 바뀌지 않습니다. 상대 페이지가 지금 브라우저 환경을 보고 스스로 정하는 것이라서요.

판단 근거는 User-Agent와 웹뷰 특성입니다.

- 인앱 웹뷰는 `kakaotalk://` 같은 커스텀 스킴이나 유니버설 링크로의 앱 전환을 자기 네비게이션 정책으로 가로막는 경우가 많습니다.
- 인앱 웹뷰의 User-Agent 는 진짜 Safari·Chrome 과 다릅니다. 자기 앱 이름을 넣거나, 표준 브라우저에 있어야 할 토큰이 빠집니다.
- 그래서 "이 환경에서는 앱 전환이 실패할 가능성이 높다"고 보면, 실패할 버튼을 아예 그리지 않고 계정 입력 폼으로 조용히 물러납니다.

카카오 입장에서는 합리적인 폴백입니다. 문제는 그 폴백의 비용이 **제가 담당하던 서비스의 전환율로 청구된다**는 것뿐입니다.

### 스레드만의 문제가 아닙니다

메타 계열(Threads·Instagram·Facebook)뿐 아니라 라인, 네이버 앱, 위챗, 틱톡, 그리고 카카오톡 자기 자신도 전부 자체 인앱 브라우저를 씁니다. 공통점이 셋입니다.

- 시스템 브라우저와 쿠키·로그인 세션을 공유하지 않습니다.
- 커스텀 스킴·유니버설 링크로의 외부 앱 전환을 막습니다.
- 자동완성·패스워드 매니저 연동이 끊깁니다.

셋 다 "쉬운 로그인"을 정확히 겨냥해 망가뜨립니다. 이미 로그인돼 있어야 할 사용자가 로그아웃 상태로 시작하고, 저장해둔 비밀번호는 안 뜨고, 앱 전환 버튼은 사라집니다.

**구글은 조용히 물러나지도 않습니다.** 2016년부터 정책으로 임베디드 웹뷰에서의 OAuth 로그인 자체를 거부합니다. 시도하면 "이 브라우저 또는 앱은 안전하지 않을 수 있습니다"라는 화면을 띄우고 진행을 막습니다. 카카오에서는 로그인이 불편해지는 정도지만, 구글에서는 **아예 못 합니다.**

### 고칠 수 있는 경계선

```plaintext
┌──────────────┐   링크 클릭   ┌────────────────┐   로그인 요청  ┌──────────────┐
│  Threads 앱   │ ───────────▶ │  담당하던 서비스 │ ────────────▶ │ 카카오 로그인 │
│ (인앱 웹뷰)    │              │                │               │ 페이지        │
└──────────────┘              └────────────────┘               └──────────────┘
       ▲                              ▲
       │ 여기는 못 고친다              │ 여기서부터 고칠 수 있다
       │ (Threads 의 웹뷰 정책)        │ (사용자가 도착한 이후)
```

링크를 여는 방식 자체에는 개입할 지점이 없습니다. 대신 사용자가 도착한 뒤, **카카오로 넘기기 전에** 진짜 브라우저로 빼내면 됩니다. 그러면 카카오 페이지는 정상 브라우저를 보고 원래 화면을 그립니다.

대응하지 않은 서비스에서 사용자가 할 수 있는 유일한 방법은 오른쪽 위 `⋯` 메뉴에서 "Safari로 열기"를 직접 누르는 것뿐입니다. 그걸 아는 사용자는 거의 없습니다.

---

## 3\. 처방 — 감지하고, 빠져나가고, 실패에 대비합니다

### 감지 — 앱 이름을 나열하는 방식은 반드시 깨집니다

`Threads`, `Instagram`, `KAKAOTALK`, `NAVER` 를 나열해 맞히는 감지는 그 앱이 UA 한 줄을 바꾸는 순간 무너집니다. 새 인앱 브라우저가 나올 때마다 목록도 새로 깨집니다. 그래서 **일반 규칙을 기본으로 두고**, 이름 목록은 그 앞에 두어 오탐을 줄이는 용도로만 씁니다.

- **iOS**: 진짜 Safari(SFSafariViewController 포함)는 UA 끝에 항상 `Safari` 토큰이 남습니다. 인앱 웹뷰는 자기 앱을 표시하려고 UA를 고치면서 이 토큰을 빠뜨립니다.
- **Android**: 인앱 웹뷰는 대개 UA에 `; wv)` 토큰을 남깁니다.

```ts title="app/_lib/in-app-browser.ts"
const KNOWN_IN_APP_TOKENS =
  /KAKAOTALK|NAVER|Line\/|FBAN|FBAV|FB_IAB|Instagram|Threads/i;

export function isInAppBrowser(ua: string): boolean {
  if (!ua) return false;
  if (KNOWN_IN_APP_TOKENS.test(ua)) return true;
  const iosLacksSafari = /iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua);
  const androidWebView = /Android/i.test(ua) && /;\s*wv\)/i.test(ua);
  return iosLacksSafari || androidWebView;
}
```

### 탈출 — OS가 예약한 스킴을 씁니다

앱이 막는 건 대개 다른 앱의 커스텀 스킴입니다. OS가 직접 처리하는 스킴은 통과율이 더 높습니다.

- **iOS**: `https://` 를 `x-safari-https://` 로 바꾸면 iOS 가 Safari 로 넘깁니다.
- **Android**: `intent://…#Intent;scheme=https;package=com.android.chrome;end` 로 크롬 실행을 시도합니다.

```ts title="app/_lib/in-app-browser.ts"
export function inAppEscapeHref(targetUrl: string, ua: string) {
  if (!/^https:\/\//.test(targetUrl)) return { kind: "none", href: null };
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return {
      kind: "ios",
      href: targetUrl.replace(/^https:\/\//, "x-safari-https://"),
    };
  }
  if (/Android/i.test(ua)) {
    const stripped = targetUrl.replace(/^https:\/\//, "");
    return {
      kind: "android",
      href: `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`,
    };
  }
  return { kind: "none", href: null };
}
```

### 폴백 — 버튼을 두 번 누르게 하지 않습니다

둘 다 비공식 트릭입니다. 앱이 이 스킴까지 막으면 그냥 실패합니다. 그래서 성공 여부를 확인하고, 실패했으면 이어서 원래 링크로 보냅니다.

탈출이 성공하면 이 탭은 백그라운드로 밀립니다. `visibilitychange` 로 그걸 감지해 폴백 타이머를 지웁니다. 화면이 그대로 남아 있으면 실패한 것이니, 1.2초 뒤 원래 로그인 링크로 자동으로 이어 보냅니다.

```tsx title="app/_components/auth/kakao-button.tsx"
const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
  const ua = navigator.userAgent;
  if (!isInAppBrowser(ua)) return; // 정상 브라우저는 그대로 href 를 따라간다

  const absolute = new URL(href, window.location.origin).toString();
  const target = inAppEscapeHref(absolute, ua);
  if (!target.href) return;

  e.preventDefault();
  window.location.href = target.href;

  const fallback = setTimeout(() => {
    if (document.visibilityState === "visible") window.location.href = absolute;
  }, 1200);
  document.addEventListener("visibilitychange", () => clearTimeout(fallback), {
    once: true,
  });
};
```

> [!NOTE]
> 문제가 구글 로그인이라면 이 순서에서 탈출이 선택이 아니라 유일한 해법입니다. 카카오는 폼으로라도 로그인할 길을 남겨두지만, 구글은 웹뷰 안에서 아무 길도 남기지 않습니다.

---

## 4\. 배너를 걷어낸 이유

첫 버전에는 안내 배너를 붙였습니다. 인앱 브라우저를 감지하면 "Safari에서 열기" 버튼과 설명 문구를 띄우는 방식이었습니다. 왜 안 되는지 알려주면 사용자가 알아서 하리라고 봤습니다.

실사용자 반응은 이랬습니다. **사파리인지 크롬인지 관심 없다, 버튼을 누르면 그냥 넘어가면 된다.**

그래서 다음 버전에서 배너를 걷어냈습니다. 대신 로그인 버튼의 클릭 자체를 가로채, 설명 없이 탈출부터 조용히 시도하도록 바꿨습니다. 감지 로직은 그대로 재사용했습니다. 사용자 입장에서는 그냥 "눌렀더니 카카오톡으로 넘어갔다"입니다. 인앱 브라우저라는 단어를 볼 일이 없습니다.

카카오톡 알림톡 안에서 링크를 눌러도 같은 로직이 걸립니다(`KAKAOTALK` 토큰). 스레드뿐 아니라 카카오톡 자기 자신의 인앱 브라우저도 똑같이 처리됩니다.

## 마무리하며

로그인 화면의 버튼 한 개 차이가 그대로 전환율입니다. 그리고 그 손실은 로그에 안 잡히고, 정상 브라우저로 테스트하는 개발자 눈에는 보이지 않습니다. 결국 개선의 방향은 "왜 안 되는지 잘 설명하기"가 아니라 **설명할 일을 없애기**였습니다.
