import { Module } from '@nestjs/common';
import { FerramentaController } from './ferramenta.controller';
import { AuthModule } from '../auth/auth.module';
import { SkillModule } from './skill.module';
import { ConsultaModule } from '../consulta/consulta.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, SkillModule, ConsultaModule, AuditModule],
  controllers: [FerramentaController],
})
export class FerramentaModule {}
