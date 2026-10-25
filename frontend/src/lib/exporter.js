import JSZip from 'jszip';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function linkOrText(label, url) {
  if (!url) return `<span>${escapeHtml(label)}</span>`;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ↗</a>`;
}

function visualBlock(imageUrl, label, className = '') {
  if (imageUrl) {
    return `<img class="visual-image ${className}" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(label)}" loading="lazy" />`;
  }
  return `<div class="visual-fallback ${className}" aria-label="${escapeHtml(label)}"><span>${escapeHtml(label.slice(0, 2).toUpperCase())}</span></div>`;
}

function sectionVisible(config, id) {
  return config.sections?.find((section) => section.id === id)?.visible !== false;
}

function buildBody(config) {
  const projects = config.projects || [];
  const experience = config.experience || [];
  const skills = config.skills || [];
  const socials = config.social_links || [];
  const gallery = config.gallery || [];

  return `
    <header class="hero shell">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(config.handle || 'folioforge / portfolio')}</p>
        <h1>${escapeHtml(config.full_name || 'Your name')}<em>.</em></h1>
        <p class="hero-role">${escapeHtml(config.professional_title || 'Creative builder')}</p>
        <p class="hero-intro">${escapeHtml(config.short_intro || 'Build a clear story around the work you care about.')}</p>
        <div class="hero-actions">
          ${config.resume_url ? `<a class="button primary" href="${escapeHtml(config.resume_url)}" target="_blank" rel="noreferrer">Resume ↗</a>` : '<span class="button primary">Your next chapter</span>'}
          <a class="button ghost" href="#projects">See selected work</a>
        </div>
      </div>
      <div class="portrait-card">
        <div class="portrait-noise">CREATE · ITERATE · SHIP</div>
        ${visualBlock(config.avatar_url, config.full_name || 'Portrait', 'portrait-image')}
        <div class="portrait-caption"><strong>${escapeHtml(config.full_name || 'Your name')}</strong><span>${escapeHtml(config.location || 'Somewhere curious')}</span></div>
      </div>
    </header>

    <div class="ticker" aria-hidden="true"><span>BUILD WITH INTENTION · MAKE THE INVISIBLE VISIBLE · </span><span>BUILD WITH INTENTION · MAKE THE INVISIBLE VISIBLE · </span></div>

    ${sectionVisible(config, 'about') ? `
      <section class="section shell" id="about">
        <div class="section-kicker">01 / About</div>
        <div class="about-grid"><div class="about-statement">A portfolio is a point of view, not just a list of links.</div><div class="about-copy"><p>${escapeHtml(config.bio || 'Add your story in the builder.')}</p><p class="muted">${escapeHtml(config.location || '')}</p></div></div>
      </section>` : ''}

    ${sectionVisible(config, 'projects') ? `
      <section class="section shell" id="projects">
        <div class="section-heading"><div><div class="section-kicker">02 / Selected work</div><h2>Projects with a point of view.</h2></div><span class="section-count">${projects.length.toString().padStart(2, '0')} pieces</span></div>
        <div class="project-grid">${projects.map((project, index) => `<article class="project-card"><div class="project-number">0${index + 1}</div>${visualBlock(project.image_url, project.title || 'Project', 'project-image')}<div class="project-body"><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.description)}</p><div class="tag-row">${(project.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="project-links">${linkOrText('Live', project.live_url)} ${linkOrText('Code', project.repo_url)}</div></div></article>`).join('')}</div>
      </section>` : ''}

    ${sectionVisible(config, 'experience') ? `
      <section class="section shell" id="experience">
        <div class="section-kicker">03 / Experience</div><h2>Where I have been useful.</h2>
        <div class="experience-list">${experience.map((item) => `<article class="experience-row"><span class="experience-date">${escapeHtml(item.date_range)}</span><div><h3>${escapeHtml(item.role)}</h3><strong>${escapeHtml(item.organization)}</strong><p>${escapeHtml(item.description)}</p><div class="tag-row">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div></div></article>`).join('')}</div>
      </section>` : ''}

    ${sectionVisible(config, 'photo-strip') ? `<div class="photo-strip" aria-hidden="true"><div>${[...projects, ...projects].map((project) => visualBlock(project.image_url, project.title || 'Work', 'strip-image')).join('')}</div></div>` : ''}

    ${sectionVisible(config, 'skills') ? `
      <section class="section shell" id="skills"><div class="section-kicker">04 / Toolkit</div><h2>Tools I reach for.</h2><div class="skills-cloud">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div></section>` : ''}

    ${sectionVisible(config, 'gallery') && gallery.length ? `
      <section class="section shell" id="gallery"><div class="section-kicker">05 / Visual diary</div><h2>Details worth remembering.</h2><div class="gallery-grid">${gallery.map((item) => `<figure>${visualBlock(item.image_url, item.alt || item.caption || 'Gallery image', 'gallery-image')}<figcaption>${escapeHtml(item.caption)}</figcaption></figure>`).join('')}</div></section>` : ''}

    ${sectionVisible(config, 'contact') ? `
      <section class="contact shell" id="contact"><div class="section-kicker">06 / Contact</div><h2>Let's make something<br /><em>worth sharing.</em></h2><p>${escapeHtml(config.short_intro || 'Have a project in mind? I would love to hear about it.')}</p><div class="social-row">${socials.map((social) => linkOrText(social.platform, social.url)).join('')}</div>${config.email ? `<a class="email-link" href="mailto:${escapeHtml(config.email)}">${escapeHtml(config.email)}</a>` : ''}</section>` : ''}
  `;
}

export function getGeneratedFiles(project) {
  const config = project.config;
  const title = config.full_name || project.name || 'FolioForge portfolio';
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${escapeHtml(config.short_intro || title)}" />
    <title>${escapeHtml(title)} — portfolio</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>${buildBody(config)}</main>
    <footer class="footer shell">© ${escapeHtml(title)} · Built with FolioForge</footer>
    <script src="./app.js"></script>
  </body>
</html>`;

  const css = `:root {
  --bg: ${config.theme.background_color};
  --accent: ${config.theme.accent_color};
  --text: ${config.theme.text_color};
  --muted: ${config.theme.muted_color};
  --serif: Georgia, 'Times New Roman', serif;
  --sans: ${config.theme.body_font}, Inter, system-ui, sans-serif;
  --heading: ${config.theme.heading_font}, Inter, system-ui, sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.6; }
a { color: inherit; }
.shell { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
.hero { min-height: 92vh; display: grid; grid-template-columns: 1.1fr .9fr; align-items: center; gap: 7vw; padding: 90px 0 70px; }
.eyebrow, .section-kicker, .project-number, .section-count { color: var(--accent); text-transform: uppercase; letter-spacing: .16em; font: 700 11px/1 var(--sans); }
h1, h2, h3, p { margin-top: 0; }
h1, h2, h3 { font-family: var(--heading); letter-spacing: -.055em; }
h1 { font-size: clamp(4rem, 10vw, 9rem); line-height: .9; max-width: 850px; margin: 24px 0; }
h1 em, h2 em { color: var(--accent); font-family: var(--serif); font-weight: 400; }
.hero-role { font-size: clamp(1.1rem, 2vw, 1.7rem); color: var(--accent); }
.hero-intro { max-width: 530px; color: var(--muted); font-size: 1.08rem; }
.hero-actions, .social-row, .project-links, .tag-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.button { display: inline-flex; padding: 12px 17px; border-radius: 999px; text-decoration: none; font-weight: 700; }
.button.primary { background: var(--accent); color: var(--bg); }
.button.ghost { border: 1px solid color-mix(in srgb, var(--text) 30%, transparent); }
.portrait-card { min-height: 450px; padding: 18px; background: color-mix(in srgb, var(--accent) 16%, var(--bg)); border: 1px solid color-mix(in srgb, var(--text) 15%, transparent); box-shadow: 22px 26px 0 color-mix(in srgb, var(--accent) 18%, transparent); transform: rotate(3deg); }
.portrait-noise { color: var(--accent); font: 700 10px/1 var(--sans); letter-spacing: .14em; padding: 9px 0 14px; }
.portrait-image { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.portrait-caption { display: flex; justify-content: space-between; gap: 14px; padding: 15px 3px 2px; font-size: .85rem; }
.portrait-caption span, .muted { color: var(--muted); }
.visual-fallback { display: grid; place-items: center; min-height: 180px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 72%, var(--bg)), color-mix(in srgb, #d98e72 58%, var(--bg))); color: var(--bg); }
.visual-fallback span { font: 800 clamp(2rem, 7vw, 6rem)/1 var(--heading); opacity: .75; }
.ticker { display: flex; overflow: hidden; border-block: 1px solid color-mix(in srgb, var(--text) 15%, transparent); color: var(--accent); white-space: nowrap; padding: 14px 0; font-size: 11px; letter-spacing: .18em; }
.ticker span { animation: marquee 18s linear infinite; padding-right: 40px; }
@keyframes marquee { to { transform: translateX(-100%); } }
.section { padding: 120px 0; }
.section h2, .contact h2 { font-size: clamp(2.8rem, 6vw, 6.4rem); line-height: .94; margin: 18px 0 40px; max-width: 800px; }
.about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9vw; align-items: start; }
.about-statement { font: 500 clamp(2rem, 4vw, 4.4rem)/1.05 var(--heading); letter-spacing: -.055em; }
.about-copy { max-width: 560px; font-size: 1.15rem; }
.project-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
.project-card { position: relative; overflow: hidden; border: 1px solid color-mix(in srgb, var(--text) 14%, transparent); background: color-mix(in srgb, var(--text) 4%, var(--bg)); transition: transform .35s ease, box-shadow .35s ease; }
.project-card:hover { transform: translateY(-7px) rotate(-.4deg); box-shadow: 0 24px 50px color-mix(in srgb, var(--text) 16%, transparent); }
.project-card .visual-fallback, .project-image { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.project-body { padding: 25px; }
.project-body h3, .experience-row h3 { font-size: 1.6rem; margin-bottom: 8px; }
.project-body p, .experience-row p { color: var(--muted); }
.project-number { position: absolute; top: 18px; right: 18px; z-index: 1; color: var(--bg); mix-blend-mode: difference; }
.tag-row span, .skills-cloud span { border: 1px solid color-mix(in srgb, var(--text) 18%, transparent); border-radius: 999px; padding: 6px 10px; font-size: 11px; }
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
.skills-cloud span { padding: 14px 18px; font-size: 1.1rem; border-color: var(--accent); color: var(--accent); }
.gallery-grid { columns: 3 220px; column-gap: 16px; }
.gallery-grid figure { break-inside: avoid; margin: 0 0 16px; }
.gallery-image { width: 100%; min-height: 180px; object-fit: cover; }
figcaption { color: var(--muted); font-size: .82rem; padding-top: 8px; }
.contact { padding: 150px 0 100px; }
.contact > p { color: var(--muted); max-width: 500px; font-size: 1.15rem; }
.social-row { margin: 35px 0 25px; }
.social-row a { border-bottom: 1px solid var(--accent); color: var(--accent); text-decoration: none; padding-bottom: 4px; }
.email-link { font: 700 clamp(1.3rem, 3vw, 2.4rem)/1.1 var(--heading); text-decoration: none; }
.footer { padding: 30px 0 50px; border-top: 1px solid color-mix(in srgb, var(--text) 15%, transparent); color: var(--muted); font-size: .8rem; }
@media (max-width: 780px) { .shell { width: min(100% - 32px, 620px); } .hero, .about-grid { grid-template-columns: 1fr; gap: 48px; } .hero { padding-top: 55px; } .portrait-card { min-height: 0; } .project-grid { grid-template-columns: 1fr; } .experience-row { grid-template-columns: 1fr; gap: 8px; } .section { padding: 80px 0; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; } }
`;

  const js = `const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion) {
  document.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('mousemove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = 'perspective(900px) rotateX(' + (y * -3) + 'deg) rotateY(' + (x * 4) + 'deg) translateY(-7px)';
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}
`;

  const readme = `# ${title}\n\nGenerated by FolioForge.\n\n## Run locally\n\nServe this folder with any static server, or deploy it to Vercel, Netlify, GitHub Pages, or another static host.\n\n- Edit content in index.html.\n- Customize the visual system in styles.css.\n- Keep app.js for the lightweight project-card interaction.\n`;

  return {
    'index.html': html,
    'styles.css': css,
    'app.js': js,
    'README.md': readme,
    'folioforge-data.json': `${safeJson(config)}\n`,
  };
}

export async function downloadProjectZip(project) {
  const zip = new JSZip();
  const files = getGeneratedFiles(project);
  Object.entries(files).forEach(([path, content]) => zip.file(path, content));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(project.name || 'folioforge-portfolio').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(project.name || 'folioforge-project').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
