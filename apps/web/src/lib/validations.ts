import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  userType: z.enum(['CANDIDATE', 'RECRUITER']),
});

export const profileSchema = z.object({
  headline: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  yearsExperience: z.number().min(0).max(50).optional(),
  currentRole: z.string().max(100).optional(),
  currentCompany: z.string().max(100).optional(),
  locationCity: z.string().max(100).optional(),
  remotePreference: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE']).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
});

export const jobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required'),
  requirements: z.string().optional(),
  responsibilities: z.string().optional(),
  locationCity: z.string().optional(),
  remotePolicy: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  salaryCurrency: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']).optional(),
  experienceLevel: z.string().optional(),
});

export const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  description: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  headquartersCity: z.string().optional(),
  headquartersCountry: z.string().optional(),
});

export const reviewSchema = z.object({
  overallScore: z.coerce.number().min(0).max(100),
  strengths: z.string().min(1, 'Strengths are required'),
  areasForImprovement: z.string().min(1, 'Areas for improvement are required'),
  suggestions: z.string().optional(),
  confidenceLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
export type JobValues = z.infer<typeof jobSchema>;
export type CompanyValues = z.infer<typeof companySchema>;
export type ReviewValues = z.infer<typeof reviewSchema>;
