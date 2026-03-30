import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — minai',
  description: 'How minai collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <a href="/" className="text-minai-600 text-sm hover:underline">&larr; Back to minai</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: March 30, 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. What We Collect</h2>
            <p>When you use minai, we collect:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account information:</strong> Email address, display name, and profile photo when you sign in with Google.</li>
              <li><strong>Conversations:</strong> Messages you send and responses from the AI, stored to provide conversation history.</li>
              <li><strong>Uploaded files:</strong> Documents (PDFs, DOCX, etc.) and images you upload for AI analysis, stored on our servers.</li>
              <li><strong>Calendar data:</strong> When you connect Google Calendar, we access event titles, times, and attendees to provide scheduling features. We do not store full calendar data — it is fetched on demand.</li>
              <li><strong>Payment information:</strong> Blockchain transaction hashes and wallet addresses for crypto top-ups. We do not collect credit card or bank information.</li>
              <li><strong>Usage data:</strong> Token counts, model usage, and costs per message for billing purposes.</li>
              <li><strong>Technical data:</strong> Browser timezone (for scheduled briefings), IP address (for rate limiting and security).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and improve the AI assistant service.</li>
              <li>To process payments and maintain your account balance.</li>
              <li>To send proactive calendar briefings at your preferred times.</li>
              <li>To extract and index text from uploaded documents so the AI can answer questions about them.</li>
              <li>To detect and prevent abuse, fraud, and unauthorized access.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Third-Party Services</h2>
            <p>We use the following third-party services to operate minai:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Alibaba Cloud (DashScope):</strong> AI model inference. Your messages are sent to their API for processing. See <a href="https://www.alibabacloud.com/help/en/model-studio/privacy-policy" className="text-minai-600 hover:underline" target="_blank" rel="noopener">Alibaba Cloud Privacy Policy</a>.</li>
              <li><strong>Google:</strong> Authentication (Google Sign-In) and Calendar API access.</li>
              <li><strong>Celo blockchain:</strong> Payment processing. Deposit transactions are public on the Celo blockchain.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Data Storage and Security</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Data is stored on a secured VPS with encrypted connections (TLS), firewall rules, and intrusion detection.</li>
              <li>Session cookies are HTTP-only, secure, and SameSite-protected.</li>
              <li>Uploaded files are stored in user-isolated directories on the server filesystem.</li>
              <li>We do not sell, rent, or share your personal data with third parties for marketing purposes.</li>
              <li>We do not use collected data for behavioral profiling, advertising targeting, or cross-service data aggregation. Usage data and technical data are used solely for billing, security, and service delivery.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Conversations and messages in inactive notebooks are automatically purged after <strong>3 months</strong> of inactivity.</li>
              <li>Uploaded files are retained as long as the notebook they belong to is active.</li>
              <li>You can delete individual messages, files, or entire notebooks at any time. Deleted data is soft-deleted and permanently purged within 30 days.</li>
              <li>Account data (email, display name) is retained as long as your account is active. Request full deletion by contacting us.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Your Rights</h2>
            <p>You may:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access and download your data at any time.</li>
              <li>Delete your conversations, files, and notes.</li>
              <li>Disconnect your Google account from Settings.</li>
              <li>Request full account deletion by contacting us.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Contact</h2>
            <p>For privacy questions or data requests, contact us at <a href="mailto:lb@minai.work" className="text-minai-600 hover:underline">lb@minai.work</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
