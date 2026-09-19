// 검색 모달이 처음 열릴 때 한 번 받아가는 글 목록. 빌드 시점에 정적 JSON 으로 굳는다.
import type { APIRoute } from 'astro';
import { languages, categoryLabel, formatDate, type Lang } from '../../i18n/ui';
import { getPosts, postUrl } from '../../lib/posts';

export function getStaticPaths() {
  return Object.keys(languages).map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const posts = await getPosts(lang);
  const items = posts.map((p) => ({
    title: p.data.title,
    description: p.data.description,
    tags: p.data.tags,
    category: categoryLabel(p.data.category),
    date: formatDate(p.data.pubDate, lang),
    url: postUrl(lang, p),
  }));
  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
