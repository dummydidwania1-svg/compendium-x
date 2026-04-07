import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const importedUiFiles = [
  'components/HomePage.tsx',
  'components/AboutPage.tsx',
  'components/GlobalStyles.tsx',
  'components/dashboard/**/*.tsx',
  'components/ui/**/*.tsx',
  'data/**/*.ts',
  'lib/constants.ts',
  'lib/coachPrecompute.ts',
  'lib/feedbackPrecompute.ts',
  'lib/geminiCoach.ts',
  'lib/geminiFeedback.ts',
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: importedUiFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.external/**',
  ]),
])

export default eslintConfig
