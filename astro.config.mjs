// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { remarkAlert } from 'remark-github-blockquote-alert';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import fs from 'node:fs';
import matter from 'gray-matter';

// 배포될 사이트 주소 (커스텀 도메인, 루트)
const SITE = 'https://jieun.dev';

// ── 사이트맵 lastmod 용 글별 최종 수정일 맵 ──────────────────────────────────
//   @astrojs/sitemap 은 기본적으로 lastmod 를 넣지 않는다. 그러면 크롤러 입장에서
//   모든 URL 이 "언제 바뀌었는지 모르는" 상태라, 글을 고쳐도 재크롤 우선순위를
//   판단할 근거가 없다.
//
//   ⚠ 값은 updatedDate ?? pubDate 다. 수정하지 않은 글에 빌드 시각을 넣으면
//     "전부 방금 바뀌었다"는 거짓 신호가 되어, 크롤러가 lastmod 자체를 무시하게 된다.
//
//   ⚠ astro.config 는 콘텐츠 컬렉션 API 를 쓸 수 없어 파일을 직접 읽는다.
//     경로 규칙: src/content/blog/<lang>/<slug>.md → /<lang>/blog/<slug>/
const POST_LASTMOD = (() => {
  const map = new Map();
  const base = new URL('./src/content/blog/', import.meta.url);
  for (const lang of ['en', 'ko']) {
    const dir = new URL(`${lang}/`, base);
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue; // 언어 폴더가 없으면 조용히 건너뜀
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const { data } = matter(fs.readFileSync(new URL(file, dir), 'utf8'));
      if (data.draft) continue; // 초안은 애초에 빌드되지 않는다
      const raw = data.updatedDate ?? data.pubDate;
      if (!raw) continue;
      const date = new Date(raw);
      if (Number.isNaN(date.valueOf())) continue;
      map.set(`/${lang}/blog/${file.replace(/\.md$/, '')}/`, date.toISOString());
    }
  }
  return map;
})();

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
        borderRadius: '14px',
        // 테두리 대신 그림자로 띄운다 (사이트 전체가 borderless 라 선을 맞춘다)
        borderColor: 'transparent',
        codeFontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace",
        codeFontSize: '0.85rem',
        uiFontFamily: 'inherit',
        frames: {
          frameBoxShadowCssValue: 'var(--shadow-sm)',
        },
      },
    }),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', ko: 'ko' },
      },
      // 글 URL 에만 lastmod 를 붙인다. 태그·목록 페이지는 "언제 바뀌었나"를
      // 정직하게 답할 수 없어 비워둔다(빠진 lastmod 는 크롤러가 그냥 무시한다).
      serialize(item) {
        const lastmod = POST_LASTMOD.get(new URL(item.url).pathname);
        if (lastmod) item.lastmod = lastmod;
        return item;
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
