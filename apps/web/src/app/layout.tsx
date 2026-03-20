import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'minai — AI for Everyone',
  description: 'Affordable frontier AI for emerging economies',
  icons: {
    icon: '/icon.svg',
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
