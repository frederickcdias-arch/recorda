import nodemailer from 'nodemailer';
import type { EmailService, EmailOptions } from '../../application/ports/email-service.js';
import { logger } from '../logging/logger.js';

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

export class SMTPEmailService implements EmailService {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(config: SMTPConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  async send(options: EmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }
}

/**
 * Console-based email service for development.
 * Logs email content instead of sending it.
 */
export class ConsoleEmailService implements EmailService {
  async send(options: EmailOptions): Promise<void> {
    logger.info('Email sent (console mode)', {
      component: 'email',
      to: options.to,
      subject: options.subject,
    });
  }
}

export function createEmailService(): EmailService {
  const host = process.env.SMTP_HOST;
  if (!host) {
    logger.info('No SMTP_HOST configured — using console email service', { component: 'email' });
    return new ConsoleEmailService();
  }

  return new SMTPEmailService({
    host,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
    from: process.env.SMTP_FROM ?? 'noreply@recorda.local',
  });
}
