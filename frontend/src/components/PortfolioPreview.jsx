import React from 'react';
import { ArrowUpRight, Github, Linkedin, Mail, Sparkles } from 'lucide-react';
import { resolveApiUrl } from '../lib/api';

function initials(value = 'FF') {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'FF';
}

function PreviewImage({ src, alt, className = '' }) {
  if (src) {
    return <img className={`preview-image ${className}`} src={resolveApiUrl(src)} alt={alt} loading="lazy" />;
  }
  return <div className={`preview-image preview-fallback ${className}`} aria-label={alt}><span>{initials(alt)}</span></div>;
}

function SocialIcon({ platform }) {
  if (platform.toLowerCase().includes('github')) return <Github size={15} />;
  if (platform.toLowerCase().includes('linkedin')) return <Linkedin size={15} />;
  if (platform.toLowerCase().includes('mail') || platform.toLowerCase().includes('email')) return <Mail size={15} />;
  return <ArrowUpRight size={15} />;
}

function SectionShell({ id, label, selectedSection, onSelectSection, children, className = '' }) {
  const selected = selectedSection === id;
  return (
    <section
      className={`portfolio-section ${selected ? 'is-selected' : ''} ${className}`}
      id={`preview-${id}`}
      onClick={() => onSelectSection?.(id)}
    >
      <div className="preview-section-label">{label}</div>
      {children}
    </section>
  );
}

