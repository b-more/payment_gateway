import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ZampayBatchReferenceDto {
  @ApiProperty({ required: false, example: 'BATCH-2026-08-21-001', description: 'Bank batch reference; empty/omitted clears it.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankBatchReference?: string;
}
