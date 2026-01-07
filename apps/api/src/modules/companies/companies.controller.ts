import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto, ListCompaniesQueryDto } from './dto/company.dto';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'List companies' })
  async listCompanies(@Query() query: ListCompaniesQueryDto) {
    return this.companiesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID' })
  async getCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.getById(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get company by slug' })
  async getCompanyBySlug(@Param('slug') slug: string) {
    return this.companiesService.getBySlug(slug);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get company stats' })
  async getCompanyStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.getStats(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create company (recruiter only)' })
  async createCompany(@Body() body: CreateCompanyDto) {
    return this.companiesService.create(body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update company (recruiter only)' })
  async updateCompany(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateCompanyDto) {
    return this.companiesService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECRUITER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete company (recruiter only)' })
  async deleteCompany(@Param('id', ParseUUIDPipe) id: string) {
    await this.companiesService.delete(id);
  }
}
