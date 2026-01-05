module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation
        'style',    // Formatting, missing semicolons, etc
        'refactor', // Code restructuring without changing behavior
        'perf',     // Performance improvement
        'test',     // Adding tests
        'build',    // Build system or external dependencies
        'ci',       // CI configuration
        'chore',    // Maintenance tasks
        'revert',   // Revert previous commit
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 200],
  },
};
