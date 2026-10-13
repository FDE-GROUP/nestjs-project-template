import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ description: 'Workspace display name', example: 'Design' })
  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: 'validate.name.required' })
  readonly name?: string;

  @ApiPropertyOptional({ description: 'URL-friendly slug', example: 'design' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, { message: 'validate.slug.invalid' })
  readonly slug?: string;
}
