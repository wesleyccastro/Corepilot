import { Module } from '@nestjs/common';
import { TotvsRmAdapterService } from './totvs-rm-adapter.service';

@Module({
  providers: [TotvsRmAdapterService],
  exports: [TotvsRmAdapterService],
})
export class TotvsRmModule {}
