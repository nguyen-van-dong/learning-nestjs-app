import { Module } from '@nestjs/common';

import { MailModule } from './mail.module';
import { MailService } from './mail.service';
import { MailProcessor } from './processors/mail.processor';

@Module({
  imports: [MailModule],
  providers: [MailService, MailProcessor],
})
export class MailWorkerModule {}
