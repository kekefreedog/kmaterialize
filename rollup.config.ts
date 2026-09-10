import type { RollupOptions } from 'rollup';

import typescriptPlugin from '@rollup/plugin-typescript';
import terserPlugin from '@rollup/plugin-terser';
import dtsPlugin from 'rollup-plugin-dts';
import scss, { type CSSPluginOptions } from 'rollup-plugin-scss';
import copy from 'rollup-plugin-copy';

/**
 * `rollup-plugin-scss`'s types don't know about Dart Sass's
 * `silenceDeprecations` option, even though it forwards unknown options
 * straight through to `sass.renderSync`.
 */
interface SassPluginOptions extends CSSPluginOptions {
  silenceDeprecations?: string[];
}

import { readFileSync } from 'fs';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
const packageJson = JSON.parse(readFileSync('./package.json').toString());

const outputPath = 'dist/js/materialize';

// Optional peerDependencies used by the enhanced form-input components
// (Number/IMask, Color/Pickr, Date/air-datepicker, File/FilePond,
// Select/Tom Select) - each is referenced only via `import type` (erased at
// compile time) plus a runtime `await import(...)` in src/peer-loader.ts,
// never a static value import, so rollup never actually needs to resolve
// these; listing them as `external` just keeps that explicit and silences
// warnings, and keeps the bundled .d.ts from trying to inline their types.
const peerDeps = [
  'sweetalert2',
  'sweetalert2/dist/sweetalert2.js',
  'tom-select',
  'air-datepicker',
  'air-datepicker/locale/en',
  'air-datepicker/locale/fr',
  '@simonwep/pickr',
  'filepond',
  'filepond-plugin-image-preview',
  'filepond-plugin-file-validate-type',
  'filepond-plugin-image-exif-orientation',
  'imask',
  'tippy.js'
];

const version = packageJson.version;

const bannerText = `/*!
* Materialize v${version} (https://materializeweb.com)
* Copyright 2014-${new Date().getFullYear()} Materialize
* MIT License (https://raw.githubusercontent.com/materializecss/materialize/master/LICENSE)
*/`;

const minCssOptions: SassPluginOptions = {
  fileName: 'materialize.min.css',
  outputStyle: 'compressed',
  sourceMap: !(process.env.BUILD === 'release'),
  silenceDeprecations: ['legacy-js-api'],
  processor: (css, map) => ({
    css: postcss([autoprefixer]).process(css, { from: 'materialize.min.css' }).toString(),
    map
  })
};

const cssOptions: SassPluginOptions = {
  fileName: 'materialize.css',
  silenceDeprecations: ['legacy-js-api'],
  processor: (css) =>
    postcss([autoprefixer])
      .process(css, { from: 'materialize.min.css' })
      .then((result) => result.css)
};

const colorsCssOptions: SassPluginOptions = {
  fileName: 'materialize.colors.min.css',
  outputStyle: 'compressed',
  silenceDeprecations: ['legacy-js-api'],
  processor: (css) =>
    postcss([autoprefixer])
      .process(css, { from: 'materialize.colors.min.css' })
      .then((result) => result.css)
};

const config: RollupOptions[] = [
  // Optional Tippy entry point keeps this peer out of the main library bundle.
  {
    input: 'components/extensions/tippy.ts',
    external: peerDeps,
    plugins: [typescriptPlugin()],
    output: [
      { file: 'dist/js/tippy.mjs', format: 'esm' },
      { file: 'dist/js/tippy.cjs.js', format: 'cjs' }
    ]
  },
  {
    input: 'components/extensions/tippy.ts',
    external: peerDeps,
    plugins: [typescriptPlugin(), dtsPlugin()],
    output: [{ file: 'dist/js/tippy.d.ts', format: 'esm' }]
  },
  //--- Replace version in index.ts
  {
    input: 'empty',
    plugins: [
      copy({
        targets: [
          {
            src: `src/index.ts`,
            dest: `src`,
            transform: (contents) =>
              contents
                .toString()
                .replace(
                  new RegExp(/export const version = '.*/),
                  `export const version = '${version}';`
                )
          }
        ]
      })
    ],
    onwarn: (warning, defaultHandler) => {
      if (warning.code !== 'EMPTY_BUNDLE') defaultHandler(warning);
    }
  },

  //--- JS
  {
    input: 'src/index.ts',
    external: peerDeps,
    plugins: [typescriptPlugin()],
    output: [
      {
        file: `${outputPath}.cjs.js`,
        banner: bannerText,
        format: 'cjs'
      }
    ]
  },
  {
    input: 'src/index.ts',
    external: peerDeps,
    plugins: [typescriptPlugin()],
    output: [
      {
        file: `${outputPath}.mjs`,
        banner: bannerText,
        format: 'esm'
      }
    ]
  },
  {
    input: 'src/index.ts',
    external: peerDeps,
    plugins: [typescriptPlugin()],
    output: [
      {
        name: 'M',
        file: `${outputPath}.js`,
        banner: bannerText,
        format: 'iife'
      },
      {
        name: 'M',
        file: `${outputPath}.min.js`,
        format: 'iife',
        banner: bannerText,
        plugins: [terserPlugin()]
      }
    ]
  },
  //--- Types
  {
    input: 'src/index.ts',
    external: peerDeps,
    plugins: [typescriptPlugin(), dtsPlugin()],
    output: [
      {
        file: `${outputPath}.d.ts`,
        format: 'esm'
      }
    ]
  },

  //--- CSS
  {
    input: 'sass/materialize.scss',
    output: [{ file: 'dist/css/materialize.min.css' }], // overwritten
    plugins: [scss(minCssOptions)],
    onwarn: (warning, defaultHandler) => {
      if (!(warning.code === 'FILE_NAME_CONFLICT' || warning.code === 'EMPTY_BUNDLE'))
        defaultHandler(warning);
    }
  },
  {
    input: 'sass/materialize.scss',
    output: [{ file: 'dist/css/materialize.css' }], // overwritten
    plugins: [scss(cssOptions)],
    onwarn: (warning, defaultHandler) => {
      if (!(warning.code === 'FILE_NAME_CONFLICT' || warning.code === 'EMPTY_BUNDLE'))
        defaultHandler(warning);
    }
  },
  {
    input: 'sass/_colors.scss',
    output: [{ file: 'dist/css/materialize.colors.min.css' }], // overwritten
    plugins: [scss(colorsCssOptions)],
    onwarn: (warning, defaultHandler) => {
      if (!(warning.code === 'FILE_NAME_CONFLICT' || warning.code === 'EMPTY_BUNDLE'))
        defaultHandler(warning);
    }
  },

  //--- CSS Banners
  {
    input: 'empty',
    plugins: [
      copy({
        targets: [
          {
            src: `dist/css/materialize.css`,
            dest: `dist/css`,
            transform: (contents) => [bannerText, contents].join('\n')
          },
          {
            src: `dist/css/*.min.css`,
            dest: `dist/css`,
            transform: (contents) => [bannerText, contents.toString()].join('\n') // bug => workaround
          }
        ]
      })
    ],
    onwarn: (warning, defaultHandler) => {
      if (warning.code !== 'EMPTY_BUNDLE') defaultHandler(warning);
    }
  }
];

export default config;
