import { randomUUID } from 'node:crypto';
import { DrizzleService } from '@app/database/drizzle.service';
import { Role, user } from '@app/database/schema';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { CreateUserDto } from '../dto/create-user.dto';

const publicColumns = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

// `.returning()` needs column references (not the boolean `columns` map used by relational queries)
const publicReturnFields = {
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  findAll() {
    this.logger.debug('Finding all users');
    return this.drizzle.db.query.user.findMany({ columns: publicColumns });
  }

  async findOne(id: string) {
    this.logger.debug(`Finding user with ID: ${id}`);
    const found = await this.drizzle.db.query.user.findFirst({
      where: eq(user.id, id),
      columns: publicColumns,
    });

    if (!found) {
      this.logger.warn(`User with ID ${id} not found`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return found;
  }

  async findByEmail(email: string) {
    this.logger.debug(`Finding user with email: ${email}`);
    const found = await this.drizzle.db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (!found) {
      this.logger.warn(`User with email ${email} not found`);
      throw new NotFoundException(`User with email ${email} not found`);
    }

    return found;
  }

  async create(createUserDto: CreateUserDto) {
    const { email, password, firstName, lastName } = createUserDto;
    this.logger.debug(`Creating user with email: ${email}`);

    // Check if user already exists
    const existingUser = await this.drizzle.db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (existingUser) {
      this.logger.warn(`User with email ${email} already exists`);
      throw new ConflictException(`User with email ${email} already exists`);
    }

    // Hash password
    this.logger.debug('Hashing password');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    try {
      const [created] = await this.drizzle.db
        .insert(user)
        .values({
          id: randomUUID(),
          name: [firstName, lastName].filter(Boolean).join(' ') || email,
          email,
          password: hashedPassword,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          role: Role.USER,
        })
        .returning(publicReturnFields);

      this.logger.log(`User created successfully with ID: ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(`Failed to create user: ${error.message}`, error.stack);
      throw error;
    }
  }
}
