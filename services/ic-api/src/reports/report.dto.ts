import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsString, MinLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ example: 'Q2 Collections' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: ['TRANSACTIONS', 'SETTLEMENTS', 'COMMISSION'] })
  @IsIn(['TRANSACTIONS', 'SETTLEMENTS', 'COMMISSION'])
  reportType!: 'TRANSACTIONS' | 'SETTLEMENTS' | 'COMMISSION';

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-03-31' })
  @IsDateString()
  to!: string;
}
