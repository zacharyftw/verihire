import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CodeExecutionService } from './code-execution.service';

@Module({
  imports: [ConfigModule],
  providers: [CodeExecutionService],
  exports: [CodeExecutionService],
})
export class CodeExecutionModule {}
