/** @type {import('tailwindcss').Config} */
import defaultColors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/*
 * Design tokens. Every colour is a CSS variable (RGB triplet) so light/dark themes swap in one place and opacity
 * modifiers (bg-slate-900/60) keep working.
 *
 *  - neutral  ("slate", also used for "gray"): calm off-white surfaces; 400+ are AA text colours on surface/canvas.
 *  - accent   ("blue" / "indigo" / "violet" / "purple" / "sky"): one restrained deep indigo.
 *  - ok / warn / danger ("emerald|green|teal" / "amber|yellow|orange" / "rose|red|pink"): semantic risk states only.
 *  - "white" is the surface colour: white in light mode, near-black in dark mode, so text-white on an accent or ink
 *    panel stays legible in both themes (dark mode is an inversion of the scales).
 * Semantic aliases (canvas, surface, line, ink, muted, accent, risk-*) are what new code should use.
 */
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

const neutralLight = {
  50: '#f7f7f5', 100: '#efefec', 200: '#e3e3de', 300: '#cfcfc8', 400: '#6b6f76', 500: '#5b6068',
  600: '#4a4f57', 700: '#363a41', 800: '#23262b', 900: '#16181c', 950: '#0d0e10'
};
const neutralDark = {
  50: '#111215', 100: '#1a1c20', 200: '#2a2d32', 300: '#3a3e44', 400: '#9ba0a8', 500: '#aab0b8',
  600: '#c0c4cb', 700: '#d4d8de', 800: '#e4e7eb', 900: '#f0f2f4', 950: '#fafafa'
};
const accentLight = {
  50: '#f2f3fb', 100: '#e3e5f6', 200: '#c9cdee', 300: '#a4aae0', 400: '#7b81cd', 500: '#5b60b9',
  600: '#4548a1', 700: '#393b88', 800: '#2e306f', 900: '#25275a', 950: '#17183a'
};
const reverse = (scale) => Object.fromEntries(SHADES.map((s, i) => [s, scale[SHADES[SHADES.length - 1 - i]]]));
const accentDark = { ...reverse(accentLight), 600: '#8e93e6', 700: '#a7abee', 500: '#7b81cd' };

const FAMILIES = {
  slate: [neutralLight, neutralDark],
  accent: [accentLight, accentDark],
  emerald: [defaultColors.emerald, reverse(defaultColors.emerald)],
  amber: [defaultColors.amber, reverse(defaultColors.amber)],
  rose: [defaultColors.rose, reverse(defaultColors.rose)]
};
const ALIASES = { gray: 'slate', blue: 'accent', indigo: 'accent', violet: 'accent', purple: 'accent', sky: 'accent',
  green: 'emerald', teal: 'emerald', yellow: 'amber', orange: 'amber', red: 'rose', pink: 'rose' };

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; };
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scaleOf = (fam) => Object.fromEntries(SHADES.map((s) => [s, v(`${fam}-${s}`)]));

function vars(i) {
  const out = {};
  for (const [fam, pair] of Object.entries(FAMILIES)) for (const s of SHADES) out[`--c-${fam}-${s}`] = rgb(pair[i][s]);
  out['--c-white'] = rgb(i === 0 ? '#ffffff' : '#17191c');
  return out;
}

const families = Object.fromEntries(Object.keys(FAMILIES).map((f) => [f, scaleOf(f)]));
for (const [alias, fam] of Object.entries(ALIASES)) families[alias] = scaleOf(fam);

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ...families,
        white: v('white'),
        // semantic tokens
        canvas: v('slate-50'),
        surface: { DEFAULT: v('white'), muted: v('slate-50'), sunken: v('slate-100'), inverse: v('slate-900') },
        line: { DEFAULT: v('slate-200'), strong: v('slate-300') },
        ink: { DEFAULT: v('slate-900'), soft: v('slate-700'), muted: v('slate-500'), faint: v('slate-400') },
        accent: { ...families.accent, DEFAULT: v('accent-600'), hover: v('accent-700'), soft: v('accent-50'), fg: v('white') },
        risk: {
          low: v('emerald-700'), 'low-soft': v('emerald-50'), 'low-line': v('emerald-200'),
          medium: v('amber-800'), 'medium-soft': v('amber-50'), 'medium-line': v('amber-200'),
          high: v('rose-700'), 'high-soft': v('rose-50'), 'high-line': v('rose-200'),
          none: v('slate-600'), 'none-soft': v('slate-100'), 'none-line': v('slate-200')
        },
        brand: scaleOf('accent')
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['"Source Serif 4"', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.625rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.3125rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.625rem', { lineHeight: '2.125rem' }],
        '3xl': ['2rem', { lineHeight: '2.5rem' }],
        '4xl': ['2.5rem', { lineHeight: '3rem' }],
        '5xl': ['3.125rem', { lineHeight: '3.5rem' }]
      },
      borderRadius: { sm: '0.25rem', DEFAULT: '0.375rem', md: '0.375rem', lg: '0.5rem', xl: '0.625rem', '2xl': '0.75rem', '3xl': '1rem' },
      boxShadow: {
        '2xs': '0 1px 0 rgb(0 0 0 / 0.02)',
        xs: '0 1px 1px rgb(0 0 0 / 0.03)',
        sm: '0 1px 2px rgb(0 0 0 / 0.04)',
        DEFAULT: '0 1px 3px rgb(0 0 0 / 0.06)',
        md: '0 2px 6px -1px rgb(0 0 0 / 0.07)',
        lg: '0 8px 20px -6px rgb(0 0 0 / 0.10)',
        xl: '0 12px 28px -8px rgb(0 0 0 / 0.14)',
        '2xl': '0 20px 40px -12px rgb(0 0 0 / 0.18)',
        focus: '0 0 0 3px rgb(var(--c-accent-300) / 0.6)'
      },
      spacing: { gutter: '1.5rem', section: '3rem' },
      maxWidth: { page: '1360px' },
      transitionDuration: { DEFAULT: '150ms' }
    }
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': { ...vars(0), colorScheme: 'light' }, '.dark': { ...vars(1), colorScheme: 'dark' } });
    })
  ]
};
