#!/usr/bin/env node
/**
 * Renders the legal documents in docs/legal/*.md into static pages next to
 * index.html: privacy.html, privacy-ru.html, terms.html, terms-ru.html.
 *
 * The Markdown files are the source of truth. Edit them, then run
 *   node landing/build-legal.mjs
 * and commit the regenerated pages. No dependencies: the converter below
 * handles exactly the Markdown those files use (headings, paragraphs, lists,
 * tables, bold, italics, inline code, links and HTML comments).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', 'docs', 'legal');

const PAGES = [
  { src: 'privacy-policy.md', out: 'privacy.html', lang: 'en', other: 'privacy-ru.html', otherLabel: 'Русская версия' },
  { src: 'privacy-policy.ru.md', out: 'privacy-ru.html', lang: 'ru', other: 'privacy.html', otherLabel: 'English version' },
  { src: 'terms-of-service.md', out: 'terms.html', lang: 'en', other: 'terms-ru.html', otherLabel: 'Русская версия' },
  { src: 'terms-of-service.ru.md', out: 'terms-ru.html', lang: 'ru', other: 'terms.html', otherLabel: 'English version' }
];

/** Links between the Markdown files become links between the pages. */
const LINKS = {
  'privacy-policy.md': 'privacy.html',
  'privacy-policy.ru.md': 'privacy-ru.html',
  'terms-of-service.md': 'terms.html',
  'terms-of-service.ru.md': 'terms-ru.html'
};

const UI = {
  en: { back: 'SkyAtlas', privacy: 'Privacy Policy', terms: 'Terms of Use', home: 'Home' },
  ru: { back: 'SkyAtlas', privacy: 'Политика конфиденциальности', terms: 'Условия использования', home: 'На главную' }
};

/** Each document’s title, so a link whose text is a file name reads as the page it points to. */
const TITLES = Object.fromEntries(
  Object.keys(LINKS).map((f) => [f, readFileSync(join(DOCS, f), "utf8").match(/^# (.*)$/m)?.[1] ?? f])
);

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  // HTML comments pass through untouched; everything else is escaped and formatted.
  return text
    .split(/(<!--[\s\S]*?-->)/)
    .map((part) => (part.startsWith('<!--') ? part : formatInline(part)))
    .join('');
}

function formatInline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${escape(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escape(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = LINKS[url] ?? url;
    const external = /^https?:/.test(href);
    const text = label === url && TITLES[url] ? escape(TITLES[url]) : label;
    return `<a href="${href}"${external ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  s = s.replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.]+\w)/g, '$1<a href="mailto:$2">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function convert(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let title = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const html = inline(h[2]);
      if (level === 1) {
        title = h[2];
        out.push(`<h1>${html}</h1>`);
      } else {
        out.push(`<h${level} id="${slug(h[2])}">${html}</h${level}>`);
      }
      i++;
      continue;
    }
    if (/^<!--[\s\S]*-->\s*$/.test(line.trim())) {
      out.push(line.trim());
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push('<div class="table"><table>');
      out.push(`<thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead>`);
      out.push('<tbody>');
      const labels = cells(head).map((c) => escape(c.replace(/[`*]/g, '')));
      for (const r of body) out.push(`<tr>${cells(r).map((c, k) => `<td data-label="${labels[k] ?? ''}">${inline(c)}</td>`).join('')}</tr>`);
      out.push('</tbody></table></div>');
      continue;
    }
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        let item = lines[i++].slice(2);
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(item);
      }
      out.push(`<ul>\n${items.map((it) => `<li>${inline(it)}</li>`).join('\n')}\n</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|- |\|)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join('\n'))}</p>`);
  }
  return { title, body: out.join('\n') };
}

