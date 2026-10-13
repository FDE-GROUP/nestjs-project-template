import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** 申请创建租户的入参（用户级能力·FR-1/FR-11③）。name/slug 校验口径与 workspace 一致。 */
export class CreateTenantApplicationDto {
  @ApiProperty({ description: 'Tenant display name', example: 'Acme Inc.' })
  @IsString()
  @IsNotEmpty({ message: 'validate.name.required' })
  readonly name: string;

  @ApiProperty({ description: 'Globally-unique tenant slug', example: 'acme' })
  @IsString()
  @IsNotEmpty({ message: 'validate.slug.required' })
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, { message: 'validate.slug.invalid' })
  readonly slug: string;
}
