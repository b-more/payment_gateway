import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ['SYSTEM', 'MERCHANT'] })
  @IsIn(['SYSTEM', 'MERCHANT'])
  scope!: 'SYSTEM' | 'MERCHANT';

  @ApiProperty({ required: false, description: 'Required when scope is MERCHANT.' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiProperty({ example: 'FINANCE' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'role must be an uppercase role name' })
  role!: string;

  @ApiProperty({ description: 'Initial password the user changes after first login.' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'ADMIN' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'role must be an uppercase role name' })
  role!: string;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'TREASURY' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'role must be an uppercase role name' })
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
