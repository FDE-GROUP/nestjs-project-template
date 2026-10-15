# Mailer Module

The Mailer Module is a comprehensive email service implementation in the NestJS application that handles various types of email communications using Nodemailer and MJML for responsive email templates.

## Features

- Multi-language support (English, Chinese, Japanese)
- Responsive email templates using MJML
- Template-based email rendering
- Support for multiple email types:
  - Verification emails
  - Welcome emails
  - Password reset emails

## Email Sending Flow

```mermaid
sequenceDiagram
  participant Client
  participant MailerService
  participant Nodemailer
  participant MJML
  participant I18nService

  Client->MailerService: sendVerificationEmail(email, verificationCode, lang)
  MailerService->MailerService: renderTemplate('verification', context, lang)
  MailerService->I18nService: translate('emails.verification.title', {lang})
  I18nService-->>MailerService: title
  MailerService->I18nService: translate('emails.verification.greeting', {lang})
  I18nService-->>MailerService: greeting
  MailerService->I18nService: translate('emails.verification.message', {lang})
  I18nService-->>MailerService: message
  MailerService->I18nService: translate('emails.verification.button', {lang})
  I18nService-->>MailerService: button
  MailerService->I18nService: translate('emails.verification.footer', {lang})
  I18nService-->>MailerService: footer
  MailerService->MJML: mjml(template)
  MJML-->>MailerService: html
  MailerService->I18nService: translate('emails.verification.subject', { lang })
  I18nService-->>MailerService: subject
  MailerService->Nodemailer: sendMail(from, to, subject, html)
  Nodemailer-->>MailerService: success
  MailerService-->>Client: void
```

## Configuration

The module requires the following environment variables:

```env
MAIL_HOST=your-smtp-host
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email-username
MAIL_PASSWORD=your-email-password
MAIL_FROM=noreply@yourdomain.com
APP_URL=https://your-app-url.com
```

## Email Templates

The module uses MJML templates located in `apps/api/src/i18n/emails/` for the following email types:

1. Verification Email (`verification.mjml`)
2. Welcome Email (`welcome.mjml`)
3. Forgot Password Email (`forgot-password.mjml`)

Each template supports multiple languages with translations stored in:
- `apps/api/src/i18n/en/emails.json`
- `apps/api/src/i18n/zh/emails.json`
- `apps/api/src/i18n/ja/emails.json`

**Asset path resolution (important).** At runtime neither the mailer nor the i18n loader hard-codes a path relative to its own module file. Both resolve a single **assets root** via `resolveI18nAssetsRoot()` (`apps/api/src/i18n/assets-root.ts`), which walks up from the running module's directory until it finds a directory containing `<lang>/` subfolders — this covers both layouts: the source tree (`apps/api/src/i18n`) and the compiled output (`dist/i18n`, where `nest-cli` `assets` lands after stripping the `sourceRoot` prefix, while compiled code stays under `dist/apps/api/src/…`). Email templates are read from `<assetsRoot>/emails`.

If the assets were not copied into the build output, startup **fails loudly** (no silent fallback to raw keys). Guard: `pnpm run verify:i18n-assets` (run after `pnpm run build`) asserts translations resolve, templates are readable, and the fail-closed path throws.

## Usage

### 1. Import the Module

```typescript
import { MailerModule } from './mailer/mailer.module';

@Module({
  imports: [MailerModule],
})
export class AppModule {}
```

### 2. Inject the Service

```typescript
import { MailerService } from './mailer/mailer.service';

@Injectable()
export class YourService {
  constructor(private readonly mailerService: MailerService) {}
}
```

### 3. Send Emails

#### Verification Email
```typescript
await mailerService.sendVerificationEmail(
  'user@example.com',
  'verification-code',
  'en' // optional, defaults to 'en'
);
```

#### Welcome Email
```typescript
await mailerService.sendWelcomeEmail(
  'user@example.com',
  'John Doe',
  'en' // optional, defaults to 'en'
);
```

#### Forgot Password Email
```typescript
await mailerService.sendForgotPasswordEmail(
  'user@example.com',
  'reset-token',
  30, // expiration time in minutes
  'en' // optional, defaults to 'en'
);
```