// 지원 언어 정의 --------------------------------------------------------------
export const languages = {
  en: 'English',
  ko: '한국어',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'en';

// 화면에 쓰이는 UI 문자열(글 내용이 아니라 버튼/제목 등) -------------------------
export const ui = {
  en: {
    siteTitle: "jieun9999's Dev Blog",
    tagline: 'Notes on software engineering — in English & Korean.',
    posts: 'Posts',
    readMore: 'Read more',
    backToList: '← All posts',
    updatedOn: 'Updated',
    publishedOn: 'Published',
    tableOfContents: 'On this page',
    noTranslation: 'This post is not available in English yet.',
    minRead: 'min read',
    locale: 'en-US',
  },
  ko: {
    siteTitle: 'jieun9999 개발 블로그',
    tagline: '소프트웨어 엔지니어링 기록 — 한국어와 영어로.',
    posts: '글 목록',
    readMore: '자세히 보기',
    backToList: '← 전체 글',
    updatedOn: '수정',
    publishedOn: '작성',
    tableOfContents: '목차',
    noTranslation: '이 글은 아직 한국어 번역이 없습니다.',
    minRead: '분 분량',
    locale: 'ko-KR',
  },
} as const;

export function t(lang: Lang) {
  return ui[lang];
}

// 콘텐츠 파일 경로(id)에서 언어/번역키 추출 -----------------------------------
//   예) "en/hello-astro"  ->  lang: "en", key: "hello-astro"
//   같은 key + 다른 lang 폴더 = 서로 번역 짝(toggle 대상)
export function langFromId(id: string): Lang {
  return id.split('/')[0] as Lang;
}

export function keyFromId(id: string): string {
  return id.split('/').slice(1).join('/');
}

export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'ko' : 'en';
}

export function formatDate(date: Date, lang: Lang): string {
  return date.toLocaleDateString(ui[lang].locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 읽는 시간(분) 대략 계산 — 원문 마크다운 기준.
//   한글: 분당 ~500자 / 영어: 분당 ~200단어. CJK 글자 수와 라틴 단어 수를 각각 세서 합산.
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 코드블록 제거
    .replace(/[#>*_`~\-\[\]()!]/g, ' '); // 마크다운 기호 제거
  const cjkChars = (text.match(/[ㄱ-힝一-鿿]/g) || []).length;
  const latinWords = (text.replace(/[ㄱ-힝一-鿿]/g, ' ').match(/\b\w+\b/g) || []).length;
  const minutes = cjkChars / 500 + latinWords / 200;
  return Math.max(1, Math.round(minutes));
}
