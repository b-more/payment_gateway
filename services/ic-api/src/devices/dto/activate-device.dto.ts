import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateDeviceDto {
  @ApiProperty({ example: 'K7Q2MXPT-9F4TQ2RW', description: 'The one-time activation code issued when the terminal was registered.' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  activationCode!: string;

  @ApiProperty({ required: false, example: 'Z100-2411-000123', description: 'Z100 hardware serial number, read from the SDK.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;
}
