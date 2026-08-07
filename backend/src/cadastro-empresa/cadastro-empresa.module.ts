import { Module } from '@nestjs/common';
import { CadastroEmpresaController } from './cadastro-empresa.controller';
import { CadastroEmpresaService } from './cadastro-empresa.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EmpresaModule } from '../empresa/empresa.module';

@Module({
  imports: [AuthModule, AuditModule, EmpresaModule],
  controllers: [CadastroEmpresaController],
  providers: [CadastroEmpresaService],
})
export class CadastroEmpresaModule {}
