import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Feature Comprehension Score',
  description:
    "Measure whether engineering teams understand what they built, using Peter Naur's Theory Building framework.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
