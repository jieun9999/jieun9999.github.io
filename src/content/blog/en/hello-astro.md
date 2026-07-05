---
title: 'Hello, Astro'
description: 'The first post on my bilingual dev blog — how this site is built and how the language toggle works.'
pubDate: 2026-07-06
tags: ['astro', 'blog', 'i18n']
---

Welcome! This is the first post on my bilingual developer blog. Use the **EN / KO** toggle in the header to read this same post in Korean.

## Why a bilingual blog

I publish in English for reach, but I think more precisely in Korean. Instead of choosing one, each post here exists in both languages and readers pick with one click.

## How it works

Each post is a Markdown file. The English and Korean versions share the same filename, which is how the toggle knows they are a pair:

```
src/content/blog/
  en/hello-astro.md   ← this post
  ko/hello-astro.md   ← the Korean version
```

The site is built with [Astro](https://astro.build), a static site generator. Everything you see is plain HTML generated at build time — there is no database and no server to maintain.

### Code looks good too

Syntax highlighting works out of the box, in both light and dark themes:

```ts
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet('world'));
```

## What's next

I'll write about software engineering here — things I learn, break, and fix. Thanks for reading.
