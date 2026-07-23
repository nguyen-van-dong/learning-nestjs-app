import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { APP_EVENTS } from '../../common/constants/event.constants';
import { MAIL_JOBS, QUEUE_NAMES } from '../../common/constants/queue.constants';
import { PasswordResetRequestedEvent } from '../events/password-reset-requested.event';

@Injectable()
export class PasswordResetRequestedListener {
    private readonly logger = new Logger(PasswordResetRequestedListener.name);

    constructor(
        @InjectQueue(QUEUE_NAMES.MAIL)
        private readonly mailQueue: Queue,
    ) {}

    @OnEvent(APP_EVENTS.USER_PASSWORD_RESET_REQUEST)
    async handlePasswordResetRequested(
        event: PasswordResetRequestedEvent,
    ): Promise<void> {
        await this.mailQueue.add(
            MAIL_JOBS.SEND_RESET_PASSWORD,
            {
                userId: event.userId,
                name: event.name,
                email: event.email,
                rawResetToken: event.rawResetToken,
            },
            {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5_000,
                },
                removeOnComplete: {
                    age: 24 * 60 * 60,
                    count: 1_000,
                },
                removeOnFail: {
                    age: 7 * 24 * 60 * 60,
                },
                jobId: `reset-password-${event.resetTokenId}`,
            },
        );

        this.logger.log(
            `Password reset email job created for user ${event.userId}`,
        );
    }
}
