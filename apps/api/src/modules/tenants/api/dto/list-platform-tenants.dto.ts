import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ListPageDto } from '../../../../common/dto/list-page.dto';

/** 跨租户列表查询参数（FR-6·平台级）：分页面继承 ListPageDto，只留 name/slug 模糊搜索。 */
export class ListPlatformTenantsDto extends ListPageDto {
  @ApiPropertyOptional({ description: 'Match against tenant name or slug (substring)' })
  @IsOptional()
  @IsString()
  readonly search?: string;
}
