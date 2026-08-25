import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ZampayBulkBatchReferenceDto {
  @ApiProperty({ type: [String], description: 'Settlement ids to tag with the batch reference.' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({ example: 'BATCH-2026-08-21-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  bankBatchReference!: string;
}
