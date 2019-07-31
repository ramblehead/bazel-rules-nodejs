/**
 * @fileoverview Description of this file.
 */
const fs = require('fs');
const DIR = 'build_bazel_rules_nodejs/packages/terser/test/jsinfo_srcs';

describe('JSInfo provider in the srcs', () => {
  it('should produce the esnext as the default output', () => {
    const file = require.resolve(DIR + '/case3.js');
    expect(fs.readFileSync(file, 'utf-8')).toBe('import*as dep from"./dep";')
  });
  it('should output a JSInfo provider if one is input',
     () => {

     });
});
