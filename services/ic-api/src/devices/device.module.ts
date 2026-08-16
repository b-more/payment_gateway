import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { AuditService } from '../audit/audit.service';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';

// Per-terminal device registration (0027). The public activation endpoint lives
// here; DeviceService is exported so the merchant/admin portals can
// create/list/revoke terminals.
@Module({
  imports: [DatabaseModule, CredentialsModule],
  controllers: [DeviceController],
  providers: [DeviceService, AuditService, RateLimitGuard],
  exports: [DeviceService],
})
export class DeviceModule {}
