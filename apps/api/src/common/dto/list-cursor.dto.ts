import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * 游标分页入参（就绪预备 §2.3 #5·切片 B）：与 `ListPageDto` 同构的 limit 校验/默认值，
 * 但翻页凭据为**不透明 cursor**（base64url 编码的复合排序键 `(createdAt,id)`）而非 offset。
 *
 * 校验只锁**字符集 + 长度上限**（防实现细节泄漏前的畸形输入 / DoS）；语义合法性（可解码为
 * `[date,id]`）由仓储适配层 `decodeCursor` 兜底——解码失败 → `BadRequestException`（400）。
 * 空串 `?cursor=` 归一为 `undefined`（视作首页），避免前端「有键无值」误判为畸形。
 */
export class ListCursorDto {
  @ApiPropertyOptional({ description: 'Page size (1-100)', example: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit = 20;

  @ApiPropertyOptional({
    description: 'Opaque base64url cursor from a previous page (omit for the first page).',
    example: 'WyIyMDI2LTAxLTAyVDAzOjA0OjA1LjAwMFoiLCJ1dWlkLWFiYyJd',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'validate.cursor.invalid' })
  @MaxLength(512)
  readonly cursor?: string;
}
