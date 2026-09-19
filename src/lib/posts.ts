// 페이지들이 공통으로 쓰는 글 목록·카테고리·태그 집계.
import { getCollection, type CollectionEntry } from 'astro:content';
import { categories, langFromId, keyFromId, type Lang } from '../i18n/ui';

export type Post = CollectionEntry<'blog'>;

/** 한 언어의 공개 글, 최신순. 같은 날이면 시리즈 뒤 편이 위로 온다. */
export async function getPosts(lang: Lang): Promise<Post[]> {
  return (await getCollection('blog'))
    .filter((p) => langFromId(p.id) === lang && !p.data.draft)
    .sort(
      (a, b) =>
        b.data.pubDate.valueOf() - a.data.pubDate.valueOf() ||
        (b.data.seriesOrder ?? 0) - (a.data.seriesOrder ?? 0),
    );
}

export function postUrl(lang: Lang, post: Post): string {
  return `/${lang}/blog/${keyFromId(post.id)}/`;
}

/** 카테고리로 거른 글 목록 — 홈과 같은 화면에서 칩만 바뀐다 */
export function categoryUrl(lang: Lang, id: string): string {
  return `/${lang}/category/${id}/`;
}

export function tagUrl(lang: Lang, tag: string): string {
  return `/${lang}/tag/${encodeURIComponent(tag)}/`;
}

export type CategoryStat = { id: string; label: string; count: number; cover?: string };

/**
 * 글이 있는 카테고리만, 글 수 많은 순.
 * 카테고리 대표 이미지는 따로 없어서 그 카테고리 최신 글의 커버를 쓴다.
 */
export function categoryStats(posts: Post[]): CategoryStat[] {
  return categories
    .map((c) => {
      const inCat = posts.filter((p) => p.data.category === c.id);
      return { id: c.id, label: c.label, count: inCat.length, cover: inCat[0]?.data.cover };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** 태그별 글 수, 많은 순 → 이름순. */
export function tagStats(posts: Post[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of posts) for (const tag of p.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
