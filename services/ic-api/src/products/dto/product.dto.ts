import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Coca-Cola 350ml' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: '1000', description: 'Price in integer ngwee (K10.00 = 1000).' })
  @IsString()
  @Matches(/^\d+$/)
  price!: string;

  @ApiProperty({ required: false, example: 'Drinks' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiProperty({ required: false, example: '6009510800012', description: 'Optional barcode for scan-to-cart.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  barcode?: string;

  @ApiProperty({ required: false, description: 'Product photo, base64-encoded (≈1MB max after device compression).' })
  @IsOptional()
  @IsString()
  @MaxLength(1_400_000)
  @Matches(/^[A-Za-z0-9+/=\r\n]+$/)
  image?: string;

  @ApiProperty({ required: false, example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @Matches(/^image\/(png|jpeg|webp)$/)
  imageMime?: string;
}

export class UpdateProductDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false, description: 'Price in integer ngwee.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  price?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ required: false, description: 'Optional barcode for scan-to-cart.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  barcode?: string;

  @ApiProperty({ required: false, description: 'Replacement photo, base64-encoded.' })
  @IsOptional()
  @IsString()
  @MaxLength(1_400_000)
  @Matches(/^[A-Za-z0-9+/=\r\n]+$/)
  image?: string;

  @ApiProperty({ required: false, example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @Matches(/^image\/(png|jpeg|webp)$/)
  imageMime?: string;
}
