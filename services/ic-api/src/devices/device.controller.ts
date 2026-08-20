import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../api/rate-limit.guard';
import { DeviceService } from './device.service';
import { ActivateDeviceDto } from './dto/activate-device.dto';

export interface ActivateDeviceResponse {
  device_id: string;
  api_key: string;
  secret: string;
  signing_key: string;
  account_number: string;
  merchant_name: string;
  branch: string;
  environment: 'SANDBOX' | 'LIVE';
  trading_name: string;
  address: string;
  city: string;
  tpin: string;
  merchant_phone: string;
  registration_number: string;
}

// Public terminal activation. No API-key auth — the terminal has no credential
// yet; this endpoint issues its first one in exchange for the one-time code.
// Rate-limited like the other unauthenticated /v1 route (onboarding).
@ApiTags('devices')
@Controller('devices')
@UseGuards(RateLimitGuard)
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Post('activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activate a POS terminal with its one-time code' })
  async activate(@Body() dto: ActivateDeviceDto): Promise<ActivateDeviceResponse> {
    const d = await this.devices.activate({ activationCode: dto.activationCode, serialNumber: dto.serialNumber ?? null });
    return {
      device_id: d.deviceId,
      api_key: d.apiKey,
      secret: d.secret,
      signing_key: d.signingKey,
      account_number: d.accountNumber,
      merchant_name: d.merchantName,
      branch: d.branch,
      environment: d.environment,
      trading_name: d.tradingName,
      address: d.address,
      city: d.city,
      tpin: d.tpin,
      merchant_phone: d.merchantPhone,
      registration_number: d.registrationNumber,
    };
  }
}
