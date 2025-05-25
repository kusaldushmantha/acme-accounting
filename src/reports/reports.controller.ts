import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('api/v1/reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get()
  report(@Query('jobID') jobID: string) {
    if (jobID) {
      // Return the state for the requested file
      return this.reportsService.getReports(jobID);
    }
    // If no file query param, return all
    throw new BadRequestException('mandatory jobID query param not provided');
  }

  @Post()
  @HttpCode(201)
  generate() {
    return this.reportsService.generate();
  }
}
