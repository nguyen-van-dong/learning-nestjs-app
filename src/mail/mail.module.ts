import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { MailService } from './mail.service';
import { MailProcessor } from './processors/mail.processor';
import { QUEUE_NAMES } from '../common/constants/queue.constants';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.MAIL,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.MAIL,
      adapter: BullMQAdapter,
    }),
  ],
  providers: [
    MailService,
    MailProcessor,
  ],
  exports: [MailService],
})
export class MailModule {}
