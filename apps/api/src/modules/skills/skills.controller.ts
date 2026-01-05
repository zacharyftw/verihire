import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SkillsService } from './skills.service';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all skills' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or description' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of skills' })
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.skillsService.findAll({
      categoryId,
      search,
      limit: limit || 50,
      offset: offset || 0,
    });
  }

  @Get('popular')
  @ApiOperation({ summary: 'Get popular skills' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of skills to return',
  })
  @ApiResponse({ status: 200, description: 'List of popular skills' })
  async getPopular(@Query('limit') limit?: number) {
    return this.skillsService.getPopularSkills(limit || 10);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all skill categories' })
  @ApiResponse({ status: 200, description: 'List of skill categories' })
  async getCategories() {
    return this.skillsService.getCategories();
  }

  @Get('categories/:slug')
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiResponse({ status: 200, description: 'Category details with skills' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async getCategoryBySlug(@Param('slug') slug: string) {
    const category = await this.skillsService.getCategoryBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get skill by slug' })
  @ApiResponse({ status: 200, description: 'Skill details' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async findBySlug(@Param('slug') slug: string) {
    const skill = await this.skillsService.findBySlug(slug);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }
    return skill;
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get skill statistics' })
  @ApiResponse({ status: 200, description: 'Skill statistics' })
  @ApiResponse({ status: 404, description: 'Skill not found' })
  async getStats(@Param('id') id: string) {
    const stats = await this.skillsService.getSkillStats(id);
    if (!stats) {
      throw new NotFoundException('Skill not found');
    }
    return stats;
  }
}
