import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Github, Linkedin, Mail, Sparkles } from 'lucide-react';
import { resolveApiUrl } from '../lib/api';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_ORDER = ['about', 'projects', 'experience', 'photo-strip', 'skills', 'gallery', 'contact'];
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const pad = (n) => String(n).padStart(2, '0');

function initials(value = 'FF') {
  return (
    String(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'FF'
  );
}

/** Blocks javascript:/data: URLs coming from user-editable config. */
function safeHref(url, fallback = undefined) {
  if (!url || typeof url !== 'string') return fallback;
  if (url.startsWith('#') || url.startsWith('/')) return url;
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : fallback;
  } catch {
    return fallback;
  }
}

const isExternal = (href = '') => /^https?:/i.test(href);

const SOCIAL_ICONS = [
  [/github/i, Github],
  [/linkedin/i, Linkedin],
  [/mail/i, Mail],
];

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

const PreviewImage = memo(function PreviewImage({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        className={`preview-image ${className}`}
        src={resolveApiUrl(src)}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`preview-image preview-fallback ${className}`} role="img" aria-label={alt}>
      <span aria-hidden="true">{initials(alt)}</span>
    </div>
  );
});

function SocialIcon({ platform = '' }) {
  const Icon = SOCIAL_ICONS.find(([pattern]) => pattern.test(platform))?.[1] || ArrowUpRight;
  return <Icon size={15} aria-hidden="true" />;
}

