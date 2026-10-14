import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 分页入参基类（module-common-pagination-contract）：limit/offset 校验与默认值
 * 从两个 platform DTO 逐字上移，形状与 shared-kernel `PageRequest` 对应
 * （校验/默认值属应用侧 class-validator 依赖，core 不引——契约分层纪律）。
 * 继承链校验元数据可读回由 list-page.dto.test.ts 实跑锁死（plan §7 唯一技术雷：
 * whitelist+forbidNonWhitelisted 下父类装饰器属性若丢失会整体 400 化）。
 */
export class ListPageDto {
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
}
