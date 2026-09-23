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
    tagline: 'Deserve what you want.',
    updatedOn: 'Updated',
    tableOfContents: 'On this page',
    noTranslation: 'This post is not available in English yet.',
    minRead: 'min read',
    backToTop: 'Back to top',
    seriesLabel: 'Series',
    comments: 'Comments',
    // 내비게이션·섹션 라벨
    home: 'Home',
    articles: 'Articles',
    tags: 'Tags',
    about: 'About',
    all: 'All',
    allArticles: 'All Articles',
    loadMore: 'Load More',
    nextArticle: 'Next Article',
    previousArticle: 'Previous Article',
    newerArticle: 'Newer Article',
    pages: 'Pages',
    // 검색
    search: 'Search',
    searchPlaceholder: 'Search posts…',
    noResults: 'No matching posts.',
    // 버튼 라벨 (스크린리더)
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    toggleTheme: 'Toggle dark mode',
    switchLang: '한국어로 보기',
    notFound: 'This page could not be found.',
    locale: 'en-US',
  },
  ko: {
    siteTitle: 'Jieun',
    tagline: 'Deserve what you want.',
    updatedOn: '수정',
    tableOfContents: '목차',
    noTranslation: '이 글은 아직 한국어 번역이 없습니다.',
    minRead: '분 분량',
    backToTop: '맨 위로',
    seriesLabel: '시리즈',
    comments: '댓글',
    home: '홈',
    articles: '글',
    tags: '태그',
    about: '소개',
    all: '전체',
    allArticles: '전체 글',
    loadMore: '더 보기',
    nextArticle: '다음 글',
    previousArticle: '이전 글',
    newerArticle: '최신 글',
    pages: '페이지',
    search: '검색',
    searchPlaceholder: '글 검색…',
    noResults: '맞는 글이 없어요.',
    openMenu: '메뉴 열기',
    closeMenu: '메뉴 닫기',
    toggleTheme: '다크 모드 전환',
    switchLang: 'View in English',
    notFound: '페이지를 찾을 수 없습니다.',
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

// 일러스트 아바타. 실사 사진은 /avatar.jpg 로 남겨둠 (되돌리려면 이 값만 바꾸면 됨)
export const avatarSrc = '/avatar-illustration.jpg';
// 같은 그림의 고해상도판 — 소개 카드처럼 크게 보일 때 쓴다. 원본(336px)을 Real-ESRGAN
// anime 모델로 4배 키운 뒤 1024px 로 줄였다. avatarSrc 를 바꾸면 이것도 같이 바꾼다.
export const avatarLargeSrc = '/avatar-illustration-1024.jpg';

// 카테고리 (영어 고정 — 한/영 공통). id 는 content.config.ts 의 category enum 과 같다.
export const categories = [
  { id: 'systems', label: 'Systems' },
  { id: 'scaling', label: 'Scaling' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'devops', label: 'DevOps' },
] as const;

export function categoryLabel(id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}
