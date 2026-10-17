import { ApiProperty } from '@nestjs/swagger';

/**
 * 存储面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 上传面复用既存 DTO `FileUploadResultDto`（已带 @ApiProperty·直接作 $ref 源，不重复造）；
 * 此处仅补 delete/url 两内联字面返回的类（controller 直返 `{success}`/`{url}`·无独立真相源类型）。
 */
export class StorageDeleteResponse {
  @ApiProperty({ description: '删除是否成功。' })
  success!: boolean;
}

export class StorageUrlResponse {
  @ApiProperty({ description: '签名访问 URL。' })
  url!: string;
}
