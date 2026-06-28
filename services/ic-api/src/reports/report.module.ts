import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ReportService } from './report.service';

// Self-service reports (§6.1.5/§6.2.5), shared by the admin + merchant portals.
@Module({
  imports: [DatabaseModule],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
