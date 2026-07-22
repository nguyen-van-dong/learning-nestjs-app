import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { APP_EVENTS } from '../../common/constants/event.constants';
import {
  MAIL_JOBS,
  QUEUE_NAMES,
} from '../../common/constants/queue.constants';
import { UserRegisteredEvent } from '../events/user-registered.event';

@Injectable()
export class UserRegisteredListener {
  private readonly logger = new Logger(
    UserRegisteredListener.name,
  );

  constructor(
    @InjectQueue(QUEUE_NAMES.MAIL)
    private readonly mailQueue: Queue,
  ) {}

  @OnEvent(APP_EVENTS.USER_REGISTERED)
  async handleUserRegistered(
    event: UserRegisteredEvent,
  ): Promise<void> {
    await this.mailQueue.add(
      MAIL_JOBS.SEND_VERIFY_ACCOUNT,
      {
        userId: event.userId,
        name: event.name,
        email: event.email,
        rawVerificationToken: event.rawVerificationToken,
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

        jobId: `verify-email-${event.userId}`,
      },
    );

    this.logger.log(
      `Verification email job created for user ${event.userId}`,
    );
  }
}
