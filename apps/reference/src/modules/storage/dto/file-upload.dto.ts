import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FileUploadResultDto {
  @ApiProperty({ description: 'File unique identifier' })
  key: string;

  @ApiProperty({ description: 'File access URL' })
  url: string;

  @ApiPropertyOptional({ description: 'File ETag value' })
  etag?: string;

  @ApiProperty({ description: 'File size (bytes)' })
  size: number;

  @ApiProperty({ description: 'File MIME type' })
  mimetype: string;

  @ApiProperty({ description: 'Original filename' })
  originalname: string;
}
