import { Module, Global } from '@nestjs/common';
import { FileProcessingService } from './file-processing.service';

@Global()
@Module({
  providers: [FileProcessingService],
  exports: [FileProcessingService],
})
export class FileProcessingModule {}
