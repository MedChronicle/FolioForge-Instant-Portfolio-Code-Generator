export const SCHEMA_VERSION = 2;

const DRAFT_KEY = 'folioforge-draft-v1'; // key kept so existing drafts load
const PROJECTS_KEY = 'folioforge-projects-v1';


export const sectionLabels = {
  about: 'About',
  projects: 'Projects',
  experience: 'Experience',
  education: 'Education',
  'photo-strip': 'Photo strip',
  skills: 'Skills',
  services: 'Services',
  certifications: 'Certifications',
  testimonials: 'Testimonials',
  gallery: 'Gallery',
  contact: 'Contact',
};

/** Order + default visibility for every known section. */
const DEFAULT_SECTIONS = [
  { id: 'about', visible: true },
  { id: 'projects', visible: true },
  { id: 'experience', visible: true },
  { id: 'education', visible: false },
  { id: 'photo-strip', visible: true },
  { id: 'skills', visible: true },
  { id: 'services', visible: false },
  { id: 'certifications', visible: false },
  { id: 'testimonials', visible: false },
  { id: 'gallery', visible: true },
  { id: 'contact', visible: true },
];

export const fontOptions = {
  heading: ['Space Grotesk', 'Playfair Display', 'DM Serif Display', 'Sora', 'Outfit', 'JetBrains Mono', 'Fraunces'],
  body: ['Inter', 'DM Sans', 'Manrope', 'Source Sans 3', 'IBM Plex Sans', 'Work Sans'],
};

export const animationLevels = ['none', 'subtle', 'expressive', 'playful'];
export const contentWidths = ['narrow', 'comfortable', 'wide', 'full'];
export const layoutDensities = ['compact', 'comfortable', 'spacious'];

export const socialPlatforms = [
  'GitHub', 'LinkedIn', 'X / Twitter', 'Instagram', 'YouTube', 'Dribbble',
  'Behance', 'Medium', 'Dev.to', 'Kaggle', 'LeetCode', 'Website',
];

export const templatePresets = [
  {
    id: 'creative-editorial',
    name: 'Creative Editorial',
    description: 'Warm ivory, expressive typography, layered cards, and art-directed motion.',
    tone: 'warm-editorial',
    fonts: { heading_font: 'Playfair Display', body_font: 'Inter' },
    colors: { background_color: '#f6f0e7', accent_color: '#315c42', text_color: '#1f1f1f', muted_color: '#6d6a63' },
  },
  {
    id: 'minimal-professional',
    name: 'Minimal Professional',
    description: 'Quiet contrast, clean grids, and a case-study-first reading experience.',
    tone: 'minimal',
    fonts: { heading_font: 'Space Grotesk', body_font: 'Inter' },
    colors: { background_color: '#f7f8fa', accent_color: '#2457d6', text_color: '#15171b', muted_color: '#687080' },
  },
  {
    id: 'dark-futuristic',
    name: 'Dark Futuristic',
    description: 'Deep canvas, luminous accents, and a technical atmosphere for bold builders.',
    tone: 'futuristic',
    fonts: { heading_font: 'Sora', body_font: 'DM Sans' },
    colors: { background_color: '#101217', accent_color: '#7ce2c1', text_color: '#f4f4ee', muted_color: '#a0a6b2' },
  },
  {
    id: 'developer-terminal',
    name: 'Developer Terminal',
    description: 'Terminal cues, structured information, and a direct engineering voice.',
    tone: 'terminal',
    fonts: { heading_font: 'JetBrains Mono', body_font: 'IBM Plex Sans' },
    colors: { background_color: '#0c1110', accent_color: '#a7f36b', text_color: '#e9f5eb', muted_color: '#91a397' },
  },
  {
    id: 'modern-glass',
    name: 'Modern Glass',
    description: 'Soft gradients and translucent surfaces with a product-design polish.',
    tone: 'glass',
    fonts: { heading_font: 'Outfit', body_font: 'Manrope' },
    colors: { background_color: '#e9eefb', accent_color: '#6449d8', text_color: '#1f2131', muted_color: '#656b84' },
  },
  {
    id: 'playful-experimental',
    name: 'Playful Experimental',
    description: 'Unexpected composition, bright color moments, and expressive interaction.',
    tone: 'experimental',
    fonts: { heading_font: 'Fraunces', body_font: 'Work Sans' },
    colors: { background_color: '#fff4dc', accent_color: '#ec5a39', text_color: '#211b24', muted_color: '#806b61' },
  },
  {
    id: 'brutalist-bold',
    name: 'Brutalist Bold',
    description: 'Hard borders, oversized type, and unapologetic high-contrast blocks.',
    tone: 'brutalist',
    fonts: { heading_font: 'Space Grotesk', body_font: 'Work Sans' },
    colors: { background_color: '#ffffff', accent_color: '#ff3b30', text_color: '#000000', muted_color: '#4a4a4a' },
  },
  {
    id: 'midnight-aurora',
    name: 'Midnight Aurora',
    description: 'Deep indigo night with aurora gradients and soft glowing highlights.',
    tone: 'aurora',
    fonts: { heading_font: 'Sora', body_font: 'Inter' },
    colors: { background_color: '#0b1020', accent_color: '#8b7bff', text_color: '#eef0ff', muted_color: '#9aa2c7' },
  },
  {
    id: 'soft-pastel',
    name: 'Soft Pastel',
    description: 'Gentle blush tones, rounded shapes, and a friendly, approachable feel.',
    tone: 'pastel',
    fonts: { heading_font: 'DM Serif Display', body_font: 'DM Sans' },
    colors: { background_color: '#fdf1f3', accent_color: '#d6457a', text_color: '#2b1d24', muted_color: '#8a6b76' },
  },
];

