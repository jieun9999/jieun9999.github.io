# 검색 개선 글 영문판 이미지

2026-10-18. 한국어 커버 v3와 본문 출처 흐름 도식 v2를 참조해 영어판을 생성했습니다. 커버의 예시는 한국어 실험을 번역한 것이며 새로운 영어 실험이 아닙니다. 한국어 검색어 원문은 영문 본문에 뜻과 함께 유지했습니다.

출력: public/covers/wiblog-search-intent-en-v1.png, public/images/search-intent/source-acquisition-flow-en-v1.png

## 커버 프롬프트

Create the English version of this exact technical blog cover. Preserve navy/slate/blue layout, small typography, generous spacing and jieun.dev. Translate ALL Korean labels. Exact text: headline 'Search for the question'; eyebrow 'SEARCH INTENT / GROK'; topic label 'Topic title'; example title 'How much does a rain tent cost for an outdoor wedding?'; left card 'Before', 'Extract words from the start', 'Seed keyword', 'Outdoor wedding rain planning', 'Extra word', 'comes'; right card 'After', 'Generate a question-focused phrase', 'Seed keyword', 'Outdoor wedding rain planning', 'Search phrase', 'tent cost'. Footer 'Same title · Different query' and small 'Translated Korean example'. Use modest font sizes so longer English fits without crowding. The word comes is a literal translation of the extracted Korean fragment, not a new English test. All labels must be English. No added numbers or claims.

## 본문 도식 프롬프트

Translate this exact flowchart into English, preserving all boxes, arrows, flat light background, teal/slate color roles and layout. Crisp clean sans-serif text, modest size, no overlaps. Exact labels: title 'From search results to article sources'; top 'General search', subtitle 'Seed keyword + extra words = saved query'; left 'General documents', 'Pass filters · Up to 3'; right 'Platform candidates', 'Naver Blog · YouTube · Namuwiki'; next 'Check shared candidate pool', 'Current results first · Up to 3 per platform'; diamond 'Any unassigned document?'; yes 'Yes'; no 'No'; side box 'Supplement missing platforms', 'Seed anchor · site: / intitle:', 'Reuse completed searches'; allocation box 'Assign documents to the topic', 'Unassigned only · Up to 1 per platform'; small side note 'No document: leave slot empty'; wide lower box 'Combine selected documents · Deduplicate'; next 'Fetch full text', 'Retrieve available document content'; final 'Create and validate the outline', 'Keep search snippets when fetching fails or is skipped'; footer 'Document assigned ≠ Full text retrieved · Search depth stays 10'. All visible explanatory text must be English. No new paths or changed arrows. Make text fit inside boxes.

