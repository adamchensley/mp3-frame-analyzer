import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'web/dist/**',
      'web/node_modules/**',
      'infra/node_modules/**',
      'infra/cdk.out/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // scripts are CLI tools: console output is their job
    files: ['scripts/**/*.ts', 'infra/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
