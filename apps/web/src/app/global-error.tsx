'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-gray-400 mb-4 text-sm">The error has been reported automatically.</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-minai-600 hover:bg-minai-700 text-white text-sm transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
