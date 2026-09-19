// 첫 화면 모션(GSAP) 공용 약속 — design/foundations.md "움직임".
//
// GSAP 은 페이지를 그린 뒤에 뜬다. 그 사이 첫 화면이 보였다 사라지는 번쩍임을 막으려고
// BaseHead 의 인라인 스크립트가 먼저 html.gsap-enter 를 붙이고, 컴포넌트 CSS 가 그걸 보고 첫 화면을 숨긴다.
// 페이지 스크립트는 enterTimeline() 으로 클래스를 떼고 같은 틱에 from 상태를 입힌다 — 그래서 사이에 비치지 않는다.
// 한 페이지에서 첫 화면을 맡는 곳은 하나다(히어로 · 소개 카드 · 글 머리말).
import { gsap } from 'gsap';

export { gsap };

// 히어로마다 이름 · 사진 · 링크 아이콘이 있기도 없기도 하다 — 없는 대상은 경고 없이 건너뛴다
gsap.config({ nullTargetWarn: false });

/** 아래에서 떠오른다. 끝나면 인라인 opacity·transform 을 지워, 남은 transform 이 고정 위치 요소의 기준을 바꾸지 않게 한다. */
export const ENTER_DEFAULTS = { duration: 0.8, ease: 'power3.out', clearProps: 'opacity,transform' };

/** 사진·구슬이 튀어오를 때 */
export const POP = { opacity: 0, scale: 0.85, duration: 0.9, ease: 'back.out(1.6)' };

/** 떠다니는 점이 천천히 번질 때 */
export const DOTS = { opacity: 0, duration: 1.6, ease: 'power1.out' };

/**
 * 숨겨 둔 첫 화면을 넘겨받아 타임라인을 돌려준다. 받은 쪽은 **같은 틱 안에서** from 을 걸어야 한다.
 * 모션을 줄인 사용자이거나, 대비책(2.5초)이 이미 보여줬으면 null — 아무것도 하지 않는다.
 */
export function enterTimeline(): gsap.core.Timeline | null {
  const de = document.documentElement;
  if (!de.classList.contains('gsap-enter')) return null;
  de.classList.remove('gsap-enter');
  return gsap.timeline({ defaults: ENTER_DEFAULTS });
}
