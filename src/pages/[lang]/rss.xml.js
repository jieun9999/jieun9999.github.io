import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { ui, languages, langFromId, keyFromId } from '../../i18n/ui';

export function getStaticPaths() {
  return Object.keys(languages).map((lang) => ({ params: { lang } }));
}

export async function GET(context) {
  const { lang } = context.params;
  const posts = (await getCollection('blog'))
    .filter((p) => langFromId(p.id) === lang && !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: ui[lang].siteTitle,
    description: ui[lang].tagline,
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: `/${lang}/blog/${keyFromId(p.id)}/`,
    })),
  });
}
