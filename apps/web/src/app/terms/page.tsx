import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — minai',
  description: 'Terms and conditions for using the minai AI assistant platform.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <a href="/" className="text-minai-600 text-sm hover:underline">&larr; Back to minai</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: March 19, 2026</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using minai ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
            <p>minai is an AI assistant platform that provides conversational AI, document analysis, image generation, calendar management, and related tools. The Service is provided on a pay-as-you-go basis.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Accounts</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You may create an account using Google Sign-In or anonymous session.</li>
              <li>You are responsible for maintaining the security of your account.</li>
              <li>You must not share your account or use the Service on behalf of others without authorization.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Payments and Credits</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>New accounts receive a free credit allocation. After free credits are exhausted, you must top up to continue using the Service.</li>
              <li>Top-ups are made via cryptocurrency (USDC, cUSD, USDT) on the Celo blockchain.</li>
              <li>All payments are final. Due to the nature of blockchain transactions, refunds are not available for completed deposits.</li>
              <li>Usage costs are deducted from your balance in real time. You can see per-message costs in the chat interface.</li>
              <li>We reserve the right to adjust pricing with reasonable notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any illegal or harmful purpose.</li>
              <li>Attempt to bypass rate limits, payment requirements, or security measures.</li>
              <li>Upload malicious files or content designed to exploit the system.</li>
              <li>Use the AI to generate content that violates applicable laws, including but not limited to: threats of violence, child exploitation, fraud, or harassment.</li>
              <li>Resell access to the Service without written permission.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. AI Output Disclaimer</h2>
            <p>The AI assistant provides information and assistance to the best of its ability, but:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>AI outputs may contain errors, inaccuracies, or hallucinations.</li>
              <li>The Service is not a substitute for professional medical, legal, or financial advice.</li>
              <li>You are responsible for verifying any information provided by the AI before acting on it.</li>
              <li>We are not liable for decisions made based on AI outputs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Intellectual Property</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You retain ownership of content you upload or create using the Service.</li>
              <li>AI-generated images and text are provided for your use; we do not claim ownership of outputs.</li>
              <li>The minai name, logo, and platform are our intellectual property.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Limitation of Liability</h2>
            <p>The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the Service, including loss of data, loss of profits, or service interruptions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Service Availability</h2>
            <p>We strive for high availability but do not guarantee uninterrupted service. We may perform maintenance, updates, or modifications at any time. We will provide reasonable notice for planned downtime when possible.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms. Material changes will be communicated via the platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:hello@buenaventura.ph" className="text-minai-600 hover:underline">hello@buenaventura.ph</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
