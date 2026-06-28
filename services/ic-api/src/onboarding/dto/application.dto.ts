import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

// KYC document categories an applicant uploads for compliance review (ONB-3).
export const KYC_DOC_TYPES = [
  'CERTIFICATE_OF_INCORPORATION',
  'TAX_CLEARANCE',
  'DIRECTOR_ID',
  'PROOF_OF_ADDRESS',
  'BANK_CONFIRMATION',
] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];

class MerchantInfoDto {
  @ApiProperty({ example: 'Acme Traders Ltd' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: ['PUBLIC', 'PRIVATE'] })
  @IsIn(['PUBLIC', 'PRIVATE'])
  merchantType!: 'PUBLIC' | 'PRIVATE';

  @ApiProperty({ example: 'ops@acme.co.zm' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, example: '+260970000001' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiProperty({ required: false, example: 'Acme' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tradingName?: string;

  @ApiProperty({ required: false, example: '120200012345' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

  @ApiProperty({ required: false, example: '1001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tpin?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiProperty({ required: false, example: 'Lusaka' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ required: false, example: 'https://acme.co.zm' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

class AdminInfoDto {
  @ApiProperty({ example: 'Jane Banda' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'jane@acme.co.zm' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

class DocumentDto {
  @ApiProperty({ enum: KYC_DOC_TYPES })
  @IsIn(KYC_DOC_TYPES)
  type!: KycDocType;

  @ApiProperty({ example: 'pacra-certificate.pdf' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(120)
  contentType!: string;

  // base64-encoded file bytes (~7M chars ≈ 5MB binary per document).
  @ApiProperty({ description: 'base64-encoded file content' })
  @IsString()
  @MaxLength(7_000_000)
  dataBase64!: string;
}

export class ApplicationDto {
  @ApiProperty({ type: MerchantInfoDto })
  @ValidateNested()
  @Type(() => MerchantInfoDto)
  merchant!: MerchantInfoDto;

  @ApiProperty({ type: AdminInfoDto })
  @ValidateNested()
  @Type(() => AdminInfoDto)
  admin!: AdminInfoDto;

  @ApiProperty({ type: [DocumentDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentDto)
  documents?: DocumentDto[];
}
