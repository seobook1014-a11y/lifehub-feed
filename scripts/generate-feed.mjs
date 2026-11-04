#!/usr/bin/env node
// Regenerate the public community-wall feed snapshots consumed by in8b.com
// and 1in8b.live through jsDelivr. One run mirrors what the Worker's
// GET /api/posts?public=1 already publishes; no private or held content is
// ever included. Files change only when the wall content changes, so commits
// and jsDelivr purges stay rare even though the job runs every 15 minutes.

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SITES = [
  { id: 'in8b', origin: 'https://in8b.com' },
  { id: 'play', origin: 'https://1in8b.live' },
];
// Keep in sync with SITE_LANGUAGES in lifehub/src/site.js.
const LANGS = ['en', 'en-GB', 'de', 'es', 'es-419', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'vi',
  'id', 'th', 'tr', 'hi', 'ar', 'bn', 'uk', 'nl', 'zh-Hant', 'zh-Hans', 'yue-Hant-HK'];
const LIMIT = 20;
const REQUEST_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 15000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchVariant(origin, lang, attempt = 0) {
  const query = lang ? `&lang=${encodeURIComponent(lang)}` : '';
  const response = await fetch(`${origin}/api/posts?public=1${query}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 429 && attempt < 1) {
    // Public reads are metered per visitor hour; a polite pause usually clears it.
    await sleep(20000);
    return fetchVariant(origin, lang, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.ok !== true || !Array.isArray(data.posts)) throw new Error('bad payload');
  const posts = data.posts.filter(post => Number.isInteger(post.id) && typeof post.name === 'string'
    && typeof post.text === 'string' && Number.isInteger(post.at));
  return { posts, more: data.more === true };
}

function contentKey(payload) {
  // `at` intentionally excluded: a regen with identical wall content must not
  // produce a commit or a purge.
  return createHash('sha256').update(JSON.stringify({ posts: payload.posts, more: payload.more, lang: payload.lang })).digest('hex');
}

async function main() {
  const generatedAt = Date.now();
  let okVariants = 0, failVariants = 0, changed = [];
  const summary = {};

  for (const site of SITES) {
    const variants = [null, ...LANGS];
    const results = [];
    for (const lang of variants) {
      // Sequential and paced: the public read limiter allows roughly one
      // request per second per visitor, and a run must never look like abuse.
      await sleep(1200 + Math.floor(Math.random() * 600));
      try {
        const result = await fetchVariant(site.origin, lang);
        results.push({ status: 'fulfilled', value: { lang, posts: result.posts, more: result.more } });
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
      }
    }
    let siteOk = 0, sitePosts = 0;
    for (let index = 0; index < results.length; index += 1) {
      const lang = variants[index];
      const name = lang ? `${lang}.json` : 'all.json';
      const path = `feed/${site.id}/${name}`;
      const outcome = results[index];
      if (outcome.status !== 'fulfilled') {
        failVariants += 1;
        console.warn(`warn: ${site.id}/${name} kept previous content (${outcome.reason?.message ?? outcome.reason})`);
        continue;
      }
      const { posts, more } = outcome.value;
      const payload = { ok: true, lang: lang ?? null, posts, more: more === true || posts.length === LIMIT, at: generatedAt };
      let previousKey = null;
      try {
        const previous = JSON.parse(await readFile(path, 'utf8'));
        previousKey = contentKey(previous);
      } catch { /* first generation or unreadable file */ }
      const serialized = `${JSON.stringify(payload)}\n`;
      if (previousKey !== contentKey(payload)) {
        await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
        await writeFile(path, serialized);
        changed.push(path);
      }
      siteOk += 1; sitePosts += posts.length;
    }
    summary[site.id] = { variants: siteOk, posts: sitePosts };
    okVariants += siteOk;
  }

  const meta = { generatedAt, okVariants, failVariants, summary, source: 'GET /api/posts?public=1 via site origins', repo: 'seobook1014-a11y/lifehub-feed' };
  await writeFile('meta.json', `${JSON.stringify(meta, null, 2)}\n`);
  console.log(JSON.stringify({ okVariants, failVariants, changed: changed.length, summary }));
  if (okVariants === 0) process.exitCode = 1; // total outage: leave everything as-is
}

main().catch(error => { console.error(error); process.exitCode = 1; });
