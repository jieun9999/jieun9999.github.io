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
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
