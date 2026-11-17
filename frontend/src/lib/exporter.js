import JSZip from 'jszip';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_ORDER = ['about', 'projects', 'experience', 'photo-strip', 'skills', 'gallery', 'contact'];

const DEFAULT_THEME = Object.freeze({
  background_color: '#f6f0e7',
  accent_color: '#315c42',
  text_color: '#1f1f1f',
  muted_color: '#6d6a63',
  heading_font: 'Space Grotesk',
  body_font: 'Inter',
});

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]{3,20})$/i;
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

/* ------------------------------------------------------------------ */
/* Sanitising helpers                                                  */
/* ------------------------------------------------------------------ */

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** JSON that is safe to embed inside a <script> tag or a file. */
function safeJson(value, space) {
  return JSON.stringify(value, null, space)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Allows http(s), mailto, tel, anchors and relative paths. Blocks javascript: and friends. */
function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const value = url.trim();
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./')) return value;
  try {
    return LINK_PROTOCOLS.has(new URL(value).protocol) ? value : '';
  } catch {
    return '';
  }
}

/** Same as safeUrl, but also allows inline raster images. */
function safeImageUrl(url) {
  if (typeof url === 'string' && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(url.trim())) return url.trim();
  const value = safeUrl(url);
  return value.startsWith('mailto:') || value.startsWith('tel:') ? '' : value;
}

const safeColor = (value, fallback) => (typeof value === 'string' && COLOR_PATTERN.test(value.trim()) ? value.trim() : fallback);

/** Font names end up inside CSS, so keep them to a conservative character set. */
function safeFont(value, fallback) {
  const clean = String(value ?? '').replace(/[^\w\s-]/g, '').trim();
  return clean ? `'${clean}'` : `'${fallback}'`;
}

function resolveTheme(theme = {}) {
  return {
    bg: safeColor(theme.background_color, DEFAULT_THEME.background_color),
    accent: safeColor(theme.accent_color, DEFAULT_THEME.accent_color),
    text: safeColor(theme.text_color, DEFAULT_THEME.text_color),
    muted: safeColor(theme.muted_color, DEFAULT_THEME.muted_color),
    heading: safeFont(theme.heading_font, DEFAULT_THEME.heading_font),
    body: safeFont(theme.body_font, DEFAULT_THEME.body_font),
  };
}

const pad = (n) => String(n).padStart(2, '0');
const slugify = (value, fallback) => String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const initialsOf = (label = '') => String(label).trim().slice(0, 2).toUpperCase() || 'FF';

/* ------------------------------------------------------------------ */
/* HTML fragments                                                      */
/* ------------------------------------------------------------------ */

function linkOrText(label, url) {
  const href = safeUrl(url);
  if (!label) return '';
  if (!href) return `<span>${escapeHtml(label)}</span>`;
  const external = /^https?:/i.test(href);
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${escapeHtml(href)}"${attrs}>${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function visualBlock(imageUrl, label, className = '', { eager = false } = {}) {
  const src = safeImageUrl(imageUrl);
  if (src) {
    return `<img class="visual-image ${className}" src="${escapeHtml(src)}" alt="${escapeHtml(label)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />`;
  }
  return `<div class="visual-fallback ${className}" role="img" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(initialsOf(label))}</span></div>`;
}

const tagRow = (tags) =>
  tags?.length ? `<ul class="tag-row" role="list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>` : '';

/* ------------------------------------------------------------------ */
/* Section registry                                                    */
/* ------------------------------------------------------------------ */

/**
 * Each section: { label, numbered, render(config, kicker) -> html | '' }.
 * Returning '' skips the section (and its number).
 */
