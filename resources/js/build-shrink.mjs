import * as esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['resources/js/shrink-src.js'],
    bundle: true,
    format: 'iife',
    globalName: 'VzlUploadVideoShrink',
    platform: 'browser',
    outfile: 'resources/js/shrink.js',
    minify: true,
    legalComments: 'none',
    banner: {
        js: '/* mediabunny 1.55.1, MPL-2.0. Source: https://github.com/Vanilagy/mediabunny/tree/1.55.1 */',
    },
});
