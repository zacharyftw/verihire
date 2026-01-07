/**
 * Rubric definitions for peer review evaluation criteria.
 * These rubrics define the scoring structure and guidelines for reviewers.
 */

export interface RubricLevel {
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  levels: RubricLevel[];
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  challengeType: 'CODING' | 'WRITTEN' | 'DESIGN' | 'MIXED';
  criteria: RubricCriterion[];
}

// ============ Default Rubric Templates ============

export const CODING_CHALLENGE_RUBRIC: Rubric = {
  id: 'coding-default',
  name: 'Coding Challenge Rubric',
  description: 'Standard evaluation rubric for coding challenges',
  challengeType: 'CODING',
  criteria: [
    {
      id: 'correctness',
      name: 'Correctness',
      description: 'Does the solution produce correct output for all test cases?',
      weight: 0.3,
      levels: [
        {
          name: 'Excellent',
          description: 'Solution passes all test cases including edge cases',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Solution passes most test cases with minor edge case issues',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Solution passes basic test cases',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Solution has logical errors affecting core functionality',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Solution does not work or fails most test cases',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'code-quality',
      name: 'Code Quality',
      description: 'Is the code clean, readable, and following best practices?',
      weight: 0.25,
      levels: [
        {
          name: 'Excellent',
          description: 'Clean, readable code following best practices with excellent naming',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Well-organized code with good practices, minor improvements possible',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Functional code but could be cleaner or better organized',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: "Code is hard to read or doesn't follow conventions",
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Code is poorly structured and difficult to understand',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'efficiency',
      name: 'Efficiency',
      description: 'Is the solution efficient in terms of time and space complexity?',
      weight: 0.2,
      levels: [
        {
          name: 'Excellent',
          description: 'Optimal time and space complexity for the problem',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good complexity, close to optimal solution',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Acceptable complexity but room for optimization',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Inefficient solution with significant performance issues',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Very inefficient, would not scale',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'problem-understanding',
      name: 'Problem Understanding',
      description: 'Does the solution demonstrate understanding of the problem domain?',
      weight: 0.15,
      levels: [
        {
          name: 'Excellent',
          description: 'Demonstrates deep understanding of problem and domain',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good grasp of the problem with thoughtful approach',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Basic understanding of the problem',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Some misunderstanding of requirements',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Fundamental misunderstanding of the problem',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'documentation',
      name: 'Documentation',
      description: 'Is the code well-documented with clear comments?',
      weight: 0.1,
      levels: [
        {
          name: 'Excellent',
          description: 'Excellent comments, clear documentation explaining approach',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good comments and reasonable documentation',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Basic comments present',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Minimal or unclear comments',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'No documentation or misleading comments',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
  ],
};

export const WRITTEN_CHALLENGE_RUBRIC: Rubric = {
  id: 'written-default',
  name: 'Written Response Rubric',
  description: 'Standard evaluation rubric for written responses',
  challengeType: 'WRITTEN',
  criteria: [
    {
      id: 'relevance',
      name: 'Relevance',
      description: 'Does the response directly address the question or prompt?',
      weight: 0.25,
      levels: [
        {
          name: 'Excellent',
          description: 'Directly addresses all aspects of the prompt with focused content',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Addresses main aspects of the prompt',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Generally relevant but some tangential content',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Partially addresses the prompt',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Does not address the prompt',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'depth',
      name: 'Depth of Analysis',
      description: 'Does the response demonstrate deep understanding and analysis?',
      weight: 0.25,
      levels: [
        {
          name: 'Excellent',
          description: 'Exceptional depth with thorough analysis and insights',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good depth with meaningful analysis',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Adequate depth covering main points',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Superficial treatment of the topic',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Lacks any meaningful analysis',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'clarity',
      name: 'Clarity & Organization',
      description: 'Is the response well-organized and clearly written?',
      weight: 0.2,
      levels: [
        {
          name: 'Excellent',
          description: 'Exceptionally clear with excellent organization',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Clear writing with good organization',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Generally clear but could be better organized',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Unclear or poorly organized',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Very difficult to follow',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'examples',
      name: 'Use of Examples',
      description: 'Does the response include relevant examples to support arguments?',
      weight: 0.15,
      levels: [
        {
          name: 'Excellent',
          description: 'Excellent use of specific, relevant examples',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good examples that support the argument',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Some examples provided',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Few or weak examples',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'No examples provided',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'technical-accuracy',
      name: 'Technical Accuracy',
      description: 'Are the technical claims and statements accurate?',
      weight: 0.15,
      levels: [
        {
          name: 'Excellent',
          description: 'All technical information is accurate and current',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Mostly accurate with minor issues',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Generally accurate',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Several inaccuracies',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Major technical errors',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
  ],
};

export const DESIGN_CHALLENGE_RUBRIC: Rubric = {
  id: 'design-default',
  name: 'Design Challenge Rubric',
  description: 'Standard evaluation rubric for design challenges',
  challengeType: 'DESIGN',
  criteria: [
    {
      id: 'problem-solving',
      name: 'Problem Solving',
      description: 'Does the design effectively solve the stated problem?',
      weight: 0.25,
      levels: [
        {
          name: 'Excellent',
          description: 'Innovative solution that fully addresses all requirements',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Solid solution addressing most requirements',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Workable solution addressing basic requirements',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Incomplete solution missing key requirements',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Does not solve the stated problem',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'usability',
      name: 'Usability',
      description: 'Is the design user-friendly and intuitive?',
      weight: 0.25,
      levels: [
        {
          name: 'Excellent',
          description: 'Highly intuitive with excellent user experience',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good usability with clear navigation',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Usable but could be more intuitive',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Confusing or difficult to use',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Very poor usability',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'visual-design',
      name: 'Visual Design',
      description: 'Is the visual design aesthetically pleasing and consistent?',
      weight: 0.2,
      levels: [
        {
          name: 'Excellent',
          description: 'Beautiful, polished, and consistent visual design',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Clean and consistent visuals',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Acceptable visuals with some inconsistencies',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Inconsistent or unappealing visuals',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'Poor visual design',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'accessibility',
      name: 'Accessibility',
      description: 'Does the design consider accessibility requirements?',
      weight: 0.15,
      levels: [
        {
          name: 'Excellent',
          description: 'Fully accessible design following WCAG guidelines',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good accessibility considerations',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Basic accessibility addressed',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Limited accessibility consideration',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'No accessibility consideration',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
    {
      id: 'rationale',
      name: 'Design Rationale',
      description: 'Is the design well-justified with clear reasoning?',
      weight: 0.15,
      levels: [
        {
          name: 'Excellent',
          description: 'Excellent rationale with clear reasoning for all decisions',
          minScore: 90,
          maxScore: 100,
        },
        {
          name: 'Good',
          description: 'Good justification for major decisions',
          minScore: 75,
          maxScore: 89,
        },
        {
          name: 'Satisfactory',
          description: 'Some rationale provided',
          minScore: 60,
          maxScore: 74,
        },
        {
          name: 'Needs Improvement',
          description: 'Limited justification',
          minScore: 40,
          maxScore: 59,
        },
        {
          name: 'Unsatisfactory',
          description: 'No design rationale provided',
          minScore: 0,
          maxScore: 39,
        },
      ],
    },
  ],
};

// Helper to get rubric by challenge type
export function getRubricForChallengeType(type: 'CODING' | 'WRITTEN' | 'DESIGN' | 'MIXED'): Rubric {
  switch (type) {
    case 'CODING':
      return CODING_CHALLENGE_RUBRIC;
    case 'WRITTEN':
      return WRITTEN_CHALLENGE_RUBRIC;
    case 'DESIGN':
      return DESIGN_CHALLENGE_RUBRIC;
    case 'MIXED':
    default:
      // For mixed, combine relevant criteria
      return {
        id: 'mixed-default',
        name: 'Mixed Challenge Rubric',
        description: 'Rubric for challenges with multiple components',
        challengeType: 'MIXED',
        criteria: [
          CODING_CHALLENGE_RUBRIC.criteria[0], // Correctness
          CODING_CHALLENGE_RUBRIC.criteria[1], // Code Quality
          WRITTEN_CHALLENGE_RUBRIC.criteria[1], // Depth
          WRITTEN_CHALLENGE_RUBRIC.criteria[2], // Clarity
          DESIGN_CHALLENGE_RUBRIC.criteria[0], // Problem Solving
        ].map((c, _i) => ({ ...c, weight: 0.2 })), // Equal weights
      };
  }
}