const SECTIONS = {
  about: {
    label: 'About',
    numbered: true,
    render: (config, kicker) => `
      <section class="section shell" id="about" aria-label="About">
        <div class="section-kicker">${kicker}</div>
        <div class="about-grid">
          <div class="about-statement">A portfolio is a point of view, not just a list of links.</div>
          <div class="about-copy"><p>${escapeHtml(config.bio || 'Add your story in the builder.')}</p>${config.location ? `<p class="muted">${escapeHtml(config.location)}</p>` : ''}</div>
        </div>
      </section>`,
  },

  projects: {
    label: 'Selected work',
    numbered: true,
    render: (config, kicker) => {
      const projects = config.projects || [];
      return `
      <section class="section shell" id="projects" aria-label="Selected work">
        <div class="section-heading">
          <div><div class="section-kicker">${kicker}</div><h2>Projects with a point of view.</h2></div>
          <span class="section-count">${pad(projects.length)} pieces</span>
        </div>
        <div class="project-grid">${projects
          .map(
            (project, index) => `
          <article class="project-card">
            <div class="project-number" aria-hidden="true">${pad(index + 1)}</div>
            ${visualBlock(project.image_url, project.title || 'Project', 'project-image')}
            <div class="project-body">
              <h3>${escapeHtml(project.title || 'Untitled project')}</h3>
              <p>${escapeHtml(project.description)}</p>
              ${tagRow(project.tags)}
              <div class="project-links">${linkOrText('Live', project.live_url)} ${linkOrText('Code', project.repo_url)}</div>
            </div>
          </article>`,
          )
          .join('')}</div>
      </section>`;
    },
  },

  experience: {
    label: 'Experience',
    numbered: true,
    render: (config, kicker) => {
      const experience = config.experience || [];
      if (!experience.length) return '';
      return `
      <section class="section shell" id="experience" aria-label="Experience">
        <div class="section-kicker">${kicker}</div><h2>Where I have been useful.</h2>
        <div class="experience-list">${experience
          .map(
            (item) => `
          <article class="experience-row">
            <span class="experience-date">${escapeHtml(item.date_range)}</span>
            <div><h3>${escapeHtml(item.role)}</h3><strong>${escapeHtml(item.organization)}</strong><p>${escapeHtml(item.description)}</p>${tagRow(item.tags)}</div>
          </article>`,
          )
          .join('')}</div>
      </section>`;
    },
  },

  'photo-strip': {
    label: 'Visual diary',
    numbered: false,
    render: (config) => {
      const projects = (config.projects || []).filter((p) => safeImageUrl(p.image_url));
      if (!projects.length) return '';
      const frames = [...projects, ...projects].map((p) => visualBlock(p.image_url, p.title || 'Work', 'strip-image')).join('');
      return `<div class="photo-strip" aria-hidden="true"><div>${frames}</div></div>`;
    },
  },

  skills: {
    label: 'Toolkit',
    numbered: true,
    render: (config, kicker) => {
      const skills = config.skills || [];
      if (!skills.length) return '';
      return `
      <section class="section shell" id="skills" aria-label="Toolkit">
        <div class="section-kicker">${kicker}</div><h2>Tools I reach for.</h2>
        <ul class="skills-cloud" role="list">${skills.map((skill) => `<li>${escapeHtml(skill)}</li>`).join('')}</ul>
      </section>`;
    },
  },

  gallery: {
    label: 'Gallery',
    numbered: true,
    render: (config, kicker) => {
      const gallery = config.gallery || [];
      if (!gallery.length) return '';
      return `
      <section class="section shell" id="gallery" aria-label="Gallery">
        <div class="section-kicker">${kicker}</div><h2>Details worth remembering.</h2>
        <div class="gallery-grid">${gallery
          .map(
            (item) => `<figure>${visualBlock(item.image_url, item.alt || item.caption || 'Gallery image', 'gallery-image')}${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}</figure>`,
          )
          .join('')}</div>
      </section>`;
    },
  },

  contact: {
    label: 'Contact',
    numbered: true,
    render: (config, kicker) => {
      const socials = (config.social_links || []).map((s) => linkOrText(s.platform, s.url)).filter(Boolean);
      const email = config.email && /^[^\s@<>"]+@[^\s@<>"]+$/.test(config.email) ? config.email : '';
      return `
      <section class="contact shell" id="contact" aria-label="Contact">
        <div class="section-kicker">${kicker}</div>
        <h2>Let's make something<br /><em>worth sharing.</em></h2>
        <p>${escapeHtml(config.short_intro || 'Have a project in mind? I would love to hear about it.')}</p>
        <div class="social-row">${socials.join('')}</div>
        ${email ? `<a class="email-link" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ''}
      </section>`;
    },
  },
};

/** Honours config.sections order + visibility; unknown ids are ignored, missing ones are appended. */
function resolveSectionOrder(config) {
  const configured = (config.sections || []).filter((s) => SECTIONS[s.id]);
  const seen = new Set(configured.map((s) => s.id));
  const merged = [...configured.map((s) => ({ id: s.id, visible: s.visible !== false })), ...DEFAULT_ORDER.filter((id) => !seen.has(id)).map((id) => ({ id, visible: true }))];
  return merged.filter((s) => s.visible).map((s) => s.id);
}

function buildBody(config) {
  const name = config.full_name || 'Your name';
  const resume = safeUrl(config.resume_url);

  let counter = 0;
  const sections = resolveSectionOrder(config)
    .map((id) => {
      const section = SECTIONS[id];
      const kicker = section.numbered ? `${pad(counter + 1)} / ${section.label}` : section.label;
      const html = section.render(config, kicker);
      if (html && section.numbered) counter += 1;
      return html;
    })
    .join('\n');

  const tickerText = `BUILD WITH INTENTION · ${name.toUpperCase()} · `;

  return `
    <header class="hero shell">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(config.handle || 'folioforge / portfolio')}</p>
        <h1>${escapeHtml(name)}<em>.</em></h1>
        <p class="hero-role">${escapeHtml(config.professional_title || 'Creative builder')}</p>
        <p class="hero-intro">${escapeHtml(config.short_intro || 'Build a clear story around the work you care about.')}</p>
        <div class="hero-actions">
          ${resume ? `<a class="button primary" href="${escapeHtml(resume)}" target="_blank" rel="noopener noreferrer">Resume <span aria-hidden="true">↗</span></a>` : ''}
          <a class="button ${resume ? 'ghost' : 'primary'}" href="#projects">See selected work</a>
        </div>
      </div>
      <div class="portrait-card">
        <div class="portrait-noise" aria-hidden="true">CREATE · ITERATE · SHIP</div>
        ${visualBlock(config.avatar_url, config.full_name || 'Portrait', 'portrait-image', { eager: true })}
        <div class="portrait-caption"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(config.location || 'Somewhere curious')}</span></div>
      </div>
    </header>

    <div class="ticker" aria-hidden="true"><span>${escapeHtml(tickerText)}</span><span>${escapeHtml(tickerText)}</span></div>
    ${sections}`;
}

/* ------------------------------------------------------------------ */
/* Head metadata (SEO, social cards, structured data, favicon)         */
/* ------------------------------------------------------------------ */

function buildHead(config, title, theme) {
  const description = config.short_intro || config.bio || title;
  const image = safeImageUrl(config.avatar_url);
  const sameAs = (config.social_links || []).map((s) => safeUrl(s.url)).filter((u) => /^https?:/i.test(u));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: config.full_name || title,
    ...(config.professional_title && { jobTitle: config.professional_title }),
    ...(config.location && { homeLocation: { '@type': 'Place', name: config.location } }),
    ...(image && /^https?:/i.test(image) && { image }),
    ...(sameAs.length && { sameAs }),
  };
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${theme.accent}"/><text x="32" y="43" font-size="30" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="${theme.bg}">${escapeHtml(initialsOf(title))}</text></svg>`;

  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="theme-color" content="${escapeHtml(theme.bg)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)} — portfolio" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${image && /^https?:/i.test(image) ? `<meta property="og:image" content="${escapeHtml(image)}" />\n    <meta name="twitter:card" content="summary_large_image" />` : '<meta name="twitter:card" content="summary" />'}
    <title>${escapeHtml(title)} — portfolio</title>
    <link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}" />
    <link rel="stylesheet" href="./styles.css" />
    <script type="application/ld+json">${safeJson(jsonLd)}</script>`;
}

/* ------------------------------------------------------------------ */
/* CSS + JS                                                            */
/* ------------------------------------------------------------------ */

function buildCss(theme) {
  return `:root {
  --bg: ${theme.bg};
  --accent: ${theme.accent};
  --text: ${theme.text};
  --muted: ${theme.muted};
  --serif: Georgia, 'Times New Roman', serif;
  --sans: ${theme.body}, Inter, system-ui, sans-serif;
  --heading: ${theme.heading}, Inter, system-ui, sans-serif;
  --line: color-mix(in srgb, var(--text) 15%, transparent);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 24px; -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.6; text-rendering: optimizeLegibility; }
