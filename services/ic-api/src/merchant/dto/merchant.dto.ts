import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({ required: false, example: 'https://merchant.example/webhook' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiProperty({ required: false, type: [String], example: ['41.x.x.x'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipWhitelist?: string[];
}
