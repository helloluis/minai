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

export async function sendIssueReportEmail(opts: {
  feedbackText: string | null;
  originalPrompt: string;
  originalResponse: string;
  userName: string | null;
  userEmail: string | null;
  userId: string;
}): Promise<void> {
  const { feedbackText, originalPrompt, originalResponse, userName, userEmail, userId } = opts;

  const contactInfo = userEmail
    ? `${userName ?? 'Anonymous'} (${userEmail})`
    : `${userName ?? 'Anonymous'} (no email — user ID: ${userId})`;

  const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '…' : s;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
      <h2 style="color: #dc2626;">Issue Report</h2>
      ${feedbackText ? `<blockquote style="border-left: 3px solid #dc2626; padding: 8px 16px; margin: 16px 0; background: #fef2f2; color: #333;">${escapeHtml(feedbackText).replace(/\n/g, '<br>')}</blockquote>` : '<p><em>No description provided</em></p>'}
      <h4 style="margin-bottom: 4px;">User message:</h4>
      <pre style="background: #f3f4f6; padding: 12px; border-radius: 8px; white-space: pre-wrap; font-size: 13px;">${escapeHtml(truncate(originalPrompt, 2000))}</pre>
      <h4 style="margin-bottom: 4px;">Assistant response:</h4>
      <pre style="background: #f3f4f6; padding: 12px; border-radius: 8px; white-space: pre-wrap; font-size: 13px;">${escapeHtml(truncate(originalResponse, 3000))}</pre>
      <p><strong>From:</strong> ${escapeHtml(contactInfo)}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
      <p style="color: #888; font-size: 12px;">Sent from minai issue reporting system</p>
    </div>
  `;

  if (!resend) {
    console.log(`[Email] Resend not configured — would have sent issue report to ${TEAM_EMAILS.join(', ')}`);
    console.log(`[Email] From: ${contactInfo}`);
    return;
  }

  try {
    const subject = feedbackText
      ? `[minai] Issue: ${feedbackText.slice(0, 60)}${feedbackText.length > 60 ? '…' : ''}`
      : '[minai] Issue report (no description)';
    await resend.emails.send({
      from: FROM,
      to: TEAM_EMAILS,
      subject,
      html,
    });
    console.log(`[Email] Issue report sent to ${TEAM_EMAILS.join(', ')}`);
  } catch (err) {
    console.error('[Email] Failed to send issue report:', err);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
