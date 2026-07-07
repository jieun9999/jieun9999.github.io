// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';

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
    // 코드블록 업그레이드: 파일명 프레임, 복사 버튼, 줄번호(옵션), 하이라이트, diff
    // (astro-expressive-code 는 markdown 이전에 등록되어야 하므로 sitemap 앞에 둠)
    expressiveCode({
      themes: ['github-light', 'github-dark'],
      // html.dark 클래스로 다크 전환 (미디어쿼리 대신)
      useDarkModeMediaQuery: false,
      themeCssSelector: (theme) => (theme.name === 'github-dark' ? '.dark' : false),
      plugins: [pluginLineNumbers()],
      defaultProps: {
        // 줄번호는 기본 끔 → 원하는 블록에만 showLineNumbers 로 켬
        showLineNumbers: false,
        wrap: true,
      },
      styleOverrides: {
        borderRadius: '10px',
        borderColor: 'var(--border)',
        codeFontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace",
        codeFontSize: '0.85rem',
        uiFontFamily: 'inherit',
      },
    }),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', ko: 'ko' },
      },
    }),
  ],
});
