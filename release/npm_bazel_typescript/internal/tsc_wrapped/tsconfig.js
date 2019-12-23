/**
 * @license
 * Copyright 2017 The Bazel Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "path", "typescript"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const path = require("path");
    const ts = require("typescript");
    /**
     * The same as Node's path.resolve, however it returns a path with forward
     * slashes rather than joining the resolved path with the platform's path
     * separator.
     * Note that even path.posix.resolve('.') returns C:\Users\... with backslashes.
     */
    function resolveNormalizedPath(...segments) {
        return path.resolve(...segments).replace(/\\/g, '/');
    }
    exports.resolveNormalizedPath = resolveNormalizedPath;
    /**
     * Load a tsconfig.json and convert all referenced paths (including
     * bazelOptions) to absolute paths.
     * Paths seen by TypeScript should be absolute, to match behavior
     * of the tsc ModuleResolution implementation.
     * @param tsconfigFile path to tsconfig, relative to process.cwd() or absolute
     * @return configuration parsed from the file, or error diagnostics
     */
    function parseTsconfig(tsconfigFile, host = ts.sys) {
        // TypeScript expects an absolute path for the tsconfig.json file
        tsconfigFile = resolveNormalizedPath(tsconfigFile);
        const isUndefined = (value) => value === undefined;
        // Handle bazel specific options, but make sure not to crash when reading a
        // vanilla tsconfig.json.
        const readExtendedConfigFile = (configFile, existingConfig) => {
            const { config, error } = ts.readConfigFile(configFile, host.readFile);
            if (error) {
                return { error };
            }
            // Allow Bazel users to control some of the bazel options.
            // Since TypeScript's "extends" mechanism applies only to "compilerOptions"
            // we have to repeat some of their logic to get the user's bazelOptions.
            const mergedConfig = existingConfig || config;
            if (existingConfig) {
                const existingBazelOpts = existingConfig.bazelOptions || {};
                const newBazelBazelOpts = config.bazelOptions || {};
                mergedConfig.bazelOptions = Object.assign({}, existingBazelOpts, { disableStrictDeps: isUndefined(existingBazelOpts.disableStrictDeps)
                        ? newBazelBazelOpts.disableStrictDeps
                        : existingBazelOpts.disableStrictDeps, suppressTsconfigOverrideWarnings: isUndefined(existingBazelOpts.suppressTsconfigOverrideWarnings)
                        ? newBazelBazelOpts.suppressTsconfigOverrideWarnings
                        : existingBazelOpts.suppressTsconfigOverrideWarnings, tsickle: isUndefined(existingBazelOpts.tsickle)
                        ? newBazelBazelOpts.tsickle
                        : existingBazelOpts.tsickle, googmodule: isUndefined(existingBazelOpts.googmodule)
                        ? newBazelBazelOpts.googmodule
                        : existingBazelOpts.googmodule, devmodeTargetOverride: isUndefined(existingBazelOpts.devmodeTargetOverride)
                        ? newBazelBazelOpts.devmodeTargetOverride
                        : existingBazelOpts.devmodeTargetOverride });
            }
            if (config.extends) {
                let extendedConfigPath = resolveNormalizedPath(path.dirname(configFile), config.extends);
                if (!extendedConfigPath.endsWith('.json'))
                    extendedConfigPath += '.json';
                return readExtendedConfigFile(extendedConfigPath, mergedConfig);
            }
            return { config: mergedConfig };
        };
        const { config, error } = readExtendedConfigFile(tsconfigFile);
        if (error) {
            // target is in the config file we failed to load...
            return [null, [error], { target: '' }];
        }
        const { options, errors, fileNames } = ts.parseJsonConfigFileContent(config, host, path.dirname(tsconfigFile));
        // Handle bazel specific options, but make sure not to crash when reading a
        // vanilla tsconfig.json.
        const bazelOpts = config.bazelOptions || {};
        const target = bazelOpts.target;
        bazelOpts.allowedStrictDeps = bazelOpts.allowedStrictDeps || [];
        bazelOpts.typeBlackListPaths = bazelOpts.typeBlackListPaths || [];
        bazelOpts.compilationTargetSrc = bazelOpts.compilationTargetSrc || [];
        if (errors && errors.length) {
            return [null, errors, { target }];
        }
        // Override the devmode target if devmodeTargetOverride is set
        if (bazelOpts.es5Mode && bazelOpts.devmodeTargetOverride) {
            switch (bazelOpts.devmodeTargetOverride.toLowerCase()) {
                case 'es3':
                    options.target = ts.ScriptTarget.ES3;
                    break;
                case 'es5':
                    options.target = ts.ScriptTarget.ES5;
                    break;
                case 'es2015':
                    options.target = ts.ScriptTarget.ES2015;
                    break;
                case 'es2016':
                    options.target = ts.ScriptTarget.ES2016;
                    break;
                case 'es2017':
                    options.target = ts.ScriptTarget.ES2017;
                    break;
                case 'es2018':
                    options.target = ts.ScriptTarget.ES2018;
                    break;
                case 'esnext':
                    options.target = ts.ScriptTarget.ESNext;
                    break;
                default:
                    console.error('WARNING: your tsconfig.json file specifies an invalid bazelOptions.devmodeTargetOverride value of: \'${bazelOpts.devmodeTargetOverride\'');
            }
        }
        // Sort rootDirs with longest include directories first.
        // When canonicalizing paths, we always want to strip
        // `workspace/bazel-bin/file` to just `file`, not to `bazel-bin/file`.
        if (options.rootDirs)
            options.rootDirs.sort((a, b) => b.length - a.length);
        // If the user requested goog.module, we need to produce that output even if
        // the generated tsconfig indicates otherwise.
        if (bazelOpts.googmodule)
            options.module = ts.ModuleKind.CommonJS;
        // TypeScript's parseJsonConfigFileContent returns paths that are joined, eg.
        // /path/to/project/bazel-out/arch/bin/path/to/package/../../../../../../path
        // We normalize them to remove the intermediate parent directories.
        // This improves error messages and also matches logic in tsc_wrapped where we
        // expect normalized paths.
        const files = fileNames.map(f => path.posix.normalize(f));
        // The bazelOpts paths in the tsconfig are relative to
        // options.rootDir (the workspace root) and aren't transformed by
        // parseJsonConfigFileContent (because TypeScript doesn't know
        // about them). Transform them to also be absolute here.
        bazelOpts.compilationTargetSrc = bazelOpts.compilationTargetSrc.map(f => resolveNormalizedPath(options.rootDir, f));
        bazelOpts.allowedStrictDeps = bazelOpts.allowedStrictDeps.map(f => resolveNormalizedPath(options.rootDir, f));
        bazelOpts.typeBlackListPaths = bazelOpts.typeBlackListPaths.map(f => resolveNormalizedPath(options.rootDir, f));
        if (bazelOpts.nodeModulesPrefix) {
            bazelOpts.nodeModulesPrefix =
                resolveNormalizedPath(options.rootDir, bazelOpts.nodeModulesPrefix);
        }
        let disabledTsetseRules = [];
        for (const pluginConfig of options['plugins'] ||
            []) {
            if (pluginConfig.name && pluginConfig.name === '@bazel/tsetse') {
                const disabledRules = pluginConfig['disabledRules'];
                if (disabledRules && !Array.isArray(disabledRules)) {
                    throw new Error('Disabled tsetse rules must be an array of rule names');
                }
                disabledTsetseRules = disabledRules;
                break;
            }
        }
        return [
            { options, bazelOpts, files, config, disabledTsetseRules }, null, { target }
        ];
    }
    exports.parseTsconfig = parseTsconfig;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHNjb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9leHRlcm5hbC9idWlsZF9iYXplbF9ydWxlc190eXBlc2NyaXB0L2ludGVybmFsL3RzY193cmFwcGVkL3RzY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7R0FlRzs7Ozs7Ozs7Ozs7O0lBRUgsNkJBQTZCO0lBQzdCLGlDQUFpQztJQWtNakM7Ozs7O09BS0c7SUFDSCxTQUFnQixxQkFBcUIsQ0FBQyxHQUFHLFFBQWtCO1FBQ3pELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUZELHNEQUVDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNILFNBQWdCLGFBQWEsQ0FDekIsWUFBb0IsRUFBRSxPQUEyQixFQUFFLENBQUMsR0FBRztRQUV6RCxpRUFBaUU7UUFDakUsWUFBWSxHQUFHLHFCQUFxQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRW5ELE1BQU0sV0FBVyxHQUFHLENBQUMsS0FBVSxFQUFzQixFQUFFLENBQUMsS0FBSyxLQUFLLFNBQVMsQ0FBQztRQUU1RSwyRUFBMkU7UUFDM0UseUJBQXlCO1FBRXpCLE1BQU0sc0JBQXNCLEdBQzFCLENBQUMsVUFBa0IsRUFBRSxjQUFvQixFQUF5QyxFQUFFO1lBQ2xGLE1BQU0sRUFBQyxNQUFNLEVBQUUsS0FBSyxFQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXJFLElBQUksS0FBSyxFQUFFO2dCQUNULE9BQU8sRUFBQyxLQUFLLEVBQUMsQ0FBQzthQUNoQjtZQUVELDBEQUEwRDtZQUMxRCwyRUFBMkU7WUFDM0Usd0VBQXdFO1lBQ3hFLE1BQU0sWUFBWSxHQUFHLGNBQWMsSUFBSSxNQUFN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LEVBQUUsU0FBUyxDQUFDLGlCQUFpQixDQUFDLENBQUM7U0FDMUU7UUFFRCxJQUFJLG1CQUFtQixHQUFhLEVBQUUsQ0FBQztRQUN2QyxLQUFLLE1BQU0sWUFBWSxJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQTZCO1lBQ3BFLEVBQUUsRUFBRTtZQUNQLElBQUksWUFBWSxDQUFDLElBQUksSUFBSSxZQUFZLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRTtnQkFDOUQsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLGFBQWEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUU7b0JBQ2xELE1BQU0sSUFBSSxLQUFLLENBQUMsc0RBQXNELENBQUMsQ0FBQztpQkFDekU7Z0JBQ0QsbUJBQW1CLEdBQUcsYUFBeUIsQ0FBQztnQkFDaEQsTUFBTTthQUNQO1NBQ0Y7UUFFRCxPQUFPO1lBQ0wsRUFBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsbUJBQW1CLEVBQUMsRUFBRSxJQUFJLEVBQUUsRUFBQyxNQUFNLEVBQUM7U0FDekUsQ0FBQztJQUNKLENBQUM7SUFsS0Qsc0NBa0tDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IDIwMTcgVGhlIEJhemVsIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcblxuXG4vKipcbiAqIFRoZSBjb25maWd1cmF0aW9uIGJsb2NrIHByb3ZpZGVkIGJ5IHRoZSB0c2NvbmZpZyBcImJhemVsT3B0aW9uc1wiLlxuICogTm90ZSB0aGF0IGFsbCBwYXRocyBoZXJlIGFyZSByZWxhdGl2ZSB0byB0aGUgcm9vdERpciwgbm90IGFic29sdXRlIG5vclxuICogcmVsYXRpdmUgdG8gdGhlIGxvY2F0aW9uIGNvbnRhaW5pbmcgdGhlIHRzY29uZmlnIGZpbGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmF6ZWxPcHRpb25zIHtcbiAgLyoqIE5hbWUgb2YgdGhlIGJhemVsIHdvcmtzcGFjZSB3aGVyZSB3ZSBhcmUgYnVpbGRpbmcuICovXG4gIHdvcmtzcGFjZU5hbWU6IHN0cmluZztcblxuICAvKiogVGhlIGZ1bGwgYmF6ZWwgdGFyZ2V0IHRoYXQgaXMgYmVpbmcgYnVpbHQsIGUuZy4gLy9teS9wa2c6bGlicmFyeS4gKi9cbiAgdGFyZ2V0OiBzdHJpbmc7XG5cbiAgLyoqIFRoZSBiYXplbCBwYWNrYWdlLCBlZyBteS9wa2cgKi9cbiAgcGFja2FnZTogc3RyaW5nO1xuXG4gIC8qKiBJZiB0cnVlLCBjb252ZXJ0IHJlcXVpcmUoKXMgaW50byBnb29nLm1vZHVsZSgpLiAqL1xuICBnb29nbW9kdWxlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBJZiB0cnVlLCBlbWl0IGRldm1vZGUgb3V0cHV0IGludG8gZmlsZW5hbWUuanMuXG4gICAqIElmIGZhbHNlLCBlbWl0IHByb2Rtb2RlIG91dHB1dCBpbnRvIGZpbGVuYW1lLmNsb3N1cmUuanMuXG4gICAqL1xuICBlczVNb2RlOiBib29sZWFuO1xuXG4gIC8qKiBJZiB0cnVlLCBjb252ZXJ0IFR5cGVTY3JpcHQgY29kZSBpbnRvIGEgQ2xvc3VyZS1jb21wYXRpYmxlIHZhcmlhbnQuICovXG4gIHRzaWNrbGU6IGJvb2xlYW47XG5cbiAgLyoqIElmIHRydWUsIGdlbmVyYXRlIGV4dGVybnMgZnJvbSBkZWNsYXJhdGlvbnMgaW4gZC50cyBmaWxlcy4gKi9cbiAgdHNpY2tsZUdlbmVyYXRlRXh0ZXJuczogYm9vbGVhbjtcblxuICAvKiogV3JpdGUgZ2VuZXJhdGVkIGV4dGVybnMgdG8gdGhlIGdpdmVuIHBhdGguICovXG4gIHRzaWNrbGVFeHRlcm5zUGF0aDogc3RyaW5nO1xuXG4gIC8qKiBQYXRocyBvZiBkZWNsYXJhdGlvbnMgd2hvc2UgdHlwZXMgbXVzdCBub3QgYXBwZWFyIGluIHJlc3VsdCAuZC50cy4gKi9cbiAgdHlwZUJsYWNrTGlzdFBhdGhzOiBzdHJpbmdbXTtcblxuICAvKiogSWYgdHJ1ZSwgZW1pdCBDbG9zdXJlIHR5cGVzIGluIFR5cGVTY3JpcHQtPkpTIG91dHB1dC4gKi9cbiAgdW50eXBlZDogYm9vbGVhbjtcblxuICAvKiogVGhlIGxpc3Qgb2Ygc291cmNlcyB3ZSdyZSBpbnRlcmVzdGVkIGluIChlbWl0dGluZyBhbmQgdHlwZSBjaGVja2luZykuICovXG4gIGNvbXBpbGF0aW9uVGFyZ2V0U3JjOiBzdHJpbmdbXTtcblxuICAvKiogUGF0aCB0byB3cml0ZSB0aGUgbW9kdWxlIGRlcGVuZGVuY3kgbWFuaWZlc3QgdG8uICovXG4gIG1hbmlmZXN0OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gZGlzYWJsZSBzdHJpY3QgZGVwcyBjaGVjay4gSWYgdHJ1ZSB0aGUgbmV4dCBwYXJhbWV0ZXIgaXNcbiAgICogaWdub3JlZC5cbiAgICovXG4gIGRpc2FibGVTdHJpY3REZXBzPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUGF0aHMgb2YgZGVwZW5kZW5jaWVzIHRoYXQgYXJlIGFsbG93ZWQgYnkgc3RyaWN0IGRlcHMsIGkuZS4gdGhhdCBtYXkgYmVcbiAgICogaW1wb3J0ZWQgYnkgdGhlIHNvdXJjZSBmaWxlcyBpbiBjb21waWxhdGlvblRhcmdldFNyYy5cbiAgICovXG4gIGFsbG93ZWRTdHJpY3REZXBzOiBzdHJpbmdbXTtcblxuICAvKiogV3JpdGUgYSBwZXJmb3JtYW5jZSB0cmFjZSB0byB0aGlzIHBhdGguIERpc2FibGVkIHdoZW4gZmFsc3kuICovXG4gIHBlcmZUcmFjZVBhdGg/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFuIGFkZGl0aW9uYWwgcHJlbHVkZSB0byBpbnNlcnQgYWZ0ZXIgdGhlIGBnb29nLm1vZHVsZWAgY2FsbCxcbiAgICogZS5nLiB3aXRoIGFkZGl0aW9uYWwgaW1wb3J0cyBvciByZXF1aXJlcy5cbiAgICovXG4gIHByZWx1ZGU6IHN0cmluZztcblxuICAvKipcbiAgICogTmFtZSBvZiB0aGUgY3VycmVudCBsb2NhbGUgaWYgcHJvY2Vzc2luZyBhIGxvY2FsZS1zcGVjaWZpYyBmaWxlLlxuICAgKi9cbiAgbG9jYWxlPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBIGxpc3Qgb2YgZXJyb3JzIHRoaXMgY29tcGlsYXRpb24gaXMgZXhwZWN0ZWQgdG8gZ2VuZXJhdGUsIGluIHRoZSBmb3JtXG4gICAqIFwiVFMxMjM0OnJlZ2V4cFwiLiBJZiBlbXB0eSwgY29tcGlsYXRpb24gaXMgZXhwZWN0ZWQgdG8gc3VjY2VlZC5cbiAgICovXG4gIGV4cGVjdGVkRGlhZ25vc3RpY3M6IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBUbyBzdXBwb3J0IG5vZGVfbW9kdWxlIHJlc29sdXRpb24sIGFsbG93IFR5cGVTY3JpcHQgdG8gbWFrZSBhcmJpdHJhcnlcbiAgICogZmlsZSBzeXN0ZW0gYWNjZXNzIHRvIHBhdGhzIHVuZGVyIHRoaXMgcHJlZml4LlxuICAgKi9cbiAgbm9kZU1vZHVsZXNQcmVmaXg6IHN0cmluZztcblxuICAvKipcbiAgICogTGlzdCBvZiByZWdleGVzIG9uIGZpbGUgcGF0aHMgZm9yIHdoaWNoIHdlIHN1cHByZXNzIHRzaWNrbGUncyB3YXJuaW5ncy5cbiAgICovXG4gIGlnbm9yZVdhcm5pbmdQYXRoczogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gYWRkIGFsaWFzZXMgdG8gdGhlIC5kLnRzIGZpbGVzIHRvIGFkZCB0aGUgZXhwb3J0cyB0byB0aGVcbiAgICog4LKgX+CyoC5jbHV0eiBuYW1lc3BhY2UuXG4gICAqL1xuICBhZGREdHNDbHV0ekFsaWFzZXM6IHRydWU7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gdHlwZSBjaGVjayBpbnB1dHMgdGhhdCBhcmVuJ3Qgc3Jjcy4gIERpZmZlcnMgZnJvbVxuICAgKiAtLXNraXBMaWJDaGVjaywgd2hpY2ggc2tpcHMgYWxsIC5kLnRzIGZpbGVzLCBldmVuIHRob3NlIHdoaWNoIGFyZVxuICAgKiBzcmNzLlxuICAgKi9cbiAgdHlwZUNoZWNrRGVwZW5kZW5jaWVzOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBUaGUgbWF4aW11bSBjYWNoZSBzaXplIGZvciBiYXplbCBvdXRwdXRzLCBpbiBtZWdhYnl0ZXMuXG4gICAqL1xuICBtYXhDYWNoZVNpemVNYj86IG51bWJlcjtcblxuICAvKipcbiAgICogU3VwcHJlc3Mgd2FybmluZ3MgYWJvdXQgdHNjb25maWcuanNvbiBwcm9wZXJ0aWVzIHRoYXQgYXJlIG92ZXJyaWRkZW4uXG4gICAqIEN1cnJlbnRseSB1bnVzZWQsIHJlbWFpbnMgaGVyZSBmb3IgYmFja3dhcmRzIGNvbXBhdCBmb3IgdXNlcnMgd2hvIHNldCBpdC5cbiAgICovXG4gIHN1cHByZXNzVHNjb25maWdPdmVycmlkZVdhcm5pbmdzOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBBbiBleHBsaWNpdCBuYW1lIGZvciB0aGlzIG1vZHVsZSwgZ2l2ZW4gYnkgdGhlIG1vZHVsZV9uYW1lIGF0dHJpYnV0ZSBvbiBhXG4gICAqIHRzX2xpYnJhcnkuXG4gICAqL1xuICBtb2R1bGVOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBbiBleHBsaWNpdCBlbnRyeSBwb2ludCBmb3IgdGhpcyBtb2R1bGUsIGdpdmVuIGJ5IHRoZSBtb2R1bGVfcm9vdCBhdHRyaWJ1dGVcbiAgICogb24gYSB0c19saWJyYXJ5LlxuICAgKi9cbiAgbW9kdWxlUm9vdD86IHN0cmluZztcblxuICAvKipcbiAgICogSWYgdHJ1ZSwgaW5kaWNhdGVzIHRoYXQgdGhpcyBqb2IgaXMgdHJhbnNwaWxpbmcgSlMgc291cmNlcy4gSWYgdHJ1ZSwgb25seVxuICAgKiBvbmUgZmlsZSBjYW4gYXBwZWFyIGluIGNvbXBpbGF0aW9uVGFyZ2V0U3JjLCBhbmQgZWl0aGVyXG4gICAqIHRyYW5zcGlsZWRKc091dHB1dEZpbGVOYW1lIG9yIHRoZSB0cmFuc3BpbGVkSnMqRGlyZWN0b3J5IG9wdGlvbnMgbXVzdCBiZVxuICAgKiBzZXQuXG4gICAqL1xuICBpc0pzVHJhbnNwaWxhdGlvbj86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFRoZSBwYXRoIHdoZXJlIHRoZSBmaWxlIGNvbnRhaW5pbmcgdGhlIEpTIHRyYW5zcGlsZWQgb3V0cHV0IHNob3VsZCBiZVxuICAgKiB3cml0dGVuLiBJZ25vcmVkIGlmIGlzSnNUcmFuc3BpbGF0aW9uIGlzIGZhbHNlLiB0cmFuc3BpbGVkSnNPdXRwdXRGaWxlTmFtZVxuICAgKlxuICAgKi9cbiAgdHJhbnNwaWxlZEpzT3V0cHV0RmlsZU5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFRoZSBwYXRoIHdoZXJlIHRyYW5zcGlsZWQgSlMgb3V0cHV0IHNob3VsZCBiZSB3cml0dGVuLiBJZ25vcmVkIGlmXG4gICAqIGlzSnNUcmFuc3BpbGF0aW9uIGlzIGZhbHNlLiBNdXN0IG5vdCBiZSBzZXQgdG9nZXRoZXIgd2l0aFxuICAgKiB0cmFuc3BpbGVkSnNPdXRwdXRGaWxlTmFtZS5cbiAgICovXG4gIHRyYW5zcGlsZWRKc0lucHV0RGlyZWN0b3J5Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBUaGUgcGF0aCB3aGVyZSB0cmFuc3BpbGVkIEpTIG91dHB1dCBzaG91bGQgYmUgd3JpdHRlbi4gSWdub3JlZCBpZlxuICAgKiBpc0pzVHJhbnNwaWxhdGlvbiBpcyBmYWxzZS4gTXVzdCBub3QgYmUgc2V0IHRvZ2V0aGVyIHdpdGhcbiAgICogdHJhbnNwaWxlZEpzT3V0cHV0RmlsZU5hbWUuXG4gICAqL1xuICB0cmFuc3BpbGVkSnNPdXRwdXREaXJlY3Rvcnk/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdGhlIHVzZXIgcHJvdmlkZWQgYW4gaW1wbGVtZW50YXRpb24gc2hpbSBmb3IgLmQudHMgZmlsZXMgaW4gdGhlXG4gICAqIGNvbXBpbGF0aW9uIHVuaXQuXG4gICAqL1xuICBoYXNJbXBsZW1lbnRhdGlvbj86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEVuYWJsZSB0aGUgQW5ndWxhciBuZ3RzYyBwbHVnaW4uXG4gICAqL1xuICBjb21waWxlQW5ndWxhclRlbXBsYXRlcz86IGJvb2xlYW47XG5cblxuICAvKipcbiAgICogT3ZlcnJpZGUgZm9yIEVDTUFTY3JpcHQgdGFyZ2V0IGxhbmd1YWdlIGxldmVsIHRvIHVzZSBmb3IgZGV2bW9kZS5cbiAgICpcbiAgICogVGhpcyBzZXR0aW5nIGNhbiBiZSBzZXQgaW4gYSB1c2VyJ3MgdHNjb25maWcgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHRcbiAgICogZGV2bW9kZSB0YXJnZXQuXG4gICAqXG4gICAqIEVYUEVSSU1FTlRBTDogVGhpcyBzZXR0aW5nIGlzIGV4cGVyaW1lbnRhbCBhbmQgbWF5IGJlIHJlbW92ZWQgaW4gdGhlXG4gICAqIGZ1dHVyZS5cbiAgICovXG4gIGRldm1vZGVUYXJnZXRPdmVycmlkZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQYXJzZWRUc0NvbmZpZyB7XG4gIG9wdGlvbnM6IHRzLkNvbXBpbGVyT3B0aW9ucztcbiAgYmF6ZWxPcHRzOiBCYXplbE9wdGlvbnM7XG4gIGFuZ3VsYXJDb21waWxlck9wdGlvbnM/OiB7W2s6IHN0cmluZ106IHVua25vd259O1xuICBmaWxlczogc3RyaW5nW107XG4gIGRpc2FibGVkVHNldHNlUnVsZXM6IHN0cmluZ1tdO1xuICBjb25maWc6IHt9O1xufVxuXG4vLyBUT0RPKGNhbGViZWdnKTogVXBzdHJlYW0/XG5pbnRlcmZhY2UgUGx1Z2luSW1wb3J0V2l0aENvbmZpZyBleHRlbmRzIHRzLlBsdWdpbkltcG9ydCB7XG4gIFtvcHRpb25OYW1lOiBzdHJpbmddOiBzdHJpbmd8e307XG59XG5cbi8qKlxuICogVGhlIHNhbWUgYXMgTm9kZSdzIHBhdGgucmVzb2x2ZSwgaG93ZXZlciBpdCByZXR1cm5zIGEgcGF0aCB3aXRoIGZvcndhcmRcbiAqIHNsYXNoZXMgcmF0aGVyIHRoYW4gam9pbmluZyB0aGUgcmVzb2x2ZWQgcGF0aCB3aXRoIHRoZSBwbGF0Zm9ybSdzIHBhdGhcbiAqIHNlcGFyYXRvci5cbiAqIE5vdGUgdGhhdCBldmVuIHBhdGgucG9zaXgucmVzb2x2ZSgnLicpIHJldHVybnMgQzpcXFVzZXJzXFwuLi4gd2l0aCBiYWNrc2xhc2hlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVOb3JtYWxpemVkUGF0aCguLi5zZWdtZW50czogc3RyaW5nW10pOiBzdHJpbmcge1xuICByZXR1cm4gcGF0aC5yZXNvbHZlKC4uLnNlZ21lbnRzKS5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG59XG5cbi8qKlxuICogTG9hZCBhIHRzY29uZmlnLmpzb24gYW5kIGNvbnZlcnQgYWxsIHJlZmVyZW5jZWQgcGF0aHMgKGluY2x1ZGluZ1xuICogYmF6ZWxPcHRpb25zKSB0byBhYnNvbHV0ZSBwYXRocy5cbiAqIFBhdGhzIHNlZW4gYnkgVHlwZVNjcmlwdCBzaG91bGQgYmUgYWJzb2x1dGUsIHRvIG1hdGNoIGJlaGF2aW9yXG4gKiBvZiB0aGUgdHNjIE1vZHVsZVJlc29sdXRpb24gaW1wbGVtZW50YXRpb24uXG4gKiBAcGFyYW0gdHNjb25maWdGaWxlIHBhdGggdG8gdHNjb25maWcsIHJlbGF0aXZlIHRvIHByb2Nlc3MuY3dkKCkgb3IgYWJzb2x1dGVcbiAqIEByZXR1cm4gY29uZmlndXJhdGlvbiBwYXJzZWQgZnJvbSB0aGUgZmlsZSwgb3IgZXJyb3IgZGlhZ25vc3RpY3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVHNjb25maWcoXG4gICAgdHNjb25maWdGaWxlOiBzdHJpbmcsIGhvc3Q6IHRzLlBhcnNlQ29uZmlnSG9zdCA9IHRzLnN5cyk6XG4gICAgW1BhcnNlZFRzQ29uZmlnfG51bGwsIHRzLkRpYWdub3N0aWNbXXxudWxsLCB7dGFyZ2V0OiBzdHJpbmd9XSB7XG4gIC8vIFR5cGVTY3JpcHQgZXhwZWN0cyBhbiBhYnNvbHV0ZSBwYXRoIGZvciB0aGUgdHNjb25maWcuanNvbiBmaWxlXG4gIHRzY29uZmlnRmlsZSA9IHJlc29sdmVOb3JtYWxpemVkUGF0aCh0c2NvbmZpZ0ZpbGUpO1xuXG4gIGNvbnN0IGlzVW5kZWZpbmVkID0gKHZhbHVlOiBhbnkpOiB2YWx1ZSBpcyB1bmRlZmluZWQgPT4gdmFsdWUgPT09IHVuZGVmaW5lZDtcblxuICAvLyBIYW5kbGUgYmF6ZWwgc3BlY2lmaWMgb3B0aW9ucywgYnV0IG1ha2Ugc3VyZSBub3QgdG8gY3Jhc2ggd2hlbiByZWFkaW5nIGFcbiAgLy8gdmFuaWxsYSB0c2NvbmZpZy5qc29uLlxuXG4gIGNvbnN0IHJlYWRFeHRlbmRlZENvbmZpZ0ZpbGUgPVxuICAgIChjb25maWdGaWxlOiBzdHJpbmcsIGV4aXN0aW5nQ29uZmlnPzogYW55KToge2NvbmZpZz86IGFueSwgZXJyb3I/OiB0cy5EaWFnbm9zdGljfSA9PiB7XG4gICAgICBjb25zdCB7Y29uZmlnLCBlcnJvcn0gPSB0cy5yZWFkQ29uZmlnRmlsZShjb25maWdGaWxlLCBob3N0LnJlYWRGaWxlKTtcblxuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHJldHVybiB7ZXJyb3J9O1xuICAgICAgfVxuXG4gICAgICAvLyBBbGxvdyBCYXplbCB1c2VycyB0byBjb250cm9sIHNvbWUgb2YgdGhlIGJhemVsIG9wdGlvbnMuXG4gICAgICAvLyBTaW5jZSBUeXBlU2NyaXB0J3MgXCJleHRlbmRzXCIgbWVjaGFuaXNtIGFwcGxpZXMgb25seSB0byBcImNvbXBpbGVyT3B0aW9uc1wiXG4gICAgICAvLyB3ZSBoYXZlIHRvIHJlcGVhdCBzb21lIG9mIHRoZWlyIGxvZ2ljIHRvIGdldCB0aGUgdXNlcidzIGJhemVsT3B0aW9ucy5cbiAgICAgIGNvbnN0IG1lcmdlZENvbmZpZyA9IGV4aXN0aW5nQ29uZmlnIHx8IGNvbmZpZztcblxuICAgICAgaWYgKGV4aXN0aW5nQ29uZmlnKSB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nQmF6ZWxPcHRzOiBCYXplbE9wdGlvbnMgPSBleGlzdGluZ0NvbmZpZy5iYXplbE9wdGlvbnMgfHwge307XG4gICAgICAgIGNvbnN0IG5ld0JhemVsQmF6ZWxPcHRzOiBCYXplbE9wdGlvbnMgPSBjb25maWcuYmF6ZWxPcHRpb25zIHx8IHt9O1xuXG4gICAgICAgIG1lcmdlZENvbmZpZy5iYXplbE9wdGlvbnMgPSB7XG4gICAgICAgICAgLi4uZXhpc3RpbmdCYXplbE9wdHMsXG5cbiAgICAgICAgICBkaXNhYmxlU3RyaWN0RGVwczogaXNVbmRlZmluZWQoZXhpc3RpbmdCYXplbE9wdHMuZGlzYWJsZVN0cmljdERlcHMpXG4gICAgICAgICAgICA/IG5ld0JhemVsQmF6ZWxPcHRzLmRpc2FibGVTdHJpY3REZXBzXG4gICAgICAgICAgICA6IGV4aXN0aW5nQmF6ZWxPcHRzLmRpc2FibGVTdHJpY3REZXBzLFxuXG4gICAgICAgICAgc3VwcHJlc3NUc2NvbmZpZ092ZXJyaWRlV2FybmluZ3M6IGlzVW5kZWZpbmVkKGV4aXN0aW5nQmF6ZWxPcHRzLnN1cHByZXNzVHNjb25maWdPdmVycmlkZVdhcm5pbmdzKVxuICAgICAgICAgICAgPyBuZXdCYXplbEJhemVsT3B0cy5zdXBwcmVzc1RzY29uZmlnT3ZlcnJpZGVXYXJuaW5nc1xuICAgICAgICAgICAgOiBleGlzdGluZ0JhemVsT3B0cy5zdXBwcmVzc1RzY29uZmlnT3ZlcnJpZGVXYXJuaW5ncyxcblxuICAgICAgICAgIHRzaWNrbGU6IGlzVW5kZWZpbmVkKGV4aXN0aW5nQmF6ZWxPcHRzLnRzaWNrbGUpXG4gICAgICAgICAgICA/IG5ld0JhemVsQmF6ZWxPcHRzLnRzaWNrbGVcbiAgICAgICAgICAgIDogZXhpc3RpbmdCYXplbE9wdHMudHNpY2tsZSxcblxuICAgICAgICAgIGdvb2dtb2R1bGU6IGlzVW5kZWZpbmVkKGV4aXN0aW5nQmF6ZWxPcHRzLmdvb2dtb2R1bGUpXG4gICAgICAgICAgICA/IG5ld0JhemVsQmF6ZWxPcHRzLmdvb2dtb2R1bGVcbiAgICAgICAgICAgIDogZXhpc3RpbmdCYXplbE9wdHMuZ29vZ21vZHVsZSxcblxuICAgICAgICAgIGRldm1vZGVUYXJnZXRPdmVycmlkZTogaXNVbmRlZmluZWQoZXhpc3RpbmdCYXplbE9wdHMuZGV2bW9kZVRhcmdldE92ZXJyaWRlKVxuICAgICAgICAgICAgPyBuZXdCYXplbEJhemVsT3B0cy5kZXZtb2RlVGFyZ2V0T3ZlcnJpZGVcbiAgICAgICAgICAgIDogZXhpc3RpbmdCYXplbE9wdHMuZGV2bW9kZVRhcmdldE92ZXJyaWRlLFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWcuZXh0ZW5kcykge1xuICAgICAgICBsZXQgZXh0ZW5kZWRDb25maWdQYXRoID0gcmVzb2x2ZU5vcm1hbGl6ZWRQYXRoKHBhdGguZGlybmFtZShjb25maWdGaWxlKSwgY29uZmlnLmV4dGVuZHMpO1xuICAgICAgICBpZiAoIWV4dGVuZGVkQ29uZmlnUGF0aC5lbmRzV2l0aCgnLmpzb24nKSkgZXh0ZW5kZWRDb25maWdQYXRoICs9ICcuanNvbic7XG5cbiAgICAgICAgcmV0dXJuIHJlYWRFeHRlbmRlZENvbmZpZ0ZpbGUoZXh0ZW5kZWRDb25maWdQYXRoLCBtZXJnZWRDb25maWcpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4ge2NvbmZpZzogbWVyZ2VkQ29uZmlnfTtcbiAgICB9O1xuXG4gIGNvbnN0IHtjb25maWcsIGVycm9yfSA9IHJlYWRFeHRlbmRlZENvbmZpZ0ZpbGUodHNjb25maWdGaWxlKTtcbiAgaWYgKGVycm9yKSB7XG4gICAgLy8gdGFyZ2V0IGlzIGluIHRoZSBjb25maWcgZmlsZSB3ZSBmYWlsZWQgdG8gbG9hZC4uLlxuICAgIHJldHVybiBbbnVsbCwgW2Vycm9yXSwge3RhcmdldDogJyd9XTtcbiAgfVxuXG4gIGNvbnN0IHtvcHRpb25zLCBlcnJvcnMsIGZpbGVOYW1lc30gPVxuICAgIHRzLnBhcnNlSnNvbkNvbmZpZ0ZpbGVDb250ZW50KGNvbmZpZywgaG9zdCwgcGF0aC5kaXJuYW1lKHRzY29uZmlnRmlsZSkpO1xuXG4gIC8vIEhhbmRsZSBiYXplbCBzcGVjaWZpYyBvcHRpb25zLCBidXQgbWFrZSBzdXJlIG5vdCB0byBjcmFzaCB3aGVuIHJlYWRpbmcgYVxuICAvLyB2YW5pbGxhIHRzY29uZmlnLmpzb24uXG4gIGNvbnN0IGJhemVsT3B0czogQmF6ZWxPcHRpb25zID0gY29uZmlnLmJhemVsT3B0aW9ucyB8fCB7fTtcbiAgY29uc3QgdGFyZ2V0ID0gYmF6ZWxPcHRzLnRhcmdldDtcbiAgYmF6ZWxPcHRzLmFsbG93ZWRTdHJpY3REZXBzID0gYmF6ZWxPcHRzLmFsbG93ZWRTdHJpY3REZXBzIHx8IFtdO1xuICBiYXplbE9wdHMudHlwZUJsYWNrTGlzdFBhdGhzID0gYmF6ZWxPcHRzLnR5cGVCbGFja0xpc3RQYXRocyB8fCBbXTtcbiAgYmF6ZWxPcHRzLmNvbXBpbGF0aW9uVGFyZ2V0U3JjID0gYmF6ZWxPcHRzLmNvbXBpbGF0aW9uVGFyZ2V0U3JjIHx8IFtdO1xuXG5cbiAgaWYgKGVycm9ycyAmJiBlcnJvcnMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIFtudWxsLCBlcnJvcnMsIHt0YXJnZXR9XTtcbiAgfVxuXG4gIC8vIE92ZXJyaWRlIHRoZSBkZXZtb2RlIHRhcmdldCBpZiBkZXZtb2RlVGFyZ2V0T3ZlcnJpZGUgaXMgc2V0XG4gIGlmIChiYXplbE9wdHMuZXM1TW9kZSAmJiBiYXplbE9wdHMuZGV2bW9kZVRhcmdldE92ZXJyaWRlKSB7XG4gICAgc3dpdGNoIChiYXplbE9wdHMuZGV2bW9kZVRhcmdldE92ZXJyaWRlLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgIGNhc2UgJ2VzMyc6XG4gICAgICAgIG9wdGlvbnMudGFyZ2V0ID0gdHMuU2NyaXB0VGFyZ2V0LkVTMztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdlczUnOlxuICAgICAgICBvcHRpb25zLnRhcmdldCA9IHRzLlNjcmlwdFRhcmdldC5FUzU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXMyMDE1JzpcbiAgICAgICAgb3B0aW9ucy50YXJnZXQgPSB0cy5TY3JpcHRUYXJnZXQuRVMyMDE1O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2VzMjAxNic6XG4gICAgICAgIG9wdGlvbnMudGFyZ2V0ID0gdHMuU2NyaXB0VGFyZ2V0LkVTMjAxNjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdlczIwMTcnOlxuICAgICAgICBvcHRpb25zLnRhcmdldCA9IHRzLlNjcmlwdFRhcmdldC5FUzIwMTc7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXMyMDE4JzpcbiAgICAgICAgb3B0aW9ucy50YXJnZXQgPSB0cy5TY3JpcHRUYXJnZXQuRVMyMDE4O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2VzbmV4dCc6XG4gICAgICAgIG9wdGlvbnMudGFyZ2V0ID0gdHMuU2NyaXB0VGFyZ2V0LkVTTmV4dDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgJ1dBUk5JTkc6IHlvdXIgdHNjb25maWcuanNvbiBmaWxlIHNwZWNpZmllcyBhbiBpbnZhbGlkIGJhemVsT3B0aW9ucy5kZXZtb2RlVGFyZ2V0T3ZlcnJpZGUgdmFsdWUgb2Y6IFxcJyR7YmF6ZWxPcHRzLmRldm1vZGVUYXJnZXRPdmVycmlkZVxcJycpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFNvcnQgcm9vdERpcnMgd2l0aCBsb25nZXN0IGluY2x1ZGUgZGlyZWN0b3JpZXMgZmlyc3QuXG4gIC8vIFdoZW4gY2Fub25pY2FsaXppbmcgcGF0aHMsIHdlIGFsd2F5cyB3YW50IHRvIHN0cmlwXG4gIC8vIGB3b3Jrc3BhY2UvYmF6ZWwtYmluL2ZpbGVgIHRvIGp1c3QgYGZpbGVgLCBub3QgdG8gYGJhemVsLWJpbi9maWxlYC5cbiAgaWYgKG9wdGlvbnMucm9vdERpcnMpIG9wdGlvbnMucm9vdERpcnMuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCk7XG5cbiAgLy8gSWYgdGhlIHVzZXIgcmVxdWVzdGVkIGdvb2cubW9kdWxlLCB3ZSBuZWVkIHRvIHByb2R1Y2UgdGhhdCBvdXRwdXQgZXZlbiBpZlxuICAvLyB0aGUgZ2VuZXJhdGVkIHRzY29uZmlnIGluZGljYXRlcyBvdGhlcndpc2UuXG4gIGlmIChiYXplbE9wdHMuZ29vZ21vZHVsZSkgb3B0aW9ucy5tb2R1bGUgPSB0cy5Nb2R1bGVLaW5kLkNvbW1vbkpTO1xuXG4gIC8vIFR5cGVTY3JpcHQncyBwYXJzZUpzb25Db25maWdGaWxlQ29udGVudCByZXR1cm5zIHBhdGhzIHRoYXQgYXJlIGpvaW5lZCwgZWcuXG4gIC8vIC9wYXRoL3RvL3Byb2plY3QvYmF6ZWwtb3V0L2FyY2gvYmluL3BhdGgvdG8vcGFja2FnZS8uLi8uLi8uLi8uLi8uLi8uLi9wYXRoXG4gIC8vIFdlIG5vcm1hbGl6ZSB0aGVtIHRvIHJlbW92ZSB0aGUgaW50ZXJtZWRpYXRlIHBhcmVudCBkaXJlY3Rvcmllcy5cbiAgLy8gVGhpcyBpbXByb3ZlcyBlcnJvciBtZXNzYWdlcyBhbmQgYWxzbyBtYXRjaGVzIGxvZ2ljIGluIHRzY193cmFwcGVkIHdoZXJlIHdlXG4gIC8vIGV4cGVjdCBub3JtYWxpemVkIHBhdGhzLlxuICBjb25zdCBmaWxlcyA9IGZpbGVOYW1lcy5tYXAoZiA9PiBwYXRoLnBvc2l4Lm5vcm1hbGl6ZShmKSk7XG5cbiAgLy8gVGhlIGJhemVsT3B0cyBwYXRocyBpbiB0aGUgdHNjb25maWcgYXJlIHJlbGF0aXZlIHRvXG4gIC8vIG9wdGlvbnMucm9vdERpciAodGhlIHdvcmtzcGFjZSByb290KSBhbmQgYXJlbid0IHRyYW5zZm9ybWVkIGJ5XG4gIC8vIHBhcnNlSnNvbkNvbmZpZ0ZpbGVDb250ZW50IChiZWNhdXNlIFR5cGVTY3JpcHQgZG9lc24ndCBrbm93XG4gIC8vIGFib3V0IHRoZW0pLiBUcmFuc2Zvcm0gdGhlbSB0byBhbHNvIGJlIGFic29sdXRlIGhlcmUuXG4gIGJhemVsT3B0cy5jb21waWxhdGlvblRhcmdldFNyYyA9IGJhemVsT3B0cy5jb21waWxhdGlvblRhcmdldFNyYy5tYXAoXG4gICAgICBmID0+IHJlc29sdmVOb3JtYWxpemVkUGF0aChvcHRpb25zLnJvb3REaXIhLCBmKSk7XG4gIGJhemVsT3B0cy5hbGxvd2VkU3RyaWN0RGVwcyA9IGJhemVsT3B0cy5hbGxvd2VkU3RyaWN0RGVwcy5tYXAoXG4gICAgICBmID0+IHJlc29sdmVOb3JtYWxpemVkUGF0aChvcHRpb25zLnJvb3REaXIhLCBmKSk7XG4gIGJhemVsT3B0cy50eXBlQmxhY2tMaXN0UGF0aHMgPSBiYXplbE9wdHMudHlwZUJsYWNrTGlzdFBhdGhzLm1hcChcbiAgICAgIGYgPT4gcmVzb2x2ZU5vcm1hbGl6ZWRQYXRoKG9wdGlvbnMucm9vdERpciEsIGYpKTtcbiAgaWYgKGJhemVsT3B0cy5ub2RlTW9kdWxlc1ByZWZpeCkge1xuICAgIGJhemVsT3B0cy5ub2RlTW9kdWxlc1ByZWZpeCA9XG4gICAgICAgIHJlc29sdmVOb3JtYWxpemVkUGF0aChvcHRpb25zLnJvb3REaXIhLCBiYXplbE9wdHMubm9kZU1vZHVsZXNQcmVmaXgpO1xuICB9XG5cbiAgbGV0IGRpc2FibGVkVHNldHNlUnVsZXM6IHN0cmluZ1tdID0gW107XG4gIGZvciAoY29uc3QgcGx1Z2luQ29uZmlnIG9mIG9wdGlvbnNbJ3BsdWdpbnMnXSBhcyBQbHVnaW5JbXBvcnRXaXRoQ29uZmlnW10gfHxcbiAgICAgICBbXSkge1xuICAgIGlmIChwbHVnaW5Db25maWcubmFtZSAmJiBwbHVnaW5Db25maWcubmFtZSA9PT0gJ0BiYXplbC90c2V0c2UnKSB7XG4gICAgICBjb25zdCBkaXNhYmxlZFJ1bGVzID0gcGx1Z2luQ29uZmlnWydkaXNhYmxlZFJ1bGVzJ107XG4gICAgICBpZiAoZGlzYWJsZWRSdWxlcyAmJiAhQXJyYXkuaXNBcnJheShkaXNhYmxlZFJ1bGVzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Rpc2FibGVkIHRzZXRzZSBydWxlcyBtdXN0IGJlIGFuIGFycmF5IG9mIHJ1bGUgbmFtZXMnKTtcbiAgICAgIH1cbiAgICAgIGRpc2FibGVkVHNldHNlUnVsZXMgPSBkaXNhYmxlZFJ1bGVzIGFzIHN0cmluZ1tdO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtcbiAgICB7b3B0aW9ucywgYmF6ZWxPcHRzLCBmaWxlcywgY29uZmlnLCBkaXNhYmxlZFRzZXRzZVJ1bGVzfSwgbnVsbCwge3RhcmdldH1cbiAgXTtcbn1cbiJdfQ==