const CSS = `
  :root {
    --ground: #0B0E11; --raised: #12161B; --lifted: #191E25; --rule: #242B34;
    --ink: #E9EEF4; --muted: #9AA5B4; --dim: #7C8797; --amber: #FF9E3D;
    --gutter: 20px;
    --display: 'Manrope', system-ui, sans-serif;
    --text: 'Inter', system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--ground); color: var(--muted); font: 400 16px/1.65 var(--text); -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }
  a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px; }
  a:hover { text-decoration-color: var(--amber); }
  a:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; }
  strong { color: var(--ink); font-weight: 600; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 var(--gutter); }
  .top { border-bottom: 1px solid var(--rule); }
  .top .wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 64px; max-width: 1120px; }
  .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); font: 800 18px/1 var(--display); }
  .brand img { width: 32px; height: 32px; border-radius: 8px; }
  .label, .top nav a { font: 500 12px/1.4 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); text-decoration: none; }
  .top nav a:hover { color: var(--ink); }
  main .wrap { padding-top: 48px; padding-bottom: 64px; }
  h1, h2, h3 { color: var(--ink); font-family: var(--display); letter-spacing: -0.02em; }
  h1 { font-size: clamp(30px, 7vw, 44px); line-height: 1.1; font-weight: 800; margin: 12px 0 8px; }
  h2 { font-size: 22px; line-height: 1.25; font-weight: 700; margin: 48px 0 12px; padding-top: 24px; border-top: 1px solid var(--rule); }
  h3 { font-size: 18px; font-weight: 700; margin: 32px 0 8px; }
  h1 + p { font: 400 13px/1.5 var(--mono); color: var(--dim); }
  p { margin: 0 0 16px; }
  ul { margin: 0 0 16px; padding: 0; list-style: none; }
  li { position: relative; padding-left: 20px; margin-bottom: 10px; }
  li::before { content: ''; position: absolute; left: 0; top: 0.8em; width: 8px; height: 1px; background: var(--dim); }
  code { font: 400 0.88em/1.4 var(--mono); color: var(--ink); background: var(--raised); border: 1px solid var(--rule); padding: 1px 4px; overflow-wrap: anywhere; }
  .table { overflow-x: auto; margin: 0 0 16px; border: 1px solid var(--rule); }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
  @media (max-width: 599px) {
    .table table, .table tbody, .table tr, .table td { display: block; }
    .table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .table tr { padding: 12px; border-bottom: 1px solid var(--rule); }
    .table tr:last-child { border-bottom: 0; }
    .table td { padding: 0; border: 0; margin-bottom: 10px; }
    .table td:last-child { margin-bottom: 0; }
    .table td::before { content: attr(data-label); display: block; font: 500 11px/1.4 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); margin-bottom: 2px; }
  }
  th { font: 500 12px/1.4 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim); background: var(--raised); }
  tr:last-child td { border-bottom: 0; }
  td code { overflow-wrap: anywhere; }
  footer { border-top: 1px solid var(--rule); }
  footer .wrap { padding-top: 32px; padding-bottom: 48px; display: flex; flex-wrap: wrap; gap: 12px 24px; max-width: 1120px; }
  footer a { color: var(--muted); font-size: 14px; }
  @media (min-width: 720px) { :root { --gutter: 32px; } }
`;

function page({ lang, other, otherLabel }, { title, body }) {
  const ui = UI[lang];
  const otherLang = lang === 'en' ? 'ru' : 'en';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="theme-color" content="#0B0E11">
<meta name="color-scheme" content="dark">
<link rel="icon" type="image/png" href="icon.png">
<link rel="alternate" hreflang="${otherLang}" href="${other}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Manrope:wght@700;800&display=swap">
<style>${CSS}</style>
</head>
<body>
<!-- Generated by landing/build-legal.mjs from docs/legal. Edit the Markdown, not this file. -->
<header class="top">
  <div class="wrap">
    <a class="brand" href="index.html"><img src="icon.png" alt="" width="32" height="32">${ui.back}</a>
    <nav><a href="${other}" hreflang="${otherLang}" lang="${otherLang}">${otherLabel}</a></nav>
  </div>
</header>
<main>
  <article class="wrap">
${body}
  </article>
</main>
<footer>
  <div class="wrap">
    <a href="index.html">${ui.home}</a>
    <a href="${lang === 'en' ? 'privacy.html' : 'privacy-ru.html'}">${ui.privacy}</a>
    <a href="${lang === 'en' ? 'terms.html' : 'terms-ru.html'}">${ui.terms}</a>
  </div>
</footer>
</body>
</html>
`;
}

for (const p of PAGES) {
  const doc = convert(readFileSync(join(DOCS, p.src), 'utf8'));
  writeFileSync(join(HERE, p.out), page(p, doc));
  console.log(`${p.src} -> landing/${p.out}`);
}
