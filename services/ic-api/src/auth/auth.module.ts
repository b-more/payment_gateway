import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MoneyModule } from '../money.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { EmailModule } from '../email/email.module';
import { ReportModule } from '../reports/report.module';
import { AirtelModule } from '../airtel/airtel.module';
import { MtnModule } from '../mtn/mtn.module';
import { AuditService } from '../audit/audit.service';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { AuthService } from './auth.service';
import { AdminReadService } from './admin-read.service';
import { AccountConfigService } from './admin-config.service';
import { UserAdminService } from './user-admin.service';
import { SecurityService } from './security.service';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';

// Portal authentication (§7.1) + RBAC (§7.2). MoneyModule provides Float/Transaction
// services and OnboardingModule the merchant/account services for AdminController.
@Module({
  imports: [DatabaseModule, MoneyModule, OnboardingModule, EmailModule, ReportModule, AirtelModule, MtnModule],
  controllers: [AuthController, AdminController],
  providers: [
    AuthService,
    AdminReadService,
    AccountConfigService,
    UserAdminService,
    SecurityService,
    NotificationsService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    AuditService,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