export default function PortfolioPreview({
  project,
  mode = 'desktop',
  selectedSection = null,
  onSelectSection,
  readOnly = false,
}) {
  const config = project?.config || {};
  const theme = config.theme || {};
  const sections = config.sections || [];
  const isVisible = (id) => sections.find((section) => section.id === id)?.visible !== false;
  const projectItems = config.projects || [];
  const experienceItems = config.experience || [];
  const galleryItems = config.gallery || [];
  const skills = config.skills || [];
  const socialLinks = config.social_links || [];

  const handleClick = (event) => {
    if (readOnly) return;
    if (event.target.closest('a, button')) return;
    event.stopPropagation();
  };

  return (
    <div
      className={`portfolio-preview preview-${mode} template-${config.template_id || 'creative-editorial'}`}
      style={{
        '--preview-bg': theme.background_color || '#f6f0e7',
        '--preview-accent': theme.accent_color || '#315c42',
        '--preview-text': theme.text_color || '#1f1f1f',
        '--preview-muted': theme.muted_color || '#6d6a63',
        '--preview-heading': theme.heading_font || 'Space Grotesk',
        '--preview-body': theme.body_font || 'Inter',
      }}
      onClick={handleClick}
    >
      <div className="preview-grain" aria-hidden="true" />
      <div className="preview-inner">
        <header className="preview-hero">
          <div className="preview-hero-copy">
            <div className="preview-eyebrow"><span className="status-dot" /> {config.handle || '@yourhandle'}</div>
            <h1>{config.full_name || 'Your Name'}<em>.</em></h1>
            <p className="preview-role">{config.professional_title || 'AI engineer & full-stack developer'}</p>
            <p className="preview-intro">{config.short_intro || 'Your intro will appear here.'}</p>
            <div className="preview-actions">
              <a className="preview-button primary" href={config.resume_url || '#preview-contact'}>Resume <ArrowUpRight size={15} /></a>
              <a className="preview-button ghost" href="#preview-projects">Explore work</a>
            </div>
          </div>
          <div className="preview-portrait-card">
            <div className="preview-card-word">CREATE · ITERATE · SHIP</div>
            <PreviewImage src={config.avatar_url} alt={config.full_name || 'Portrait'} className="portrait-preview-image" />
            <div className="preview-portrait-caption"><strong>{config.full_name || 'Your Name'}</strong><span>{config.location || 'Your city'}</span></div>
          </div>
        </header>

        <div className="preview-ticker" aria-hidden="true"><span>MAKE THE INVISIBLE VISIBLE · FOLIOFORGE STUDIO · </span><span>MAKE THE INVISIBLE VISIBLE · FOLIOFORGE STUDIO · </span></div>

        {isVisible('about') && (
          <SectionShell id="about" label="01 / About" selectedSection={selectedSection} onSelectSection={onSelectSection}>
            <div className="preview-about-grid">
              <h2>A portfolio is a <em>point of view.</em></h2>
              <div><p>{config.bio || 'Add your story in the Basics step.'}</p><span className="preview-muted">{config.location || 'Your location'}</span></div>
            </div>
          </SectionShell>
        )}

        {isVisible('projects') && (
          <SectionShell id="projects" label="02 / Selected work" selectedSection={selectedSection} onSelectSection={onSelectSection}>
            <div className="preview-section-heading"><h2>Selected work.</h2><span>{String(projectItems.length).padStart(2, '0')} pieces</span></div>
            {projectItems.length ? (
              <div className="preview-project-grid">
                {projectItems.map((item, index) => (
                  <article className="preview-project-card" key={item.id || `${item.title}-${index}`}>
                    <div className="preview-project-number">0{index + 1}</div>
                    <PreviewImage src={item.image_url} alt={item.title || 'Project'} className="project-preview-image" />
                    <div className="preview-project-body"><h3>{item.title || 'Untitled project'}</h3><p>{item.description || 'Add a short project story.'}</p><div className="preview-tags">{(item.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="preview-link-row">{item.live_url && <a href={item.live_url}>Live <ArrowUpRight size={13} /></a>}{item.repo_url && <a href={item.repo_url}>Code <ArrowUpRight size={13} /></a>}</div></div>
                  </article>
                ))}
              </div>
            ) : <div className="preview-empty">Your projects will land here.</div>}
          </SectionShell>
        )}

        {isVisible('experience') && (
          <SectionShell id="experience" label="03 / Experience" selectedSection={selectedSection} onSelectSection={onSelectSection}>
            <h2>Where I have been useful.</h2>
            <div className="preview-experience-list">{experienceItems.length ? experienceItems.map((item, index) => <article className="preview-experience-row" key={item.id || `${item.role}-${index}`}><span>{item.date_range}</span><div><h3>{item.role || 'Role'}</h3><strong>{item.organization || 'Organization'}</strong><p>{item.description || 'Describe the work and the change you helped create.'}</p><div className="preview-tags">{(item.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div></div></article>) : <div className="preview-empty">Add your experience in the Content step.</div>}</div>
          </SectionShell>
        )}

        {isVisible('photo-strip') && (
          <SectionShell id="photo-strip" label="Visual diary" selectedSection={selectedSection} onSelectSection={onSelectSection} className="preview-photo-section">
            <div className="preview-photo-strip">{[...projectItems, ...projectItems].slice(0, 8).map((item, index) => <PreviewImage key={`${item.id}-${index}`} src={item.image_url} alt={item.title || 'Portfolio detail'} className="strip-preview-image" />)}</div>
          </SectionShell>
        )}

        {isVisible('skills') && (
          <SectionShell id="skills" label="04 / Toolkit" selectedSection={selectedSection} onSelectSection={onSelectSection}>
            <h2>Tools I reach for.</h2>
            <div className="preview-skills">{skills.length ? skills.map((skill) => <span key={skill}>{skill}</span>) : <span className="preview-muted">Add skills in the Content step.</span>}</div>
          </SectionShell>
        )}

        {isVisible('gallery') && (
          <SectionShell id="gallery" label="05 / Gallery" selectedSection={selectedSection} onSelectSection={onSelectSection}>
            <h2>Details worth remembering.</h2>
            {galleryItems.length ? <div className="preview-gallery">{galleryItems.map((item) => <figure key={item.id}><PreviewImage src={item.image_url} alt={item.alt || item.caption || 'Gallery image'} className="gallery-preview-image" /><figcaption>{item.caption}</figcaption></figure>)}</div> : <div className="preview-empty"><Sparkles size={18} /> Add photos when you are ready.</div>}
          </SectionShell>
        )}

        {isVisible('contact') && (
          <SectionShell id="contact" label="06 / Contact" selectedSection={selectedSection} onSelectSection={onSelectSection} className="preview-contact">
            <h2>Let's make something <em>worth sharing.</em></h2>
            <p>{config.short_intro || 'Have a project in mind? I would love to hear about it.'}</p>
            <div className="preview-socials">{socialLinks.map((social) => <a key={`${social.platform}-${social.url}`} href={social.url}><SocialIcon platform={social.platform} /> {social.platform}</a>)}</div>
            {config.email && <a className="preview-email" href={`mailto:${config.email}`}>{config.email}</a>}
          </SectionShell>
        )}
        <footer className="preview-footer">© {config.full_name || 'Your Name'} · Built with FolioForge</footer>
      </div>
    </div>
  );
}
