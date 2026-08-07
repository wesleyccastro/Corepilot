import { Module } from '@nestjs/common';
import { AnthropicModule } from '../chat/anthropic.module';
import { SkillExecutorService } from './skill-executor.service';

@Module({
  imports: [AnthropicModule],
  providers: [SkillExecutorService],
  exports: [SkillExecutorService],
})
export class SkillExecutorModule {}
