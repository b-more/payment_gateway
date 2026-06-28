import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Processor } from '../../money/types';

const PROCESSORS = ['MTN', 'AIRTEL', 'ZAMTEL', 'ZED_MOBILE', 'VISA'] as const;

export class DisbursementDto {
  @ApiProperty({ enum: PROCESSORS, example: 'MTN' })
  @IsIn(PROCESSORS)
  processor!: Processor;

  @ApiProperty({ example: '50000', description: 'Amount in integer ngwee (NN-1).' })
  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string of ngwee' })
  amount!: string;

  @ApiProperty({ example: '260970000001', description: 'Recipient MSISDN.' })
  @IsString()
  msisdn!: string;

  @ApiProperty({ required: false, description: 'Merchant-supplied reference.' })
  @IsOptional()
  @IsString()
  collectionReference?: string;
}
