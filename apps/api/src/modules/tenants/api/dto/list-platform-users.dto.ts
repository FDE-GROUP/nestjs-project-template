import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ListPageDto } from '../../../../common/dto/list-page.dto';

/** 跨平台用户列表查询参数（FR-6·平台级）：分页面继承 ListPageDto，只留 name/email 模糊搜索。 */
export class ListPlatformUsersDto extends ListPageDto {
  @ApiPropertyOptional({ description: 'Against user name or email (substring)' })
  @IsOptional()
  @IsString()
  readonly search?: string;
}
