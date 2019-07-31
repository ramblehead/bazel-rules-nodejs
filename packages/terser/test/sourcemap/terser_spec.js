const fs = require('fs');
const sms = require('source-map-support');
const DIR = 'build_bazel_rules_nodejs/packages/terser/test/sourcemap';

describe('terser sourcemap handling', () => {
  it('should produce a sourcemap output', () => {
    const file = require.resolve(DIR + '/case1.js.map');
    expect(fs.readFileSync(file, 'utf-8')).toBe('hello');
  });
});