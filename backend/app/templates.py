from .schemas import TemplateDefinition


TEMPLATES = [
    TemplateDefinition(
        id="creative-editorial",
        name="Creative Editorial",
        description="Warm ivory surfaces, oversized type, layered imagery, and expressive scroll motion.",
        tone="warm-editorial",
        supports_dark_mode=False,
        supports_3d_motion=True,
    ),
    TemplateDefinition(
        id="minimal-professional",
        name="Minimal Professional",
        description="A restrained, readable portfolio for clear case studies and professional credibility.",
        tone="minimal",
        supports_dark_mode=False,
        supports_3d_motion=False,
    ),
    TemplateDefinition(
        id="dark-futuristic",
        name="Dark Futuristic",
        description="Dark surfaces, luminous accents, and a controlled technical atmosphere.",
        tone="futuristic",
        supports_dark_mode=True,
        supports_3d_motion=True,
    ),
    TemplateDefinition(
        id="developer-terminal",
        name="Developer Terminal",
        description="A terminal-inspired layout with strong information hierarchy and code-like details.",
        tone="terminal",
        supports_dark_mode=True,
        supports_3d_motion=False,
    ),
    TemplateDefinition(
        id="modern-glass",
        name="Modern Glass",
        description="Soft gradients, translucent panels, and a polished product-designer feel.",
        tone="glass",
        supports_dark_mode=True,
        supports_3d_motion=True,
    ),
    TemplateDefinition(
        id="playful-experimental",
        name="Playful Experimental",
        description="Colorful shapes, unexpected composition, and a more expressive motion language.",
        tone="experimental",
        supports_dark_mode=False,
        supports_3d_motion=True,
    ),
]
