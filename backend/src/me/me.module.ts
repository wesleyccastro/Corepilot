import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EmpresaModule } from '../empresa/empresa.module';

@Module({
  imports: [AuthModule, AuditModule, EmpresaModule],
  controllers: [MeController],
})
export class MeModule {}
