import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Minai — AI for Everyone',
  description: 'Affordable frontier AI for emerging economies',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
