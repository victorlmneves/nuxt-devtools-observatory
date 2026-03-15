import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintPluginVue from 'eslint-plugin-vue';
import vueEslintParser from 'vue-eslint-parser';
import jsdoc from 'eslint-plugin-jsdoc';
import jsonc from 'eslint-plugin-jsonc';
import regexpPlugin from 'eslint-plugin-regexp';
import eslintPluginPrettierRecommended from 'eslint-config-prettier';

const jsBaseRules = {
    'no-unused-vars': 'error',
    'no-undef': 'error',
};

const jsDocRules = {
    'jsdoc/require-param-type': 'warn',
    'jsdoc/require-returns': 'warn',
    'jsdoc/require-param-description': 'off',
    'jsdoc/require-example': 'off',
    'jsdoc/require-jsdoc': 'off',
    'jsdoc/require-param': 'warn',
};

const tsBaseRules = {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'regexp/no-unused-capturing-group': 'off',
    'no-undef': 'off',
};

const regExRules = { 'regexp/no-unused-capturing-group': 'off' };

const vueRules = {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'vue/no-unused-vars': 'error',
    'vue/multi-word-component-names': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/require-default-prop': 'off',
    'no-undef': 'off',
    'vue/html-indent': [
        'error',
        4,
        {
            attribute: 1,
            baseIndent: 1,
            closeBracket: 0,
            alignAttributesVertically: true,
            ignores: [],
        },
    ],
};

const securityRules = {
    // Prevent token exposure in client-side code
    'no-restricted-syntax': [
        'error',
        {
            selector: "MemberExpression[object.name='session']:has(Identifier[name='access_token'])",
            message: 'Direct access to access_token is not allowed. Use server-side methods instead.',
        },
        {
            selector: "MemberExpression[object.name='token']:has(Identifier[name='access_token'])",
            message: 'Direct access to access_token is not allowed. Use server-side methods instead.',
        },
        {
            selector: "MemberExpression[object.name='window'] > Identifier[name='localStorage']",
            message: 'Avoid using window.localStorage for token operations.',
        },
        {
            selector: "MemberExpression[object.name='window'] > Identifier[name='sessionStorage']",
            message: 'Avoid using window.sessionStorage for token operations.',
        },
    ],
    // Prevent token exposure in console logs
    'no-console': [
        'warn',
        {
            allow: ['warn', 'error'],
        },
    ],
    // Prevent token exposure in localStorage/sessionStorage
    'no-restricted-properties': [
        'error',
        {
            object: 'localStorage',
            property: 'setItem',
            message: 'Do not store tokens in localStorage.',
        },
        {
            object: 'sessionStorage',
            property: 'setItem',
            message: 'Do not store tokens in sessionStorage.',
        },
    ],
};

const vueSecurityRules = {
    ...securityRules,
    // Prevent token exposure in Vue templates and components
    'vue/no-restricted-syntax': [
        'error',
        {
            selector: "MemberExpression[object.name='$session'] > Identifier[name='access_token']",
            message: 'Direct access to access_token in templates is not allowed.',
        },
        {
            selector: "MemberExpression[object.name='this'] > Identifier[name='access_token']",
            message: 'Do not store tokens in component data.',
        },
    ],
    // Prevent token exposure in Vue component data
    'vue/block-order': [
        'error',
        {
            order: ['script', 'template', 'style'],
        },
    ],
    // Prevent token exposure in Vue component props
    'vue/require-prop-types': 'error',
    // Prevent token exposure in Vue component data
    'vue/no-reserved-component-names': [
        'error',
        {
            disallowVueBuiltInComponents: true,
        },
    ],
    // Prevent token exposure in Vue component methods
    'vue/no-restricted-component-options': ['error', ['data']],
};

export default [
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                document: true,
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    {
        files: ['**/*.{ts, js, mjs, vue, json, jsonc}'],
    },
    {
        ignores: ['**/*.d.ts', 'styleDictionary/build/', 'styleDictionary/config.js', 'coverage/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    jsdoc.configs['flat/recommended'],
    regexpPlugin.configs['flat/recommended'],
    ...eslintPluginVue.configs['flat/recommended'],
    ...jsonc.configs['flat/recommended-with-jsonc'],
    {
        rules: jsBaseRules,
    },
    {
        files: ['**/*.ts'],
        rules: {
            ...tsBaseRules,
            ...jsDocRules,
            ...securityRules,
        },
    },
    {
        files: ['*.vue', '**/*.vue'],
        rules: {
            ...vueRules,
            ...jsDocRules,
            ...regExRules,
            ...vueSecurityRules,
        },
        languageOptions: {
            parser: vueEslintParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                parser: {
                    js: 'espree',
                    ts: '@typescript-eslint/parser',
                },
            },
        },
    },
    eslintPluginPrettierRecommended,
    // Add specific rules for API and auth related files
    {
        files: ['**/api/**/*.ts', '**/auth/**/*.ts', '**/server/**/*.ts'],
        rules: {
            ...securityRules,
            // Additional server-side specific rules
            'no-restricted-syntax': [
                'error',
                {
                    selector: "CallExpression[callee.name='getToken']",
                    message: 'Ensure getToken is only used server-side.',
                },
            ],
        },
    },
];
