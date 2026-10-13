import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import mjml from 'mjml';
// import { I18nService } from 'nestjs-i18n'; // Temporarily disabled until I18n module is properly configured
import * as nodemailer from 'nodemailer';
import * as path from 'path';

@Injectable()
export class MailerService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    // @Inject(I18nService) private readonly i18n: I18nService, // Temporarily disabled
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('MAIL_HOST'),
      port: this.configService.get('MAIL_PORT'),
      secure: this.configService.get('MAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get('MAIL_USER'),
        pass: this.configService.get('MAIL_PASSWORD'),
      },
    });
  }

  // 默认入口语言置中文（依 global-cn-adaptation L1 / vision §6 地域约束）。
  // 注：`I18nModule` 尚未接线，`getEmailTranslations` 仍为占位英文——此处只定「默认
  // 语言」基准，全量翻译（校验消息 / 邮件正文）待 I18n 管道接入后启用。
  private async renderTemplate(
    templateName: string,
    context: Record<string, any>,
    lang: string = 'zh',
  ): Promise<string> {
    try {
      // Read MJML template
      const templatePath = path.join(__dirname, '..', 'i18n', 'emails', `${templateName}.mjml`);
      let mjmlTemplate = await fs.readFile(templatePath, 'utf8');

      // Replace template variables with translations
      const translations = await this.getEmailTranslations(templateName, lang, context);

      // Replace all the translation placeholders in the template
      Object.entries(translations).forEach(([key, value]) => {
        const regex = new RegExp(
          `{\\{\\s*'emails\\.${templateName}\\.${key}'\\s*\\|\\s*translate(?::\\s*\\{.*?\\})?\\s*\\}\\}`,
          'g',
        );
        mjmlTemplate = mjmlTemplate.replace(regex, value);
      });

      // Replace context variables
      Object.entries(context).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        mjmlTemplate = mjmlTemplate.replace(regex, String(value));
      });

      // Convert MJML to HTML
      const { html } = mjml(mjmlTemplate);
      return html;
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}`, error);
      throw error;
    }
  }

  private async getEmailTranslations(
    _templateName: string,
    _lang: string,
    _context: Record<string, any>,
  ): Promise<Record<string, string>> {
    // TODO: Implement proper I18n translations when I18n module is configured
    // For now, return default English translations
    const translations: Record<string, string> = {
      title: 'Email Title',
      greeting: 'Hello',
      message: 'This is a message',
      button: 'Click Here',
      footer: 'Email Footer',
    };

    return translations;
  }

  async sendVerificationEmail(
    email: string,
    verificationCode: string,
    lang: string = 'zh',
  ): Promise<void> {
    try {
      const context = {
        verificationCode,
        verificationUrl: `${this.configService.get('APP_URL')}/verify?code=${verificationCode}`,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('verification', context, lang);

      const subject = 'Email Verification'; // TODO: Use I18n when available

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, name: string, lang: string = 'zh'): Promise<void> {
    try {
      const context = {
        name,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('welcome', context, lang);

      const subject = 'Welcome'; // TODO: Use I18n when available

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error);
      throw error;
    }
  }

  async sendForgotPasswordEmail(
    email: string,
    resetToken: string,
    expireTime: number,
    lang: string = 'zh',
  ): Promise<void> {
    try {
      const context = {
        expireTime,
        resetUrl: `${this.configService.get('APP_URL')}/reset-password?token=${resetToken}`,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('forgot-password', context, lang);

      const subject = 'Forgot Password'; // TODO: Use I18n when available

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Forgot password email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send forgot password email to ${email}`, error);
      throw error;
    }
  }
}
