import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { AuthModule } from '../auth/auth.module';
import { AgenteModule } from '../agente/agente.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AgenteModule, AuditModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
