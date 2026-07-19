import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { OnboardingService, ONBOARDING_RECEIVED_MESSAGE } from './onboarding.service';
import { ApplicationDto } from './dto/application.dto';

// Public merchant application (ONB-1/2). No API-key auth — an applicant has no
// credentials yet — but rate-limited. Admin-side review/provisioning are NOT
// exposed here; they require admin portal auth (§7).
@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(RateLimitGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('applications')
  @HttpCode(202)
  @ApiOperation({ summary: 'Submit a merchant onboarding application' })
  async apply(@Body() dto: ApplicationDto): Promise<{ merchant_id: string; message: string }> {
    const { merchantId } = await this.onboarding.submitApplication({
      merchant: {
        name: dto.merchant.name,
        merchantType: dto.merchant.merchantType,
        email: dto.merchant.email,
        phone: dto.merchant.phone ?? null,
        tradingName: dto.merchant.tradingName ?? null,
        registrationNumber: dto.merchant.registrationNumber ?? null,
        tpin: dto.merchant.tpin ?? null,
        address: dto.merchant.address ?? null,
        city: dto.merchant.city ?? null,
        website: dto.merchant.website ?? null,
        description: dto.merchant.description ?? null,
      },
      admin: {
        name: dto.admin.name,
        email: dto.admin.email,
        phone: dto.admin.phone ?? null,
      },
      documents: dto.documents ?? [],
      chargeFulfiller: dto.chargeFulfiller ?? 'MERCHANT',
    });
    return { merchant_id: merchantId, message: ONBOARDING_RECEIVED_MESSAGE };
  }
}
