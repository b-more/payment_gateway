import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class SendReceiptDto {
  @ApiProperty({ required: false, example: '260966123456', description: 'Recipient phone; defaults to the payer msisdn.' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?260|0)\d{8,10}$/)
  phone?: string;
}
