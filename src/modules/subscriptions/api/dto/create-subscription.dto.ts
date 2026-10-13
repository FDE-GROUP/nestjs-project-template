import { TENANT_PLANS } from '@app/tenancy/quota/tenant-plans';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, Min } from 'class-validator';

const PLAN_IDS = Object.keys(TENANT_PLANS);

/**
 * 开通/改档订阅入参（S7 · FR-7/FR-8）。`plan` 限档位目录内；`customerEmail` 用于 FR-8
 * 建 provider customer 映射；`seatsLimit` 缺省取档位目录（显式传则覆盖·快照存行）。
 */
export class CreateSubscriptionDto {
  @ApiProperty({ description: 'Subscription plan/tier', enum: PLAN_IDS, example: 'pro' })
  @IsIn(PLAN_IDS)
  readonly plan!: string;

  @ApiProperty({ description: 'Billing contact email (creates the provider customer · FR-8)' })
  @IsEmail()
  readonly customerEmail!: string;

  @ApiPropertyOptional({ description: 'Override the plan seat limit (defaults to the plan)' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  readonly seatsLimit?: number;

  @ApiPropertyOptional({ description: 'Storage quota (bytes) placeholder' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly storageQuota?: number;

  @ApiPropertyOptional({ description: 'API quota placeholder' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly apiQuota?: number;
}
