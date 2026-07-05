// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 배포될 사이트 주소 (User site 이므로 루트)
const SITE = 'https://jieun9999.github.io';

export default defineConfig({
  site: SITE,

  // 다국어(i18n) 설정 — 영어/한국어 둘 다 URL에 접두어를 붙임 (/en/, /ko/)
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ko'],
    routing: {
      prefixDefaultLocale: true, // 기본 언어도 /en/ 으로 (좌우대칭 → 토글이 단순해짐)
    },
  },

  // 최상단 '/' 방문 시 기본 언어로 보냄
  redirects: {
    '/': '/en/',
  },

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', ko: 'ko' },
      },
    }),
  ],

  markdown: {
    // 코드블록 문법 강조 — 라이트/다크 두 테마를 동시에 구워두고 CSS로 전환
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
