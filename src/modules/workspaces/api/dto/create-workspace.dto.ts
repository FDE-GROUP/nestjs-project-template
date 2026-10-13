import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Workspace display name', example: 'Design' })
  @IsString()
  @IsNotEmpty({ message: 'validate.name.required' })
  readonly name: string;

  @ApiProperty({ description: 'URL-friendly slug (unique within the tenant)', example: 'design' })
  @IsString()
  @IsNotEmpty({ message: 'validate.slug.required' })
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, { message: 'validate.slug.invalid' })
  readonly slug: string;
}
