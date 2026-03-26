import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@verihire/database';
import {
  CreateRecruiterProfileDto,
  UpdateRecruiterProfileDto,
  RecruiterProfileResponseDto,
} from './dto/recruiter.dto';

@Injectable()
export class RecruitersService {
  async createProfile(data: CreateRecruiterProfileDto): Promise<RecruiterProfileResponseDto> {
    // Check if profile already exists
    const existing = await prisma.recruiterProfile.findUnique({
      where: { userId: data.userId },
    });

    if (existing) {
      throw new BadRequestException('Recruiter profile already exists for this user');
    }

    const profile = await prisma.recruiterProfile.create({
      data: {
        userId: data.userId,
        companyId: data.companyId,
        title: data.title,
        department: data.department,
        role: data.role || 'RECRUITER',
      },
    });

    return this.mapToResponse(profile);
  }

  async getProfile(id: string): Promise<RecruiterProfileResponseDto> {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Recruiter profile not found');
    }

    return {
      ...this.mapToResponse(profile),
      user: profile.user,
      company: profile.company,
    } as any;
  }

  async getProfileByUserId(userId: string): Promise<RecruiterProfileResponseDto> {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Recruiter profile not found');
    }

    return {
      ...this.mapToResponse(profile),
      user: profile.user,
      company: profile.company,
    } as any;
  }

  async updateProfile(
    id: string,
    data: UpdateRecruiterProfileDto
  ): Promise<RecruiterProfileResponseDto> {
    const profile = await prisma.recruiterProfile.update({
      where: { id },
      data: {
        companyId: data.companyId,
        title: data.title,
        department: data.department,
        role: data.role,
      },
    });

    return this.mapToResponse(profile);
  }

  async getStats(id: string) {
    const [activeJobs, totalApplicants, shortlisted, hired] = await Promise.all([
      prisma.job.count({
        where: { recruiterId: id, status: 'ACTIVE' },
      }),
      prisma.jobApplication.count({
        where: { job: { recruiterId: id } },
      }),
      prisma.shortlist.count({
        where: { recruiterId: id },
      }),
      prisma.shortlist.count({
        where: { recruiterId: id, stage: 'HIRED' },
      }),
    ]);

    const hireRate = shortlisted > 0 ? Math.round((hired / shortlisted) * 100) : 0;

    return {
      activeJobs,
      totalApplicants,
      shortlisted,
      hireRate,
    };
  }

  private mapToResponse(profile: any): RecruiterProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      companyId: profile.companyId ?? undefined,
      title: profile.title ?? undefined,
      department: profile.department ?? undefined,
      role: profile.role,
      totalHires: profile.totalHires ?? 0,
      activeJobs: profile.activeJobs ?? 0,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
