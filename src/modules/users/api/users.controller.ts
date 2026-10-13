import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SessionGuard, type SessionUser } from '../../auth/guards/session.guard';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { DeleteUserCommand } from '../application/commands/delete-user.command';
import { ExportUserDataQuery } from '../application/queries/export-user-data.query';
import { GetUserQuery } from '../application/queries/get-user.query';
import { GetUsersQuery } from '../application/queries/get-users.query';
import type { UserReadModel } from '../application/read-models/user.read-model';
import type { UserDataExportReadModel } from '../application/read-models/user-data-export.read-model';
import type { PublicUser } from '../domain/entities/user.aggregate';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async create(@Body() createUserDto: CreateUserDto): Promise<PublicUser> {
    this.logger.log(`Creating new user with email: ${createUserDto.email}`);
    return this.commandBus.execute<CreateUserCommand, PublicUser>(
      new CreateUserCommand(
        createUserDto.email,
        createUserDto.password,
        createUserDto.firstName,
        createUserDto.lastName,
      ),
    );
  }

  @Get('me/data-export')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'PIPL right-to-access: export current user personal data (C1 · FR-7)' })
  @ApiResponse({ status: 200, description: 'Aggregated personal data (no credentials).' })
  @ApiResponse({ status: 401, description: 'Missing or invalid session.' })
  async exportMe(@CurrentUser() user: SessionUser): Promise<UserDataExportReadModel> {
    this.logger.log(`Exporting personal data for user ${user.id}`);
    return this.queryBus.execute<ExportUserDataQuery, UserDataExportReadModel>(
      new ExportUserDataQuery(user.id),
    );
  }

  @Delete('me')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'PIPL right-to-erase: hard-delete current user (C1 · FR-7)' })
  @ApiResponse({ status: 204, description: 'User deleted; consent rows retained anonymously.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid session.' })
  async deleteMe(@CurrentUser() user: SessionUser): Promise<void> {
    this.logger.log(`Deleting user ${user.id} (PIPL right-to-erase)`);
    await this.commandBus.execute<DeleteUserCommand, void>(new DeleteUserCommand(user.id));
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Return all users' })
  findAll(): Promise<UserReadModel[]> {
    this.logger.log('Finding all users');
    return this.queryBus.execute<GetUsersQuery, UserReadModel[]>(new GetUsersQuery());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Return the user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<UserReadModel> {
    this.logger.log(`Finding user with ID: ${id}`);
    return this.queryBus.execute<GetUserQuery, UserReadModel>(new GetUserQuery(id));
  }
}
