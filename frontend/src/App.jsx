import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Eye,
  FileJson,
  Github,
  Layers3,
  LayoutDashboard,
  Linkedin,
  Mail,
  Menu,
  Monitor,
  Palette,
  Plus,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import PortfolioPreview from './components/PortfolioPreview';
import {
  cloneProject,
  createDefaultProject,
  createId,
  loadDraft,
  loadSavedProjects,
  sectionLabels,
  templatePresets,
} from './data/defaultProject';
import { downloadJson, downloadProjectZip, getGeneratedFiles } from './lib/exporter';
import { hasApiConnection, resolveApiUrl, saveProjectToApi, uploadImageToApi } from './lib/api';

const steps = [
  { id: 'basics', label: 'Basics', hint: 'Your point of view', icon: Sparkles },
  { id: 'content', label: 'Content', hint: 'Work and experience', icon: Layers3 },
  { id: 'design', label: 'Design', hint: 'Style and page flow', icon: Palette },
  { id: 'export', label: 'Export', hint: 'Preview and ship', icon: Download },
];

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'builder', label: 'Builder', icon: Wand2 },
  { id: 'preview', label: 'Live preview', icon: Eye },
  { id: 'code', label: 'Code workspace', icon: Code2 },
];

function formatDate(value) {
  if (!value) return 'Not saved yet';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  } catch {
    return 'Recently edited';
  }
}

