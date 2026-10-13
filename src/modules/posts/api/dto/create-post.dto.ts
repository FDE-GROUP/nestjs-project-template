import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ description: 'The title of the post', example: 'Hello tenant' })
  @IsString()
  @IsNotEmpty({ message: 'validate.title.required' })
  readonly title: string;

  @ApiPropertyOptional({ description: 'The post body', example: 'Content...' })
  @IsString()
  @IsOptional()
  readonly content?: string;

  @ApiPropertyOptional({ description: 'Whether the post is published', example: false })
  @IsBoolean()
  @IsOptional()
  readonly published?: boolean;
}
