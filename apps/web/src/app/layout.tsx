import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'minai — AI for the rest of us',
  description: 'Ultra low-cost frontier AI for emerging economies',
  icons: {
    icon: '/icon.svg',
  },
  other: {
    'talentapp:project_verification': '57985bdf612fe4a4de7acf3dc04d6fbbd9082a2dffd14fd9352d3e6243a2d361a607dabca99aaa9656449ea1e6f0f26b46e3c46bcb0c65dab4e97c87eb5456ed',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-71SGL038HS" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-71SGL038HS');
        `}} />
      </head>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
