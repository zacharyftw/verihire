import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@verihire/database';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  CompanyResponseDto,
  CompanyStatsDto,
  ListCompaniesQueryDto,
} from './dto/company.dto';

@Injectable()
export class CompaniesService {
  async create(data: CreateCompanyDto, recruiterId?: string): Promise<CompanyResponseDto> {
    const slug = this.generateSlug(data.name);

    // Check if slug already exists
    const existing = await prisma.company.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new BadRequestException('Company with similar name already exists');
    }

    const company = await prisma.company.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        industry: data.industry,
        companySize: data.companySize,
        websiteUrl: data.websiteUrl,
        headquartersCity: data.headquartersCity,
        headquartersCountry: data.headquartersCountry,
      },
    });

    // Link company to recruiter profile
    if (recruiterId) {
      await prisma.recruiterProfile.update({
        where: { id: recruiterId },
        data: { companyId: company.id },
      });
    }

    return this.mapToResponse(company);
  }

  async getById(id: string): Promise<CompanyResponseDto> {
    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.mapToResponse(company);
  }

  async getBySlug(slug: string): Promise<CompanyResponseDto> {
    const company = await prisma.company.findUnique({
      where: { slug },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.mapToResponse(company);
  }

  async update(id: string, data: UpdateCompanyDto): Promise<CompanyResponseDto> {
    const updateData: any = { ...data };

    // If name is changing, regenerate slug
    if (data.name) {
      updateData.slug = this.generateSlug(data.name);
    }

    const company = await prisma.company.update({
      where: { id },
      data: updateData,
    });

    return this.mapToResponse(company);
  }

  async list(query: ListCompaniesQueryDto) {
    const { query: searchQuery, industry, verifiedOnly, limit = 20, offset = 0 } = query;

    const where: any = {};

    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    if (industry) {
      where.industry = industry;
    }

    if (verifiedOnly) {
      where.verified = true;
    }

    const companies = await prisma.company.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: companies.map(c => this.mapToResponse(c)),
    };
  }

  async getStats(id: string): Promise<CompanyStatsDto> {
    const [totalJobs, activeJobs, totalRecruiters, totalHires] = await Promise.all([
      prisma.job.count({
        where: { companyId: id },
      }),
      prisma.job.count({
        where: { companyId: id, status: 'ACTIVE' },
      }),
      prisma.recruiterProfile.count({
        where: { companyId: id },
      }),
      prisma.shortlist.count({
        where: {
          job: { companyId: id },
          stage: 'HIRED',
        },
      }),
    ]);

    return {
      totalJobs,
      activeJobs,
      totalRecruiters,
      totalHires,
    };
  }

  async delete(id: string): Promise<void> {
    await prisma.company.delete({
      where: { id },
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private mapToResponse(company: any): CompanyResponseDto {
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      description: company.description ?? undefined,
      industry: company.industry ?? undefined,
      companySize: company.companySize ?? undefined,
      logoUrl: company.logoUrl ?? undefined,
      websiteUrl: company.websiteUrl ?? undefined,
      headquartersCity: company.headquartersCity ?? undefined,
      headquartersCountry: company.headquartersCountry ?? undefined,
      verified: company.verified,
      verifiedAt: company.verifiedAt ?? undefined,
      status: company.status,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}
