import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://03c94e3a4e5ca9d7cd5bb1b2722e12b0@o4511097194414080.ingest.de.sentry.io/4511097210929232',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of requests for performance monitoring
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.5, // 50% of error sessions get replay
  enabled: process.env.NODE_ENV === 'production',
  beforeSend(event) {
    // Drop errors caused by browser extensions (Grammarly, password managers, etc.)
    const frames = event.exception?.values?.[0]?.stacktrace?.frames || [];
    if (frames.some((f) => f.filename?.includes('injectedScript') || f.filename?.includes('extension://'))) {
      return null;
    }
    return event;
  },
});
