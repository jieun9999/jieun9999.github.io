// jieun.dev(영문 글) → Hashnode 교차발행.
//
// 대상: src/content/blog/en/*.md 중 `crosspost: true` && !draft
//   - hashnodeId 있음 → updatePost (기존 글 수정)
//   - hashnodeId 없음 → 먼저 slug로 기존 글 조회해서 있으면 그 id 채택(update),
//                       없으면 publishPost (신규). 발행 후 id를 프론트매터에 되써넣음.
//   - 해쉬노드 쪽은 self-canonical(originalArticleURL 비움) → 전략 A(영문 대표=해쉬노드)
//
// 사용:
//   HASHNODE_PAT=xxx node scripts/crosspost-hashnode.mjs [파일...]   # 파일 없으면 crosspost 영문 전체
//   DRY_RUN=1 HASHNODE_PAT=xxx node scripts/crosspost-hashnode.mjs   # 뮤테이션 없이 계획만 출력
//
// 환경변수: HASHNODE_PAT(필수), DRY_RUN(선택, "1"이면 읽기전용)

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';

const SITE = 'https://jieun.dev';
const PUBLICATION_HOST = 'beckybuilds.hashnode.dev';
const EN_DIR = 'src/content/blog/en';
const GQL = 'https://gql.hashnode.com';

const TOKEN = process.env.HASHNODE_PAT;
const DRY = process.env.DRY_RUN === '1';

if (!TOKEN) {
  console.error('✖ HASHNODE_PAT 환경변수가 없습니다.');
  process.exit(1);
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getPublicationId() {
  const data = await gql(
    `query($host:String!){ publication(host:$host){ id } }`,
    { host: PUBLICATION_HOST }
  );
  if (!data.publication?.id) throw new Error(`publication 못 찾음: ${PUBLICATION_HOST}`);
  return data.publication.id;
}

async function findPostIdBySlug(slug) {
  const data = await gql(
    `query($host:String!,$slug:String!){ publication(host:$host){ post(slug:$slug){ id } } }`,
    { host: PUBLICATION_HOST, slug }
  );
  return data.publication?.post?.id ?? null;
}

// 본문 상대경로 이미지(/covers, /images ...)를 jieun.dev 절대경로로 (해쉬노드에서 안 깨지게)
function absolutizeImages(md) {
  return md
    .replace(/(!\[[^\]]*\]\()(\/[^)\s]+)(\))/g, (_, a, url, c) => `${a}${SITE}${url}${c}`)
    .replace(/(<img[^>]+src=")(\/[^"]+)(")/g, (_, a, url, c) => `${a}${SITE}${url}${c}`);
}

function tagObjects(tags) {
  return (tags || []).map((t) => ({
    name: String(t),
    slug: String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  }));
}

// 프론트매터 다른 필드/포맷 건드리지 않고 hashnodeId만 삽입/치환
function writeHashnodeId(file, id) {
  let text = readFileSync(file, 'utf8');
  if (/^hashnodeId:.*$/m.test(text)) {
    text = text.replace(/^hashnodeId:.*$/m, `hashnodeId: '${id}'`);
  } else if (/^crosspost:.*$/m.test(text)) {
    text = text.replace(/^(crosspost:.*)$/m, `$1\nhashnodeId: '${id}'`);
  } else {
    text = text.replace('---\n', `---\nhashnodeId: '${id}'\n`);
  }
  writeFileSync(file, text);
}

async function processFile(file, publicationId) {
  const { data: fm, content } = matter(readFileSync(file, 'utf8'));
  if (!fm.crosspost || fm.draft) {
    console.log(`· skip (crosspost 아님/draft): ${basename(file)}`);
    return;
  }

  const slug = basename(file, '.md');
  const contentMarkdown = absolutizeImages(content);
  const coverURL = fm.cover ? `${SITE}${fm.cover}` : undefined;
  const tags = tagObjects(fm.tags);

  let id = fm.hashnodeId || (await findPostIdBySlug(slug));
  const action = id ? 'UPDATE' : 'PUBLISH';

  if (DRY) {
    console.log(`[dry-run] ${action} ${slug}${id ? ` (id=${id})` : ''} cover=${coverURL ?? '없음'} tags=${tags.length}`);
    return;
  }

  if (id) {
    await gql(
      `mutation($input:UpdatePostInput!){ updatePost(input:$input){ post{ id url } } }`,
      {
        input: {
          id,
          title: fm.title,
          contentMarkdown,
          slug,
          tags,
          ...(coverURL ? { coverImageOptions: { coverImageURL: coverURL } } : {}),
        },
      }
    );
    console.log(`✓ updated: ${slug}`);
  } else {
    const data = await gql(
      `mutation($input:PublishPostInput!){ publishPost(input:$input){ post{ id url } } }`,
      {
        input: {
          title: fm.title,
          contentMarkdown,
          publicationId,
          slug,
          tags,
          ...(coverURL ? { coverImageOptions: { coverImageURL: coverURL } } : {}),
          // originalArticleURL 비움 → 해쉬노드 self-canonical
        },
      }
    );
    id = data.publishPost.post.id;
    console.log(`✓ published: ${slug} → ${data.publishPost.post.url}`);
  }

  if (fm.hashnodeId !== id) writeHashnodeId(file, id);
}

// 처리 대상 파일 결정: 인자로 받은 en/*.md, 없으면 crosspost 영문 전체
let files = process.argv
  .slice(2)
  .filter((f) => f.replace(/^\.\//, '').startsWith(EN_DIR) && f.endsWith('.md'));
if (files.length === 0) {
  files = readdirSync(EN_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(EN_DIR, f));
}

const publicationId = await getPublicationId();
console.log(`publicationId=${publicationId} · ${DRY ? 'DRY-RUN' : '실행'} · 대상 ${files.length}개`);

for (const f of files) {
  try {
    await processFile(f, publicationId);
  } catch (e) {
    console.error(`✖ 실패 ${basename(f)}: ${e.message}`);
    process.exitCode = 1;
  }
}
