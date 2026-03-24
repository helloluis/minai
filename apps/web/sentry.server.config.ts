import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://03c94e3a4e5ca9d7cd5bb1b2722e12b0@o4511097194414080.ingest.de.sentry.io/4511097210929232',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
});
