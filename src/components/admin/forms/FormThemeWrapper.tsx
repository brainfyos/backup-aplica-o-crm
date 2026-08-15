import { CSSProperties, ReactNode, useEffect, useId, useMemo } from 'react';
import type { FormTheme, FormHeadingWeight, FormLetterSpacing } from '@/types/forms';
import { cn } from '@/lib/utils';

// Convert #RRGGBB → { h, s, l } where s and l are 0-100
function hexToHsl(hex?: string | null): { h: number; s: number; l: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hh = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: hh = (b - r) / d + 2; break;
      case b: hh = (r - g) / d + 4; break;
    }
    hh /= 6;
  }
  return { h: Math.round(hh * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function tripletFromHsl(hsl: { h: number; s: number; l: number }): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

function shift(hsl: { h: number; s: number; l: number }, deltaL: number): string {
  const l = Math.max(0, Math.min(100, hsl.l + deltaL));
  return `${hsl.h} ${hsl.s}% ${Math.round(l)}%`;
}

function mixL(a: { h: number; s: number; l: number }, b: { h: number; s: number; l: number }, t: number): string {
  // mix lightness from a toward b by t (0..1), keep hue/sat from a
  const l = a.l * (1 - t) + b.l * t;
  return `${a.h} ${a.s}% ${Math.round(l)}%`;
}

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function radiusValue(radius?: string): string {
  if (!radius) return '0.75rem';
  const map: Record<string, string> = {
    none: '0px',
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  };
  return map[radius] ?? radius;
}

interface FormThemeWrapperProps {
  theme: FormTheme;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Applies a Form's theme by overriding the relevant shadcn CSS variables
 * scoped to its subtree.
 */
export function FormThemeWrapper({ theme, children, className, style }: FormThemeWrapperProps) {
  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    const primaryHsl = hexToHsl(theme.primary_color);
    const bgHsl = hexToHsl(theme.background_color);
    const textHsl = hexToHsl(theme.text_color);
    const progressHsl = hexToHsl(theme.progress_color || theme.primary_color);

    const isDarkBg = theme.background_color ? hexLuminance(theme.background_color) < 0.5 : false;
    // Direction to shift surfaces away from the page bg (lighter on dark, darker on light)
    const dir = isDarkBg ? 1 : -1;

    if (primaryHsl) {
      vars['--primary'] = tripletFromHsl(primaryHsl);
      vars['--ring'] = tripletFromHsl(primaryHsl);
      const primaryDark = theme.primary_color
        ? hexLuminance(theme.primary_color) < 0.6
        : true;
      vars['--primary-foreground'] = primaryDark ? '0 0% 100%' : '0 0% 10%';
      // Override the platform gradient/glow so themed buttons follow the form's primary color.
      // The shadcn Button "default" variant uses .gradient-primary + shadow-glow which are otherwise hardcoded.
      const darkStop = `hsl(${primaryHsl.h} ${primaryHsl.s}% ${Math.max(0, primaryHsl.l - 18)}%)`;
      const midStop = `hsl(${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%)`;
      const lightStop = `hsl(${primaryHsl.h} ${primaryHsl.s}% ${Math.min(100, primaryHsl.l + 22)}%)`;
      vars['--gradient-primary'] = `linear-gradient(135deg, ${darkStop}, ${midStop}, ${lightStop})`;
      vars['--shadow-glow'] = `0 0 20px hsl(${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}% / 0.30)`;
    }
    if (bgHsl) {
      vars['--background'] = tripletFromHsl(bgHsl);
      // Card slightly elevated from background
      vars['--card'] = shift(bgHsl, dir * 3);
      vars['--popover'] = shift(bgHsl, dir * 3);
      // Muted/accent surfaces
      vars['--muted'] = shift(bgHsl, dir * 8);
      vars['--accent'] = shift(bgHsl, dir * 10);
      vars['--secondary'] = shift(bgHsl, dir * 6);
      // Borders/inputs
      vars['--border'] = shift(bgHsl, dir * 14);
      vars['--input'] = shift(bgHsl, dir * 14);
    }
    if (textHsl) {
      // Garante contraste: se texto e fundo têm luminância próximas, força legibilidade
      let effectiveText = textHsl;
      if (bgHsl) {
        const diff = Math.abs(textHsl.l - bgHsl.l);
        if (diff < 35) {
          effectiveText = isDarkBg
            ? { h: 0, s: 0, l: 100 }
            : { h: 0, s: 0, l: 8 };
        }
      }
      vars['--foreground'] = tripletFromHsl(effectiveText);
      vars['--card-foreground'] = tripletFromHsl(effectiveText);
      vars['--popover-foreground'] = tripletFromHsl(effectiveText);
      vars['--accent-foreground'] = tripletFromHsl(effectiveText);
      vars['--secondary-foreground'] = tripletFromHsl(effectiveText);
      // Muted-foreground: mix text toward bg ~45%
      if (bgHsl) {
        vars['--muted-foreground'] = mixL(effectiveText, bgHsl, 0.45);
      } else {
        vars['--muted-foreground'] = shift(effectiveText, isDarkBg ? -20 : 20);
      }
    }
    if (progressHsl) vars['--form-progress'] = tripletFromHsl(progressHsl);
    vars['--radius'] = radiusValue(theme.border_radius);
    return vars as CSSProperties;
  }, [theme]);

  const fontFamily = theme.font_family && theme.font_family !== 'Inter'
    ? `${theme.font_family}, Inter, system-ui, sans-serif`
    : undefined;

  // Heading typography (per-theme)
  const headingFont = theme.heading_font_family || theme.font_family;
  const headingFontStack = headingFont && headingFont !== 'Inter'
    ? `${headingFont}, Inter, system-ui, sans-serif`
    : 'Inter, system-ui, sans-serif';
  const headingWeight = weightToCss(theme.heading_weight);
  const headingTransform = theme.heading_transform === 'uppercase' ? 'uppercase' : 'none';
  const headingSpacing = letterSpacingCss(theme.heading_letter_spacing);

  // Load Google Fonts dynamically for display fonts not in the base set
  useEffect(() => {
    const fonts = [theme.font_family, theme.heading_font_family]
      .filter(Boolean)
      .filter((f) => f && !BASE_FONTS.includes(f) && f !== 'system-ui') as string[];
    if (fonts.length === 0) return;
    const links: HTMLLinkElement[] = [];
    fonts.forEach((f) => {
      const id = `form-font-${f.replace(/\s+/g, '-')}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;500;600;700;800;900&display=swap`;
      document.head.appendChild(link);
      links.push(link);
    });
  }, [theme.font_family, theme.heading_font_family]);

  const scopeId = useId().replace(/[:]/g, '');
  const scopeClass = `form-theme-${scopeId}`;

  return (
    <div
      className={cn('w-full h-full text-foreground', scopeClass, className)}
      style={{ ...cssVars, ...(fontFamily ? { fontFamily } : {}), ...style }}
    >
      <style>{`
        .${scopeClass} h1, .${scopeClass} h2, .${scopeClass} h3 {
          font-family: ${headingFontStack};
          font-weight: ${headingWeight};
          text-transform: ${headingTransform};
          letter-spacing: ${headingSpacing};
        }
      `}</style>
      {children}
    </div>
  );
}

const BASE_FONTS = ['Inter', 'system-ui', 'sans-serif'];

function weightToCss(w?: FormHeadingWeight): number {
  switch (w) {
    case 'normal': return 400;
    case 'medium': return 500;
    case 'semibold': return 600;
    case 'extrabold': return 800;
    case 'black': return 900;
    case 'bold':
    default: return 700;
  }
}

function letterSpacingCss(s?: FormLetterSpacing): string {
  switch (s) {
    case 'tighter': return '-0.05em';
    case 'tight': return '-0.025em';
    case 'wide': return '0.025em';
    case 'widest': return '0.1em';
    case 'normal':
    default: return '0';
  }
}

export const FORM_FONT_OPTIONS = [
  'Inter',
  'Manrope',
  'Poppins',
  'Roboto',
  'DM Sans',
  'Plus Jakarta Sans',
  'Space Grotesk',
  'Outfit',
  'Sora',
  'system-ui',
] as const;

export const FORM_HEADING_FONT_OPTIONS = [
  'Inter',
  'Archivo Black',
  'Anton',
  'Bebas Neue',
  'Oswald',
  'Space Grotesk',
  'Poppins',
  'Manrope',
  'Sora',
  'Outfit',
  'Plus Jakarta Sans',
  'DM Sans',
] as const;

export const FORM_HEADING_WEIGHT_OPTIONS: { value: FormHeadingWeight; label: string }[] = [
  { value: 'normal', label: 'Regular' },
  { value: 'medium', label: 'Médio' },
  { value: 'semibold', label: 'Semi-bold' },
  { value: 'bold', label: 'Bold' },
  { value: 'extrabold', label: 'Extra-bold' },
  { value: 'black', label: 'Black' },
];

export const FORM_LETTER_SPACING_OPTIONS: { value: FormLetterSpacing; label: string }[] = [
  { value: 'tighter', label: 'Bem apertado' },
  { value: 'tight', label: 'Apertado' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Largo' },
  { value: 'widest', label: 'Muito largo' },
];

export const FORM_RADIUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'sm', label: 'Pequeno' },
  { value: 'md', label: 'Médio' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Extra' },
  { value: 'full', label: 'Arredondado' },
];

/** Resolve a form button visual style into shadcn Button variant + extra classes. */
export function formButtonProps(style?: FormTheme['button_style']): {
  variant: 'default' | 'outline' | 'ghost';
  className: string;
} {
  switch (style) {
    case 'outlined':
      return {
        variant: 'outline',
        className: 'border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground',
      };
    case 'text':
      return {
        variant: 'ghost',
        className: 'text-primary hover:bg-primary/10',
      };
    case 'filled':
    default:
      return { variant: 'default', className: '' };
  }
}
