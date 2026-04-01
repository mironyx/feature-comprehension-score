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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable}`}>
      <body className="font-sans bg-background text-text-primary">
        {children}
      </body>
    </html>
  );
}
