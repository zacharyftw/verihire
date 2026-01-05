import {
  PrismaClient,
  UserType,
  ChallengeDifficulty,
  ChallengeType,
  SkillLevel,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean up existing data (in reverse order of dependencies)
  console.log('🧹 Cleaning existing data...');
  await prisma.analyticsEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.jobSkill.deleteMany();
  await prisma.job.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.review.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.challenge.deleteMany();
  await prisma.challengeTemplate.deleteMany();
  await prisma.candidateSkill.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.skillCategory.deleteMany();
  await prisma.recruiterProfile.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.company.deleteMany();
  await prisma.session.deleteMany();
  await prisma.mfaBackupCode.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();

  // =============================================================================
  // USERS
  // =============================================================================
  console.log('👤 Creating users...');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@verihire.com',
      emailVerified: true,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      userType: UserType.ADMIN,
    },
  });

  await prisma.userRole.create({
    data: { userId: admin.id, role: 'ADMIN' },
  });

  // Candidate users
  const candidates = await Promise.all([
    prisma.user.create({
      data: {
        email: 'alice@example.com',
        emailVerified: true,
        passwordHash,
        firstName: 'Alice',
        lastName: 'Johnson',
        userType: UserType.CANDIDATE,
      },
    }),
    prisma.user.create({
      data: {
        email: 'bob@example.com',
        emailVerified: true,
        passwordHash,
        firstName: 'Bob',
        lastName: 'Smith',
        userType: UserType.CANDIDATE,
      },
    }),
    prisma.user.create({
      data: {
        email: 'charlie@example.com',
        emailVerified: true,
        passwordHash,
        firstName: 'Charlie',
        lastName: 'Brown',
        userType: UserType.CANDIDATE,
      },
    }),
  ]);

  // Recruiter users
  const recruiters = await Promise.all([
    prisma.user.create({
      data: {
        email: 'recruiter@techcorp.com',
        emailVerified: true,
        passwordHash,
        firstName: 'Sarah',
        lastName: 'Williams',
        userType: UserType.RECRUITER,
      },
    }),
    prisma.user.create({
      data: {
        email: 'hiring@startup.io',
        emailVerified: true,
        passwordHash,
        firstName: 'Mike',
        lastName: 'Davis',
        userType: UserType.RECRUITER,
      },
    }),
  ]);

  // =============================================================================
  // SKILL CATEGORIES & SKILLS
  // =============================================================================
  console.log('🎯 Creating skill categories and skills...');

  const categories = await Promise.all([
    prisma.skillCategory.create({
      data: {
        name: 'Programming Languages',
        slug: 'programming-languages',
        description: 'Core programming language skills',
        icon: 'code',
        displayOrder: 1,
      },
    }),
    prisma.skillCategory.create({
      data: {
        name: 'Web Development',
        slug: 'web-development',
        description: 'Frontend and backend web technologies',
        icon: 'globe',
        displayOrder: 2,
      },
    }),
    prisma.skillCategory.create({
      data: {
        name: 'Data Science',
        slug: 'data-science',
        description: 'Data analysis and machine learning',
        icon: 'chart-bar',
        displayOrder: 3,
      },
    }),
    prisma.skillCategory.create({
      data: {
        name: 'DevOps',
        slug: 'devops',
        description: 'Infrastructure and deployment',
        icon: 'server',
        displayOrder: 4,
      },
    }),
    prisma.skillCategory.create({
      data: {
        name: 'Design',
        slug: 'design',
        description: 'UI/UX and graphic design',
        icon: 'palette',
        displayOrder: 5,
      },
    }),
  ]);

  const skills = await Promise.all([
    // Programming Languages
    prisma.skill.create({
      data: {
        categoryId: categories[0].id,
        name: 'JavaScript',
        slug: 'javascript',
        description: 'Modern JavaScript including ES6+ features',
        passThreshold: 70,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[0].id,
        name: 'TypeScript',
        slug: 'typescript',
        description: 'TypeScript with type safety and advanced features',
        passThreshold: 70,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[0].id,
        name: 'Python',
        slug: 'python',
        description: 'Python programming and best practices',
        passThreshold: 70,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[0].id,
        name: 'Go',
        slug: 'golang',
        description: 'Go programming language',
        passThreshold: 70,
      },
    }),
    // Web Development
    prisma.skill.create({
      data: {
        categoryId: categories[1].id,
        name: 'React',
        slug: 'react',
        description: 'React.js framework and ecosystem',
        passThreshold: 65,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[1].id,
        name: 'Node.js',
        slug: 'nodejs',
        description: 'Server-side JavaScript with Node.js',
        passThreshold: 65,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[1].id,
        name: 'Next.js',
        slug: 'nextjs',
        description: 'Next.js React framework',
        passThreshold: 65,
      },
    }),
    // Data Science
    prisma.skill.create({
      data: {
        categoryId: categories[2].id,
        name: 'SQL',
        slug: 'sql',
        description: 'SQL database querying and optimization',
        passThreshold: 70,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[2].id,
        name: 'Machine Learning',
        slug: 'machine-learning',
        description: 'ML algorithms and model development',
        passThreshold: 60,
      },
    }),
    // DevOps
    prisma.skill.create({
      data: {
        categoryId: categories[3].id,
        name: 'Docker',
        slug: 'docker',
        description: 'Container technology and Docker',
        passThreshold: 65,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[3].id,
        name: 'Kubernetes',
        slug: 'kubernetes',
        description: 'Container orchestration with K8s',
        passThreshold: 60,
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[3].id,
        name: 'AWS',
        slug: 'aws',
        description: 'Amazon Web Services cloud platform',
        passThreshold: 65,
      },
    }),
    // Design
    prisma.skill.create({
      data: {
        categoryId: categories[4].id,
        name: 'UI Design',
        slug: 'ui-design',
        description: 'User interface design principles',
        passThreshold: 60,
        challengeTypes: JSON.stringify(['design', 'written']),
      },
    }),
    prisma.skill.create({
      data: {
        categoryId: categories[4].id,
        name: 'UX Research',
        slug: 'ux-research',
        description: 'User experience research methods',
        passThreshold: 60,
        challengeTypes: JSON.stringify(['written']),
      },
    }),
  ]);

  // =============================================================================
  // CANDIDATE PROFILES
  // =============================================================================
  console.log('👨‍💻 Creating candidate profiles...');

  const candidateProfiles = await Promise.all(
    candidates.map((user, index) =>
      prisma.candidateProfile.create({
        data: {
          userId: user.id,
          headline: ['Senior Full Stack Developer', 'Frontend Engineer', 'Data Scientist'][index],
          bio: `Experienced ${['full-stack', 'frontend', 'data'][index]} developer with a passion for building great products.`,
          yearsExperience: [5, 3, 4][index],
          currentRole: ['Tech Lead', 'Senior Developer', 'Data Analyst'][index],
          currentCompany: ['BigTech Inc', 'StartupCo', 'DataCorp'][index],
          locationCity: ['San Francisco', 'New York', 'Austin'][index],
          locationCountry: 'United States',
          remotePreference: 'FLEXIBLE',
          jobSearchStatus: 'OPEN',
          portfolioPublic: true,
          portfolioSlug: `${user.firstName?.toLowerCase()}-${user.lastName?.toLowerCase()}`,
        },
      })
    )
  );

  // Add skills to candidates
  console.log('🔗 Linking skills to candidates...');
  await Promise.all([
    // Alice - Full Stack
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[0].id,
        skillId: skills[0].id, // JavaScript
        verified: true,
        score: 85,
        level: SkillLevel.ADVANCED,
      },
    }),
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[0].id,
        skillId: skills[1].id, // TypeScript
        verified: true,
        score: 82,
        level: SkillLevel.ADVANCED,
      },
    }),
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[0].id,
        skillId: skills[4].id, // React
        verified: true,
        score: 88,
        level: SkillLevel.EXPERT,
      },
    }),
    // Bob - Frontend
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[1].id,
        skillId: skills[0].id, // JavaScript
        verified: true,
        score: 78,
        level: SkillLevel.INTERMEDIATE,
      },
    }),
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[1].id,
        skillId: skills[4].id, // React
        verified: true,
        score: 85,
        level: SkillLevel.ADVANCED,
      },
    }),
    // Charlie - Data
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[2].id,
        skillId: skills[2].id, // Python
        verified: true,
        score: 90,
        level: SkillLevel.EXPERT,
      },
    }),
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[2].id,
        skillId: skills[7].id, // SQL
        verified: true,
        score: 85,
        level: SkillLevel.ADVANCED,
      },
    }),
    prisma.candidateSkill.create({
      data: {
        candidateId: candidateProfiles[2].id,
        skillId: skills[8].id, // ML
        verified: true,
        score: 75,
        level: SkillLevel.INTERMEDIATE,
      },
    }),
  ]);

  // =============================================================================
  // COMPANIES & RECRUITER PROFILES
  // =============================================================================
  console.log('🏢 Creating companies...');

  const companies = await Promise.all([
    prisma.company.create({
      data: {
        name: 'TechCorp Inc',
        slug: 'techcorp',
        description: 'Leading technology company building the future',
        industry: 'Technology',
        companySize: '1001-5000',
        headquartersCity: 'San Francisco',
        headquartersCountry: 'United States',
        verified: true,
        verifiedAt: new Date(),
        plan: 'enterprise',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Startup.io',
        slug: 'startup-io',
        description: 'Fast-growing startup disrupting the industry',
        industry: 'Technology',
        companySize: '11-50',
        headquartersCity: 'Austin',
        headquartersCountry: 'United States',
        verified: true,
        verifiedAt: new Date(),
        plan: 'pro',
      },
    }),
  ]);

  console.log('👔 Creating recruiter profiles...');

  const recruiterProfiles = await Promise.all([
    prisma.recruiterProfile.create({
      data: {
        userId: recruiters[0].id,
        companyId: companies[0].id,
        title: 'Senior Technical Recruiter',
        department: 'Engineering',
        role: 'HIRING_MANAGER',
      },
    }),
    prisma.recruiterProfile.create({
      data: {
        userId: recruiters[1].id,
        companyId: companies[1].id,
        title: 'Head of Talent',
        department: 'People',
        role: 'ADMIN',
      },
    }),
  ]);

  // =============================================================================
  // CHALLENGE TEMPLATES
  // =============================================================================
  console.log('📝 Creating challenge templates...');

  const templates = await Promise.all([
    prisma.challengeTemplate.create({
      data: {
        skillId: skills[0].id, // JavaScript
        name: 'JavaScript Fundamentals',
        description: 'Test core JavaScript knowledge',
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 45,
        promptTemplate: 'Implement the following JavaScript functions: {{requirements}}',
        evaluationCriteria: JSON.stringify([
          { name: 'Correctness', weight: 0.4 },
          { name: 'Code Quality', weight: 0.3 },
          { name: 'Performance', weight: 0.2 },
          { name: 'Edge Cases', weight: 0.1 },
        ]),
        rubric: JSON.stringify({
          excellent: 'Code is clean, efficient, and handles all edge cases',
          good: 'Code works correctly with minor improvements possible',
          acceptable: 'Code works but has some issues',
          poor: 'Code has significant issues or does not work',
        }),
        supportedLanguages: JSON.stringify(['javascript', 'typescript']),
        isActive: true,
        createdBy: admin.id,
      },
    }),
    prisma.challengeTemplate.create({
      data: {
        skillId: skills[4].id, // React
        name: 'React Component Challenge',
        description: 'Build a React component with specific requirements',
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 60,
        promptTemplate: 'Create a React component that: {{requirements}}',
        evaluationCriteria: JSON.stringify([
          { name: 'Functionality', weight: 0.35 },
          { name: 'Component Design', weight: 0.25 },
          { name: 'State Management', weight: 0.2 },
          { name: 'Code Organization', weight: 0.2 },
        ]),
        rubric: JSON.stringify({
          excellent: 'Component is well-designed, reusable, and follows React best practices',
          good: 'Component works well with minor improvements possible',
          acceptable: 'Component works but has some design issues',
          poor: 'Component has significant issues',
        }),
        supportedLanguages: JSON.stringify(['javascript', 'typescript']),
        isActive: true,
        createdBy: admin.id,
      },
    }),
    prisma.challengeTemplate.create({
      data: {
        skillId: skills[2].id, // Python
        name: 'Python Data Processing',
        description: 'Process and analyze data using Python',
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 60,
        promptTemplate: 'Write a Python script that: {{requirements}}',
        evaluationCriteria: JSON.stringify([
          { name: 'Correctness', weight: 0.4 },
          { name: 'Efficiency', weight: 0.25 },
          { name: 'Code Quality', weight: 0.2 },
          { name: 'Documentation', weight: 0.15 },
        ]),
        rubric: JSON.stringify({
          excellent: 'Code is efficient, well-documented, and handles all cases',
          good: 'Code works correctly with good practices',
          acceptable: 'Code works but could be improved',
          poor: 'Code has issues or is inefficient',
        }),
        supportedLanguages: JSON.stringify(['python']),
        isActive: true,
        createdBy: admin.id,
      },
    }),
    prisma.challengeTemplate.create({
      data: {
        skillId: skills[7].id, // SQL
        name: 'SQL Query Challenge',
        description: 'Write optimized SQL queries',
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 30,
        promptTemplate: 'Write SQL queries to: {{requirements}}',
        evaluationCriteria: JSON.stringify([
          { name: 'Correctness', weight: 0.4 },
          { name: 'Optimization', weight: 0.3 },
          { name: 'Readability', weight: 0.2 },
          { name: 'Best Practices', weight: 0.1 },
        ]),
        rubric: JSON.stringify({
          excellent: 'Queries are correct, optimized, and follow best practices',
          good: 'Queries work correctly with good performance',
          acceptable: 'Queries work but could be optimized',
          poor: 'Queries have issues or are very inefficient',
        }),
        supportedLanguages: JSON.stringify(['sql']),
        isActive: true,
        createdBy: admin.id,
      },
    }),
  ]);

  // =============================================================================
  // JOBS
  // =============================================================================
  console.log('💼 Creating jobs...');

  const jobs = await Promise.all([
    prisma.job.create({
      data: {
        companyId: companies[0].id,
        recruiterId: recruiterProfiles[0].id,
        title: 'Senior Full Stack Developer',
        description: 'We are looking for an experienced Full Stack Developer to join our team.',
        requirements: '5+ years experience with React and Node.js. Strong TypeScript skills.',
        responsibilities: 'Design and implement new features. Mentor junior developers.',
        locationCity: 'San Francisco',
        locationCountry: 'United States',
        remotePolicy: 'HYBRID',
        salaryMin: 150000,
        salaryMax: 200000,
        salaryCurrency: 'USD',
        employmentType: 'FULL_TIME',
        experienceLevel: 'Senior',
        experienceYearsMin: 5,
        experienceYearsMax: 10,
        status: 'ACTIVE',
        publishedAt: new Date(),
      },
    }),
    prisma.job.create({
      data: {
        companyId: companies[1].id,
        recruiterId: recruiterProfiles[1].id,
        title: 'Frontend Engineer',
        description: 'Join our team to build amazing user experiences.',
        requirements: '3+ years experience with React. Good eye for design.',
        responsibilities: 'Build and maintain frontend applications. Collaborate with designers.',
        locationCity: 'Austin',
        locationCountry: 'United States',
        remotePolicy: 'REMOTE',
        salaryMin: 100000,
        salaryMax: 140000,
        salaryCurrency: 'USD',
        employmentType: 'FULL_TIME',
        experienceLevel: 'Mid',
        experienceYearsMin: 3,
        experienceYearsMax: 6,
        status: 'ACTIVE',
        publishedAt: new Date(),
      },
    }),
    prisma.job.create({
      data: {
        companyId: companies[0].id,
        recruiterId: recruiterProfiles[0].id,
        title: 'Data Scientist',
        description: 'Help us make data-driven decisions.',
        requirements: 'Strong Python and SQL skills. Experience with ML models.',
        responsibilities:
          'Analyze data. Build predictive models. Present insights to stakeholders.',
        locationCity: 'San Francisco',
        locationCountry: 'United States',
        remotePolicy: 'HYBRID',
        salaryMin: 140000,
        salaryMax: 180000,
        salaryCurrency: 'USD',
        employmentType: 'FULL_TIME',
        experienceLevel: 'Mid-Senior',
        experienceYearsMin: 4,
        experienceYearsMax: 8,
        status: 'ACTIVE',
        publishedAt: new Date(),
      },
    }),
  ]);

  // Link skills to jobs
  console.log('🔗 Linking skills to jobs...');
  await Promise.all([
    // Full Stack job
    prisma.jobSkill.create({
      data: { jobId: jobs[0].id, skillId: skills[0].id, minScore: 75, required: true },
    }),
    prisma.jobSkill.create({
      data: { jobId: jobs[0].id, skillId: skills[1].id, minScore: 70, required: true },
    }),
    prisma.jobSkill.create({
      data: { jobId: jobs[0].id, skillId: skills[4].id, minScore: 75, required: true },
    }),
    prisma.jobSkill.create({
      data: { jobId: jobs[0].id, skillId: skills[5].id, minScore: 70, required: true },
    }),
    // Frontend job
    prisma.jobSkill.create({
      data: { jobId: jobs[1].id, skillId: skills[0].id, minScore: 70, required: true },
    }),
    prisma.jobSkill.create({
      data: { jobId: jobs[1].id, skillId: skills[4].id, minScore: 80, required: true },
    }),
    prisma.jobSkill.create({
      data: {
        jobId: jobs[1].id,
        skillId: skills[1].id,
        minScore: 60,
        required: false,
      },
    }),
    // Data Scientist job
    prisma.jobSkill.create({
      data: { jobId: jobs[2].id, skillId: skills[2].id, minScore: 80, required: true },
    }),
    prisma.jobSkill.create({
      data: { jobId: jobs[2].id, skillId: skills[7].id, minScore: 75, required: true },
    }),
    prisma.jobSkill.create({
      data: { jobId: jobs[2].id, skillId: skills[8].id, minScore: 70, required: true },
    }),
  ]);

  // =============================================================================
  // SAMPLE CHALLENGES
  // =============================================================================
  console.log('🎮 Creating sample challenges...');

  const challenges = await Promise.all([
    prisma.challenge.create({
      data: {
        templateId: templates[0].id,
        skillId: skills[0].id,
        title: 'Array Manipulation Challenge',
        description:
          'Implement functions to manipulate arrays: flatten nested arrays, find duplicates, and merge sorted arrays.',
        requirements: JSON.stringify([
          'Implement a function to flatten nested arrays',
          'Find all duplicate elements in an array',
          'Merge two sorted arrays into one sorted array',
        ]),
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 45,
        evaluationCriteria: templates[0].evaluationCriteria,
        starterCode: `// Implement these functions

function flatten(arr) {
  // Your code here
}

function findDuplicates(arr) {
  // Your code here
}

function mergeSorted(arr1, arr2) {
  // Your code here
}`,
        testCases: JSON.stringify([
          {
            input: '[[1, 2], [3, [4, 5]]]',
            expected: '[1, 2, 3, 4, 5]',
            function: 'flatten',
          },
          {
            input: '[1, 2, 2, 3, 3, 3]',
            expected: '[2, 3]',
            function: 'findDuplicates',
          },
          {
            input: '([1, 3, 5], [2, 4, 6])',
            expected: '[1, 2, 3, 4, 5, 6]',
            function: 'mergeSorted',
          },
        ]),
      },
    }),
    prisma.challenge.create({
      data: {
        templateId: templates[1].id,
        skillId: skills[4].id,
        title: 'Todo List Component',
        description:
          'Build a React Todo List component with add, delete, and complete functionality.',
        requirements: JSON.stringify([
          'Display a list of todo items',
          'Add new todo items',
          'Mark items as complete',
          'Delete items',
          'Filter by status (all/active/completed)',
        ]),
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 60,
        evaluationCriteria: templates[1].evaluationCriteria,
        starterCode: `import React, { useState } from 'react';

function TodoList() {
  // Your implementation here
  
  return (
    <div>
      {/* Your JSX here */}
    </div>
  );
}

export default TodoList;`,
      },
    }),
  ]);

  console.log('✅ Database seeded successfully!');
  console.log(`
📊 Summary:
- Users: ${3 + candidates.length + recruiters.length}
- Skill Categories: ${categories.length}
- Skills: ${skills.length}
- Candidate Profiles: ${candidateProfiles.length}
- Companies: ${companies.length}
- Recruiter Profiles: ${recruiterProfiles.length}
- Challenge Templates: ${templates.length}
- Challenges: ${challenges.length}
- Jobs: ${jobs.length}

🔐 Test Accounts (all use password: Password123!):
- Admin: admin@verihire.com
- Candidates: alice@example.com, bob@example.com, charlie@example.com
- Recruiters: recruiter@techcorp.com, hiring@startup.io
`);
}

main()
  .catch(e => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
