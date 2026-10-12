import { Command, Query } from '@nestjs/cqrs';

/**
 * Thin conventions layer over `@nestjs/cqrs` message base classes.
 * Commands and Queries in every bounded context extend these so the result type
 * is inferred by the bus (`commandBus.execute<C, R>` / `queryBus.execute<C, R>`).
 *
 * Note: this folder intentionally touches the CQRS library. The purity rule applies
 * to each context's domain folder only; commands and queries are application artifacts.
 */
export abstract class BaseCommand<TResult = void> extends Command<TResult> {}

export abstract class BaseQuery<TResult> extends Query<TResult> {}
