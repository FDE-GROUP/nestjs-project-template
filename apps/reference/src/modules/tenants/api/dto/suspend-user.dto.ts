import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 暂停用户可选理由（写入 user_status.reason + 审计上下文）。 */
export class SuspendUserDto {
  @ApiPropertyOptional({ description: 'Free-text suspension reason (audit trail)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly reason?: string;
}
