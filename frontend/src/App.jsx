import React, {
  Component,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Layers3,
  LayoutDashboard,
  Menu,
  Monitor,
  Palette,
  Plus,
  Redo2,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
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

/* ------------------------------------------------------------------ */
/* Constants + pure helpers                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEYS = { draft: 'folioforge-draft-v1', projects: 'folioforge-projects-v1' };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SAVED_PROJECTS = 12;

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

const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'tablet', label: 'Tablet', icon: Tablet },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
];

const pad = (n) => String(n).padStart(2, '0');
const parseList = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
const formatBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const isEditable = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function formatDate(value) {
  if (!value) return 'Not saved yet';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  } catch {
    return 'Recently edited';
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode or quota exceeded
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** Merges imported JSON onto a fresh default so older or partial exports still load. */
function normalizeImportedProject(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.config !== 'object' || raw.config === null) {
    throw new Error('This file is not a FolioForge project.');
  }
  const base = createDefaultProject();
  return {
    ...cloneProject(base),
    ...cloneProject(raw),
    id: createId('portfolio'),
    name: String(raw.name || 'Imported portfolio'),
    updatedAt: new Date().toISOString(),
    config: {
      ...base.config,
      ...raw.config,
      theme: { ...base.config.theme, ...(raw.config.theme || {}) },
      sections: Array.isArray(raw.config.sections) ? raw.config.sections : base.config.sections,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** State with undo/redo. Rapid edits (typing) within `mergeMs` collapse into one history entry. */
function useHistory(initial, { limit = 100, mergeMs = 700 } = {}) {
  const [history, setHistory] = useState(() => ({
    past: [],
    present: typeof initial === 'function' ? initial() : initial,
    future: [],
  }));
  const lastChange = useRef(0);

  const set = useCallback(
    (updater) => {
      const now = Date.now();
      const merge = now - lastChange.current < mergeMs;
      lastChange.current = now;
      setHistory((h) => {
        const next = typeof updater === 'function' ? updater(h.present) : updater;
        if (next === h.present) return h;
        const past = merge && h.past.length ? h.past : [...h.past, h.present].slice(-limit);
        return { past, present: next, future: [] };
      });
    },
    [limit, mergeMs],
  );

  const undo = useCallback(() => {
    lastChange.current = 0;
    setHistory((h) =>
      h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h,
    );
  }, []);

  const redo = useCallback(() => {
    lastChange.current = 0;
    setHistory((h) =>
      h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h,
    );
  }, []);

  const reset = useCallback((next) => {
    lastChange.current = 0;
    setHistory({ past: [], present: next, future: [] });
  }, []);

  return { project: history.present, setProject: set, undo, redo, reset, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

/** Debounced draft autosave that reports real status: saving | saved | error. */
function useAutosave(project) {
  const [status, setStatus] = useState('saved');
  useEffect(() => {
    setStatus('saving');
    const timer = window.setTimeout(() => setStatus(writeStorage(STORAGE_KEYS.draft, project) ? 'saved' : 'error'), 400);
    return () => window.clearTimeout(timer);
  }, [project]);
  return status;
}

/* ------------------------------------------------------------------ */
/* Error boundary                                                      */
/* ------------------------------------------------------------------ */

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-projects" role="alert">
        <div>
          <strong>{this.props.label || 'This panel'} hit a problem.</strong>
          <span>{this.state.error.message}</span>
        </div>
        <button className="button secondary small" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

function App() {
  const { project, setProject, undo, redo, reset, canUndo, canRedo } = useHistory(loadDraft);
  const [savedProjects, setSavedProjects] = useState(loadSavedProjects);
  const [view, setView] = useState('dashboard');
  const [step, setStep] = useState('basics');
  const [previewMode, setPreviewMode] = useState('desktop');
  const [selectedSection, setSelectedSection] = useState(null);
  const [notice, setNotice] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const saveStatus = useAutosave(project);
  const projectRef = useRef(project);
  projectRef.current = project;

  const template = useMemo(
    () => templatePresets.find((item) => item.id === project.config.template_id) || templatePresets[0],
    [project.config.template_id],
  );

  const showNotice = useCallback((message, type = 'success') => setNotice({ message, type }), []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* ---------- config updaters (all functional, never stale) ---------- */

  const updateConfig = useCallback(
    (field, value) => setProject((current) => ({ ...current, config: { ...current.config, [field]: value } })),
    [setProject],
  );

  const updateTheme = useCallback(
    (field, value) =>
      setProject((current) => ({
        ...current,
        config: { ...current.config, theme: { ...current.config.theme, [field]: value } },
      })),
    [setProject],
  );

  const updateProjectName = useCallback((value) => setProject((current) => ({ ...current, name: value })), [setProject]);

  const applyTemplate = useCallback(
    (templateId) => {
      const preset = templatePresets.find((item) => item.id === templateId);
      if (!preset) return false;
      setProject((current) => ({
        ...current,
        config: { ...current.config, template_id: preset.id, theme: { ...current.config.theme, ...preset.colors } },
      }));
      return true;
    },
    [setProject],
  );

  const toggleSection = useCallback(
    (id, value) =>
      setProject((current) => ({
        ...current,
        config: { ...current.config, sections: current.config.sections.map((s) => (s.id === id ? { ...s, visible: value } : s)) },
      })),
    [setProject],
  );

  const moveSection = useCallback(
    (id, targetIndex) =>
      setProject((current) => {
        const list = [...current.config.sections];
        const from = list.findIndex((s) => s.id === id);
        if (from < 0 || targetIndex < 0 || targetIndex >= list.length || from === targetIndex) return current;
        const [item] = list.splice(from, 1);
        list.splice(targetIndex, 0, item);
        return { ...current, config: { ...current.config, sections: list } };
      }),
    [setProject],
  );

  const reorderSection = useCallback(
    (id, direction) => {
      const index = projectRef.current.config.sections.findIndex((s) => s.id === id);
      moveSection(id, direction === 'up' ? index - 1 : index + 1);
    },
    [moveSection],
  );

  /* ---------- persistence ---------- */

  const persistProject = useCallback(
    async (candidate = projectRef.current) => {
      const next = { ...cloneProject(candidate), id: candidate.id || createId('portfolio'), updatedAt: new Date().toISOString() };
      setProject(next);
      const nextSaved = [next, ...savedProjects.filter((item) => item.id !== next.id)].slice(0, MAX_SAVED_PROJECTS);
      setSavedProjects(nextSaved);
      const stored = writeStorage(STORAGE_KEYS.draft, next) && writeStorage(STORAGE_KEYS.projects, nextSaved);

      if (!stored) {
        showNotice('Browser storage is full. Download the JSON to keep a copy of this project.', 'warning');
        return next;
      }
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
    },
    [savedProjects, setProject, showNotice],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await persistProject();
    } finally {
      setIsSaving(false);
    }
  }, [persistProject]);

  const exportProject = useCallback(async () => {
    setIsExporting(true);
    try {
      const next = await persistProject();
      await downloadProjectZip(next);
      showNotice('Your runnable portfolio ZIP is ready.');
    } catch (error) {
      showNotice(`Export failed: ${error.message}`, 'warning');
    } finally {
      setIsExporting(false);
    }
  }, [persistProject, showNotice]);

  /* ---------- navigation ---------- */

  const changeView = useCallback((nextView) => {
    setView(nextView);
    setMobileNavOpen(false);
  }, []);

  const loadIntoBuilder = useCallback(
    (next) => {
      reset(next);
      setStep('basics');
      setView('builder');
      setSelectedSection(null);
      setMobileNavOpen(false);
    },
    [reset],
  );

  const startNew = useCallback(
    (presetId = 'creative-editorial') => {
      const next = createDefaultProject();
      const preset = templatePresets.find((item) => item.id === presetId) || templatePresets[0];
      next.config.template_id = preset.id;
      next.config.theme = { ...next.config.theme, ...preset.colors };
      loadIntoBuilder(next);
    },
    [loadIntoBuilder],
  );

  const openProject = useCallback((saved) => loadIntoBuilder(cloneProject(saved)), [loadIntoBuilder]);

  const importProject = useCallback(
    async (file) => {
      if (!file) return;
      try {
        loadIntoBuilder(normalizeImportedProject(JSON.parse(await file.text())));
        showNotice('Project imported. Review it, then save.');
      } catch (error) {
        showNotice(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message, 'warning');
      }
    },
    [loadIntoBuilder, showNotice],
  );

  /* ---------- uploads ---------- */

  const handleUpload = useCallback(
    async (file, field) => {
      if (!file) return;
      if (!ACCEPTED_IMAGES.includes(file.type)) return showNotice('Use a JPEG, PNG, WebP or GIF image.', 'warning');
      if (file.size > MAX_IMAGE_BYTES) return showNotice(`Images must be under ${formatBytes(MAX_IMAGE_BYTES)}.`, 'warning');
      try {
        // A data URL survives reloads and exports; blob: URLs would die with the tab.
        updateConfig(field, await readFileAsDataUrl(file));
        showNotice('Image added to this draft.');
      } catch (error) {
        return showNotice(error.message, 'warning');
      }
      if (hasApiConnection) {
        try {
          const uploaded = await uploadImageToApi(file);
          updateConfig(field, resolveApiUrl(uploaded.url));
          showNotice('Image uploaded to the FolioForge API.');
        } catch (error) {
          showNotice(`Using a local copy. Upload failed: ${error.message}`, 'warning');
        }
      }
    },
    [showNotice, updateConfig],
  );

  /* ---------- local edit assistant ---------- */

  const runLocalCommand = useCallback(
    (command) => {
      const text = command.trim().toLowerCase();
      if (!text) return 'Type a command first.';
      const sections = projectRef.current.config.sections || [];
      const sectionFor = (word) => sections.find((s) => s.id === word || (sectionLabels[s.id] || '').toLowerCase() === word);

      const hex = text.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/);
      if (hex && /accent|colou?r/.test(text)) {
        updateTheme('accent_color', hex[0]);
        return `Changed the accent to ${hex[0]}.`;
      }
      if (/emerald|green accent/.test(text)) {
        updateTheme('accent_color', '#2f7d52');
        return 'Changed the accent to emerald green.';
      }

      const named = templatePresets.find((p) => text.includes(p.name.toLowerCase()));
      const keyword = /minimal/.test(text) ? 'minimal-professional' : /dark|futuristic/.test(text) ? 'dark-futuristic' : null;
      if (named || keyword) {
        const id = named?.id || keyword;
        if (applyTemplate(id)) return `Applied ${templatePresets.find((p) => p.id === id).name}.`;
      }

      const visibility = text.match(/\b(hide|show)\b.*\b([a-z-]+)\b/);
      if (visibility) {
        const target = sections.find((s) => text.includes(s.id) || text.includes((sectionLabels[s.id] || '').toLowerCase()));
        if (target) {
          toggleSection(target.id, visibility[1] === 'show');
          return `${sectionLabels[target.id] || target.id} is ${visibility[1] === 'show' ? 'visible again' : 'hidden from the portfolio'}.`;
        }
      }

      const order = text.match(/([\w-]+) (?:above|before) ([\w-]+)/);
      if (order) {
        const [moving, anchor] = [sectionFor(order[1]), sectionFor(order[2])];
        if (moving && anchor) {
          const anchorIndex = sections.findIndex((s) => s.id === anchor.id);
          const movingIndex = sections.findIndex((s) => s.id === moving.id);
          moveSection(moving.id, movingIndex < anchorIndex ? anchorIndex - 1 : anchorIndex);
          return `Moved ${sectionLabels[moving.id] || moving.id} above ${sectionLabels[anchor.id] || anchor.id}.`;
        }
      }

      if (text.includes('heading larger')) {
        updateTheme('content_width', 'wide');
        return 'Expanded the content width for a larger editorial feel.';
      }
      return 'I only run safe local edits here. Try “make the accent emerald green”, “hide the gallery section”, “put projects above about”, or “use Minimal Professional”.';
    },
    [applyTemplate, moveSection, toggleSection, updateTheme],
  );

  /* ---------- keyboard shortcuts ---------- */

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        handleSave();
      } else if (!isEditable(event.target) && key === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (!isEditable(event.target) && key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, redo, undo]);

  const saveLabel = { saving: 'Saving…', saved: 'Autosaved', error: 'Storage full' }[saveStatus];

  return (
    <div className="studio-app">
      <StudioSidebar view={view} onViewChange={changeView} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} project={project} template={template} saveStatus={saveStatus} />
      <main className="studio-main">
        <header className="studio-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>FolioForge</span><ChevronDown size={14} /><strong>{project.name}</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
            <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
            <span className="save-state" role="status"><span className="save-dot" style={saveStatus === 'error' ? { background: '#c0392b' } : undefined} /> {saveLabel}</span>
            <button className="button secondary small" onClick={handleSave} disabled={isSaving} title="Save (Ctrl+S)">{isSaving ? 'Saving…' : <><Save size={15} /> Save</>}</button>
            <button className="button primary small" onClick={() => changeView('preview')}><Eye size={15} /> Preview</button>
          </div>
        </header>

        {view === 'dashboard' && <Dashboard project={project} savedProjects={savedProjects} onNew={() => startNew()} onOpen={openProject} onTemplate={startNew} onImport={importProject} onViewChange={changeView} />}
        {view === 'builder' && (
          <Builder
            project={project} step={step} setStep={setStep}
            onUpdateConfig={updateConfig} onUpdateTheme={updateTheme} onUpdateName={updateProjectName}
            onUpload={handleUpload} onApplyTemplate={applyTemplate}
            onToggleSection={toggleSection} onReorderSection={reorderSection}
            onRunCommand={runLocalCommand} onSave={handleSave} onExport={exportProject}
            isSaving={isSaving} isExporting={isExporting}
            selectedSection={selectedSection} onSelectSection={setSelectedSection}
            previewMode={previewMode} onPreviewMode={setPreviewMode}
          />
        )}
        {view === 'preview' && <PreviewScreen project={project} previewMode={previewMode} onPreviewMode={setPreviewMode} onBack={() => changeView('builder')} />}
        {view === 'code' && <CodeWorkspace project={project} onBack={() => changeView('builder')} onExport={exportProject} isExporting={isExporting} />}
      </main>
      {notice && (
        <div className={`toast ${notice.type}`} role={notice.type === 'warning' ? 'alert' : 'status'}>
          <span aria-hidden="true">{notice.type === 'warning' ? '!' : <Check size={16} />}</span>
          {notice.message}
          <button className="toast-close" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared UI                                                           */
/* ------------------------------------------------------------------ */

function DeviceSwitcher({ value, onChange, large = false }) {
  return (
    <div className={`device-switcher ${large ? 'large-switcher' : ''}`} role="group" aria-label="Preview size">
      {DEVICES.map(({ id, label, icon: Icon }) => (
        <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)} aria-pressed={value === id} aria-label={`${label} preview`}>
          <Icon size={15} /> {large && label}
        </button>
      ))}
    </div>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented-field">
      <span className="field-label">{label}</span>
      <div className="segmented-control" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option} className={value === option ? 'active' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
    </div>
  );
}

function FormIntro({ eyebrow, title, description }) {
  return <div className="form-intro"><span className="eyebrow muted-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>;
}

function Field({ label, hint, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function TextField({ label, hint, value, onChange, ...rest }) {
  return <Field label={label} hint={hint}><input value={value || ''} onChange={(event) => onChange(event.target.value)} {...rest} /></Field>;
}

function TextArea({ label, hint, value, onChange, ...rest }) {
  return <Field label={label} hint={hint}><textarea value={value || ''} onChange={(event) => onChange(event.target.value)} {...rest} /></Field>;
}

function StudioSidebar({ view, onViewChange, open, onClose, project, template, saveStatus }) {
  return (
    <>
      {open && <button className="mobile-scrim" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`studio-sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark">F</div>
          <div><strong>FolioForge</strong><span>creative studio</span></div>
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={17} /></button>
        </div>
        <div className="sidebar-project">
          <span className="sidebar-label">Current project</span>
          <strong>{project.name}</strong>
          <span className="template-pill" style={{ '--pill-accent': template.colors.accent_color }}>{template.name}</span>
        </div>
        <nav className="studio-nav" aria-label="Primary navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => onViewChange(id)}>
              <Icon size={17} /><span>{label}</span>{id === 'code' && <span className="nav-beta">SOURCE</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-card"><Sparkles size={16} /><div><strong>Make it yours</strong><span>Start with the Creative Editorial direction, then tune every detail.</span></div></div>
        <div className="sidebar-bottom">
          <span className="sidebar-label">Project status</span>
          <div className="status-line"><span className="save-dot" /> {saveStatus === 'error' ? 'Local storage is full' : 'Draft saved locally'}</div>
          <span className="sidebar-version">FolioForge 1.0 · local studio</span>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function Dashboard({ project, savedProjects, onNew, onOpen, onTemplate, onImport, onViewChange }) {
  const importRef = useRef(null);
  const { full_name: fullName, professional_title: title } = project.config;

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-copy-dashboard">
          <span className="eyebrow"><Sparkles size={14} /> Portfolio studio for people with a point of view</span>
          <h1>Build a portfolio that feels like <em>you.</em></h1>
          <p>FolioForge turns your story, projects, and ambitions into a polished personal site — then gives you the real source code to keep.</p>
          <div className="dashboard-cta">
            <button className="button primary large" onClick={onNew}><Wand2 size={18} /> Create your portfolio <ArrowRight size={17} /></button>
            <button className="button ghost large" onClick={() => onViewChange('builder')}>Continue current draft</button>
            <button className="button ghost large" onClick={() => importRef.current?.click()}><Upload size={16} /> Import JSON</button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { onImport(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
          <div className="trust-row">
            <span><span className="save-dot" /> Local-first drafts</span>
            <span><Code2 size={14} /> Runnable export</span>
            <span><Sparkles size={14} /> {templatePresets.length} art-directed templates</span>
          </div>
        </div>
        <div className="dashboard-art">
          <div className="art-label">YOUR STORY<br /><span>IN MOTION</span></div>
          <div className="art-card art-back"><span>01</span><strong>Build<br />with<br /><em>intention.</em></strong></div>
          <div className="art-card art-front">
            <div className="art-topline"><span>folio / 001</span><span>↗</span></div>
            <div className="art-face">{(fullName || 'Your Name').slice(0, 1)}</div>
            <div className="art-name">{fullName || 'Your Name'}<small>{title || 'Creative builder'}</small></div>
          </div>
          <div className="art-sticker">MAKE<br />IT<br /><span>MEMORABLE</span></div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading-row">
          <div><span className="eyebrow muted-eyebrow">Your workspace</span><h2>Pick up where you left off.</h2></div>
          <button className="text-button" onClick={onNew}><Plus size={16} /> New project</button>
        </div>
        <div className="project-list">
          {savedProjects.length ? (
            savedProjects.slice(0, 4).map((saved) => (
              <button className="project-list-card" key={saved.id} onClick={() => onOpen(saved)}>
                <div className="project-list-preview" style={{ '--card-bg': saved.config?.theme?.background_color || '#f6f0e7', '--card-accent': saved.config?.theme?.accent_color || '#315c42' }}>
                  <span>{(saved.config?.full_name || 'Y').slice(0, 1)}</span>
                </div>
                <div className="project-list-info"><strong>{saved.name}</strong><span>{saved.config?.template_id || 'creative-editorial'} · edited {formatDate(saved.updatedAt)}</span></div>
                <ArrowRight size={17} />
              </button>
            ))
          ) : (
            <div className="empty-projects">
              <div className="empty-icon"><Layers3 size={20} /></div>
              <div><strong>No saved projects yet</strong><span>Your first portfolio will appear here after you save it.</span></div>
              <button className="button secondary small" onClick={onNew}>Start now <ArrowRight size={14} /></button>
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-section templates-section">
        <div className="section-heading-row">
          <div><span className="eyebrow muted-eyebrow">Starter directions</span><h2>Choose a mood, not a mold.</h2></div>
          <span className="section-note">All templates are editable</span>
        </div>
        <div className="template-grid">
          {templatePresets.slice(0, 4).map((item, index) => (
            <button className={`template-card template-card-${item.tone}`} key={item.id} onClick={() => onTemplate(item.id)} style={{ '--template-bg': item.colors.background_color, '--template-accent': item.colors.accent_color, '--template-text': item.colors.text_color }}>
              <div className="template-card-visual"><span className="template-card-number">{pad(index + 1)}</span><div className="template-visual-lines"><span /><span /><span /></div><strong>{item.name}</strong></div>
              <div className="template-card-copy"><strong>{item.name}</strong><span>{item.description}</span></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

function Builder({
  project, step, setStep, onUpdateConfig, onUpdateTheme, onUpdateName, onUpload, onApplyTemplate,
  onToggleSection, onReorderSection, onRunCommand, onSave, onExport, isSaving, isExporting,
  selectedSection, onSelectSection, previewMode, onPreviewMode,
}) {
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  const goTo = (index) => setStep(steps[Math.min(steps.length - 1, Math.max(0, index))].id);
  const exportLabel = isExporting ? 'Exporting…' : null;

  return (
    <div className="page builder-page">
      <div className="builder-heading">
        <div><span className="eyebrow muted-eyebrow">Portfolio builder</span><h1>Shape the story.</h1><p>Move through the essentials, then let the preview show you what the finished experience feels like.</p></div>
        <div className="builder-heading-actions">
          <button className="button secondary small" onClick={onSave} disabled={isSaving}><Save size={15} /> {isSaving ? 'Saving…' : 'Save draft'}</button>
          <button className="button primary small" onClick={onExport} disabled={isExporting}><Download size={15} /> {exportLabel || 'Export ZIP'}</button>
        </div>
      </div>

      <div className="builder-layout">
        <StepRail currentStep={step} onSelect={setStep} />
        <div className="builder-workspace">
          {step === 'basics' && <BasicsStep project={project} onUpdateConfig={onUpdateConfig} onUpdateName={onUpdateName} onUpload={onUpload} />}
          {step === 'content' && <ContentStep config={project.config} onUpdateConfig={onUpdateConfig} />}
          {step === 'design' && <DesignStep config={project.config} onUpdateTheme={onUpdateTheme} onApplyTemplate={onApplyTemplate} onToggleSection={onToggleSection} onReorderSection={onReorderSection} />}
          {step === 'export' && <ExportStep project={project} onSave={onSave} onExport={onExport} isExporting={isExporting} />}
          <div className="builder-footer-nav">
            <button className="button ghost small" onClick={() => goTo(currentStepIndex - 1)} disabled={currentStepIndex === 0}><ArrowLeft size={15} /> Back</button>
            <span>Step {currentStepIndex + 1} of {steps.length}</span>
            {currentStepIndex < steps.length - 1
              ? <button className="button primary small" onClick={() => goTo(currentStepIndex + 1)}>Continue <ArrowRight size={15} /></button>
              : <button className="button primary small" onClick={onExport} disabled={isExporting}><Download size={15} /> {exportLabel || 'Download ZIP'}</button>}
          </div>
        </div>

        <div className="builder-preview-column">
          <div className="preview-column-header">
            <div><span className="eyebrow muted-eyebrow">Live canvas</span><strong>{project.config.full_name || 'Your portfolio'}</strong></div>
            <DeviceSwitcher value={previewMode} onChange={onPreviewMode} />
          </div>
          <div className="preview-canvas-frame">
            <ErrorBoundary label="The preview" resetKey={project}>
              <PortfolioPreview project={project} mode={previewMode} selectedSection={selectedSection} onSelectSection={onSelectSection} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <QuickEdit onRunCommand={onRunCommand} />
    </div>
  );
}

function StepRail({ currentStep, onSelect }) {
  const currentIndex = steps.findIndex((item) => item.id === currentStep);
  return (
    <aside className="step-rail">
      <span className="eyebrow muted-eyebrow">Build sequence</span>
      <div className="step-list">
        {steps.map(({ id, label, hint, icon: Icon }, index) => (
          <button key={id} className={`step-item ${currentStep === id ? 'active' : ''}`} aria-current={currentStep === id ? 'step' : undefined} onClick={() => onSelect(id)}>
            <span className="step-index">{index + 1}</span>
            <span className="step-icon"><Icon size={16} /></span>
            <span className="step-copy"><strong>{label}</strong><small>{hint}</small></span>
            {index < currentIndex && <Check size={15} className="step-complete" aria-label="Completed" />}
          </button>
        ))}
      </div>
      <div className="step-tip"><Sparkles size={15} /><span><strong>Small moves, strong signal.</strong> You can come back and change anything later.</span></div>
    </aside>
  );
}

function BasicsStep({ project, onUpdateConfig, onUpdateName, onUpload }) {
  const { config } = project;
  const set = (field) => (value) => onUpdateConfig(field, value);
  return (
    <div className="form-page">
      <FormIntro eyebrow="Step 01 / Basics" title="Start with the signal." description="Give your portfolio enough personality that the design has something real to amplify." />
      <div className="form-card">
        <TextField label="Project name" hint="Only used inside FolioForge" value={project.name} onChange={onUpdateName} placeholder="My portfolio" />
        <div className="form-grid two">
          <TextField label="Full name" value={config.full_name} onChange={set('full_name')} placeholder="Your Name" autoComplete="name" />
          <TextField label="Handle" value={config.handle} onChange={set('handle')} placeholder="@yourhandle" />
        </div>
        <div className="form-grid two">
          <TextField label="Professional title" value={config.professional_title} onChange={set('professional_title')} placeholder="AI engineer & full-stack developer" />
          <TextField label="Location" value={config.location} onChange={set('location')} placeholder="Your city, country" />
        </div>
        <TextArea label="One-line introduction" hint="This appears in the hero and contact section" rows="3" value={config.short_intro} onChange={set('short_intro')} placeholder="I turn ambitious ideas into useful products." />
        <TextArea label="About your work" hint="Write like a person. Two short paragraphs is plenty." rows="7" value={config.bio} onChange={set('bio')} placeholder="Tell people what you build, how you think, and what you care about." />
        <div className="form-grid two">
          <TextField label="Email" type="email" value={config.email} onChange={set('email')} placeholder="hello@example.com" autoComplete="email" />
          <TextField label="Resume URL" type="url" value={config.resume_url} onChange={set('resume_url')} placeholder="https://…" />
        </div>
      </div>
      <div className="form-card media-upload-card">
        <div className="media-upload-copy">
          <span className="upload-icon"><Upload size={18} /></span>
          <div><strong>Portrait image</strong><span>Use a crisp square or vertical image, up to {formatBytes(MAX_IMAGE_BYTES)}. It stays local until you connect the backend.</span></div>
        </div>
        <div className="upload-controls">
          {config.avatar_url && <img src={resolveApiUrl(config.avatar_url)} alt="Current portrait" className="upload-thumb" />}
          <label className="button secondary small"><Upload size={14} /> Choose image<input type="file" accept={ACCEPTED_IMAGES.join(',')} onChange={(event) => { onUpload(event.target.files?.[0], 'avatar_url'); event.target.value = ''; }} /></label>
        </div>
      </div>
    </div>
  );
}

function RepeatableCard({ index, title, onRemove, children }) {
  return (
    <div className="repeatable-card">
      <div className="repeatable-card-top">
        <span className="repeatable-index">{pad(index + 1)}</span>
        <strong>{title}</strong>
        <button className="icon-button danger" onClick={onRemove} aria-label={`Remove ${title}`}><Trash2 size={15} /></button>
      </div>
      {children}
    </div>
  );
}

function ContentStep({ config, onUpdateConfig }) {
  const projects = config.projects || [];
  const experience = config.experience || [];
  const socials = config.social_links || [];

  const patchItem = (field, index, value) => onUpdateConfig(field, (config[field] || []).map((item, i) => (i === index ? { ...item, ...value } : item)));
  const removeItem = (field, index) => onUpdateConfig(field, (config[field] || []).filter((_, i) => i !== index));
  const addItem = (field, item) => onUpdateConfig(field, [...(config[field] || []), item]);

  return (
    <div className="form-page">
      <FormIntro eyebrow="Step 02 / Content" title="Make the work legible." description="Add enough context for someone to understand your craft without making them dig." />

      <div className="form-card">
        <div className="card-heading">
          <div><span className="eyebrow muted-eyebrow">Projects</span><h3>Selected work</h3></div>
          <button className="button secondary small" onClick={() => addItem('projects', { id: createId('project'), title: 'New project', description: 'What did you build and why does it matter?', image_url: '', tags: ['New'], live_url: '', repo_url: '' })}><Plus size={14} /> Add project</button>
        </div>
        {projects.map((item, index) => (
          <RepeatableCard key={item.id || index} index={index} title={item.title || 'Untitled project'} onRemove={() => removeItem('projects', index)}>
            <div className="form-grid two">
              <TextField label="Title" value={item.title} onChange={(value) => patchItem('projects', index, { title: value })} />
              <TextField label="Tags" hint="Comma separated" value={(item.tags || []).join(', ')} onChange={(value) => patchItem('projects', index, { tags: parseList(value) })} />
            </div>
            <TextArea label="Description" rows="3" value={item.description} onChange={(value) => patchItem('projects', index, { description: value })} />
            <div className="form-grid two">
              <TextField label="Live URL" type="url" value={item.live_url} onChange={(value) => patchItem('projects', index, { live_url: value })} placeholder="https://…" />
              <TextField label="Repository URL" type="url" value={item.repo_url} onChange={(value) => patchItem('projects', index, { repo_url: value })} placeholder="https://github.com/…" />
            </div>
          </RepeatableCard>
        ))}
      </div>

      <div className="form-card">
        <div className="card-heading">
          <div><span className="eyebrow muted-eyebrow">Experience</span><h3>Where you have been useful</h3></div>
          <button className="button secondary small" onClick={() => addItem('experience', { id: createId('experience'), date_range: '2024 — Present', role: 'Your role', organization: 'Your organization', description: 'Describe your contribution and the outcome.', tags: ['Impact'], url: '' })}><Plus size={14} /> Add experience</button>
        </div>
        {experience.map((item, index) => (
          <RepeatableCard key={item.id || index} index={index} title={item.role || 'Your role'} onRemove={() => removeItem('experience', index)}>
            <div className="form-grid two">
              <TextField label="Date range" value={item.date_range} onChange={(value) => patchItem('experience', index, { date_range: value })} />
              <TextField label="Role" value={item.role} onChange={(value) => patchItem('experience', index, { role: value })} />
            </div>
            <TextField label="Organization" value={item.organization} onChange={(value) => patchItem('experience', index, { organization: value })} />
            <TextArea label="Description" rows="3" value={item.description} onChange={(value) => patchItem('experience', index, { description: value })} />
            <TextField label="Tags" hint="Comma separated" value={(item.tags || []).join(', ')} onChange={(value) => patchItem('experience', index, { tags: parseList(value) })} />
          </RepeatableCard>
        ))}
      </div>

      <div className="form-card">
        <div className="card-heading"><div><span className="eyebrow muted-eyebrow">Skills & links</span><h3>Give people a way in</h3></div></div>
        <TextField label="Skills" hint="Comma separated" value={(config.skills || []).join(', ')} onChange={(value) => onUpdateConfig('skills', parseList(value))} />
        {socials.map((social, index) => (
          <div className="inline-repeatable" key={index}>
            <input aria-label="Social platform" value={social.platform || ''} onChange={(event) => patchItem('social_links', index, { platform: event.target.value })} placeholder="Platform" />
            <input aria-label="Social URL" type="url" value={social.url || ''} onChange={(event) => patchItem('social_links', index, { url: event.target.value })} placeholder="https://…" />
            <button className="icon-button danger" onClick={() => removeItem('social_links', index)} aria-label="Remove social link"><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="text-button" onClick={() => addItem('social_links', { platform: 'Website', url: 'https://' })}><Plus size={15} /> Add social link</button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="color-field">
      <span className="color-swatch" style={{ background: value }}><input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'} onChange={(event) => onChange(event.target.value)} aria-label={`${label} color`} /></span>
      <span><strong>{label}</strong><small>{value}</small></span>
    </label>
  );
}

function DesignStep({ config, onUpdateTheme, onApplyTemplate, onToggleSection, onReorderSection }) {
  const theme = config.theme || {};
  const sections = config.sections || [];
  return (
    <div className="form-page">
      <FormIntro eyebrow="Step 03 / Design" title="Choose the atmosphere." description="Start with a strong system, then make the details yours. Every template exports as real source code." />

      <div className="form-card">
        <div className="card-heading"><div><span className="eyebrow muted-eyebrow">Template library</span><h3>Distinct starting points</h3></div><span className="card-meta">{templatePresets.length} available</span></div>
        <div className="template-picker-grid">
          {templatePresets.map((item) => (
            <button key={item.id} className={`template-picker ${config.template_id === item.id ? 'active' : ''}`} aria-pressed={config.template_id === item.id} onClick={() => onApplyTemplate(item.id)} style={{ '--picker-bg': item.colors.background_color, '--picker-accent': item.colors.accent_color, '--picker-text': item.colors.text_color }}>
              <div className="picker-preview"><span>F</span><i /><i /><i /></div>
              <div><strong>{item.name}</strong><small>{item.description}</small></div>
              {config.template_id === item.id && <span className="picker-check"><Check size={13} /></span>}
            </button>
          ))}
        </div>
      </div>

      <div className="form-card">
        <div className="card-heading"><div><span className="eyebrow muted-eyebrow">Visual tokens</span><h3>Tune the surface</h3></div><span className="card-meta">Live in preview</span></div>
        <div className="color-grid">
          {[['Background', 'background_color'], ['Accent', 'accent_color'], ['Text', 'text_color'], ['Muted', 'muted_color']].map(([label, key]) => (
            <ColorField key={key} label={label} value={theme[key]} onChange={(value) => onUpdateTheme(key, value)} />
          ))}
        </div>
        <div className="form-grid two">
          <TextField label="Heading font" value={theme.heading_font} onChange={(value) => onUpdateTheme('heading_font', value)} />
          <TextField label="Body font" value={theme.body_font} onChange={(value) => onUpdateTheme('body_font', value)} />
        </div>
        <Segmented label="Motion intensity" options={['reduced', 'subtle', 'expressive']} value={theme.animation_intensity} onChange={(value) => onUpdateTheme('animation_intensity', value)} />
        <Segmented label="Content width" options={['compact', 'comfortable', 'wide']} value={theme.content_width} onChange={(value) => onUpdateTheme('content_width', value)} />
      </div>

      <div className="form-card">
        <div className="card-heading"><div><span className="eyebrow muted-eyebrow">Page flow</span><h3>Make the sequence yours</h3></div><span className="card-meta">Drag-free controls, same result</span></div>
        <div className="section-flow-list">
          {sections.map((section, index) => (
            <div className={`section-flow-row ${section.visible ? '' : 'hidden'}`} key={section.id}>
              <span className="flow-number">{pad(index + 1)}</span>
              <div className="flow-copy"><strong>{sectionLabels[section.id] || section.id}</strong><small>{section.visible ? 'Visible in portfolio' : 'Hidden from portfolio'}</small></div>
              <button className={`visibility-toggle ${section.visible ? 'on' : ''}`} aria-pressed={section.visible} onClick={() => onToggleSection(section.id, !section.visible)}>{section.visible ? 'Visible' : 'Hidden'}</button>
              <div className="flow-arrows">
                <button className="icon-button" onClick={() => onReorderSection(section.id, 'up')} disabled={index === 0} aria-label={`Move ${sectionLabels[section.id] || section.id} up`}><ArrowUp size={14} /></button>
                <button className="icon-button" onClick={() => onReorderSection(section.id, 'down')} disabled={index === sections.length - 1} aria-label={`Move ${sectionLabels[section.id] || section.id} down`}><ArrowDown size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Generated files, recomputed off the urgent render path so typing stays responsive. */
function useGeneratedFiles(project) {
  const deferred = useDeferredValue(project);
  return useMemo(() => getGeneratedFiles(deferred), [deferred]);
}

function ExportStep({ project, onSave, onExport, isExporting }) {
  const files = useGeneratedFiles(project);
  const totalBytes = useMemo(() => Object.values(files).reduce((sum, content) => sum + new Blob([content]).size, 0), [files]);
  return (
    <div className="form-page">
      <FormIntro eyebrow="Step 04 / Export" title="Make it real." description="Your preview and your download use the same structured portfolio data. Save a draft, inspect the source, or ship the ZIP." />
      <div className="export-hero-card">
        <div className="export-icon"><Code2 size={23} /></div>
        <div><span className="eyebrow muted-eyebrow">Ready to generate</span><h3>{project.config.full_name || 'Your portfolio'} is shaped enough to ship.</h3><p>{Object.keys(files).length} files · {formatBytes(totalBytes)} · responsive HTML/CSS/JS · reduced-motion support</p></div>
        <button className="button primary" onClick={onExport} disabled={isExporting}><Download size={16} /> {isExporting ? 'Exporting…' : 'Download ZIP'}</button>
      </div>
      <div className="export-grid">
        <div className="form-card export-checklist">
          <div className="card-heading"><div><span className="eyebrow muted-eyebrow">Preflight</span><h3>What is included</h3></div></div>
          {['Personal content in one normalized config', 'Selected template and theme tokens', 'Responsive static portfolio source', 'Project card interactions and motion', 'README with deployment instructions'].map((item) => (
            <div className="check-row" key={item}><span><Check size={14} /></span>{item}</div>
          ))}
        </div>
        <div className="form-card export-actions-card">
          <span className="eyebrow muted-eyebrow">Keep your options open</span>
          <h3>Save the source of truth.</h3>
          <p>Download the editable JSON too, so you can reopen this project or move it to another workspace.</p>
          <div className="stacked-actions">
            <button className="button secondary" onClick={onSave}><Save size={15} /> Save draft</button>
            <button className="button ghost" onClick={() => downloadJson(project)}><FileJson size={15} /> Download JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickEdit({ onRunCommand }) {
  const [command, setCommand] = useState('');
  const [result, setResult] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const response = onRunCommand(command);
    setResult(response);
    if (!response.startsWith('I only') && !response.startsWith('Type')) setCommand('');
  };
  return (
    <div className="quick-edit">
      <div className="quick-edit-icon"><Wand2 size={17} /></div>
      <div className="quick-edit-copy"><strong>Local edit assistant</strong><span>Safe commands update the structured draft. Open-ended AI needs a configured provider.</span></div>
      <form onSubmit={submit}>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Try: make the accent emerald green" aria-label="Local edit command" />
        <button className="button secondary small" type="submit">Apply</button>
      </form>
      {result && <span className="quick-edit-result" role="status">{result}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview + code workspace                                            */
/* ------------------------------------------------------------------ */

function PreviewScreen({ project, previewMode, onPreviewMode, onBack }) {
  return (
    <div className="page preview-page">
      <div className="full-preview-toolbar">
        <div><button className="button ghost small" onClick={onBack}><ArrowLeft size={15} /> Back to builder</button><span className="preview-toolbar-title">Live portfolio preview</span></div>
        <DeviceSwitcher value={previewMode} onChange={onPreviewMode} large />
      </div>
      <div className="full-preview-stage">
        <ErrorBoundary label="The preview" resetKey={project}>
          <PortfolioPreview project={project} mode={previewMode} readOnly />
        </ErrorBoundary>
      </div>
    </div>
  );
}

function CodeWorkspace({ project, onBack, onExport, isExporting }) {
  const files = useGeneratedFiles(project);
  const fileNames = Object.keys(files);
  const [activeFile, setActiveFile] = useState(fileNames[0]);
  const [copyState, setCopyState] = useState('idle');
  const current = files[activeFile] !== undefined ? activeFile : fileNames[0];
  const source = files[current] || '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div className="page code-page">
      <div className="code-heading">
        <div>
          <button className="button ghost small" onClick={onBack}><ArrowLeft size={15} /> Back to builder</button>
          <span className="eyebrow muted-eyebrow">Source workspace</span>
          <h1>Every pixel has a file.</h1>
          <p>Inspect the generated project, copy what you need, and download the runnable bundle when you are ready.</p>
        </div>
        <button className="button primary" onClick={onExport} disabled={isExporting}><Download size={16} /> {isExporting ? 'Exporting…' : 'Export ZIP'}</button>
      </div>
      <div className="code-layout">
        <aside className="file-tree">
          <span className="file-tree-title">Generated files</span>
          {fileNames.map((name) => (
            <button className={current === name ? 'active' : ''} key={name} aria-current={current === name ? 'true' : undefined} onClick={() => setActiveFile(name)}><Code2 size={14} />{name}</button>
          ))}
          <div className="file-tree-note"><Sparkles size={14} /><span>Static export is deterministic, so the preview and the ZIP stay in sync.</span></div>
        </aside>
        <section className="code-editor-card">
          <div className="code-editor-toolbar">
            <span><span className="editor-dot" /> {current} · {source.split('\n').length} lines · {formatBytes(new Blob([source]).size)}</span>
            <button className="text-button" onClick={copy}>
              {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />} {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy blocked' : 'Copy file'}
            </button>
          </div>
          <pre className="code-editor" tabIndex={0}><code>{source}</code></pre>
        </section>
      </div>
    </div>
  );
}

export default App;
