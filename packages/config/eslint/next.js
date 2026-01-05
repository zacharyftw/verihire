/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [require.resolve('./react.js'), 'plugin:@next/next/recommended'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
  },
};