export const templateById = Object.fromEntries(templatePresets.map((t) => [t.id, t]));

/* ------------------------------ Utilities -------------------------- */

export function createId(prefix = 'item') {
  const uid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
  return `${prefix}-${uid}`;
}

export function cloneProject(project) {
  if (typeof structuredClone === 'function') return structuredClone(project);
  return JSON.parse(JSON.stringify(project));
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asString = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const asArray = (v) => (Array.isArray(v) ? v : []);
const asStringArray = (v) => asArray(v).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

export function slugify(text) {
  return asString(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'portfolio';
}

/** Allow only http(s) and mailto links. Blocks javascript:, data:, etc. */
export function isSafeUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url, 'https://placeholder.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol);
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  const value = asString(url).trim();
  if (!value) return '';
  if (/^(https?:|mailto:|tel:|blob:|data:image\/)/i.test(value)) return isSafeUrl(value) || value.startsWith('blob:') || value.startsWith('data:image/') ? value : '';
  if (value.startsWith('/')) return value;
  const withScheme = `https://${value}`;
  return isSafeUrl(withScheme) ? withScheme : '';
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(asString(email).trim());
}

/* ----------------------- Color / accessibility --------------------- */

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(asString(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two hex colors (1 to 21), or null if invalid. */
export function getContrastRatio(fg, bg) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function getContrastGrade(ratio) {
  if (ratio == null) return 'unknown';
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'fail';
}

export function checkThemeAccessibility(theme) {
  const pairs = [
    ['Body text', theme.text_color, theme.background_color],
    ['Muted text', theme.muted_color, theme.background_color],
    ['Accent on background', theme.accent_color, theme.background_color],
  ];
  return pairs.map(([label, fg, bg]) => {
    const ratio = getContrastRatio(fg, bg);
    return { label, ratio: ratio && Math.round(ratio * 100) / 100, grade: getContrastGrade(ratio) };
  });
}

/* ------------------------------ Defaults --------------------------- */

function emptyProject() {
  return {
    id: createId('proj'),
    schema_version: SCHEMA_VERSION,
    name: 'My FolioForge portfolio',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: {
      template_id: 'creative-editorial',
      full_name: 'Your Name',
      handle: '@yourhandle',
      professional_title: 'AI engineer & full-stack developer',
      short_intro: 'I turn ambitious ideas into clear, useful, and beautifully engineered digital experiences.',
      bio: 'Write a concise story about what you build, how you think, and the kind of people or problems you enjoy working with.',
      location: 'Your city, country',
      email: 'hello@example.com',
      phone: '',
      availability: { status: 'open', label: 'Open to opportunities' },
      resume_url: '',
      avatar_url: '',
      social_links: [
        { platform: 'GitHub', url: 'https://github.com/' },
        { platform: 'LinkedIn', url: 'https://www.linkedin.com/' },
      ],
      stats: [],
      skills: ['React', 'Python', 'AI / ML', 'Product thinking', 'Systems design'],
      projects: [
        {
          id: createId('project'),
          title: 'A thoughtful product',
          description: 'A short explanation of the problem, the approach, and the result.',
          image_url: '',
          tags: ['React', 'Design systems'],
          live_url: '',
          repo_url: '',
          featured: true,
        },
        {
          id: createId('project'),
          title: 'An intelligent workflow',
          description: 'Show the decision-making and the craft behind a meaningful build.',
          image_url: '',
          tags: ['Python', 'Automation'],
          live_url: '',
          repo_url: '',
          featured: false,
        },
      ],
      experience: [
        {
          id: createId('experience'),
          date_range: '2024 — Present',
          role: 'Builder / researcher',
          organization: 'Your team or studio',
          description: 'Describe the work, the context, and the change you helped create.',
          tags: ['Strategy', 'Engineering'],
          url: '',
        },
      ],
      education: [],
      services: [],
      certifications: [],
      testimonials: [],
      gallery: [],
      sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
      seo: {
        title: '',
        description: '',
        og_image_url: '',
        language: 'en',
      },
      theme: {
        background_color: '#f6f0e7',
        accent_color: '#315c42',
        text_color: '#1f1f1f',
        muted_color: '#6d6a63',
        heading_font: 'Space Grotesk',
        body_font: 'Inter',
        animation_intensity: 'expressive',
        content_width: 'comfortable',
        density: 'comfortable',
        dark_mode: 'auto',
      },
    },
  };
}

export function createDefaultProject() {
  return emptyProject();
}

/* --------------------- Normalize / migrate / validate -------------- */

const normLink = (l) => ({
  platform: asString(l?.platform, 'Website'),
  url: normalizeUrl(l?.url),
});

const normProject = (p) => ({
  id: asString(p?.id) || createId('project'),
  title: asString(p?.title),
  description: asString(p?.description),
  image_url: normalizeUrl(p?.image_url),
  tags: asStringArray(p?.tags),
  live_url: normalizeUrl(p?.live_url),
  repo_url: normalizeUrl(p?.repo_url),
  featured: Boolean(p?.featured),
});

const normExperience = (e) => ({
  id: asString(e?.id) || createId('experience'),
  date_range: asString(e?.date_range),
  role: asString(e?.role),
  organization: asString(e?.organization),
  description: asString(e?.description),
  tags: asStringArray(e?.tags),
  url: normalizeUrl(e?.url),
});

const normEducation = (e) => ({
  id: asString(e?.id) || createId('education'),
  date_range: asString(e?.date_range),
  degree: asString(e?.degree ?? e?.role),
  institution: asString(e?.institution ?? e?.organization),
  description: asString(e?.description),
  grade: asString(e?.grade),
});

const normService = (s) => ({
  id: asString(s?.id) || createId('service'),
  title: asString(s?.title),
  description: asString(s?.description),
  icon: asString(s?.icon, 'sparkles'),
});

const normCertification = (c) => ({
  id: asString(c?.id) || createId('cert'),
  title: asString(c?.title),
  issuer: asString(c?.issuer),
  date: asString(c?.date),
  url: normalizeUrl(c?.url),
});

const normTestimonial = (t) => ({
  id: asString(t?.id) || createId('testimonial'),
  quote: asString(t?.quote),
  author: asString(t?.author),
  role: asString(t?.role),
  avatar_url: normalizeUrl(t?.avatar_url),
});

const normGalleryItem = (g) =>
  typeof g === 'string'
    ? { id: createId('gallery'), url: normalizeUrl(g), caption: '' }
    : { id: asString(g?.id) || createId('gallery'), url: normalizeUrl(g?.url ?? g?.image_url), caption: asString(g?.caption) };

const normStat = (s) => ({
  id: asString(s?.id) || createId('stat'),
  label: asString(s?.label),
  value: asString(String(s?.value ?? '')),
});

/** Keep user order, drop unknown/duplicate ids, append any missing known section. */
function normalizeSections(sections) {
  const seen = new Set();
  const result = [];
  for (const s of asArray(sections)) {
    if (s && sectionLabels[s.id] && !seen.has(s.id)) {
      seen.add(s.id);
      result.push({ id: s.id, visible: s.visible !== false });
    }
  }
  for (const def of DEFAULT_SECTIONS) {
    if (!seen.has(def.id)) result.push({ ...def, visible: false }); // new sections start hidden for old projects
  }
  return result;
}

/**
 * Turn ANY input (old draft, imported JSON, partial object) into a valid
 * current-schema project. Never throws; always returns a usable project.
 */
export function normalizeProject(input) {
  const base = emptyProject();
  if (!isPlainObject(input)) return base;

  const cfg = isPlainObject(input.config) ? input.config : {};
  const theme = isPlainObject(cfg.theme) ? cfg.theme : {};
  const templateId = templateById[cfg.template_id] ? cfg.template_id : base.config.template_id;
  const bt = base.config.theme;
  const color = (v, fallback) => (hexToRgb(v) ? v : fallback);

  return {
    id: asString(input.id) || base.id,
    schema_version: SCHEMA_VERSION,
    name: asString(input.name, base.name).trim() || base.name,
    created_at: asString(input.created_at) || base.created_at,
    updated_at: asString(input.updated_at) || base.updated_at,
    config: {
      template_id: templateId,
      full_name: asString(cfg.full_name, base.config.full_name),
      handle: asString(cfg.handle, base.config.handle),
      professional_title: asString(cfg.professional_title, base.config.professional_title),
      short_intro: asString(cfg.short_intro, base.config.short_intro),
      bio: asString(cfg.bio, base.config.bio),
      location: asString(cfg.location, base.config.location),
      email: asString(cfg.email, base.config.email),
      phone: asString(cfg.phone),
      availability: {
        status: oneOf(cfg.availability?.status, ['open', 'busy', 'closed'], 'open'),
        label: asString(cfg.availability?.label, base.config.availability.label),
      },
      resume_url: normalizeUrl(cfg.resume_url),
      avatar_url: normalizeUrl(cfg.avatar_url),
      social_links: asArray(cfg.social_links).map(normLink),
      stats: asArray(cfg.stats).map(normStat),
      skills: asStringArray(cfg.skills),
      projects: asArray(cfg.projects).map(normProject),
      experience: asArray(cfg.experience).map(normExperience),
      education: asArray(cfg.education).map(normEducation),
      services: asArray(cfg.services).map(normService),
      certifications: asArray(cfg.certifications).map(normCertification),
      testimonials: asArray(cfg.testimonials).map(normTestimonial),
      gallery: asArray(cfg.gallery).map(normGalleryItem),
      sections: normalizeSections(cfg.sections),
      seo: {
        title: asString(cfg.seo?.title),
        description: asString(cfg.seo?.description),
        og_image_url: normalizeUrl(cfg.seo?.og_image_url),
        language: asString(cfg.seo?.language, 'en'),
      },
      theme: {
        background_color: color(theme.background_color, bt.background_color),
        accent_color: color(theme.accent_color, bt.accent_color),
        text_color: color(theme.text_color, bt.text_color),
        muted_color: color(theme.muted_color, bt.muted_color),
        heading_font: asString(theme.heading_font, bt.heading_font),
        body_font: asString(theme.body_font, bt.body_font),
        animation_intensity: oneOf(theme.animation_intensity, animationLevels, bt.animation_intensity),
        content_width: oneOf(theme.content_width, contentWidths, bt.content_width),
        density: oneOf(theme.density, layoutDensities, bt.density),
        dark_mode: oneOf(theme.dark_mode, ['auto', 'light', 'dark'], bt.dark_mode),
      },
    },
  };
}

/** Human-readable problems (does not block saving; use for a checklist UI). */
export function validateProject(project) {
  const c = project?.config ?? {};
  const issues = [];
  const add = (level, field, message) => issues.push({ level, field, message });

  if (!asString(c.full_name).trim() || c.full_name === 'Your Name') add('warning', 'full_name', 'Add your real name.');
  if (!isValidEmail(c.email) || c.email === 'hello@example.com') add('warning', 'email', 'Add a valid contact email.');
  if (!asString(c.short_intro).trim()) add('warning', 'short_intro', 'Add a short intro for the hero section.');
  if (!asArray(c.projects).some((p) => p.title && p.title !== 'A thoughtful product')) {
    add('info', 'projects', 'Replace the sample projects with your own work.');
  }
  asArray(c.projects).forEach((p, i) => {
    if (!p.title?.trim()) add('error', `projects.${i}.title`, `Project ${i + 1} needs a title.`);
    if (!p.image_url) add('info', `projects.${i}.image_url`, `Project "${p.title || i + 1}" has no cover image.`);
  });
  for (const check of checkThemeAccessibility(c.theme ?? {})) {
    if (check.grade === 'fail') add('warning', 'theme', `${check.label} has low contrast (${check.ratio}:1).`);
  }
  return issues;
}

/** 0 to 100 profile completeness score. */
export function getCompleteness(project) {
  const c = project?.config ?? {};
  const checks = [
    c.full_name && c.full_name !== 'Your Name',
    c.professional_title,
    c.short_intro,
    c.bio && !c.bio.startsWith('Write a concise'),
    c.avatar_url,
    c.email && c.email !== 'hello@example.com',
    c.location && c.location !== 'Your city, country',
    asArray(c.social_links).some((l) => l.url),
    asArray(c.skills).length >= 3,
    asArray(c.projects).some((p) => p.title && p.image_url),
    asArray(c.experience).length > 0,
    c.resume_url,
    c.seo?.description,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/* ----------------------- Immutable update helpers ------------------ */

/** setIn(project, 'config.theme.accent_color', '#fff') returns a new object. */
export function setIn(obj, path, value) {
  const keys = Array.isArray(path) ? path : String(path).split('.');
  const [head, ...rest] = keys;
  const key = Array.isArray(obj) ? Number(head) : head;
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  next[key] = rest.length ? setIn(obj?.[key] ?? {}, rest, value) : value;
  return next;
}

export function touch(project) {
  return { ...project, updated_at: new Date().toISOString() };
}

export function updateConfig(project, path, value) {
  return touch(setIn(project, `config.${path}`, value));
}

export function applyTemplate(project, templateId, { keepFonts = false } = {}) {
  const preset = templateById[templateId];
  if (!preset) return project;
  const theme = {
    ...project.config.theme,
    ...preset.colors,
    ...(keepFonts ? {} : preset.fonts),
  };
  return touch({ ...project, config: { ...project.config, template_id: templateId, theme } });
}

export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function reorderSections(project, from, to) {
  return updateConfig(project, 'sections', moveItem(project.config.sections, from, to));
}

export function toggleSection(project, sectionId) {
  const sections = project.config.sections.map((s) => (s.id === sectionId ? { ...s, visible: !s.visible } : s));
  return updateConfig(project, 'sections', sections);
}

export function addItem(project, listKey, item) {
  return updateConfig(project, listKey, [...project.config[listKey], item]);
}

export function removeItem(project, listKey, id) {
  return updateConfig(project, listKey, project.config[listKey].filter((x) => x.id !== id));
}

export function duplicateProject(project) {
  const copy = cloneProject(project);
  const now = new Date().toISOString();
  return { ...copy, id: createId('proj'), name: `${project.name} (copy)`, created_at: now, updated_at: now };
}

/* ---------------------------- Undo / redo -------------------------- */

export function createHistory(initial, limit = 100) {
  return { past: [], present: initial, future: [], limit };
}

export function historyPush(history, next) {
  if (next === history.present) return history;
  const past = [...history.past, history.present].slice(-history.limit);
  return { ...history, past, present: next, future: [] };
}

export function historyUndo(history) {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return { ...history, past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function historyRedo(history) {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return { ...history, past: [...history.past, history.present], present: next, future };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

/* ------------------------------ Storage ---------------------------- */

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError' || error?.code === 22;
    return { ok: false, reason: quota ? 'quota' : 'unavailable', error };
  }
}

export function loadDraft() {
  return normalizeProject(readJson(DRAFT_KEY));
}

export function saveDraft(project) {
  return writeJson(DRAFT_KEY, touch(project));
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Debounced autosave. Returns { save, flush, cancel }. Flushes on tab hide. */
export function createAutosaver(delay = 600, onResult) {
  let timer = null;
  let pending = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) {
      const result = saveDraft(pending);
      pending = null;
      onResult?.(result);
    }
  };

  const onHide = () => document.visibilityState === 'hidden' && flush();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);

  return {
    save(project) {
      pending = project;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    },
  };
}

export function loadSavedProjects() {
  const stored = readJson(PROJECTS_KEY);
  return asArray(stored).map(normalizeProject);
}

export function saveProjects(projects) {
  return writeJson(PROJECTS_KEY, projects);
}

export function upsertSavedProject(project) {
  const projects = loadSavedProjects();
  const saved = touch(project);
  const index = projects.findIndex((p) => p.id === saved.id);
  if (index >= 0) projects[index] = saved;
  else projects.unshift(saved);
  return { ...saveProjects(projects), projects };
}

export function deleteSavedProject(id) {
  const projects = loadSavedProjects().filter((p) => p.id !== id);
  return { ...saveProjects(projects), projects };
}

/* --------------------------- Import / export ----------------------- */

export function exportProjectJson(project) {
  return JSON.stringify({ app: 'folioforge', schema_version: SCHEMA_VERSION, project }, null, 2);
}

export function exportFileName(project) {
  return `${slugify(project.config?.full_name || project.name)}-folioforge.json`;
}

/** Parse + normalize imported JSON. Returns { ok, project } or { ok:false, error }. */
export function importProjectJson(text) {
  try {
    const data = JSON.parse(text);
    const raw = data?.app === 'folioforge' ? data.project : data;
    if (!isPlainObject(raw) || !isPlainObject(raw.config)) {
      return { ok: false, error: 'This file is not a FolioForge project.' };
    }
    const project = normalizeProject(raw);
    project.id = createId('proj'); // never collide with an existing project
    return { ok: true, project };
  } catch {
    return { ok: false, error: 'Could not read that file. Is it valid JSON?' };
  }
}

export function downloadTextFile(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
