import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PipelineTemplatesModule } from '../pipeline-templates/pipeline-templates.module';

@Module({
  imports: [PipelineTemplatesModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
