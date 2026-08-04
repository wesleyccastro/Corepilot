import { Module } from '@nestjs/common';
import { FonteDeDadosController } from './fonte-de-dados.controller';
import { FonteDeDadosService } from './fonte-de-dados.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [FonteDeDadosController],
  providers: [FonteDeDadosService],
  exports: [FonteDeDadosService],
})
export class FonteDeDadosModule {}
