import type { Metadata } from 'next';
import { Syne, Outfit } from 'next/font/google';
import './globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: 'Feature Comprehension Score',
  description:
    "Measure whether engineering teams understand what they built, using Peter Naur's Theory Building framework.",
};

// Inline script applied before React hydrates to prevent flash of wrong theme.
// Reads localStorage and falls back to prefers-color-scheme. See LLD § T4.
const themeInitScript = `(function(){try{var s=localStorage.getItem('fcs-theme');var t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans bg-background text-text-primary">
        {children}
      </body>
    </html>
  );
}
