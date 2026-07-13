// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { remarkAlert } from 'remark-github-blockquote-alert';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

// 배포될 사이트 주소 (커스텀 도메인, 루트)
const SITE = 'https://jieun.dev';

// 본문 이미지 처리: 단독 이미지 문단을 <figure>+<figcaption>(alt)로 감싸고,
// 모든 이미지에 lazy 로딩 부여. (unist 의존성 없이 트리 직접 순회)
function rehypeImages() {
  const walk = (node) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      walk(child);
      if (child.type === 'element' && child.tagName === 'img') {
        child.properties = { ...child.properties, loading: 'lazy', decoding: 'async' };
      }
      if (child.type === 'element' && child.tagName === 'p') {
        const kids = child.children.filter(
          (c) => !(c.type === 'text' && !c.value.trim())
        );
        if (kids.length === 1 && kids[0].type === 'element' && kids[0].tagName === 'img') {
          const img = kids[0];
          img.properties = { ...img.properties, loading: 'lazy', decoding: 'async' };
          const alt = img.properties?.alt;
          const fig = {
            type: 'element',
            tagName: 'figure',
            properties: { className: ['post-figure'] },
            children: [img],
          };
          if (alt && String(alt).trim()) {
            fig.children.push({
              type: 'element',
              tagName: 'figcaption',
              properties: {},
              children: [{ type: 'text', value: String(alt) }],
            });
          }
          return fig;
        }
      }
      return child;
    });
  };
  return (tree) => walk(tree);
}

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

  markdown: {
    remarkPlugins: [
      // GitHub 스타일 콜아웃: > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
      remarkAlert,
    ],
    rehypePlugins: [
      // Astro 기본 id 주입보다 먼저 slug(id) 부여 → autolink 가 앵커를 붙일 수 있게
      rehypeSlug,
      // 헤딩에 마우스 올리면 나타나는 앵커(#) 링크
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['heading-anchor'], ariaHidden: 'true', tabIndex: -1 },
          // 빈 내용 — 눈에 보이는 '#'는 CSS(::before)로 렌더 → 목차 텍스트 오염 방지
          content: [],
        },
      ],
      // 단독 이미지 → figure+figcaption, lazy 로딩
      rehypeImages,
    ],
  },
});