function App() {
  const [project, setProject] = useState(loadDraft);
  const [savedProjects, setSavedProjects] = useState(loadSavedProjects);
  const [view, setView] = useState('dashboard');
  const [step, setStep] = useState('basics');
  const [previewMode, setPreviewMode] = useState('desktop');
  const [selectedSection, setSelectedSection] = useState(null);
  const [notice, setNotice] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem('folioforge-draft-v1', JSON.stringify(project));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const template = useMemo(
    () => templatePresets.find((item) => item.id === project.config.template_id) || templatePresets[0],
    [project.config.template_id],
  );

  const updateConfig = (field, value) => {
    setProject((current) => ({ ...current, config: { ...current.config, [field]: value } }));
  };

  const updateTheme = (field, value) => {
    setProject((current) => ({
      ...current,
      config: { ...current.config, theme: { ...current.config.theme, [field]: value } },
    }));
  };

  const updateProjectName = (value) => setProject((current) => ({ ...current, name: value }));

  const showNotice = (message, type = 'success') => setNotice({ message, type });

  const persistProject = async (candidate = project) => {
    const next = {
      ...cloneProject(candidate),
      id: candidate.id || createId('portfolio'),
      updatedAt: new Date().toISOString(),
    };
    setProject(next);
    localStorage.setItem('folioforge-draft-v1', JSON.stringify(next));
    const nextSaved = [next, ...savedProjects.filter((item) => item.id !== next.id)].slice(0, 12);
    setSavedProjects(nextSaved);
    localStorage.setItem('folioforge-projects-v1', JSON.stringify(nextSaved));

    if (hasApiConnection) {
      try {
        await saveProjectToApi({ name: next.name, config: next.config });
        showNotice('Saved locally and synced to the FolioForge API.');
      } catch (error) {
        showNotice(`Saved locally. API sync failed: ${error.message}`, 'warning');
      }
    } else {
      showNotice('Portfolio saved locally. Add VITE_API_URL to sync it to the backend.');
    }
    return next;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await persistProject();
    } finally {
      setIsSaving(false);
    }
  };

  const startNew = (presetId = 'creative-editorial') => {
    const next = createDefaultProject();
    const preset = templatePresets.find((item) => item.id === presetId) || templatePresets[0];
    next.config.template_id = preset.id;
    next.config.theme = { ...next.config.theme, ...preset.colors };
    setProject(next);
    setStep('basics');
    setView('builder');
    setSelectedSection(null);
    setMobileNavOpen(false);
  };

  const openProject = (saved) => {
    setProject(cloneProject(saved));
    setView('builder');
    setStep('basics');
    setSelectedSection(null);
    setMobileNavOpen(false);
  };

  const changeView = (nextView) => {
    setView(nextView);
    setMobileNavOpen(false);
  };

  const handleUpload = async (file, field) => {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    updateConfig(field, localUrl);
    showNotice('Image added to this draft.');
    if (hasApiConnection) {
      try {
        const uploaded = await uploadImageToApi(file);
        updateConfig(field, resolveApiUrl(uploaded.url));
        showNotice('Image uploaded to the FolioForge API.');
      } catch (error) {
        showNotice(`Using a local preview. Upload failed: ${error.message}`, 'warning');
      }
    }
  };

  const runLocalCommand = (command) => {
    const text = command.trim().toLowerCase();
    if (!text) return 'Type a command first.';
    if (text.includes('emerald') || text.includes('green accent')) {
      updateTheme('accent_color', '#2f7d52');
      return 'Changed the accent to emerald green.';
    }
    if (text.includes('creative editorial')) {
      applyTemplate('creative-editorial');
      return 'Applied Creative Editorial.';
    }
    if (text.includes('minimal')) {
      applyTemplate('minimal-professional');
      return 'Applied Minimal Professional.';
    }
    if (text.includes('dark') || text.includes('futuristic')) {
      applyTemplate('dark-futuristic');
      return 'Applied Dark Futuristic.';
    }
    if (text.includes('hide') && text.includes('gallery')) {
      toggleSection('gallery', false);
      return 'Gallery is hidden from the portfolio.';
    }
    if (text.includes('show') && text.includes('gallery')) {
      toggleSection('gallery', true);
      return 'Gallery is visible again.';
    }
    if (text.includes('projects above about')) {
      reorderSection('projects', 'up');
      return 'Moved projects above about.';
    }
    if (text.includes('heading larger')) {
      updateTheme('content_width', 'wide');
      return 'Expanded the content width for a larger editorial feel.';
    }
    return 'I only run safe local edits here. Try “make the accent emerald green”, “hide the gallery section”, or “use Minimal Professional”.';
  };

  const applyTemplate = (templateId) => {
    const preset = templatePresets.find((item) => item.id === templateId);
    if (!preset) return;
    setProject((current) => ({
      ...current,
      config: { ...current.config, template_id: preset.id, theme: { ...current.config.theme, ...preset.colors } },
    }));
  };

  const toggleSection = (id, value) => {
    updateConfig('sections', project.config.sections.map((section) => (section.id === id ? { ...section, visible: value } : section)));
  };

  const reorderSection = (id, direction) => {
    const currentIndex = project.config.sections.findIndex((section) => section.id === id);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= project.config.sections.length) return;
    const nextSections = [...project.config.sections];
    [nextSections[currentIndex], nextSections[nextIndex]] = [nextSections[nextIndex], nextSections[currentIndex]];
    updateConfig('sections', nextSections);
  };

  const exportProject = async () => {
    const next = await persistProject();
    await downloadProjectZip(next);
    showNotice('Your runnable portfolio ZIP is ready.');
  };

  return (
    <div className="studio-app">
      <StudioSidebar view={view} onViewChange={changeView} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} project={project} template={template} />
      <main className="studio-main">
        <header className="studio-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>FolioForge</span><ChevronDown size={14} /><strong>{project.name}</strong></div>
          <div className="topbar-actions"><span className="save-state"><span className="save-dot" /> Autosaved</span><button className="button secondary small" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : <><Save size={15} /> Save</>}</button><button className="button primary small" onClick={() => changeView('preview')}><Eye size={15} /> Preview</button></div>
        </header>

        {view === 'dashboard' && <Dashboard project={project} savedProjects={savedProjects} template={template} onNew={() => startNew()} onOpen={openProject} onTemplate={(id) => startNew(id)} onViewChange={changeView} />}
        {view === 'builder' && <Builder project={project} step={step} setStep={setStep} onUpdateConfig={updateConfig} onUpdateTheme={updateTheme} onUpdateName={updateProjectName} onUpload={handleUpload} onApplyTemplate={applyTemplate} onToggleSection={toggleSection} onReorderSection={reorderSection} onRunCommand={runLocalCommand} onSave={handleSave} onExport={exportProject} isSaving={isSaving} selectedSection={selectedSection} onSelectSection={setSelectedSection} previewMode={previewMode} onPreviewMode={setPreviewMode} />}
        {view === 'preview' && <PreviewScreen project={project} previewMode={previewMode} onPreviewMode={setPreviewMode} onBack={() => changeView('builder')} />}
        {view === 'code' && <CodeWorkspace project={project} onBack={() => changeView('builder')} onExport={exportProject} />}
      </main>
      {notice && <div className={`toast ${notice.type}`}><span>{notice.type === 'warning' ? '!' : <Check size={16} />}</span>{notice.message}<button className="toast-close" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button></div>}
    </div>
  );
}

