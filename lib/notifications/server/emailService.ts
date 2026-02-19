/**
 * Email Service
 *
 * Sends notification emails via Nodemailer with Zoho SMTP.
 */

import nodemailer from 'nodemailer';
import type { NotificationType } from '../domain/notification.types';
import { escapeHtml } from '@/lib/conversations/domain/reportHtml';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.zoho.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface EmailContent {
  subject: string;
  html: string;
}

function getEmailContent(
  type: NotificationType,
  title: string,
  body: string | null,
  linkPath: string
): EmailContent | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hivemind.com';
  const fullLink = `${baseUrl}${linkPath}`;

  switch (type) {
    case 'new_conversation':
      return {
        subject: `New conversation: ${body ?? 'Untitled'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">${escapeHtml(title)}</h2>
            <p style="color: #475569;">A new conversation has been started:</p>
            <p style="color: #1e293b; font-size: 18px; font-weight: 500;">${escapeHtml(body ?? 'Untitled')}</p>
            <a href="${fullLink}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Conversation</a>
          </div>
        `,
      };

    case 'analysis_complete':
    case 'report_generated':
      return {
        subject: `${type === 'analysis_complete' ? 'Analysis complete' : 'New report available'}: ${body ?? 'Untitled'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">${escapeHtml(title)}</h2>
            <p style="color: #475569;">The conversation "${escapeHtml(body ?? 'Untitled')}" has new insights available.</p>
            <a href="${fullLink}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View Insights</a>
          </div>
        `,
      };

    case 'opinion_liked':
      // No email for opinion likes
      return null;

    default:
      return null;
  }
}

export async function sendNotificationEmail(
  to: string,
  type: NotificationType,
  title: string,
  body: string | null,
  linkPath: string
): Promise<{ success: boolean; error?: string }> {
  // Skip if SMTP not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('[emailService] SMTP not configured, skipping email');
    return { success: false, error: 'SMTP not configured' };
  }

  const content = getEmailContent(type, title, body, linkPath);
  if (!content) {
    return { success: true }; // Not an error, just not an email-worthy notification
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject: content.subject,
      html: content.html,
    });

    console.log(`[emailService] Email sent to ${to} for ${type}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[emailService] Failed to send email: ${message}`);
    return { success: false, error: message };
  }
}
