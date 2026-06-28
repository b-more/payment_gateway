import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReverseDto {
  @ApiProperty({ required: false, description: 'Reason recorded in the audit log.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
