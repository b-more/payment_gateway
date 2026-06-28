import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CredentialService } from './credential.service';

// Issues API credentials and authenticates signed requests. Shared by the §8 API
// (auth) and §5.1 onboarding (auto-generation).
@Module({
  imports: [DatabaseModule],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialsModule {}
