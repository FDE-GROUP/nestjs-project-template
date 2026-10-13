import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RefundPaymentDto {
  @ApiProperty({
    description: 'Checkout (payment intent) id to refund',
    example: 'pi_1AbcDef',
  })
  @IsNotEmpty()
  @IsString()
  readonly checkoutId: string;

  @ApiPropertyOptional({
    description: 'Amount to refund (defaults to full amount when omitted)',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  readonly amount?: number;

  @ApiPropertyOptional({ description: 'Refund reason', example: 'requested_by_customer' })
  @IsOptional()
  @IsString()
  readonly reason?: string;
}
