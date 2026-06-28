import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { EmailModule } from '../email/email.module';
import { AuditService } from '../audit/audit.service';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { OnboardingService } from './onboarding.service';
import { AccountProvisioningService } from './account-provisioning.service';
import { OnboardingController } from './onboarding.controller';

// Merchant onboarding (§5.1). The public application endpoint lives here; the
// admin-side services (review, provision, promote) are exported for the admin
// portal to call once portal auth (§7) exists.
@Module({
  imports: [DatabaseModule, CredentialsModule, EmailModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, AccountProvisioningService, AuditService, RateLimitGuard],
  exports: [OnboardingService, AccountProvisioningService],
})
export class OnboardingModule {}
