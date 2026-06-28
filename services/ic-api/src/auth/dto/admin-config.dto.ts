import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';

const PROCESSORS = ['MTN', 'AIRTEL', 'ZAMTEL', 'ZED_MOBILE', 'VISA'] as const;

export class ChargeConfigDto {
  @ApiProperty({ enum: PROCESSORS })
  @IsIn(PROCESSORS)
  processor!: (typeof PROCESSORS)[number];

  @ApiProperty({ enum: ['SOURCE', 'MERCHANT'] })
  @IsIn(['SOURCE', 'MERCHANT'])
  chargeFulfiller!: 'SOURCE' | 'MERCHANT';

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE', 'TIERED'] })
  @IsIn(['FIXED', 'PERCENTAGE', 'TIERED'])
  chargeType!: 'FIXED' | 'PERCENTAGE' | 'TIERED';

  @ApiProperty({ required: false, description: 'Fixed charge in ngwee (FIXED/TIERED).' })
  @IsOptional()
  @Matches(/^\d+$/, { message: 'fixedValue must be integer ngwee' })
  fixedValue?: string;

  @ApiProperty({ required: false, description: 'Percent, e.g. 2.50 (PERCENTAGE/TIERED).' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'percentValue must be a percent like 2.50' })
  percentValue?: string;

  @ApiProperty({ required: false, description: 'MNO OVA reference.' })
  @IsOptional()
  @IsString()
  ovaAccountRef?: string;
}

export class AdminSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipWhitelist?: string[];
}

export class ModeDto {
  @ApiProperty({ enum: ['SANDBOX', 'PRODUCTION'] })
  @IsIn(['SANDBOX', 'PRODUCTION'])
  mode!: 'SANDBOX' | 'PRODUCTION';
}
