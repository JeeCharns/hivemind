import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Typography system based on actual usage
        // Display sizes
        'display-lg': ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }], // 60px
        'display-md': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }], // 48px
        'display-sm': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }], // 32px

        // Headings
        'h1': ['1.875rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }], // 30px
        'h2': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }], // 24px
        'h3': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }], // 20px
        'h4': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }], // 18px

        // Body text
        'body-lg': ['1rem', { lineHeight: '1.5', fontWeight: '400' }], // 16px
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }], // 14px
        'body-sm': ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }], // 13px

        // UI elements
        'subtitle': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }], // 14px medium
        'label': ['0.75rem', { lineHeight: '1.4', fontWeight: '600' }], // 12px semibold
        'label-sm': ['0.6875rem', { lineHeight: '1.3', fontWeight: '600' }], // 11px semibold
        'pill': ['0.625rem', { lineHeight: '1.2', fontWeight: '600' }], // 10px semibold
        'button-lg': ['1rem', { lineHeight: '1.25', fontWeight: '500' }], // 16px
        'button': ['0.875rem', { lineHeight: '1.25', fontWeight: '500' }], // 14px
        'button-sm': ['0.875rem', { lineHeight: '1.25', fontWeight: '500' }], // 14px
        'allcaps': ['0.75rem', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.05em', textTransform: 'uppercase' }], // 12px uppercase

        // Special
        'info': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }], // 12px normal
      },
      colors: {
        // Standardize text colors based on usage
        text: {
          primary: '#172847',
          secondary: '#566175',
          tertiary: '#9498B0',
          muted: '#566888',
          disabled: '#A0AEC0',
        },
        brand: {
          primary: '#3A1DC8',
          hover: '#2F17A0',
        },
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
