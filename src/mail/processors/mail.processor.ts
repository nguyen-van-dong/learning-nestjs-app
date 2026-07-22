import {
    OnWorkerEvent,
    Processor,
    WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';

import {
    MAIL_JOBS,
    QUEUE_NAMES,
} from '../../common/constants/queue.constants';
import { SendVerificationEmailJob } from '../interfaces/send-verification-email-job.interface';
import { MailService } from '../mail.service';

@Processor(QUEUE_NAMES.MAIL)
export class MailProcessor extends WorkerHost {
    private readonly logger = new Logger(
        MailProcessor.name,
    );

    constructor(
        private readonly mailService: MailService,
        private readonly configService: ConfigService,
    ) {
        super();
    }

    async process(
        job: Job<SendVerificationEmailJob>,
    ): Promise<void> {
        switch (job.name) {
            case MAIL_JOBS.SEND_VERIFY_ACCOUNT:
                await this.sendVerificationEmail(job);
                return;

            default:
                throw new Error(
                    `Unsupported mail job: ${job.name}`,
                );
        }
    }

    private async sendVerificationEmail(
        job: Job<SendVerificationEmailJob>,
    ): Promise<void> {
        const frontendUrl =
            this.configService.getOrThrow<string>(
                'FRONTEND_URL',
            );

        const verificationUrl =
            `${frontendUrl}/verify-account` +
            `?token=${encodeURIComponent(
                job.data.rawVerificationToken,
            )}`;

        await this.mailService.sendVerificationEmail({
            name: job.data.name,
            email: job.data.email,
            verificationUrl,
        });
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job): void {
        this.logger.log(
            `Mail job ${job.id} completed`,
        );
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job | undefined, error: Error): void {
        this.logger.error(
            `Mail job ${job?.id ?? 'unknown'} failed: ${error.message}`,
        );
    }
}