function StudioSidebar({ view, onViewChange, open, onClose, project, template }) {
  return (
    <>
      {open && <button className="mobile-scrim" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`studio-sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark">F</div><div><strong>FolioForge</strong><span>creative studio</span></div><button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={17} /></button></div>
        <div className="sidebar-project"><span className="sidebar-label">Current project</span><strong>{project.name}</strong><span className="template-pill" style={{ '--pill-accent': template.colors.accent_color }}>{template.name}</span></div>
        <nav className="studio-nav" aria-label="Primary navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onViewChange(id)}><Icon size={17} /><span>{label}</span>{id === 'code' && <span className="nav-beta">SOURCE</span>}</button>)}</nav>
        <div className="sidebar-divider" />
        <div className="sidebar-card"><Sparkles size={16} /><div><strong>Make it yours</strong><span>Start with the Creative Editorial direction, then tune every detail.</span></div></div>
        <div className="sidebar-bottom"><span className="sidebar-label">Project status</span><div className="status-line"><span className="save-dot" /> Draft saved locally</div><span className="sidebar-version">FolioForge 1.0 · local studio</span></div>
      </aside>
    </>
  );
}

function Dashboard({ project, savedProjects, template, onNew, onOpen, onTemplate, onViewChange }) {
  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-copy-dashboard"><span className="eyebrow"><Sparkles size={14} /> Portfolio studio for people with a point of view</span><h1>Build a portfolio that feels like <em>you.</em></h1><p>FolioForge turns your story, projects, and ambitions into a polished personal site — then gives you the real source code to keep.</p><div className="dashboard-cta"><button className="button primary large" onClick={onNew}><Wand2 size={18} /> Create your portfolio <ArrowRight size={17} /></button><button className="button ghost large" onClick={() => onViewChange('builder')}>Continue current draft</button></div><div className="trust-row"><span><span className="save-dot" /> Local-first drafts</span><span><Code2 size={14} /> Runnable export</span><span><Sparkles size={14} /> Six art-directed templates</span></div></div>
        <div className="dashboard-art"><div className="art-label">YOUR STORY<br /><span>IN MOTION</span></div><div className="art-card art-back"><span>01</span><strong>Build<br />with<br /><em>intention.</em></strong></div><div className="art-card art-front"><div className="art-topline"><span>folio / 001</span><span>↗</span></div><div className="art-face">{(project.config.full_name || 'Your Name').slice(0, 1)}</div><div className="art-name">{project.config.full_name || 'Your Name'}<small>{project.config.professional_title || 'Creative builder'}</small></div></div><div className="art-sticker">MAKE<br />IT<br /><span>MEMORABLE</span></div></div>
      </section>

      <section className="dashboard-section"><div className="section-heading-row"><div><span className="eyebrow muted-eyebrow">Your workspace</span><h2>Pick up where you left off.</h2></div><button className="text-button" onClick={onNew}><Plus size={16} /> New project</button></div><div className="project-list">{savedProjects.length ? savedProjects.slice(0, 4).map((saved) => <button className="project-list-card" key={saved.id} onClick={() => onOpen(saved)}><div className="project-list-preview" style={{ '--card-bg': saved.config?.theme?.background_color || '#f6f0e7', '--card-accent': saved.config?.theme?.accent_color || '#315c42' }}><span>{(saved.config?.full_name || 'Y').slice(0, 1)}</span></div><div className="project-list-info"><strong>{saved.name}</strong><span>{saved.config?.template_id || 'creative-editorial'} · edited {formatDate(saved.updatedAt)}</span></div><ArrowRight size={17} /></button>) : <div className="empty-projects"><div className="empty-icon"><Layers3 size={20} /></div><div><strong>No saved projects yet</strong><span>Your first portfolio will appear here after you save it.</span></div><button className="button secondary small" onClick={onNew}>Start now <ArrowRight size={14} /></button></div>}</div></section>

      <section className="dashboard-section templates-section"><div className="section-heading-row"><div><span className="eyebrow muted-eyebrow">Starter directions</span><h2>Choose a mood, not a mold.</h2></div><span className="section-note">All templates are editable</span></div><div className="template-grid">{templatePresets.slice(0, 4).map((item) => <button className={`template-card template-card-${item.tone}`} key={item.id} onClick={() => onTemplate(item.id)} style={{ '--template-bg': item.colors.background_color, '--template-accent': item.colors.accent_color, '--template-text': item.colors.text_color }}><div className="template-card-visual"><span className="template-card-number">0{templatePresets.indexOf(item) + 1}</span><div className="template-visual-lines"><span /><span /><span /></div><strong>{item.name}</strong></div><div className="template-card-copy"><strong>{item.name}</strong><span>{item.description}</span></div></button>)}</div></section>
    </div>
  );
}

function Builder({
  project,
  step,
  setStep,
  onUpdateConfig,
  onUpdateTheme,
  onUpdateName,
  onUpload,
  onApplyTemplate,
  onToggleSection,
  onReorderSection,
  onRunCommand,
  onSave,
  onExport,
  isSaving,
  selectedSection,
  onSelectSection,
  previewMode,
  onPreviewMode,
}) {
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  const goNext = () => setStep(steps[Math.min(steps.length - 1, currentStepIndex + 1)].id);
  const goPrevious = () => setStep(steps[Math.max(0, currentStepIndex - 1)].id);

  return (
    <div className="page builder-page">
      <div className="builder-heading"><div><span className="eyebrow muted-eyebrow">Portfolio builder</span><h1>Shape the story.</h1><p>Move through the essentials, then let the preview show you what the finished experience feels like.</p></div><div className="builder-heading-actions"><button className="button secondary small" onClick={onSave} disabled={isSaving}><Save size={15} /> {isSaving ? 'Saving…' : 'Save draft'}</button><button className="button primary small" onClick={onExport}><Download size={15} /> Export ZIP</button></div></div>
      <div className="builder-layout">
        <StepRail currentStep={step} onSelect={setStep} />
        <div className="builder-workspace">
          {step === 'basics' && <BasicsStep project={project} onUpdateConfig={onUpdateConfig} onUpdateName={onUpdateName} onUpload={onUpload} />}
          {step === 'content' && <ContentStep config={project.config} onUpdateConfig={onUpdateConfig} />}
          {step === 'design' && <DesignStep config={project.config} onUpdateTheme={onUpdateTheme} onApplyTemplate={onApplyTemplate} onToggleSection={onToggleSection} onReorderSection={onReorderSection} />}
          {step === 'export' && <ExportStep project={project} onSave={onSave} onExport={onExport} />}
          <div className="builder-footer-nav"><button className="button ghost small" onClick={goPrevious} disabled={currentStepIndex === 0}><ArrowLeft size={15} /> Back</button><span>Step {currentStepIndex + 1} of {steps.length}</span>{currentStepIndex < steps.length - 1 ? <button className="button primary small" onClick={goNext}>Continue <ArrowRight size={15} /></button> : <button className="button primary small" onClick={onExport}><Download size={15} /> Download ZIP</button>}</div>
        </div>
        <div className="builder-preview-column">
          <div className="preview-column-header"><div><span className="eyebrow muted-eyebrow">Live canvas</span><strong>{project.config.full_name || 'Your portfolio'}</strong></div><div className="device-switcher"><button className={previewMode === 'desktop' ? 'active' : ''} onClick={() => onPreviewMode('desktop')} aria-label="Desktop preview"><Monitor size={15} /></button><button className={previewMode === 'tablet' ? 'active' : ''} onClick={() => onPreviewMode('tablet')} aria-label="Tablet preview"><Tablet size={15} /></button><button className={previewMode === 'mobile' ? 'active' : ''} onClick={() => onPreviewMode('mobile')} aria-label="Mobile preview"><Smartphone size={15} /></button></div></div><div className="preview-canvas-frame"><PortfolioPreview project={project} mode={previewMode} selectedSection={selectedSection} onSelectSection={onSelectSection} /></div>
        </div>
      </div>
      <QuickEdit onRunCommand={onRunCommand} />
    </div>
  );
}

function StepRail({ currentStep, onSelect }) {
  return <aside className="step-rail"><span className="eyebrow muted-eyebrow">Build sequence</span><div className="step-list">{steps.map(({ id, label, hint, icon: Icon }, index) => <button key={id} className={`step-item ${currentStep === id ? 'active' : ''}`} onClick={() => onSelect(id)}><span className="step-index">{index + 1}</span><span className="step-icon"><Icon size={16} /></span><span className="step-copy"><strong>{label}</strong><small>{hint}</small></span>{currentStep !== id && index < steps.findIndex((item) => item.id === currentStep) && <Check size={15} className="step-complete" />}</button>)}</div><div className="step-tip"><Sparkles size={15} /><span><strong>Small moves, strong signal.</strong> You can come back and change anything later.</span></div></aside>;
}

function BasicsStep({ project, onUpdateConfig, onUpdateName, onUpload }) {
  const config = project.config;
  return <div className="form-page"><FormIntro eyebrow="Step 01 / Basics" title="Start with the signal." description="Give your portfolio enough personality that the design has something real to amplify." /><div className="form-card"><Field label="Project name" hint="Only used inside FolioForge"><input value={project.name || ''} onChange={(event) => onUpdateName(event.target.value)} placeholder="My portfolio" /></Field><div className="form-grid two"><Field label="Full name"><input value={config.full_name || ''} onChange={(event) => onUpdateConfig('full_name', event.target.value)} placeholder="Your Name" /></Field><Field label="Handle"><input value={config.handle || ''} onChange={(event) => onUpdateConfig('handle', event.target.value)} placeholder="@yourhandle" /></Field></div><div className="form-grid two"><Field label="Professional title"><input value={config.professional_title || ''} onChange={(event) => onUpdateConfig('professional_title', event.target.value)} placeholder="AI engineer & full-stack developer" /></Field><Field label="Location"><input value={config.location || ''} onChange={(event) => onUpdateConfig('location', event.target.value)} placeholder="Your city, country" /></Field></div><Field label="One-line introduction" hint="This appears in the hero and contact section"><textarea rows="3" value={config.short_intro || ''} onChange={(event) => onUpdateConfig('short_intro', event.target.value)} placeholder="I turn ambitious ideas into useful products." /></Field><Field label="About your work" hint="Write like a person. Two short paragraphs is plenty."><textarea rows="7" value={config.bio || ''} onChange={(event) => onUpdateConfig('bio', event.target.value)} placeholder="Tell people what you build, how you think, and what you care about." /></Field><div className="form-grid two"><Field label="Email"><input type="email" value={config.email || ''} onChange={(event) => onUpdateConfig('email', event.target.value)} placeholder="hello@example.com" /></Field><Field label="Resume URL"><input value={config.resume_url || ''} onChange={(event) => onUpdateConfig('resume_url', event.target.value)} placeholder="https://…" /></Field></div></div><div className="form-card media-upload-card"><div className="media-upload-copy"><span className="upload-icon"><Upload size={18} /></span><div><strong>Portrait image</strong><span>Use a crisp square or vertical image. It stays local until you connect the backend.</span></div></div><div className="upload-controls">{config.avatar_url && <img src={config.avatar_url} alt="Current portrait" className="upload-thumb" />}<label className="button secondary small"><Upload size={14} /> Choose image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => onUpload(event.target.files?.[0], 'avatar_url')} /></label></div></div></div>;
}

function FormIntro({ eyebrow, title, description }) {
  return <div className="form-intro"><span className="eyebrow muted-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>;
}

function Field({ label, hint, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function ContentStep({ config, onUpdateConfig }) {
  const projects = config.projects || [];
  const experience = config.experience || [];
  const socials = config.social_links || [];
  const updateListItem = (field, index, value) => onUpdateConfig(field, config[field].map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const addProject = () => onUpdateConfig('projects', [...projects, { id: createId('project'), title: 'New project', description: 'What did you build and why does it matter?', image_url: '', tags: ['New'], live_url: '', repo_url: '' }]);
  const removeProject = (index) => onUpdateConfig('projects', projects.filter((_, itemIndex) => itemIndex !== index));
  const addExperience = () => onUpdateConfig('experience', [...experience, { id: createId('experience'), date_range: '2024 — Present', role: 'Your role', organization: 'Your organization', description: 'Describe your contribution and the outcome.', tags: ['Impact'], url: '' }]);
  const removeExperience = (index) => onUpdateConfig('experience', experience.filter((_, itemIndex) => itemIndex !== index));
  const addSocial = () => onUpdateConfig('social_links', [...socials, { platform: 'Website', url: 'https://' }]);
  const removeSocial = (index) => onUpdateConfig('social_links', socials.filter((_, itemIndex) => itemIndex !== index));

  return <div className="form-page"><FormIntro eyebrow="Step 02 / Content" title="Make the work legible." description="Add enough context for someone to understand your craft without making them dig." /><div className="form-card"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Projects</span><h3>Selected work</h3></div><button className="button secondary small" onClick={addProject}><Plus size={14} /> Add project</button></div>{projects.map((item, index) => <div className="repeatable-card" key={item.id || index}><div className="repeatable-card-top"><span className="repeatable-index">0{index + 1}</span><strong>{item.title || 'Untitled project'}</strong><button className="icon-button danger" onClick={() => removeProject(index)} aria-label={`Remove ${item.title}`}><Trash2 size={15} /></button></div><div className="form-grid two"><Field label="Title"><input value={item.title || ''} onChange={(event) => updateListItem('projects', index, { title: event.target.value })} /></Field><Field label="Tags" hint="Comma separated"><input value={(item.tags || []).join(', ')} onChange={(event) => updateListItem('projects', index, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></Field></div><Field label="Description"><textarea rows="3" value={item.description || ''} onChange={(event) => updateListItem('projects', index, { description: event.target.value })} /></Field><div className="form-grid two"><Field label="Live URL"><input value={item.live_url || ''} onChange={(event) => updateListItem('projects', index, { live_url: event.target.value })} placeholder="https://…" /></Field><Field label="Repository URL"><input value={item.repo_url || ''} onChange={(event) => updateListItem('projects', index, { repo_url: event.target.value })} placeholder="https://github.com/…" /></Field></div></div>)}</div><div className="form-card"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Experience</span><h3>Where you have been useful</h3></div><button className="button secondary small" onClick={addExperience}><Plus size={14} /> Add experience</button></div>{experience.map((item, index) => <div className="repeatable-card" key={item.id || index}><div className="repeatable-card-top"><span className="repeatable-index">0{index + 1}</span><strong>{item.role || 'Your role'}</strong><button className="icon-button danger" onClick={() => removeExperience(index)} aria-label={`Remove ${item.role}`}><Trash2 size={15} /></button></div><div className="form-grid two"><Field label="Date range"><input value={item.date_range || ''} onChange={(event) => updateListItem('experience', index, { date_range: event.target.value })} /></Field><Field label="Role"><input value={item.role || ''} onChange={(event) => updateListItem('experience', index, { role: event.target.value })} /></Field></div><Field label="Organization"><input value={item.organization || ''} onChange={(event) => updateListItem('experience', index, { organization: event.target.value })} /></Field><Field label="Description"><textarea rows="3" value={item.description || ''} onChange={(event) => updateListItem('experience', index, { description: event.target.value })} /></Field><Field label="Tags" hint="Comma separated"><input value={(item.tags || []).join(', ')} onChange={(event) => updateListItem('experience', index, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></Field></div>)}</div><div className="form-card"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Skills & links</span><h3>Give people a way in</h3></div></div><Field label="Skills" hint="Comma separated"><input value={(config.skills || []).join(', ')} onChange={(event) => onUpdateConfig('skills', event.target.value.split(',').map((skill) => skill.trim()).filter(Boolean))} /></Field>{socials.map((social, index) => <div className="inline-repeatable" key={`${social.platform}-${index}`}><input aria-label="Social platform" value={social.platform || ''} onChange={(event) => updateListItem('social_links', index, { platform: event.target.value })} placeholder="Platform" /><input aria-label="Social URL" value={social.url || ''} onChange={(event) => updateListItem('social_links', index, { url: event.target.value })} placeholder="https://…" /><button className="icon-button danger" onClick={() => removeSocial(index)} aria-label="Remove social link"><Trash2 size={15} /></button></div>)}<button className="text-button" onClick={addSocial}><Plus size={15} /> Add social link</button></div></div>;
}

function DesignStep({ config, onUpdateTheme, onApplyTemplate, onToggleSection, onReorderSection }) {
  const theme = config.theme || {};
  return <div className="form-page"><FormIntro eyebrow="Step 03 / Design" title="Choose the atmosphere." description="Start with a strong system, then make the details yours. Every template exports as real source code." /><div className="form-card"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Template library</span><h3>Distinct starting points</h3></div><span className="card-meta">{templatePresets.length} available</span></div><div className="template-picker-grid">{templatePresets.map((item) => <button key={item.id} className={`template-picker ${config.template_id === item.id ? 'active' : ''}`} onClick={() => onApplyTemplate(item.id)} style={{ '--picker-bg': item.colors.background_color, '--picker-accent': item.colors.accent_color, '--picker-text': item.colors.text_color }}><div className="picker-preview"><span>F</span><i /><i /><i /></div><div><strong>{item.name}</strong><small>{item.description}</small></div>{config.template_id === item.id && <span className="picker-check"><Check size={13} /></span>}</button>)}</div></div><div className="form-card"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Visual tokens</span><h3>Tune the surface</h3></div><span className="card-meta">Live in preview</span></div><div className="color-grid"><ColorField label="Background" value={theme.background_color} onChange={(value) => onUpdateTheme('background_color', value)} /><ColorField label="Accent" value={theme.accent_color} onChange={(value) => onUpdateTheme('accent_color', value)} /><ColorField label="Text" value={theme.text_color} onChange={(value) => onUpdateTheme('text_color', value)} /><ColorField label="Muted" value={theme.muted_color} onChange={(value) => onUpdateTheme('muted_color', value)} /></div><div className="form-grid two"><Field label="Heading font"><input value={theme.heading_font || ''} onChange={(event) => onUpdateTheme('heading_font', event.target.value)} /></Field><Field label="Body font"><input value={theme.body_font || ''} onChange={(event) => onUpdateTheme('body_font', event.target.value)} /></Field></div><div className="segmented-field"><span className="field-label">Motion intensity</span><div className="segmented-control">{['reduced', 'subtle', 'expressive'].map((value) => <button key={value} className={theme.animation_intensity === value ? 'active' : ''} onClick={() => onUpdateTheme('animation_intensity', value)}>{value}</button>)}</div></div><div className="segmented-field"><span className="field-label">Content width</span><div className="segmented-control">{['compact', 'comfortable', 'wide'].map((value) => <button key={value} className={theme.content_width === value ? 'active' : ''} onClick={() => onUpdateTheme('content_width', value)}>{value}</button>)}</div></div></div><div className="form-card"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Page flow</span><h3>Make the sequence yours</h3></div><span className="card-meta">Drag-free controls, same result</span></div><div className="section-flow-list">{(config.sections || []).map((section, index) => <div className={`section-flow-row ${section.visible ? '' : 'hidden'}`} key={section.id}><span className="flow-number">0{index + 1}</span><div className="flow-copy"><strong>{sectionLabels[section.id] || section.id}</strong><small>{section.visible ? 'Visible in portfolio' : 'Hidden from portfolio'}</small></div><button className={`visibility-toggle ${section.visible ? 'on' : ''}`} onClick={() => onToggleSection(section.id, !section.visible)}>{section.visible ? 'Visible' : 'Hidden'}</button><div className="flow-arrows"><button className="icon-button" onClick={() => onReorderSection(section.id, 'up')} disabled={index === 0} aria-label={`Move ${section.id} up`}><ArrowUp size={14} /></button><button className="icon-button" onClick={() => onReorderSection(section.id, 'down')} disabled={index === (config.sections || []).length - 1} aria-label={`Move ${section.id} down`}><ArrowDown size={14} /></button></div></div>)}</div></div></div>;
}

function ColorField({ label, value, onChange }) {
  return <label className="color-field"><span className="color-swatch" style={{ background: value }}><input type="color" value={value || '#000000'} onChange={(event) => onChange(event.target.value)} aria-label={`${label} color`} /></span><span><strong>{label}</strong><small>{value}</small></span></label>;
}

function ExportStep({ project, onSave, onExport }) {
  const files = getGeneratedFiles(project);
  return <div className="form-page"><FormIntro eyebrow="Step 04 / Export" title="Make it real." description="Your preview and your download use the same structured portfolio data. Save a draft, inspect the source, or ship the ZIP." /><div className="export-hero-card"><div className="export-icon"><Code2 size={23} /></div><div><span className="eyebrow muted-eyebrow">Ready to generate</span><h3>{project.config.full_name || 'Your portfolio'} is shaped enough to ship.</h3><p>{Object.keys(files).length} files · responsive HTML/CSS/JS · reduced-motion support</p></div><button className="button primary" onClick={onExport}><Download size={16} /> Download ZIP</button></div><div className="export-grid"><div className="form-card export-checklist"><div className="card-heading"><div><span className="eyebrow muted-eyebrow">Preflight</span><h3>What is included</h3></div></div>{['Personal content in one normalized config', 'Selected template and theme tokens', 'Responsive static portfolio source', 'Project card interactions and motion', 'README with deployment instructions'].map((item) => <div className="check-row" key={item}><span><Check size={14} /></span>{item}</div>)}</div><div className="form-card export-actions-card"><span className="eyebrow muted-eyebrow">Keep your options open</span><h3>Save the source of truth.</h3><p>Download the editable JSON too, so you can reopen this project or move it to another workspace.</p><div className="stacked-actions"><button className="button secondary" onClick={onSave}><Save size={15} /> Save draft</button><button className="button ghost" onClick={() => downloadJson(project)}><FileJson size={15} /> Download JSON</button></div></div></div></div>;
}

function QuickEdit({ onRunCommand }) {
  const [command, setCommand] = useState('');
  const [result, setResult] = useState('');
  const submit = (event) => { event.preventDefault(); const response = onRunCommand(command); setResult(response); };
  return <div className="quick-edit"><div className="quick-edit-icon"><Wand2 size={17} /></div><div className="quick-edit-copy"><strong>Local edit assistant</strong><span>Safe commands update the structured draft. Open-ended AI needs a configured provider.</span></div><form onSubmit={submit}><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Try: make the accent emerald green" aria-label="Local edit command" /><button className="button secondary small" type="submit">Apply</button></form>{result && <span className="quick-edit-result">{result}</span>}</div>;
}

function PreviewScreen({ project, previewMode, onPreviewMode, onBack }) {
  return <div className="page preview-page"><div className="full-preview-toolbar"><div><button className="button ghost small" onClick={onBack}><ArrowLeft size={15} /> Back to builder</button><span className="preview-toolbar-title">Live portfolio preview</span></div><div className="device-switcher large-switcher"><button className={previewMode === 'desktop' ? 'active' : ''} onClick={() => onPreviewMode('desktop')}><Monitor size={15} /> Desktop</button><button className={previewMode === 'tablet' ? 'active' : ''} onClick={() => onPreviewMode('tablet')}><Tablet size={15} /> Tablet</button><button className={previewMode === 'mobile' ? 'active' : ''} onClick={() => onPreviewMode('mobile')}><Smartphone size={15} /> Mobile</button></div></div><div className="full-preview-stage"><PortfolioPreview project={project} mode={previewMode} readOnly /></div></div>;
}

function CodeWorkspace({ project, onBack, onExport }) {
  const files = getGeneratedFiles(project);
  const fileNames = Object.keys(files);
  const [activeFile, setActiveFile] = useState(fileNames[0]);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(files[activeFile]); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className="page code-page"><div className="code-heading"><div><button className="button ghost small" onClick={onBack}><ArrowLeft size={15} /> Back to builder</button><span className="eyebrow muted-eyebrow">Source workspace</span><h1>Every pixel has a file.</h1><p>Inspect the generated project, copy what you need, and download the runnable bundle when you are ready.</p></div><button className="button primary" onClick={onExport}><Download size={16} /> Export ZIP</button></div><div className="code-layout"><aside className="file-tree"><span className="file-tree-title">Generated files</span>{fileNames.map((name) => <button className={activeFile === name ? 'active' : ''} key={name} onClick={() => setActiveFile(name)}><Code2 size={14} />{name}</button>)}<div className="file-tree-note"><Sparkles size={14} /><span>Static export is deterministic, so the preview and the ZIP stay in sync.</span></div></aside><section className="code-editor-card"><div className="code-editor-toolbar"><span><span className="editor-dot" /> {activeFile}</span><button className="text-button" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy file'}</button></div><pre className="code-editor"><code>{files[activeFile]}</code></pre></section></div></div>;
}

export default App;