a { color: inherit; }
img { max-width: 100%; display: block; }
ul[role='list'] { list-style: none; padding: 0; margin: 0; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.skip-link { position: absolute; left: 16px; top: -60px; z-index: 10; padding: 10px 16px; background: var(--accent); color: var(--bg); border-radius: 999px; text-decoration: none; font-weight: 700; }
.skip-link:focus { top: 16px; }
.shell { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
.hero { min-height: 92vh; display: grid; grid-template-columns: 1.1fr .9fr; align-items: center; gap: 7vw; padding: 90px 0 70px; }
.eyebrow, .section-kicker, .project-number, .section-count { color: var(--accent); text-transform: uppercase; letter-spacing: .16em; font: 700 11px/1 var(--sans); }
h1, h2, h3, p { margin-top: 0; }
h1, h2, h3 { font-family: var(--heading); letter-spacing: -.055em; text-wrap: balance; }
h1 { font-size: clamp(3.2rem, 10vw, 9rem); line-height: .9; max-width: 850px; margin: 24px 0; overflow-wrap: anywhere; }
h1 em, h2 em { color: var(--accent); font-family: var(--serif); font-weight: 400; }
.hero-role { font-size: clamp(1.1rem, 2vw, 1.7rem); color: var(--accent); }
.hero-intro { max-width: 530px; color: var(--muted); font-size: 1.08rem; }
.hero-actions, .social-row, .project-links, .tag-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.button { display: inline-flex; padding: 12px 17px; border-radius: 999px; text-decoration: none; font-weight: 700; transition: transform .2s ease; }
.button:hover { transform: translateY(-2px); }
.button.primary { background: var(--accent); color: var(--bg); }
.button.ghost { border: 1px solid color-mix(in srgb, var(--text) 30%, transparent); }
.portrait-card { min-height: 450px; padding: 18px; background: color-mix(in srgb, var(--accent) 16%, var(--bg)); border: 1px solid var(--line); box-shadow: 22px 26px 0 color-mix(in srgb, var(--accent) 18%, transparent); transform: rotate(3deg); }
.portrait-noise { color: var(--accent); font: 700 10px/1 var(--sans); letter-spacing: .14em; padding: 9px 0 14px; }
.portrait-image { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.portrait-caption { display: flex; justify-content: space-between; gap: 14px; padding: 15px 3px 2px; font-size: .85rem; }
.portrait-caption span, .muted { color: var(--muted); }
.visual-fallback { display: grid; place-items: center; min-height: 180px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 72%, var(--bg)), color-mix(in srgb, #d98e72 58%, var(--bg))); color: var(--bg); }
.visual-fallback span { font: 800 clamp(2rem, 7vw, 6rem)/1 var(--heading); opacity: .75; }
.ticker { display: flex; overflow: hidden; border-block: 1px solid var(--line); color: var(--accent); white-space: nowrap; padding: 14px 0; font-size: 11px; letter-spacing: .18em; }
.ticker span { flex: 0 0 auto; animation: marquee 18s linear infinite; padding-right: 40px; }
@keyframes marquee { to { transform: translateX(-100%); } }
.section { padding: 120px 0; }
.section h2, .contact h2 { font-size: clamp(2.4rem, 6vw, 6.4rem); line-height: .94; margin: 18px 0 40px; max-width: 800px; }
.section-heading { display: flex; justify-content: space-between; align-items: end; gap: 20px; flex-wrap: wrap; }
.about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9vw; align-items: start; }
.about-statement { font: 500 clamp(2rem, 4vw, 4.4rem)/1.05 var(--heading); letter-spacing: -.055em; }
.about-copy { max-width: 560px; font-size: 1.15rem; }
.project-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
.project-card { position: relative; overflow: hidden; border: 1px solid color-mix(in srgb, var(--text) 14%, transparent); background: color-mix(in srgb, var(--text) 4%, var(--bg)); transition: transform .35s ease, box-shadow .35s ease; will-change: transform; }
.project-card:hover { transform: translateY(-7px) rotate(-.4deg); box-shadow: 0 24px 50px color-mix(in srgb, var(--text) 16%, transparent); }
.project-card .visual-fallback, .project-image { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.project-body { padding: 25px; }
.project-body h3, .experience-row h3 { font-size: 1.6rem; margin-bottom: 8px; }
.project-body p, .experience-row p { color: var(--muted); }
.project-number { position: absolute; top: 18px; right: 18px; z-index: 1; color: var(--bg); mix-blend-mode: difference; }
.tag-row li, .skills-cloud li { border: 1px solid color-mix(in srgb, var(--text) 18%, transparent); border-radius: 999px; padding: 6px 10px; font-size: 11px; }
.project-links { margin-top: 20px; font-size: .85rem; font-weight: 700; }
.project-links a { text-decoration: none; color: var(--accent); }
.experience-list { border-top: 1px solid color-mix(in srgb, var(--text) 18%, transparent); }
.experience-row { display: grid; grid-template-columns: 170px 1fr; gap: 30px; padding: 30px 0; border-bottom: 1px solid color-mix(in srgb, var(--text) 18%, transparent); }
.experience-date { color: var(--accent); font-size: .82rem; font-weight: 700; }
.experience-row strong { color: var(--accent); }
.photo-strip { overflow: hidden; padding: 25px 0; border-block: 1px solid color-mix(in srgb, var(--text) 12%, transparent); }
.photo-strip > div { display: flex; gap: 14px; width: max-content; animation: strip 30s linear infinite; }
.strip-image { width: 210px; height: 140px; min-height: 0; object-fit: cover; flex: 0 0 auto; }
@keyframes strip { to { transform: translateX(-50%); } }
.skills-cloud { display: flex; flex-wrap: wrap; gap: 12px; max-width: 900px; }
.skills-cloud li { padding: 14px 18px; font-size: 1.1rem; border-color: var(--accent); color: var(--accent); }
.gallery-grid { columns: 3 220px; column-gap: 16px; }
.gallery-grid figure { break-inside: avoid; margin: 0 0 16px; }
.gallery-image { width: 100%; min-height: 180px; object-fit: cover; }
figcaption { color: var(--muted); font-size: .82rem; padding-top: 8px; }
.contact { padding: 150px 0 100px; }
.contact > p { color: var(--muted); max-width: 500px; font-size: 1.15rem; }
.social-row { margin: 35px 0 25px; }
.social-row a { border-bottom: 1px solid var(--accent); color: var(--accent); text-decoration: none; padding-bottom: 4px; }
.email-link { font: 700 clamp(1.3rem, 3vw, 2.4rem)/1.1 var(--heading); text-decoration: none; overflow-wrap: anywhere; }
.footer { padding: 30px 0 50px; border-top: 1px solid var(--line); color: var(--muted); font-size: .8rem; }
@media (max-width: 780px) { .shell { width: min(100% - 32px, 620px); } .hero, .about-grid { grid-template-columns: 1fr; gap: 48px; } .hero { padding-top: 55px; } .portrait-card { min-height: 0; } .project-grid { grid-template-columns: 1fr; } .experience-row { grid-template-columns: 1fr; gap: 8px; } .section { padding: 80px 0; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; } }
@media print {
  body { background: #fff; color: #000; }
  .ticker, .photo-strip, .portrait-card, .skip-link { display: none !important; }
  .hero { min-height: 0; padding: 24px 0; }
  .section, .contact { padding: 28px 0; }
  .project-card, .experience-row { break-inside: avoid; }
  a[href^='http']::after { content: ' (' attr(href) ')'; font-size: .75em; color: #555; }
}
`;
}

const APP_JS = `(() => {
  'use strict';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!finePointer || reduceMotion) return;

  document.querySelectorAll('.project-card').forEach((card) => {
    let frame = 0;
    card.addEventListener('pointermove', (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = 'perspective(900px) rotateX(' + (y * -3).toFixed(2) + 'deg) rotateY(' + (x * 4).toFixed(2) + 'deg) translateY(-7px)';
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      card.style.transform = '';
    });
  });
})();
`;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function getGeneratedFiles(project = {}) {
  const config = project.config || {};
  const title = config.full_name || project.name || 'FolioForge portfolio';
  const theme = resolveTheme(config.theme);

  const html = `<!doctype html>
<html lang="${escapeHtml(config.language || 'en')}">
  <head>${buildHead(config, title, theme)}
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">${buildBody(config)}</main>
    <footer class="footer shell">© ${new Date().getFullYear()} ${escapeHtml(title)} · Built with FolioForge</footer>
    <script src="./app.js" defer></script>
  </body>
</html>
`;

  const readme = [
    `# ${title}`,
    '',
    'Generated by FolioForge.',
    '',
    '## Run locally',
    '',
    'Serve this folder with any static server (for example `npx serve .`), or deploy it to Vercel, Netlify, GitHub Pages, or another static host.',
    '',
    '## Files',
    '',
    '- `index.html` holds the content and SEO metadata.',
    '- `styles.css` holds the visual system; colours and fonts are CSS variables at the top.',
    '- `app.js` adds a light tilt effect to project cards (disabled for touch and reduced motion).',
    '- `folioforge-data.json` is the source config, so the site can be re-imported into FolioForge.',
    '',
  ].join('\n');

  return {
    'index.html': html,
    'styles.css': buildCss(theme),
    'app.js': APP_JS,
    'README.md': readme,
    'folioforge-data.json': `${safeJson(config, 2)}\n`,
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadProjectZip(project) {
  const zip = new JSZip();
  const files = getGeneratedFiles(project);
  const date = new Date();
  Object.entries(files).forEach(([path, content]) => zip.file(path, content, { date }));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  triggerDownload(blob, `${slugify(project?.name, 'folioforge-portfolio')}.zip`);
}

export function downloadJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${slugify(project?.name, 'folioforge-project')}.json`);
}
