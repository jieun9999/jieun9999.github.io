# 커스텀 도메인 색인 PoC 집필 근거

- 게시물: [커스텀 도메인을 필수로 권장하게 된 이유](../../src/content/blog/ko/from-shared-subdomains-to-custom-domains-for-search-indexing.md)
- 발행일: 사용자 요청의 8월 20일을 이슈 연도와 맞춰 `2026-08-20`으로 설정했습니다.
- 자료 확인일: 2026-09-24입니다. 본문의 실험 경과는 2026-08-19까지를 사용했습니다.
- 조회 범위: `3w-labs/m-wdot-platform`의 closed issue/PR 중 작성자 `Jieun9999`입니다. 본문뿐 아니라 후속 댓글도 확인했습니다.
- 편집 참고: [증거를 따라 원인을 좁히기](references/03-slow-query.md)입니다.

## 주요 기록과 채택 범위

| 출처 | 사용한 사실 | 해석의 제한 |
| --- | --- | --- |
| [#231](https://github.com/3w-labs/m-wdot-platform/issues/231) | 7/21 서브도메인 62/1,784, babynote 61/90 색인, babynote 첫 글 7/13 | 서브도메인 전체 전수조사 완료가 아닙니다. 같은 콘텐츠의 무작위 배정 실험도 아닙니다. 원문 상태 표의 일부 항목 합계는 분모와 맞지 않아 전체 상태 분포를 재현하지 않았습니다. |
| [#269](https://github.com/3w-labs/m-wdot-platform/issues/269) | 커스텀 도메인 6/6에서 24시간 내 색인 관찰 | 글 전체의 100% 색인을 뜻하지 않습니다. 서브폴더 A/B는 제안이며 완료한 실험으로 서술하지 않았습니다. |
| [#273](https://github.com/3w-labs/m-wdot-platform/issues/273), [PR #276](https://github.com/3w-labs/m-wdot-platform/pull/276) | workb.xyz → witim.blog 이전, 병행 서빙, 빌드 시점 절대 URL | 기본 도메인 변경과 사용자별 커스텀 도메인 전환을 구분했습니다. |
| [PR #339](https://github.com/3w-labs/m-wdot-platform/pull/339) | 랜딩 canonical 누락 및 옛 대표 URL 선택 수정 | 8월의 블로그 서브도메인 색인 제외와 별도 문제입니다. |
| [#479](https://github.com/3w-labs/m-wdot-platform/issues/479) | 8/7 루트 URL: 커스텀 17/19, 서브도메인 표본 0/15. 수동 조치·보안 문제 없음 | 글 색인율이 아닙니다. 원문에는 전체 취소·8/2 이후 노출 0이라는 요약과 8/4 노출 6이라는 표가 공존하므로, 전 기간 노출 0으로 서술하지 않았습니다. 알고리즘 원인·평가 단위를 확정하지 않았습니다. |
| [#528](https://github.com/3w-labs/m-wdot-platform/issues/528) | .shop 두 사이트 크롤링 부진, btc 76 URL 중 10건 색인, 수동 요청 9건 실험 | .shop의 전체 색인이 0이거나 Google의 수동 제재가 있었다고 서술하지 않았습니다. |
| [PR #670](https://github.com/3w-labs/m-wdot-platform/pull/670) | 커스텀→커스텀 301 지원, .shop 자동 추천 제외, 수동 검색 유지 | 서비스 내부 추천 정책이며 Google의 TLD 등급이 아닙니다. |
| [#681](https://github.com/3w-labs/m-wdot-platform/issues/681) | 8/18 coinmanual.blog·powerinsight.blog 이전, 본문 유지, canonical·301·캐시·GSC 처리, 8/19 색인 확인 댓글 | 제목에 남은 D+21 대기보다 마지막 댓글을 반영했습니다. 댓글은 정상 색인 확인이며 전량 색인율·장기 유지 수치는 없습니다. TLD와 이름을 동시에 변경했습니다. |

## 작성자의 운영 경험

사용자는 `.shop`에서 같은 콘텐츠를 `.blog`로 옮긴 후 색인이 정상화됐다는 경험과, 신생 도메인도 콘텐츠 품질이 좋으면 상단 노출이 가능하다는 내용을 요청했습니다. 전자는 #681의 마지막 댓글과 일치합니다. 후자는 작성자가 제공한 운영 경험으로 담되, URL 검사 수치가 검색 순위를 증명한다고 서술하지 않았습니다. 특정 검색어·순위·유지 기간은 확인하지 못해 숫자를 넣지 않았습니다.

#681의 8/19 댓글에는 화면 첨부 3개가 있습니다. 이 세션에서는 이미지 다운로드가 실패해 이미지를 직접 판독하지 않았으며, 화면의 수치나 검색어를 추정하지 않았습니다. 9/18 검색 화면이 있는 기존 회고는 8/20 시점의 성과 증거로 옮겨 쓰지 않았습니다.

## 공식 자료

- [Google Search 작동 과정](https://developers.google.com/search/docs/fundamentals/how-search-works): 크롤링·색인·검색결과 제공을 구분합니다.
- [검색 순위 FAQ](https://developers.google.com/search/help/site-position-in-search-faq): TLD 자체의 검색 성능 우위를 일반화하지 않습니다.
- [사이트 이전 가이드](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes): 리디렉션, 새 canonical, 사이트맵 등 이전 신호를 설명합니다.

## 편집 판단

핵심 질문은 검색 운영 사용자에게 기본 주소만으로 충분한지입니다. 글 단위 비교 → 기본 도메인 이전 후 재발 → .shop 예외 진단·회복 → 제품 정책 → 신생 도메인과 콘텐츠의 역할 순서로 구성했습니다. 이슈의 강한 인과 표현은 관찰 수준으로 낮추고, 구글 내부 판단을 알아냈다는 주장이나 도메인 교체가 품질 문제를 없앤다는 주장은 채택하지 않았습니다.
