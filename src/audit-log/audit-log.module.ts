import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditContextService } from './audit-context.service';
import { AuditDiffService } from './audit-diff.service';
import { AUDIT_LOG_OPTIONS } from './audit-log.constants';
import { AuditLog } from './audit-log.entity';
import { AuditLogInterceptor } from './audit-log.interceptor';
import {
  AuditLogModuleAsyncOptions,
  AuditLogModuleOptions,
  AuditLogOptionsFactory,
} from './audit-log.interfaces';
import { AuditLogService } from './audit-log.service';
import { AuditSanitizerService } from './audit-sanitizer.service';

const DEFAULT_OPTIONS: AuditLogModuleOptions = {
  enabled: true,
  includeMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  excludedRoutes: [],
  sensitiveFields: [],
  failureMode: 'non-blocking',
};

@Global()
@Module({})
export class AuditLogModule {
  static forRoot(options: AuditLogModuleOptions = {}): DynamicModule {
    return this.buildModule([
      {
        provide: AUDIT_LOG_OPTIONS,
        useValue: { ...DEFAULT_OPTIONS, ...options },
      },
    ]);
  }

  static forRootAsync(options: AuditLogModuleAsyncOptions): DynamicModule {
    const providers = this.createAsyncProviders(options);
    return {
      ...this.buildModule(providers),
      imports: [
        ...(options.imports ?? []),
        TypeOrmModule.forFeature([AuditLog]),
      ],
    };
  }

  private static buildModule(optionsProviders: Provider[]): DynamicModule {
    return {
      module: AuditLogModule,
      imports: [TypeOrmModule.forFeature([AuditLog])],
      providers: [
        ...optionsProviders,
        AuditContextService,
        AuditDiffService,
        AuditSanitizerService,
        AuditLogService,
        {
          provide: APP_INTERCEPTOR,
          useClass: AuditLogInterceptor,
        },
      ],
      exports: [AuditLogService, AuditContextService],
    };
  }

  private static createAsyncProviders(
    options: AuditLogModuleAsyncOptions,
  ): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: AUDIT_LOG_OPTIONS,
          inject: options.inject ?? [],
          useFactory: async (...args: any[]) => ({
            ...DEFAULT_OPTIONS,
            // Nest factory dependencies are dynamically typed by the inject list.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            ...(await options.useFactory!(...args)),
          }),
        },
      ];
    }

    if (!options.useClass) {
      throw new Error(
        'AuditLogModule.forRootAsync requires useFactory or useClass',
      );
    }

    return [
      options.useClass,
      {
        provide: AUDIT_LOG_OPTIONS,
        inject: [options.useClass],
        useFactory: async (factory: AuditLogOptionsFactory) => ({
          ...DEFAULT_OPTIONS,
          ...(await factory.createAuditLogOptions()),
        }),
      },
    ];
  }
}
