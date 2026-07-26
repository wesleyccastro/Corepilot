import { Module } from '@nestjs/common';
import { SkillExecucaoController } from './skill-execucao.controller';
import { SkillExecucaoService } from './skill-execucao.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { SkillModule } from './skill.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [AuthModule, AuditModule, SkillModule, ChatModule],
  controllers: [SkillExecucaoController],
  providers: [SkillExecucaoService],
})
export class SkillExecucaoModule {}
