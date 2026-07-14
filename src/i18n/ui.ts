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
    siteTitle: 'Jieun',
    tagline: 'deserve what you want',
    posts: 'Posts',
    readMore: 'Read more',
    backToList: '← All posts',
    updatedOn: 'Updated',
    publishedOn: 'Published',
    tableOfContents: 'On this page',
    noTranslation: 'This post is not available in English yet.',
    minRead: 'min read',
    prevPost: 'Previous',
    nextPost: 'Next',
    backToTop: 'Back to top',
    seriesLabel: 'Series',
    tags: 'TAGS',
    showMore: 'Show more',
    showLess: 'Show less',
    locale: 'en-US',
  },
  ko: {
    siteTitle: 'Jieun',
    tagline: 'deserve what you want',
    posts: '글 목록',
    readMore: '자세히 보기',
    backToList: '← 전체 글',
    updatedOn: '수정',
    publishedOn: '작성',
    tableOfContents: '목차',
    noTranslation: '이 글은 아직 한국어 번역이 없습니다.',
    minRead: '분 분량',
    prevPost: '이전 글',
    nextPost: '다음 글',
    backToTop: '맨 위로',
    seriesLabel: '시리즈',
    tags: 'TAGS',
    showMore: '더보기',
    showLess: '접기',
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

// 글 개수 표기 — 언어별 어순/단수복수 다르게
export function postCount(lang: Lang, n: number): string {
  return lang === 'ko' ? `글 ${n}개` : `${n} ${n === 1 ? 'post' : 'posts'}`;
}

// 프로필 소셜 링크
export const social = {
  github: 'https://github.com/jieun9999',
  linkedin: 'https://www.linkedin.com/in/kindjieunjeong/',
  email: 'kindjjee@gmail.com',
};

export const avatarSrc = '/avatar.jpg';

// 카테고리 (영어 고정 — 한/영 공통). all은 항상 왼쪽 기본값.
export const categories = [
  { id: 'all', label: 'All' },
  { id: 'systems', label: 'Systems' },
  { id: 'scaling', label: 'Scaling' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'cost', label: 'Cost' },
] as const;

export function categoryLabel(id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}
