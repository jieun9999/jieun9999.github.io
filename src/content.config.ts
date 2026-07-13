import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 블로그 글 컬렉션. 파일은 src/content/blog/<lang>/<key>.md 구조로 둔다.
//   - 언어는 폴더명(en/ko)으로 결정 → frontmatter에 lang 안 적어도 됨
//   - 한/영 번역 짝은 "같은 파일명(key)"으로 연결됨
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    // 카테고리 필터 (배너 아래 pill). all은 UI 기본값이라 글엔 지정 안 함.
    category: z
      .enum(['building', 'open-source', 'fundamentals', 'career'])
      .default('building'),
    draft: z.boolean().default(false),
    // 검색 대표 URL 오버라이드(선택). 값이 있으면 그 글의 canonical을 이 주소로 넘김.
    //   - 비우면 self-canonical(기본). 영문 글을 해쉬노드로 넘길 때만 채운다.
    canonicalURL: z.string().url().optional(),
    // 커버 이미지(선택). 예: "/covers/hello-astro.jpg". 없으면 자동 타일 생성.
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    // 시리즈(선택): 같은 series id 를 가진 글들이 묶임
    series: z.string().optional(),
    seriesOrder: z.number().optional(),
    seriesTitle: z.string().optional(),
  }),
});

export const collections = { blog };
