import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@instacompayzm.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jane@acme.co.zm' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiProperty({ example: 'a strong new password', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ReviewDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

export class ProvisionDto {
  @ApiProperty({ enum: ['COLLECTION', 'DISBURSEMENT', 'OVA', 'BANK'] })
  @IsIn(['COLLECTION', 'DISBURSEMENT', 'OVA', 'BANK'])
  accountType!: 'COLLECTION' | 'DISBURSEMENT' | 'OVA' | 'BANK';
}

export class FloatCreditDto {
  @ApiProperty({ example: '5000000', description: 'Amount in integer ngwee (NN-1).' })
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string of ngwee' })
  amount!: string;

  @ApiProperty({ example: 'bank-deposit-slip.pdf', description: 'Proof of payment filename.' })
  @IsString()
  @MaxLength(255)
  proofFileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(120)
  proofContentType!: string;

  @ApiProperty({ description: 'base64-encoded proof of payment (bank slip / receipt).' })
  @IsString()
  @MaxLength(7_000_000)
  proofDataBase64!: string;
}

export class FloatRejectDto {
  @ApiProperty({ example: 'Amount exceeds the merchant’s approved float ceiling.' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class AirtelDisburseDto {
  @ApiProperty({ example: '975020473', description: 'Payee Airtel MSISDN.' })
  @IsString()
  @MaxLength(20)
  msisdn!: string;

  @ApiProperty({ example: '5000', description: 'Amount in integer ngwee (NN-1).' })
  @Matches(/^\d+$/, { message: 'amount must be a non-negative integer string of ngwee' })
  amount!: string;

  @ApiProperty({ required: false, description: 'Payout reference (defaults to the transaction id).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

// ── Settlements (§5.8, SET-2) ──

export class SettlementConfirmDto {
  @ApiProperty({
    required: false,
    example: 'FNB-TRF-20260713-0042',
    description: 'Bank transfer reference, recorded in the audit trail.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankReference?: string;
}

export class SettlementFailDto {
  @ApiProperty({ example: 'Bank rejected the transfer — account details invalid.' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;
}
