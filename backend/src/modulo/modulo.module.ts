import { Module } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import { ModuloService } from './modulo.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ModuloController],
  providers: [ModuloService],
  exports: [ModuloService],
})
export class ModuloModule {}
