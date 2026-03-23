import type { Metadata } from 'next';
import { AuthRedirect, GuestLoginButton } from '@/components/AuthRedirect';
import { FeatureCarousel } from '@/components/FeatureCarousel';
import { FeatureJump } from '@/components/FeatureJump';

export const metadata: Metadata = {
  title: 'minai — AI for the rest of us',
  description: 'Ultra low-cost frontier AI assistant for emerging economies. Pay-as-you-go, no subscriptions. Research, documents, spreadsheets, calendar management, and more.',
  openGraph: {
    title: 'minai — AI for the rest of us',
    description: 'Ultra low-cost frontier AI assistant for emerging economies.',
    url: 'https://minai.work',
    siteName: 'minai',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Client-side auth redirect (invisible — redirects logged-in users) */}
      <AuthRedirect />

      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION — full viewport height
          ═══════════════════════════════════════════════════════════════════ */}
      <section
        className="relative h-screen bg-cover bg-no-repeat flex flex-col"
        style={{ backgroundImage: 'url(/landing-page-bg.jpg)', backgroundPosition: '70% center' }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Karma ribbon */}
        <a
          href="https://www.karmahq.xyz/project/minai"
          target="_blank"
          rel="noopener"
          className="fixed top-0 right-0 z-50 overflow-hidden w-[200px] h-[200px] pointer-events-none"
        >
          <div
            className="pointer-events-auto absolute top-[42px] -right-[70px] w-[260px] text-center
              rotate-45 py-2 shadow-md border-y-[3px] border-green-500 bg-white"
          >
            <span className="text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5">
              We&apos;re on
              <img src="https://www.karmahq.xyz/logo/karma-logo-light.svg" alt="Karma" className="h-4 inline-block" />!
            </span>
          </div>
        </a>

        {/* Hero content — upper left panel (85% of viewport) */}
        <div className="relative z-10 flex-1 flex items-start justify-start p-4 sm:p-10 lg:p-16"
          style={{ height: '85%' }}
        >
          <div className="max-w-md w-full bg-green-900/70 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-2xl border border-white/10">
            {/* Logo + title */}
            <div className="flex items-center gap-4 mb-5">
              <img
                src="/icon.svg"
                alt="minai logo"
                width={56}
                height={61}
                className="flex-shrink-0"
              />
              <div>
                <h1 className="text-3xl font-bold text-white leading-tight">minai</h1>
                <p className="text-green-200/80 text-sm">AI for the rest of us</p>
              </div>
            </div>

            {/* Feature bullets */}
            <ul className="text-green-100/90 mb-6 text-left space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">•</span>
                <span>Deep research, document analysis, image generation, calendar management, and 30+ tools at your fingertips</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">•</span>
                <span>Pay-as-you-go, no subscriptions — top up with as little as $0.10!</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">•</span>
                <span>Top up with <a href="https://minipay.to" target="_blank" className="underline hover:text-white">MiniPay</a> or any crypto wallet on Celo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">•</span>
                <span>Try it for free ❤️</span>
              </li>
            </ul>

            {/* Google SSO */}
            <a
              href="/api/auth/google"
              className="w-full py-3.5 px-6 bg-white hover:bg-gray-50
                text-gray-700 font-semibold rounded-xl text-base transition-colors
                flex items-center justify-center gap-3 shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </a>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-xs text-green-200/50">or</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            {/* Guest login */}
            <GuestLoginButton />

            {/* Legal */}
            <div className="mt-6 flex items-center justify-center gap-4 text-xs text-green-200/40">
              <a href="/privacy" className="hover:text-green-100 transition-colors">Privacy Policy</a>
              <span>·</span>
              <a href="/terms" className="hover:text-green-100 transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>

        {/* Feature-jump — bottom 15% of hero viewport */}
        <FeatureJump />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FEATURES SECTION — carousel + CTA
          ═══════════════════════════════════════════════════════════════════ */}
      <section id="features" className="text-gray-100" style={{ backgroundColor: '#0f1a14' }}>
        {/* Feature carousel */}
        <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24">
          <FeatureCarousel />
        </div>

        {/* Bottom CTA */}
        <div className="border-t border-green-900/40" style={{ backgroundColor: '#0d1710' }}>
          <div className="max-w-lg mx-auto px-6 py-12 text-center">
            <h3 className="text-xl font-semibold text-gray-100 mb-1">
              Ready to give it a try?
            </h3>
            <p className="text-sm text-gray-400 mb-6">We&apos;ll give you free credits to start!</p>

            <a
              href="/api/auth/google"
              className="w-full py-3.5 px-6 bg-white hover:bg-gray-50
                text-gray-700 font-semibold rounded-xl text-base transition-colors
                flex items-center justify-center gap-3 shadow-sm mb-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </a>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-green-900/50" />
              <span className="text-xs text-gray-500">or</span>
              <div className="flex-1 h-px bg-green-900/50" />
            </div>

            <GuestLoginButton />

            <p className="mt-4 text-xs text-gray-500">
              No recurring subscriptions, no credit card required
            </p>
          </div>
        </div>

        {/* Why we built minai — YouTube video */}
        <div className="border-t border-green-900/40 py-16 sm:py-20" style={{ backgroundColor: '#0f1a14' }}>
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h3 className="text-xl font-semibold text-gray-100 mb-2 lowercase">why we built minai</h3>
            <p className="text-sm text-gray-400 mb-8">
              A short video from our founder on why accessible AI matters.
            </p>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl border border-green-900/30">
              <iframe
                src="https://www.youtube.com/embed/KE8L3n1X7V4"
                title="Why we built minai"
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
