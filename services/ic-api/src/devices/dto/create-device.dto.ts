import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ example: '9f1c…', description: 'The COLLECTION account the terminal transacts under.' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: 'Till 3 - Kabwata', description: 'Human label for the terminal (unique within the account).' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;
}
