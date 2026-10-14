import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 跨平台用户列表查询参数（FR-6·平台级）：limit/offset 分页 + name/email 模糊搜索。 */
export class ListPlatformUsersDto {
  @ApiPropertyOptional({ description: 'Page size (1-100)', example: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit = 20;

  @ApiPropertyOptional({ description: 'Offset (rows to skip)', example: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  readonly offset = 0;

  @ApiPropertyOptional({ description: 'Against user name or email (substring)' })
  @IsOptional()
  @IsString()
  readonly search?: string;
}