function SafeLink({ href, children, ...rest }) {
  const url = safeHref(href);
  if (!url) return null;
  const external = isExternal(url);
  return (
    <a href={url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {children}
    </a>
  );
}

function Tags({ items }) {
  if (!items?.length) return null;
  return (
    <div className="preview-tags">
      {items.map((tag, i) => (
        <span key={`${tag}-${i}`}>{tag}</span>
      ))}
    </div>
  );
}

function SectionShell({ id, label, selectedSection, onSelectSection, interactive, children, className = '' }) {
  const ref = useRef(null);
  const selected = selectedSection === id;
  const headingId = `preview-${id}-label`;

  // Bring the section into view when it is picked from the editor sidebar.
  useEffect(() => {
    if (!selected || !interactive) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [selected, interactive]);

  const select = () => onSelectSection?.(id);
  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  };

  return (
    <section
      ref={ref}
      id={`preview-${id}`}
      className={`portfolio-section ${selected ? 'is-selected' : ''} ${className}`}
      aria-labelledby={headingId}
      aria-current={selected ? 'true' : undefined}
      onClick={select}
      {...(interactive ? { tabIndex: 0, onKeyDown } : {})}
    >
      <div className="preview-section-label" id={headingId}>
        {label}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section renderers (registry keeps the main component declarative)   */
/* ------------------------------------------------------------------ */

const SECTION_META = {
  about: '01 / About',
  projects: '02 / Selected work',
  experience: '03 / Experience',
  'photo-strip': 'Visual diary',
  skills: '04 / Toolkit',
  gallery: '05 / Gallery',
  contact: '06 / Contact',
};

const SECTION_RENDERERS = {
  about: ({ config }) => (
    <div className="preview-about-grid">
      <h2>
        A portfolio is a <em>point of view.</em>
      </h2>
      <div>
        <p>{config.bio || 'Add your story in the Basics step.'}</p>
        <span className="preview-muted">{config.location || 'Your location'}</span>
      </div>
    </div>
  ),

  projects: ({ data }) => (
    <>
      <div className="preview-section-heading">
        <h2>Selected work.</h2>
        <span>{pad(data.projects.length)} pieces</span>
      </div>
      {data.projects.length ? (
        <div className="preview-project-grid">
          {data.projects.map((item, index) => (
            <article className="preview-project-card" key={item.id || `${item.title}-${index}`}>
              <div className="preview-project-number">{pad(index + 1)}</div>
              <PreviewImage src={item.image_url} alt={item.title || 'Project'} className="project-preview-image" />
              <div className="preview-project-body">
                <h3>{item.title || 'Untitled project'}</h3>
                <p>{item.description || 'Add a short project story.'}</p>
                <Tags items={item.tags} />
                <div className="preview-link-row">
                  <SafeLink href={item.live_url}>
                    Live <ArrowUpRight size={13} aria-hidden="true" />
                  </SafeLink>
                  <SafeLink href={item.repo_url}>
                    Code <ArrowUpRight size={13} aria-hidden="true" />
                  </SafeLink>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="preview-empty">Your projects will land here.</div>
      )}
    </>
  ),

  experience: ({ data }) => (
    <>
      <h2>Where I have been useful.</h2>
      <div className="preview-experience-list">
        {data.experience.length ? (
          data.experience.map((item, index) => (
            <article className="preview-experience-row" key={item.id || `${item.role}-${index}`}>
              <span>{item.date_range}</span>
              <div>
                <h3>{item.role || 'Role'}</h3>
                <strong>{item.organization || 'Organization'}</strong>
                <p>{item.description || 'Describe the work and the change you helped create.'}</p>
                <Tags items={item.tags} />
              </div>
            </article>
          ))
        ) : (
          <div className="preview-empty">Add your experience in the Content step.</div>
        )}
      </div>
    </>
  ),

  'photo-strip': ({ data }) => (
    <div className="preview-photo-strip">
      {data.strip.map((item, index) => (
        <PreviewImage
          key={`${item.id ?? item.title ?? 'item'}-${index}`}
          src={item.image_url}
          alt={item.title || 'Portfolio detail'}
          className="strip-preview-image"
        />
      ))}
    </div>
  ),

  skills: ({ data }) => (
    <>
      <h2>Tools I reach for.</h2>
      <ul className="preview-skills" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {data.skills.length ? (
          data.skills.map((skill, i) => <li key={`${skill}-${i}`}><span>{skill}</span></li>)
        ) : (
          <li><span className="preview-muted">Add skills in the Content step.</span></li>
        )}
      </ul>
    </>
  ),

  gallery: ({ data }) => (
    <>
      <h2>Details worth remembering.</h2>
      {data.gallery.length ? (
        <div className="preview-gallery">
          {data.gallery.map((item, index) => (
            <figure key={item.id || `${item.caption}-${index}`}>
              <PreviewImage
                src={item.image_url}
                alt={item.alt || item.caption || 'Gallery image'}
                className="gallery-preview-image"
              />
              {item.caption && <figcaption>{item.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : (
        <div className="preview-empty">
          <Sparkles size={18} aria-hidden="true" /> Add photos when you are ready.
        </div>
      )}
    </>
  ),

  contact: ({ config, data }) => (
    <>
      <h2>
        Let's make something <em>worth sharing.</em>
      </h2>
      <p>{config.short_intro || 'Have a project in mind? I would love to hear about it.'}</p>
      <div className="preview-socials">
        {data.socialLinks.map((social, index) => (
          <SafeLink key={`${social.platform}-${social.url}-${index}`} href={social.url}>
            <SocialIcon platform={social.platform} /> {social.platform}
          </SafeLink>
        ))}
      </div>
      {config.email && (
        <a className="preview-email" href={`mailto:${config.email}`}>
          {config.email}
        </a>
      )}
    </>
  ),
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

function PortfolioPreview({
  project,
  mode = 'desktop',
  selectedSection = null,
  onSelectSection,
  readOnly = false,
}) {
  const config = project?.config ?? {};
  const theme = config.theme ?? {};
  const interactive = !readOnly && typeof onSelectSection === 'function';

  const data = useMemo(() => {
    const projects = config.projects ?? [];
    return {
      projects,
      experience: config.experience ?? [],
      gallery: config.gallery ?? [],
      skills: config.skills ?? [],
      socialLinks: config.social_links ?? [],
      strip: [...projects, ...projects].slice(0, 8),
    };
  }, [config.projects, config.experience, config.gallery, config.skills, config.social_links]);

  /** Respect the order and visibility defined in config.sections. */
  const orderedSections = useMemo(() => {
    const configured = config.sections ?? [];
    const known = configured.filter((s) => SECTION_RENDERERS[s.id]);
    const missing = DEFAULT_ORDER.filter((id) => !known.some((s) => s.id === id));
    return [...known.map((s) => ({ id: s.id, visible: s.visible !== false })), ...missing.map((id) => ({ id, visible: true }))]
      .filter((s) => s.visible)
      .map((s) => s.id);
  }, [config.sections]);

  const cssVars = useMemo(
    () => ({
      '--preview-bg': theme.background_color || '#f6f0e7',
      '--preview-accent': theme.accent_color || '#315c42',
      '--preview-text': theme.text_color || '#1f1f1f',
      '--preview-muted': theme.muted_color || '#6d6a63',
      '--preview-heading': theme.heading_font || 'Space Grotesk',
      '--preview-body': theme.body_font || 'Inter',
    }),
    [theme],
  );

  // In the editor, clicks on the canvas shouldn't trigger real navigation.
  const handleClick = useCallback(
    (event) => {
      if (readOnly) return;
      const link = event.target.closest('a');
      if (link && !link.getAttribute('href')?.startsWith('#')) event.preventDefault();
      event.stopPropagation();
    },
    [readOnly],
  );

  const name = config.full_name || 'Your Name';
  const tickerText = `MAKE THE INVISIBLE VISIBLE · ${name.toUpperCase()} · `;

  return (
    <div
      className={`portfolio-preview preview-${mode} template-${config.template_id || 'creative-editorial'}`}
      style={cssVars}
      onClick={handleClick}
    >
      <div className="preview-grain" aria-hidden="true" />
      <div className="preview-inner">
        <header className="preview-hero">
          <div className="preview-hero-copy">
            <div className="preview-eyebrow">
              <span className="status-dot" aria-hidden="true" /> {config.handle || '@yourhandle'}
            </div>
            <h1>
              {name}
              <em>.</em>
            </h1>
            <p className="preview-role">{config.professional_title || 'AI engineer & full-stack developer'}</p>
            <p className="preview-intro">{config.short_intro || 'Your intro will appear here.'}</p>
            <div className="preview-actions">
              <SafeLink className="preview-button primary" href={config.resume_url || '#preview-contact'}>
                Resume <ArrowUpRight size={15} aria-hidden="true" />
              </SafeLink>
              <a className="preview-button ghost" href="#preview-projects">
                Explore work
              </a>
            </div>
          </div>
          <div className="preview-portrait-card">
            <div className="preview-card-word">CREATE · ITERATE · SHIP</div>
            <PreviewImage
              src={config.avatar_url}
              alt={config.full_name || 'Portrait'}
              className="portrait-preview-image"
            />
            <div className="preview-portrait-caption">
              <strong>{name}</strong>
              <span>{config.location || 'Your city'}</span>
            </div>
          </div>
        </header>

        <div className="preview-ticker" aria-hidden="true">
          <span>{tickerText}</span>
          <span>{tickerText}</span>
        </div>

        {orderedSections.map((id) => {
          const Render = SECTION_RENDERERS[id];
          return (
            <SectionShell
              key={id}
              id={id}
              label={SECTION_META[id]}
              selectedSection={selectedSection}
              onSelectSection={onSelectSection}
              interactive={interactive}
              className={
                id === 'photo-strip' ? 'preview-photo-section' : id === 'contact' ? 'preview-contact' : ''
              }
            >
              <Render config={config} data={data} />
            </SectionShell>
          );
        })}

        <footer className="preview-footer">© {name} · Built with FolioForge</footer>
      </div>
    </div>
  );
}

export default memo(PortfolioPreview);
