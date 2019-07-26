#!/usr/bin/env node

// Pass-through require, ensures that the nodejs_binary will load the version of rollup
// from @bazel/rollup package.json, not some other version the user depends on.
require('rollup/bin/rollup');
