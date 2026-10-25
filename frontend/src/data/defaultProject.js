export const sectionLabels = {
  about: 'About',
  projects: 'Projects',
  experience: 'Experience',
  'photo-strip': 'Photo strip',
  skills: 'Skills',
  gallery: 'Gallery',
  contact: 'Contact',
};

export const templatePresets = [
  {
    id: 'creative-editorial',
    name: 'Creative Editorial',
    description: 'Warm ivory, expressive typography, layered cards, and art-directed motion.',
    tone: 'warm-editorial',
    colors: { background_color: '#f6f0e7', accent_color: '#315c42', text_color: '#1f1f1f', muted_color: '#6d6a63' },
  },
  {
    id: 'minimal-professional',
    name: 'Minimal Professional',
    description: 'Quiet contrast, clean grids, and a case-study-first reading experience.',
    tone: 'minimal',
    colors: { background_color: '#f7f8fa', accent_color: '#2457d6', text_color: '#15171b', muted_color: '#687080' },
  },
  {
    id: 'dark-futuristic',
    name: 'Dark Futuristic',
    description: 'Deep canvas, luminous accents, and a technical atmosphere for bold builders.',
    tone: 'futuristic',
    colors: { background_color: '#101217', accent_color: '#7ce2c1', text_color: '#f4f4ee', muted_color: '#a0a6b2' },
  },
  {
    id: 'developer-terminal',
    name: 'Developer Terminal',
    description: 'Terminal cues, structured information, and a direct engineering voice.',
    tone: 'terminal',
    colors: { background_color: '#0c1110', accent_color: '#a7f36b', text_color: '#e9f5eb', muted_color: '#91a397' },
  },
  {
    id: 'modern-glass',
    name: 'Modern Glass',
    description: 'Soft gradients and translucent surfaces with a product-design polish.',
    tone: 'glass',
    colors: { background_color: '#e9eefb', accent_color: '#6449d8', text_color: '#1f2131', muted_color: '#656b84' },
  },
  {
    id: 'playful-experimental',
    name: 'Playful Experimental',
    description: 'Unexpected composition, bright color moments, and expressive interaction.',
    tone: 'experimental',
    colors: { background_color: '#fff4dc', accent_color: '#ec5a39', text_color: '#211b24', muted_color: '#806b61' },
  },
];

export function createId(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

export function createDefaultProject() {
  return {
    name: 'My FolioForge portfolio',
    config: {
      template_id: 'creative-editorial',
      full_name: 'Your Name',
      handle: '@yourhandle',
      professional_title: 'AI engineer & full-stack developer',
      short_intro: 'I turn ambitious ideas into clear, useful, and beautifully engineered digital experiences.',
      bio: 'Write a concise story about what you build, how you think, and the kind of people or problems you enjoy working with.',
      location: 'Your city, country',
      email: 'hello@example.com',
      resume_url: '',
      avatar_url: '',
      social_links: [
        { platform: 'GitHub', url: 'https://github.com/' },
        { platform: 'LinkedIn', url: 'https://www.linkedin.com/' },
      ],
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
        },
        {
          id: createId('project'),
          title: 'An intelligent workflow',
          description: 'Show the decision-making and the craft behind a meaningful build.',
          image_url: '',
          tags: ['Python', 'Automation'],
          live_url: '',
          repo_url: '',
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
      gallery: [],
      sections: [
        { id: 'about', visible: true },
        { id: 'projects', visible: true },
        { id: 'experience', visible: true },
        { id: 'photo-strip', visible: true },
        { id: 'skills', visible: true },
        { id: 'gallery', visible: true },
        { id: 'contact', visible: true },
      ],
      theme: {
        background_color: '#f6f0e7',
        accent_color: '#315c42',
        text_color: '#1f1f1f',
        muted_color: '#6d6a63',
        heading_font: 'Space Grotesk',
        body_font: 'Inter',
        animation_intensity: 'expressive',
        content_width: 'comfortable',
      },
    },
  };
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

export function loadDraft() {
  try {
    const stored = localStorage.getItem('folioforge-draft-v1');
    return stored ? JSON.parse(stored) : createDefaultProject();
  } catch {
    return createDefaultProject();
  }
}

export function loadSavedProjects() {
  try {
    const stored = localStorage.getItem('folioforge-projects-v1');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
