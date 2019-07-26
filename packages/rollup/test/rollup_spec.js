const fs = require('fs');
const DIR = 'build_bazel_rules_nodejs/packages/rollup/test';

describe('rollup_bundle rule', () => {
  it('should work', () => {
    const file = require.resolve(DIR + '/bundle.js');
    expect(fs.readFileSync(file, 'utf-8')).toBe('hello');
  });
});