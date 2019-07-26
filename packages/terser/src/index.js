#!/usr/bin/env node

// Pass-through require, ensures that the nodejs_binary will load the version of terser
// from @bazel/terser package.json, not some other version the user depends on.
require('terser/bin/uglifyjs');
