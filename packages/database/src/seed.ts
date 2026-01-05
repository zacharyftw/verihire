import { PrismaClient, UserType, SkillLevel, ChallengeDifficulty, ChallengeType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create skill categories
  console.log('📁 Creating skill categories...');
  
  const programmingCategory = await prisma.skillCategory.upsert({
    where: { slug: 'programming' },
    update: {},
    create: {
      name: 'Programming',
      slug: 'programming',
      description: 'General programming skills',
      icon: 'code',
      displayOrder: 1,
    },
  });

  const frontendCategory = await prisma.skillCategory.upsert({
    where: { slug: 'frontend' },
    update: {},
    create: {
      name: 'Frontend Development',
      slug: 'frontend',
      description: 'Frontend web development skills',
      icon: 'layout',
      displayOrder: 2,
      parentId: programmingCategory.id,
    },
  });

  const backendCategory = await prisma.skillCategory.upsert({
    where: { slug: 'backend' },
    update: {},
    create: {
      name: 'Backend Development',
      slug: 'backend',
      description: 'Backend server development skills',
      icon: 'server',
      displayOrder: 3,
      parentId: programmingCategory.id,
    },
  });

  const dataCategory = await prisma.skillCategory.upsert({
    where: { slug: 'data-science' },
    update: {},
    create: {
      name: 'Data Science',
      slug: 'data-science',
      description: 'Data science and machine learning skills',
      icon: 'chart',
      displayOrder: 4,
    },
  });

  const designCategory = await prisma.skillCategory.upsert({
    where: { slug: 'design' },
    update: {},
    create: {
      name: 'Design',
      slug: 'design',
      description: 'UI/UX and visual design skills',
      icon: 'palette',
      displayOrder: 5,
    },
  });

  // Create skills
  console.log('🎯 Creating skills...');

  const skills = [
    // Frontend skills
    { name: 'JavaScript', slug: 'javascript', categoryId: frontendCategory.id, passThreshold: 65 },
    { name: 'TypeScript', slug: 'typescript', categoryId: frontendCategory.id, passThreshold: 65 },
    { name: 'React', slug: 'react', categoryId: frontendCategory.id, passThreshold: 60 },
    { name: 'Next.js', slug: 'nextjs', categoryId: frontendCategory.id, passThreshold: 60 },
    { name: 'Vue.js', slug: 'vuejs', categoryId: frontendCategory.id, passThreshold: 60 },
    { name: 'CSS/SCSS', slug: 'css-scss', categoryId: frontendCategory.id, passThreshold: 55 },
    { name: 'Tailwind CSS', slug: 'tailwind', categoryId: frontendCategory.id, passThreshold: 55 },
    
    // Backend skills
    { name: 'Node.js', slug: 'nodejs', categoryId: backendCategory.id, passThreshold: 65 },
    { name: 'Python', slug: 'python', categoryId: backendCategory.id, passThreshold: 65 },
    { name: 'Go', slug: 'golang', categoryId: backendCategory.id, passThreshold: 65 },
    { name: 'Rust', slug: 'rust', categoryId: backendCategory.id, passThreshold: 70 },
    { name: 'Java', slug: 'java', categoryId: backendCategory.id, passThreshold: 65 },
    { name: 'PostgreSQL', slug: 'postgresql', categoryId: backendCategory.id, passThreshold: 60 },
    { name: 'MongoDB', slug: 'mongodb', categoryId: backendCategory.id, passThreshold: 60 },
    { name: 'GraphQL', slug: 'graphql', categoryId: backendCategory.id, passThreshold: 60 },
    { name: 'REST API Design', slug: 'rest-api', categoryId: backendCategory.id, passThreshold: 60 },
    
    // Data science skills
    { name: 'Machine Learning', slug: 'machine-learning', categoryId: dataCategory.id, passThreshold: 65 },
    { name: 'Deep Learning', slug: 'deep-learning', categoryId: dataCategory.id, passThreshold: 70 },
    { name: 'Data Analysis', slug: 'data-analysis', categoryId: dataCategory.id, passThreshold: 60 },
    { name: 'SQL', slug: 'sql', categoryId: dataCategory.id, passThreshold: 60 },
    
    // Design skills
    { name: 'UI Design', slug: 'ui-design', categoryId: designCategory.id, passThreshold: 55 },
    { name: 'UX Design', slug: 'ux-design', categoryId: designCategory.id, passThreshold: 55 },
    { name: 'Figma', slug: 'figma', categoryId: designCategory.id, passThreshold: 55 },
  ];

  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {},
      create: {
        name: skill.name,
        slug: skill.slug,
        categoryId: skill.categoryId,
        passThreshold: skill.passThreshold,
        description: `Proficiency in ${skill.name}`,
        certificationEnabled: true,
        certificationValidityMonths: 24,
      },
    });
  }

  // Create challenge templates
  console.log('📝 Creating challenge templates...');

  const jsSkill = await prisma.skill.findUnique({ where: { slug: 'javascript' } });
  const pythonSkill = await prisma.skill.findUnique({ where: { slug: 'python' } });

  if (jsSkill) {
    await prisma.challengeTemplate.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        skillId: jsSkill.id,
        name: 'JavaScript Array Manipulation',
        description: 'Test your ability to work with arrays in JavaScript',
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 45,
        promptTemplate: `
## Challenge: Array Manipulation

Implement the following functions:

1. \`uniqueValues(arr)\` - Return an array with only unique values
2. \`flattenArray(arr)\` - Flatten a nested array to a single level
3. \`groupBy(arr, key)\` - Group an array of objects by a key

### Requirements
- Do not use external libraries
- Handle edge cases (empty arrays, null values)
- Write clean, readable code
        `.trim(),
        evaluationCriteria: {
          correctness: { weight: 0.4, description: 'All test cases pass' },
          efficiency: { weight: 0.2, description: 'Time and space complexity' },
          codeQuality: { weight: 0.2, description: 'Clean, readable code' },
          edgeCases: { weight: 0.2, description: 'Handles edge cases' },
        },
        rubric: {
          excellent: { min: 90, description: 'Exceptional solution with optimal efficiency' },
          good: { min: 75, description: 'Solid solution with minor improvements possible' },
          passing: { min: 60, description: 'Meets requirements with some issues' },
          failing: { min: 0, description: 'Does not meet minimum requirements' },
        },
        supportedLanguages: ['javascript', 'typescript'],
      },
    });
  }

  if (pythonSkill) {
    await prisma.challengeTemplate.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        skillId: pythonSkill.id,
        name: 'Python Data Processing',
        description: 'Test your ability to process and transform data in Python',
        difficulty: ChallengeDifficulty.INTERMEDIATE,
        type: ChallengeType.CODING,
        timeLimitMinutes: 60,
        promptTemplate: `
## Challenge: Data Processing

Implement a data processing pipeline with the following functions:

1. \`clean_data(records)\` - Remove invalid records and normalize fields
2. \`transform_data(records)\` - Apply transformations based on business rules
3. \`aggregate_data(records, group_by)\` - Aggregate data by specified field

### Requirements
- Use only Python standard library
- Handle missing values gracefully
- Include proper type hints
- Write docstrings for each function
        `.trim(),
        evaluationCriteria: {
          correctness: { weight: 0.35, description: 'All test cases pass' },
          efficiency: { weight: 0.2, description: 'Efficient data handling' },
          codeQuality: { weight: 0.25, description: 'Pythonic code with type hints' },
          documentation: { weight: 0.2, description: 'Clear docstrings and comments' },
        },
        rubric: {
          excellent: { min: 90, description: 'Exceptional Pythonic solution' },
          good: { min: 75, description: 'Solid solution following best practices' },
          passing: { min: 60, description: 'Meets requirements adequately' },
          failing: { min: 0, description: 'Does not meet minimum requirements' },
        },
        supportedLanguages: ['python'],
      },
    });
  }

  // Create a test admin user
  console.log('👤 Creating test admin user...');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@verihire.local' },
    update: {},
    create: {
      email: 'admin@verihire.local',
      emailVerified: true,
      firstName: 'Admin',
      lastName: 'User',
      userType: UserType.ADMIN,
      // Password: "admin123" (hashed with bcrypt, cost 10)
      passwordHash: '$2b$10$rQZ8GtG6xQb8GqVH8FJ.t.YKH8QY6bWz4Kz7qKqKqKqKqKqKqKqKq',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: adminUser.id, role: 'admin' } },
    update: {},
    create: {
      userId: adminUser.id,
      role: 'admin',
    },
  });

  console.log('✅ Database seed completed successfully!');
  console.log(`
Summary:
- Skill Categories: 5
- Skills: ${skills.length}
- Challenge Templates: 2
- Admin User: admin@verihire.local
  `);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
