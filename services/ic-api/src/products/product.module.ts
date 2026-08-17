import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { ApiAuthGuard } from '../api/api-auth.guard';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';

// Product catalog (POS). Device/API-key auth via ApiAuthGuard.
@Module({
  imports: [DatabaseModule, CredentialsModule],
  controllers: [ProductController],
  providers: [ProductService, ApiAuthGuard, RateLimitGuard],
  exports: [ProductService],
})
export class ProductModule {}
