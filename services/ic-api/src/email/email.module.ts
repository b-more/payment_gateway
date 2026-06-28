import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { createEmailTransport, EMAIL_TRANSPORT } from './transport';

// Transactional email (§9.3). Shared by Auth (OTP) and Onboarding (welcome).
@Module({
  providers: [{ provide: EMAIL_TRANSPORT, useFactory: () => createEmailTransport() }, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
