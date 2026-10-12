import { Body, Controller, Get, Inject, Logger, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { GetUserQuery } from '../application/queries/get-user.query';
import { GetUsersQuery } from '../application/queries/get-users.query';
import type { UserReadModel } from '../application/read-models/user.read-model';
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
