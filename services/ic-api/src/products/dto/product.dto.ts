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
}
