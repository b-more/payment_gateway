import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MERCHANT_ROLES } from '../merchant-user.service';

// Create a sub-user under the caller's merchant. Roles are validated against the
// merchant-assignable set (a merchant can never grant a SYSTEM role).
export class CreateMerchantUserDto {
  @ApiProperty({ example: 'Grace Banda' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'grace@business.co.zm' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({ required: false, example: '260975020473' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: 'Initial#Pass123', description: 'Temporary password; emailed to the user.' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ enum: MERCHANT_ROLES, isArray: true, example: ['MERCHANT_INITIATOR'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MERCHANT_ROLES, { each: true })
  roles!: string[];
}

export class AssignRoleDto {
  @ApiProperty({ enum: MERCHANT_ROLES, example: 'MERCHANT_APPROVER' })
  @IsIn(MERCHANT_ROLES)
  role!: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'], example: 'DISABLED' })
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: string;
}
