import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MailWorkerModule } from './mail/mail-worker.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),

        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6379),
            },
        }),

        MailWorkerModule,
    ],
})
export class WorkerModule { }
