import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { AuthModule } from '../auth/auth.module';
import { AgenteModule } from '../agente/agente.module';

@Module({
  imports: [AuthModule, AgenteModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
