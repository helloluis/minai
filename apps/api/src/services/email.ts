/**
 * Email notification service — uses Resend for transactional emails.
 *
 * Env vars:
 *   RESEND_API_KEY — API key from resend.com
 *   TEAM_EMAILS — comma-separated list of team emails to notify
 */

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? 'minai <onboarding@resend.dev>';
const TEAM_EMAILS = (process.env.TEAM_EMAILS ?? 'lbuenaventura2@gmail.com').split(',').map((e) => e.trim());

export async function sendFeatureSuggestionEmail(opts: {
  title: string;
  description: string;
  userName: string | null;
  userEmail: string | null;
  userId: string;
}): Promise<void> {
  const { title, description, userName, userEmail, userId } = opts;

  const contactInfo = userEmail
    ? `${userName ?? 'Anonymous'} (${userEmail})`
    : `${userName ?? 'Anonymous'} (no email — user ID: ${userId})`;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
      <h2 style="color: #16a34a;">New Feature Suggestion</h2>
      <h3 style="margin-bottom: 4px;">${escapeHtml(title)}</h3>
      <blockquote style="border-left: 3px solid #16a34a; padding: 8px 16px; margin: 16px 0; background: #f0fdf4; color: #333;">
        ${escapeHtml(description).replace(/\n/g, '<br>')}
      </blockquote>
      <p><strong>From:</strong> ${escapeHtml(contactInfo)}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
      <p style="color: #888; font-size: 12px;">Sent from minai feature suggestion system</p>
    </div>
  `;

  if (!resend) {
    console.log(`[Email] Resend not configured — would have sent feature suggestion to ${TEAM_EMAILS.join(', ')}`);
    console.log(`[Email] Title: ${title}`);
    console.log(`[Email] From: ${contactInfo}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: TEAM_EMAILS,
      subject: `[minai] Feature suggestion: ${title}`,
      html,
    });
    console.log(`[Email] Feature suggestion sent to ${TEAM_EMAILS.join(', ')}`);
  } catch (err) {
    console.error('[Email] Failed to send feature suggestion:', err);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
