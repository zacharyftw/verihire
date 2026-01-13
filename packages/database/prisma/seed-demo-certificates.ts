import { PrismaClient, SubmissionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🎓 Creating demo data for certificate testing...');

  // Get existing data from seed
  const skills = await prisma.skill.findMany({ take: 3 });
  const candidates = await prisma.candidateProfile.findMany({ take: 3 });
  const challenges = await prisma.challenge.findMany({ take: 3 });

  if (skills.length === 0 || candidates.length === 0 || challenges.length === 0) {
    console.error('❌ No seed data found. Please run: pnpm db:seed first');
    process.exit(1);
  }

  // Type guards
  if (!challenges[0] || !candidates[0]) {
    console.error('❌ Missing required seed data');
    process.exit(1);
  }

  console.log(
    `Found ${skills.length} skills, ${candidates.length} candidates, ${challenges.length} challenges`
  );

  // Clean existing demo certificates and submissions
  console.log('🧹 Cleaning existing demo data...');
  await prisma.certificate.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.submission.deleteMany();

  // Create 3 evaluated submissions with passing scores
  console.log('📝 Creating evaluated submissions...');

  const submissions = await Promise.all([
    // Submission 1: High score (92%)
    prisma.submission.create({
      data: {
        challengeId: challenges[0].id,
        candidateId: candidates[0].id,
        content: `function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}`,
        language: 'javascript',
        status: SubmissionStatus.EVALUATED,
        startedAt: new Date(Date.now() - 3600000), // 1 hour ago
        submittedAt: new Date(Date.now() - 1800000), // 30 mins ago
        timeSpentSeconds: 1800,
        finalScore: 92,
        aiScore: 90,
        peerScore: 94,
        percentile: 88,
      },
    }),

    // Submission 2: Good score (85%)
    prisma.submission.create({
      data: {
        challengeId: challenges[1]?.id ?? challenges[0].id,
        candidateId: candidates[1]?.id ?? candidates[0].id,
        content: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
        language: 'python',
        status: SubmissionStatus.EVALUATED,
        startedAt: new Date(Date.now() - 7200000), // 2 hours ago
        submittedAt: new Date(Date.now() - 5400000), // 1.5 hours ago
        timeSpentSeconds: 1800,
        finalScore: 85,
        aiScore: 83,
        peerScore: 87,
        percentile: 75,
      },
    }),

    // Submission 3: Passing score (78%)
    prisma.submission.create({
      data: {
        challengeId: challenges[2]?.id ?? challenges[0].id,
        candidateId: candidates[2]?.id ?? candidates[0].id,
        content: `import React, { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={() => setCount(count - 1)}>Decrement</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}`,
        language: 'typescript',
        status: SubmissionStatus.EVALUATED,
        startedAt: new Date(Date.now() - 10800000), // 3 hours ago
        submittedAt: new Date(Date.now() - 9000000), // 2.5 hours ago
        timeSpentSeconds: 1800,
        finalScore: 78,
        aiScore: 76,
        peerScore: 80,
        percentile: 65,
      },
    }),
  ]);

  console.log(`✅ Created ${submissions.length} evaluated submissions`);

  // Create evaluations for each submission
  console.log('📊 Creating evaluations...');

  await Promise.all(
    submissions.map((submission, index) =>
      prisma.evaluation.create({
        data: {
          submissionId: submission.id,
          overallScore: submission.finalScore ?? 0,
          confidence: 0.85 + index * 0.05,
          criteriaScores: [
            {
              criterion: 'Correctness',
              score: Number(submission.finalScore ?? 0) + 2,
              weight: 0.4,
            },
            {
              criterion: 'Code Quality',
              score: Number(submission.finalScore ?? 0) - 3,
              weight: 0.3,
            },
            { criterion: 'Performance', score: Number(submission.finalScore ?? 0), weight: 0.2 },
            {
              criterion: 'Best Practices',
              score: Number(submission.finalScore ?? 0) + 1,
              weight: 0.1,
            },
          ],
          feedback: 'Overall good submission with solid fundamentals.',
          suggestions: [
            'Clean and readable code',
            'Proper error handling',
            'Good variable naming',
            'Consider edge cases',
            'Add input validation',
          ],
        },
      })
    )
  );

  console.log('✅ Created evaluations');

  console.log('\n🎉 Demo data created successfully!');
  console.log('\n📋 Summary:');
  console.log(`   - ${submissions.length} evaluated submissions`);
  console.log(`   - Scores: ${submissions.map(s => `${s.finalScore}%`).join(', ')}`);
  console.log(`   - Candidates: ${submissions.length}`);
  console.log('\n🚀 You can now generate certificates via API!');
  console.log('\n💡 Test in Swagger:');
  console.log('   1. GET /api/v1/submissions - Find submission IDs');
  console.log('   2. POST /api/v1/certificates/generate - Generate certificate');
  console.log('   3. GET /api/v1/certificates/{id}/pdf - Download PDF\n');
}

main()
  .catch(e => {
    console.error('❌ Error creating demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
