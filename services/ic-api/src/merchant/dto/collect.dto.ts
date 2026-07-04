import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const PROCESSORS = ['MTN', 'AIRTEL', 'ZAMTEL', 'ZED_MOBILE', 'VISA'] as const;
type ProcessorName = (typeof PROCESSORS)[number];

// Merchant-portal collection request. Amount is integer ngwee (the UI converts
// from Kwacha). Scoped to the authenticated merchant's own account.
export class MerchantCollectDto {
  @ApiProperty({ enum: PROCESSORS, example: 'AIRTEL' })
  @IsIn(PROCESSORS)
  processor!: ProcessorName;

  @ApiProperty({ example: '150', description: 'Amount in integer ngwee (NN-1). K1.50 = 150.' })
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string of ngwee' })
  amount!: string;

  @ApiProperty({ example: '260975020473', description: "Customer's mobile number." })
  @IsString()
  @MaxLength(20)
  msisdn!: string;

  @ApiProperty({ required: false, description: 'Your reference for this collection.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class PayoutRejectDto {
  @ApiProperty({ example: 'Wrong recipient number', description: 'Reason shown in the audit trail.' })
  @IsString()
  @MaxLength(300)
  reason!: string;
}
