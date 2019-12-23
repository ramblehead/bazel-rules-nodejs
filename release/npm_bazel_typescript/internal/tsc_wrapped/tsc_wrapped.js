(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "fs", "path", "typescript", "../tsetse/runner", "./cache", "./compiler_host", "./diagnostics", "./manifest", "./perf_trace", "./strict_deps", "./tsconfig", "./worker"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const fs = require("fs");
    const path = require("path");
    const ts = require("typescript");
    const runner_1 = require("../tsetse/runner");
    const cache_1 = require("./cache");
    const compiler_host_1 = require("./compiler_host");
    const bazelDiagnostics = require("./diagnostics");
    const manifest_1 = require("./manifest");
    const perfTrace = require("./perf_trace");
    const strict_deps_1 = require("./strict_deps");
    const tsconfig_1 = require("./tsconfig");
    const worker_1 = require("./worker");
    // Equivalent of running node with --expose-gc
    // but easier to write tooling since we don't need to inject that arg to
    // nodejs_binary
    if (typeof global.gc !== 'function') {
        require('v8').setFlagsFromString('--expose_gc');
        global.gc = require('vm').runInNewContext('gc');
    }
    /**
     * Top-level entry point for tsc_wrapped.
     */
    function main(args) {
        if (worker_1.runAsWorker(args)) {
            worker_1.log('Starting TypeScript compiler persistent worker...');
            worker_1.runWorkerLoop(runOneBuild);
            // Note: intentionally don't process.exit() here, because runWorkerLoop
            // is waiting for async callbacks from node.
        }
        else {
            worker_1.debug('Running a single build...');
            if (args.length === 0)
                throw new Error('Not enough arguments');
            if (!runOneBuild(args)) {
                return 1;
            }
        }
        return 0;
    }
    exports.main = main;
    /** The one ProgramAndFileCache instance used in this process. */
    const cache = new cache_1.ProgramAndFileCache(worker_1.debug);
    function isCompilationTarget(bazelOpts, sf) {
        if (bazelOpts.isJsTranspilation && bazelOpts.transpiledJsInputDirectory) {
            // transpiledJsInputDirectory is a relative logical path, so we cannot
            // compare it to the resolved, absolute path of sf here.
            // compilationTargetSrc is resolved, so use that for the comparison.
            return sf.fileName.startsWith(bazelOpts.compilationTargetSrc[0]);
        }
        return (bazelOpts.compilationTargetSrc.indexOf(sf.fileName) !== -1);
    }
    /**
     * Gather diagnostics from TypeScript's type-checker as well as other plugins we
     * install such as strict dependency checking.
     */
    function gatherDiagnostics(options, bazelOpts, program, disabledTsetseRules, angularPlugin, plugins = []) {
        // Install extra diagnostic plugins
        plugins.push(...getCommonPlugins(options, bazelOpts, program, disabledTsetseRules));
        if (angularPlugin) {
            program = angularPlugin.wrap(program);
        }
        const diagnostics = [];
        perfTrace.wrap('type checking', () => {
            // These checks mirror ts.getPreEmitDiagnostics, with the important
            // exception of avoiding b/30708240, which is that if you call
            // program.getDeclarationDiagnostics() it somehow corrupts the emit.
            perfTrace.wrap(`global diagnostics`, () => {
                diagnostics.push(...program.getOptionsDiagnostics());
                diagnostics.push(...program.getGlobalDiagnostics());
            });
            let sourceFilesToCheck;
            if (bazelOpts.typeCheckDependencies) {
                sourceFilesToCheck = program.getSourceFiles();
            }
            else {
                sourceFilesToCheck = program.getSourceFiles().filter(f => isCompilationTarget(bazelOpts, f));
            }
            for (const sf of sourceFilesToCheck) {
                perfTrace.wrap(`check ${sf.fileName}`, () => {
                    diagnostics.push(...program.getSyntacticDiagnostics(sf));
                    diagnostics.push(...program.getSemanticDiagnostics(sf));
                });
                perfTrace.snapshotMemoryUsage();
            }
            for (const plugin of plugins) {
                perfTrace.wrap(`${plugin.name} diagnostics`, () => {
                    for (const sf of sourceFilesToCheck) {
                        perfTrace.wrap(`${plugin.name} checking ${sf.fileName}`, () => {
                            const pluginDiagnostics = plugin.getDiagnostics(sf).map((d) => {
                                return tagDiagnosticWithPlugin(plugin.name, d);
                            });
                            diagnostics.push(...pluginDiagnostics);
                        });
                        perfTrace.snapshotMemoryUsage();
                    }
                });
            }
        });
        return diagnostics;
    }
    exports.gatherDiagnostics = gatherDiagnostics;
    /**
     * Construct diagnostic plugins that we always want included.
     *
     * TODO: Call sites of getDiagnostics should initialize plugins themselves,
     *   including these, and the arguments to getDiagnostics should be simplified.
     */
    function* getCommonPlugins(options, bazelOpts, program, disabledTsetseRules) {
        if (!bazelOpts.disableStrictDeps) {
            if (options.rootDir == null) {
                throw new Error(`StrictDepsPlugin requires that rootDir be specified`);
            }
            yield new strict_deps_1.Plugin(program, Object.assign({}, bazelOpts, { rootDir: options.rootDir }));
        }
        if (!bazelOpts.isJsTranspilation) {
            let tsetsePluginConstructor = runner_1.Plugin;
            yield new tsetsePluginConstructor(program, disabledTsetseRules);
        }
    }
    exports.getCommonPlugins = getCommonPlugins;
    /**
     * Returns a copy of diagnostic with one whose text has been prepended with
     * an indication of what plugin contributed that diagnostic.
     *
     * This is slightly complicated because a diagnostic's message text can be
     * split up into a chain of diagnostics, e.g. when there's supplementary info
     * about a diagnostic.
     */
    function tagDiagnosticWithPlugin(pluginName, diagnostic) {
        const tagMessageWithPluginName = (text) => `[${pluginName}] ${text}`;
        let messageText;
        if (typeof diagnostic.messageText === 'string') {
            // The simple case, where a diagnostic's message is just a string.
            messageText = tagMessageWithPluginName(diagnostic.messageText);
        }
        else {
            // In the case of a chain of messages we only want to tag the head of the
            //   chain, as that's the first line of message on the CLI.
            const chain = diagnostic.messageText;
            messageText = Object.assign({}, chain, { messageText: tagMessageWithPluginName(chain.messageText) });
        }
        return Object.assign({}, diagnostic, { messageText });
    }
    /**
     * expandSourcesFromDirectories finds any directories under filePath and expands
     * them to their .js or .ts contents.
     */
    function expandSourcesFromDirectories(fileList, filePath) {
        if (!fs.statSync(filePath).isDirectory()) {
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') ||
                filePath.endsWith('.js')) {
                fileList.push(filePath);
            }
            return;
        }
        const entries = fs.readdirSync(filePath);
        for (const entry of entries) {
            expandSourcesFromDirectories(fileList, path.join(filePath, entry));
        }
    }
    /**
     * Runs a single build, returning false on failure.  This is potentially called
     * multiple times (once per bazel request) when running as a bazel worker.
     * Any encountered errors are written to stderr.
     */
    function runOneBuild(args, inputs) {
        if (args.length !== 1) {
            console.error('Expected one argument: path to tsconfig.json');
            return false;
        }
        perfTrace.snapshotMemoryUsage();
        // Strip leading at-signs, used in build_defs.bzl to indicate a params file
        const tsconfigFile = args[0].replace(/^@+/, '');
        const [parsed, errors, { target }] = tsconfig_1.parseTsconfig(tsconfigFile);
        if (errors) {
            console.error(bazelDiagnostics.format(target, errors));
            return false;
        }
        if (!parsed) {
            throw new Error('Impossible state: if parseTsconfig returns no errors, then parsed should be non-null');
        }
        const { options, bazelOpts, files, disabledTsetseRules, angularCompilerOptions } = parsed;
        const sourceFiles = [];
        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            expandSourcesFromDirectories(sourceFiles, filePath);
        }
        if (bazelOpts.maxCacheSizeMb !== undefined) {
            const maxCacheSizeBytes = bazelOpts.maxCacheSizeMb * (1 << 20);
            cache.setMaxCacheSize(maxCacheSizeBytes);
        }
        else {
            cache.resetMaxCacheSize();
        }
        let fileLoader;
        if (inputs) {
            fileLoader = new cache_1.CachedFileLoader(cache);
            // Resolve the inputs to absolute paths to match TypeScript internals
            const resolvedInputs = new Map();
            for (const key of Object.keys(inputs)) {
                resolvedInputs.set(tsconfig_1.resolveNormalizedPath(key), inputs[key]);
            }
            cache.updateCache(resolvedInputs);
        }
        else {
            fileLoader = new cache_1.UncachedFileLoader();
        }
        const perfTracePath = bazelOpts.perfTracePath;
        if (!perfTracePath) {
            return runFromOptions(fileLoader, options, bazelOpts, sourceFiles, disabledTsetseRules, angularCompilerOptions);
        }
        worker_1.log('Writing trace to', perfTracePath);
        const success = perfTrace.wrap('runOneBuild', () => runFromOptions(fileLoader, options, bazelOpts, sourceFiles, disabledTsetseRules, angularCompilerOptions));
        if (!success)
            return false;
        // Force a garbage collection pass.  This keeps our memory usage
        // consistent across multiple compilations, and allows the file
        // cache to use the current memory usage as a guideline for expiring
        // data.  Note: this is intentionally not within runFromOptions(), as
        // we want to gc only after all its locals have gone out of scope.
        global.gc();
        perfTrace.snapshotMemoryUsage();
        perfTrace.write(perfTracePath);
        return true;
    }
    // We only allow our own code to use the expected_diagnostics attribute
    const expectDiagnosticsWhitelist = [];
    function runFromOptions(fileLoader, options, bazelOpts, files, disabledTsetseRules, angularCompilerOptions) {
        perfTrace.snapshotMemoryUsage();
        cache.resetStats();
        cache.traceStats();
        const compilerHostDelegate = ts.createCompilerHost({ target: ts.ScriptTarget.ES5 });
        const moduleResolver = bazelOpts.isJsTranspilation ?
            makeJsModuleResolver(bazelOpts.workspaceName) :
            ts.resolveModuleName;
        const tsickleCompilerHost = new compiler_host_1.CompilerHost(files, options, bazelOpts, compilerHostDelegate, fileLoader, moduleResolver);
        let compilerHost = tsickleCompilerHost;
        const diagnosticPlugins = [];
        let angularPlugin;
        if (bazelOpts.compileAngularTemplates) {
            try {
                const ngOptions = angularCompilerOptions || {};
                // Add the rootDir setting to the options passed to NgTscPlugin.
                // Required so that synthetic files added to the rootFiles in the program
                // can be given absolute paths, just as we do in tsconfig.ts, matching
                // the behavior in TypeScript's tsconfig parsing logic.
                ngOptions['rootDir'] = options.rootDir;
                // Dynamically load the Angular compiler installed as a peerDep
                const ngtsc = require('@angular/compiler-cli');
                angularPlugin = new ngtsc.NgTscPlugin(ngOptions);
            }
            catch (e) {
                console.error(e);
                throw new Error('when using `ts_library(compile_angular_templates=True)`, ' +
                    'you must install @angular/compiler-cli');
            }
            // Wrap host only needed until after Ivy cleanup
            // TODO(alexeagle): remove after ngsummary and ngfactory files eliminated
            compilerHost = angularPlugin.wrapHost(files, compilerHost);
        }
        const oldProgram = cache.getProgram(bazelOpts.target);
        const program = perfTrace.wrap('createProgram', () => ts.createProgram(compilerHost.inputFiles, options, compilerHost, oldProgram));
        cache.putProgram(bazelOpts.target, program);
        if (!bazelOpts.isJsTranspilation) {
            // If there are any TypeScript type errors abort now, so the error
            // messages refer to the original source.  After any subsequent passes
            // (decorator downleveling or tsickle) we do not type check.
            let diagnostics = gatherDiagnostics(options, bazelOpts, program, disabledTsetseRules, angularPlugin, diagnosticPlugins);
            if (!expectDiagnosticsWhitelist.length ||
                expectDiagnosticsWhitelist.some(p => bazelOpts.target.startsWith(p))) {
                diagnostics = bazelDiagnostics.filterExpected(bazelOpts, diagnostics, bazelDiagnostics.uglyFormat);
            }
            else if (bazelOpts.expectedDiagnostics.length > 0) {
                console.error(`Only targets under ${expectDiagnosticsWhitelist.join(', ')} can use ` +
                    'expected_diagnostics, but got', bazelOpts.target);
            }
            if (diagnostics.length > 0) {
                console.error(bazelDiagnostics.format(bazelOpts.target, diagnostics));
                worker_1.debug('compilation failed at', new Error().stack);
                return false;
            }
        }
        const compilationTargets = program.getSourceFiles().filter(fileName => isCompilationTarget(bazelOpts, fileName));
        let diagnostics = [];
        let useTsickleEmit = bazelOpts.tsickle;
        let transforms = {
            before: [],
            after: [],
            afterDeclarations: [],
        };
        if (angularPlugin) {
            transforms = angularPlugin.createTransformers(compilerHost);
        }
        if (useTsickleEmit) {
            diagnostics = emitWithTsickle(program, tsickleCompilerHost, compilationTargets, options, bazelOpts, transforms);
        }
        else {
            diagnostics = emitWithTypescript(program, compilationTargets, transforms);
        }
        if (diagnostics.length > 0) {
            console.error(bazelDiagnostics.format(bazelOpts.target, diagnostics));
            worker_1.debug('compilation failed at', new Error().stack);
            return false;
        }
        cache.printStats();
        return true;
    }
    function emitWithTypescript(program, compilationTargets, transforms) {
        const diagnostics = [];
        for (const sf of compilationTargets) {
            const result = program.emit(sf, /*writeFile*/ undefined, 
            /*cancellationToken*/ undefined, /*emitOnlyDtsFiles*/ undefined, transforms);
            diagnostics.push(...result.diagnostics);
        }
        return diagnostics;
    }
    /**
     * Runs the emit pipeline with Tsickle transformations - goog.module rewriting
     * and Closure types emitted included.
     * Exported to be used by the internal global refactoring tools.
     * TODO(radokirov): investigate using runWithOptions and making this private
     * again, if we can make compilerHosts match.
     */
    function emitWithTsickle(program, compilerHost, compilationTargets, options, bazelOpts, transforms) {
        const emitResults = [];
        const diagnostics = [];
        // The 'tsickle' import above is only used in type positions, so it won't
        // result in a runtime dependency on tsickle.
        // If the user requests the tsickle emit, then we dynamically require it
        // here for use at runtime.
        let optTsickle;
        try {
            // tslint:disable-next-line:no-require-imports
            optTsickle = require('tsickle');
        }
        catch (e) {
            if (e.code !== 'MODULE_NOT_FOUND') {
                throw e;
            }
            throw new Error('When setting bazelOpts { tsickle: true }, ' +
                'you must also add a devDependency on the tsickle npm package');
        }
        perfTrace.wrap('emit', () => {
            for (const sf of compilationTargets) {
                perfTrace.wrap(`emit ${sf.fileName}`, () => {
                    emitResults.push(optTsickle.emitWithTsickle(program, compilerHost, compilerHost, options, sf, 
                    /*writeFile*/ undefined, 
                    /*cancellationToken*/ undefined, /*emitOnlyDtsFiles*/ undefined, {
                        beforeTs: transforms.before,
                        afterTs: transforms.after,
                        afterDeclarations: transforms.afterDeclarations,
                    }));
                });
            }
        });
        const emitResult = optTsickle.mergeEmitResults(emitResults);
        diagnostics.push(...emitResult.diagnostics);
        // If tsickle reported diagnostics, don't produce externs or manifest outputs.
        if (diagnostics.length > 0) {
            return diagnostics;
        }
        let externs = '/** @externs */\n' +
            '// generating externs was disabled using generate_externs=False\n';
        if (bazelOpts.tsickleGenerateExterns) {
            externs =
                optTsickle.getGeneratedExterns(emitResult.externs, options.rootDir);
        }
        if (bazelOpts.tsickleExternsPath) {
            // Note: when tsickleExternsPath is provided, we always write a file as a
            // marker that compilation succeeded, even if it's empty (just containing an
            // @externs).
            fs.writeFileSync(bazelOpts.tsickleExternsPath, externs);
            // When generating externs, generate an externs file for each of the input
            // .d.ts files.
            if (bazelOpts.tsickleGenerateExterns &&
                compilerHost.provideExternalModuleDtsNamespace) {
                for (const extern of compilationTargets) {
                    if (!extern.isDeclarationFile)
                        continue;
                    const outputBaseDir = options.outDir;
                    const relativeOutputPath = compilerHost.relativeOutputPath(extern.fileName);
                    mkdirp(outputBaseDir, path.dirname(relativeOutputPath));
                    const outputPath = path.join(outputBaseDir, relativeOutputPath);
                    const moduleName = compilerHost.pathToModuleName('', extern.fileName);
                    fs.writeFileSync(outputPath, `goog.module('${moduleName}');\n` +
                        `// Export an empty object of unknown type to allow imports.\n` +
                        `// TODO: use typeof once available\n` +
                        `exports = /** @type {?} */ ({});\n`);
                }
            }
        }
        if (bazelOpts.manifest) {
            perfTrace.wrap('manifest', () => {
                const manifest = manifest_1.constructManifest(emitResult.modulesManifest, compilerHost);
                fs.writeFileSync(bazelOpts.manifest, manifest);
            });
        }
        return diagnostics;
    }
    exports.emitWithTsickle = emitWithTsickle;
    /**
     * Creates directories subdir (a slash separated relative path) starting from
     * base.
     */
    function mkdirp(base, subdir) {
        const steps = subdir.split(path.sep);
        let current = base;
        for (let i = 0; i < steps.length; i++) {
            current = path.join(current, steps[i]);
            if (!fs.existsSync(current))
                fs.mkdirSync(current);
        }
    }
    /**
     * Resolve module filenames for JS modules.
     *
     * JS module resolution needs to be different because when transpiling JS we
     * do not pass in any dependencies, so the TS module resolver will not resolve
     * any files.
     *
     * Fortunately, JS module resolution is very simple. The imported module name
     * must either a relative path, or the workspace root (i.e. 'google3'),
     * so we can perform module resolution entirely based on file names, without
     * looking at the filesystem.
     */
    function makeJsModuleResolver(workspaceName) {
        // The literal '/' here is cross-platform safe because it's matching on
        // import specifiers, not file names.
        const workspaceModuleSpecifierPrefix = `${workspaceName}/`;
        const workspaceDir = `${path.sep}${workspaceName}${path.sep}`;
        function jsModuleResolver(moduleName, containingFile, compilerOptions, host) {
            let resolvedFileName;
            if (containingFile === '') {
                // In tsickle we resolve the filename against '' to get the goog module
                // name of a sourcefile.
                resolvedFileName = moduleName;
            }
            else if (moduleName.startsWith(workspaceModuleSpecifierPrefix)) {
                // Given a workspace name of 'foo', we want to resolve import specifiers
                // like: 'foo/project/file.js' to the absolute filesystem path of
                // project/file.js within the workspace.
                const workspaceDirLocation = containingFile.indexOf(workspaceDir);
                if (workspaceDirLocation < 0) {
                    return { resolvedModule: undefined };
                }
                const absolutePathToWorkspaceDir = containingFile.slice(0, workspaceDirLocation);
                resolvedFileName = path.join(absolutePathToWorkspaceDir, moduleName);
            }
            else {
                if (!moduleName.startsWith('./') && !moduleName.startsWith('../')) {
                    throw new Error(`Unsupported module import specifier: ${JSON.stringify(moduleName)}.\n` +
                        `JS module imports must either be relative paths ` +
                        `(beginning with '.' or '..'), ` +
                        `or they must begin with '${workspaceName}/'.`);
                }
                resolvedFileName = path.join(path.dirname(containingFile), moduleName);
            }
            return {
                resolvedModule: {
                    resolvedFileName,
                    extension: ts.Extension.Js,
                    // These two fields are cargo culted from what ts.resolveModuleName
                    // seems to return.
                    packageId: undefined,
                    isExternalLibraryImport: false,
                }
            };
        }
        return jsModuleResolver;
    }
    if (require.main === module) {
        // Do not call process.exit(), as that terminates the binary before
        // completing pending operations, such as writing to stdout or emitting the
        // v8 performance log. Rather, set the exit code and fall off the main
        // thread, which will cause node to terminate cleanly.
        process.exitCode = main(process.argv.slice(2));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHNjX3dyYXBwZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9leHRlcm5hbC9idWlsZF9iYXplbF9ydWxlc190eXBlc2NyaXB0L2ludGVybmFsL3RzY193cmFwcGVkL3RzY193cmFwcGVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0lBQUEseUJBQXlCO0lBQ3pCLDZCQUE2QjtJQUU3QixpQ0FBaUM7SUFFakMsNkNBQWtFO0lBRWxFLG1DQUE4RjtJQUM5RixtREFBNkM7SUFDN0Msa0RBQWtEO0lBQ2xELHlDQUE2QztJQUM3QywwQ0FBMEM7SUFFMUMsK0NBQXlEO0lBQ3pELHlDQUE4RTtJQUM5RSxxQ0FBZ0U7SUFFaEUsOENBQThDO0lBQzlDLHdFQUF3RTtJQUN4RSxnQkFBZ0I7SUFDaEIsSUFBSSxPQUFPLE1BQU0sQ0FBQyxFQUFFLEtBQUssVUFBVSxFQUFFO1FBQ25DLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDakQ7SUFFRDs7T0FFRztJQUNILFNBQWdCLElBQUksQ0FBQyxJQUFjO1FBQ2pDLElBQUksb0JBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNyQixZQUFHLENBQUMsbURBQW1ELENBQUMsQ0FBQztZQUN6RCxzQkFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzNCLHVFQUF1RTtZQUN2RSw0Q0FBNEM7U0FDN0M7YUFBTTtZQUNMLGNBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQ25DLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDO2dCQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUMvRCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxF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SSxDQUFDLDBCQUEwQixFQUFFLFVBQVUsQ0FBQyxDQUFDO2FBQ3RFO2lCQUFNO2dCQUNMLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDakUsTUFBTSxJQUFJLEtBQUssQ0FDWCx3Q0FDSSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxLQUFLO3dCQUNuQyxrREFBa0Q7d0JBQ2xELGdDQUFnQzt3QkFDaEMsNEJBQTRCLGFBQWEsS0FBSyxDQUFDLENBQUM7aUJBQ3JEO2dCQUNELGdCQUFnQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQzthQUN4RTtZQUNELE9BQU87Z0JBQ0wsY0FBYyxFQUFFO29CQUNkLGdCQUFnQjtvQkFDaEIsU0FBUyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRTtvQkFDMUIsbUVBQW1FO29CQUNuRSxtQkFBbUI7b0JBQ25CLFNBQVMsRUFBRSxTQUFTO29CQUNwQix1QkFBdUIsRUFBRSxLQUFLO2lCQUMvQjthQUNGLENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQztJQUMxQixDQUFDO0lBR0QsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRTtRQUMzQixtRUFBbUU7UUFDbkUsMkVBQTJFO1FBQzNFLHNFQUFzRTtRQUN0RSxzREFBc0Q7UUFDdEQsT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNoRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB0c2lja2xlIGZyb20gJ3RzaWNrbGUnO1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmltcG9ydCB7UGx1Z2luIGFzIEJhemVsQ29uZm9ybWFuY2VQbHVnaW59IGZyb20gJy4uL3RzZXRzZS9ydW5uZXInO1xuXG5pbXBvcnQge0NhY2hlZEZpbGVMb2FkZXIsIEZpbGVMb2FkZXIsIFByb2dyYW1BbmRGaWxlQ2FjaGUsIFVuY2FjaGVkRmlsZUxvYWRlcn0gZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQge0NvbXBpbGVySG9zdH0gZnJvbSAnLi9jb21waWxlcl9ob3N0JztcbmltcG9ydCAqIGFzIGJhemVsRGlhZ25vc3RpY3MgZnJvbSAnLi9kaWFnbm9zdGljcyc7XG5pbXBvcnQge2NvbnN0cnVjdE1hbmlmZXN0fSBmcm9tICcuL21hbmlmZXN0JztcbmltcG9ydCAqIGFzIHBlcmZUcmFjZSBmcm9tICcuL3BlcmZfdHJhY2UnO1xuaW1wb3J0IHtEaWFnbm9zdGljUGx1Z2luLCBQbHVnaW5Db21waWxlckhvc3QsIFRzY1BsdWdpbn0gZnJvbSAnLi9wbHVnaW5fYXBpJztcbmltcG9ydCB7UGx1Z2luIGFzIFN0cmljdERlcHNQbHVnaW59IGZyb20gJy4vc3RyaWN0X2RlcHMnO1xuaW1wb3J0IHtCYXplbE9wdGlvbnMsIHBhcnNlVHNjb25maWcsIHJlc29sdmVOb3JtYWxpemVkUGF0aH0gZnJvbSAnLi90c2NvbmZpZyc7XG5pbXBvcnQge2RlYnVnLCBsb2csIHJ1bkFzV29ya2VyLCBydW5Xb3JrZXJMb29wfSBmcm9tICcuL3dvcmtlcic7XG5cbi8vIEVxdWl2YWxlbnQgb2YgcnVubmluZyBub2RlIHdpdGggLS1leHBvc2UtZ2Ncbi8vIGJ1dCBlYXNpZXIgdG8gd3JpdGUgdG9vbGluZyBzaW5jZSB3ZSBkb24ndCBuZWVkIHRvIGluamVjdCB0aGF0IGFyZyB0b1xuLy8gbm9kZWpzX2JpbmFyeVxuaWYgKHR5cGVvZiBnbG9iYWwuZ2MgIT09ICdmdW5jdGlvbicpIHtcbiAgcmVxdWlyZSgndjgnKS5zZXRGbGFnc0Zyb21TdHJpbmcoJy0tZXhwb3NlX2djJyk7XG4gIGdsb2JhbC5nYyA9IHJlcXVpcmUoJ3ZtJykucnVuSW5OZXdDb250ZXh0KCdnYycpO1xufVxuXG4vKipcbiAqIFRvcC1sZXZlbCBlbnRyeSBwb2ludCBmb3IgdHNjX3dyYXBwZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYWluKGFyZ3M6IHN0cmluZ1tdKSB7XG4gIGlmIChydW5Bc1dvcmtlcihhcmdzKSkge1xuICAgIGxvZygnU3RhcnRpbmcgVHlwZVNjcmlwdCBjb21waWxlciBwZXJzaXN0ZW50IHdvcmtlci4uLicpO1xuICAgIHJ1bldvcmtlckxvb3AocnVuT25lQnVpbGQpO1xuICAgIC8vIE5vdGU6IGludGVudGlvbmFsbHkgZG9uJ3QgcHJvY2Vzcy5leGl0KCkgaGVyZSwgYmVjYXVzZSBydW5Xb3JrZXJMb29wXG4gICAgLy8gaXMgd2FpdGluZyBmb3IgYXN5bmMgY2FsbGJhY2tzIGZyb20gbm9kZS5cbiAgfSBlbHNlIHtcbiAgICBkZWJ1ZygnUnVubmluZyBhIHNpbmdsZSBidWlsZC4uLicpO1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IEVycm9yKCdOb3QgZW5vdWdoIGFyZ3VtZW50cycpO1xuICAgIGlmICghcnVuT25lQnVpbGQoYXJncykpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cbiAgfVxuICByZXR1cm4gMDtcbn1cblxuLyoqIFRoZSBvbmUgUHJvZ3JhbUFuZEZpbGVDYWNoZSBpbnN0YW5jZSB1c2VkIGluIHRoaXMgcHJvY2Vzcy4gKi9cbmNvbnN0IGNhY2hlID0gbmV3IFByb2dyYW1BbmRGaWxlQ2FjaGUoZGVidWcpO1xuXG5mdW5jdGlvbiBpc0NvbXBpbGF0aW9uVGFyZ2V0KFxuICAgIGJhemVsT3B0czogQmF6ZWxPcHRpb25zLCBzZjogdHMuU291cmNlRmlsZSk6IGJvb2xlYW4ge1xuICBpZiAoYmF6ZWxPcHRzLmlzSnNUcmFuc3BpbGF0aW9uICYmIGJhemVsT3B0cy50cmFuc3BpbGVkSnNJbnB1dERpcmVjdG9yeSkge1xuICAgIC8vIHRyYW5zcGlsZWRKc0lucHV0RGlyZWN0b3J5IGlzIGEgcmVsYXRpdmUgbG9naWNhbCBwYXRoLCBzbyB3ZSBjYW5ub3RcbiAgICAvLyBjb21wYXJlIGl0IHRvIHRoZSByZXNvbHZlZCwgYWJzb2x1dGUgcGF0aCBvZiBzZiBoZXJlLlxuICAgIC8vIGNvbXBpbGF0aW9uVGFyZ2V0U3JjIGlzIHJlc29sdmVkLCBzbyB1c2UgdGhhdCBmb3IgdGhlIGNvbXBhcmlzb24uXG4gICAgcmV0dXJuIHNmLmZpbGVOYW1lLnN0YXJ0c1dpdGgoYmF6ZWxPcHRzLmNvbXBpbGF0aW9uVGFyZ2V0U3JjWzBdKTtcbiAgfVxuICByZXR1cm4gKGJhemVsT3B0cy5jb21waWxhdGlvblRhcmdldFNyYy5pbmRleE9mKHNmLmZpbGVOYW1lKSAhPT0gLTEpO1xufVxuXG4vKipcbiAqIEdhdGhlciBkaWFnbm9zdGljcyBmcm9tIFR5cGVTY3JpcHQncyB0eXBlLWNoZWNrZXIgYXMgd2VsbCBhcyBvdGhlciBwbHVnaW5zIHdlXG4gKiBpbnN0YWxsIHN1Y2ggYXMgc3RyaWN0IGRlcGVuZGVuY3kgY2hlY2tpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnYXRoZXJEaWFnbm9zdGljcyhcbiAgICBvcHRpb25zOiB0cy5Db21waWxlck9wdGlvbnMsIGJhemVsT3B0czogQmF6ZWxPcHRpb25zLCBwcm9ncmFtOiB0cy5Qcm9ncmFtLFxuICAgIGRpc2FibGVkVHNldHNlUnVsZXM6IHN0cmluZ1tdLCBhbmd1bGFyUGx1Z2luPzogVHNjUGx1Z2luLFxuICAgIHBsdWdpbnM6IERpYWdub3N0aWNQbHVnaW5bXSA9IFtdKTogdHMuRGlhZ25vc3RpY1tdIHtcbiAgLy8gSW5zdGFsbCBleHRyYSBkaWFnbm9zdGljIHBsdWdpbnNcbiAgcGx1Z2lucy5wdXNoKFxuICAgICAgLi4uZ2V0Q29tbW9uUGx1Z2lucyhvcHRpb25zLCBiYXplbE9wdHMsIHByb2dyYW0sIGRpc2FibGVkVHNldHNlUnVsZXMpKTtcbiAgaWYgKGFuZ3VsYXJQbHVnaW4pIHtcbiAgICBwcm9ncmFtID0gYW5ndWxhclBsdWdpbi53cmFwKHByb2dyYW0pO1xuICB9XG5cbiAgY29uc3QgZGlhZ25vc3RpY3M6IHRzLkRpYWdub3N0aWNbXSA9IFtdO1xuICBwZXJmVHJhY2Uud3JhcCgndHlwZSBjaGVja2luZycsICgpID0+IHtcbiAgICAvLyBUaGVzZSBjaGVja3MgbWlycm9yIHRzLmdldFByZUVtaXREaWFnbm9zdGljcywgd2l0aCB0aGUgaW1wb3J0YW50XG4gICAgLy8gZXhjZXB0aW9uIG9mIGF2b2lkaW5nIGIvMzA3MDgyNDAsIHdoaWNoIGlzIHRoYXQgaWYgeW91IGNhbGxcbiAgICAvLyBwcm9ncmFtLmdldERlY2xhcmF0aW9uRGlhZ25vc3RpY3MoKSBpdCBzb21laG93IGNvcnJ1cHRzIHRoZSBlbWl0LlxuICAgIHBlcmZUcmFjZS53cmFwKGBnbG9iYWwgZGlhZ25vc3RpY3NgLCAoKSA9PiB7XG4gICAgICBkaWFnbm9zdGljcy5wdXNoKC4uLnByb2dyYW0uZ2V0T3B0aW9uc0RpYWdub3N0aWNzKCkpO1xuICAgICAgZGlhZ25vc3RpY3MucHVzaCguLi5wcm9ncmFtLmdldEdsb2JhbERpYWdub3N0aWNzKCkpO1xuICAgIH0pO1xuICAgIGxldCBzb3VyY2VGaWxlc1RvQ2hlY2s6IFJlYWRvbmx5QXJyYXk8dHMuU291cmNlRmlsZT47XG4gICAgaWYgKGJhemVsT3B0cy50eXBlQ2hlY2tEZXBlbmRlbmNpZXMpIHtcbiAgICAgIHNvdXJjZUZpbGVzVG9DaGVjayA9IHByb2dyYW0uZ2V0U291cmNlRmlsZXMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc291cmNlRmlsZXNUb0NoZWNrID0gcHJvZ3JhbS5nZXRTb3VyY2VGaWxlcygpLmZpbHRlcihcbiAgICAgICAgICBmID0+IGlzQ29tcGlsYXRpb25UYXJnZXQoYmF6ZWxPcHRzLCBmKSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc2Ygb2Ygc291cmNlRmlsZXNUb0NoZWNrKSB7XG4gICAgICBwZXJmVHJhY2Uud3JhcChgY2hlY2sgJHtzZi5maWxlTmFtZX1gLCAoKSA9PiB7XG4gICAgICAgIGRpYWdub3N0aWNzLnB1c2goLi4ucHJvZ3JhbS5nZXRTeW50YWN0aWNEaWFnbm9zdGljcyhzZikpO1xuICAgICAgICBkaWFnbm9zdGljcy5wdXNoKC4uLnByb2dyYW0uZ2V0U2VtYW50aWNEaWFnbm9zdGljcyhzZikpO1xuICAgICAgfSk7XG4gICAgICBwZXJmVHJhY2Uuc25hcHNob3RNZW1vcnlVc2FnZSgpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHBsdWdpbiBvZiBwbHVnaW5zKSB7XG4gICAgICBwZXJmVHJhY2Uud3JhcChgJHtwbHVnaW4ubmFtZX0gZGlhZ25vc3RpY3NgLCAoKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3Qgc2Ygb2Ygc291cmNlRmlsZXNUb0NoZWNrKSB7XG4gICAgICAgICAgcGVyZlRyYWNlLndyYXAoYCR7cGx1Z2luLm5hbWV9IGNoZWNraW5nICR7c2YuZmlsZU5hbWV9YCwgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGx1Z2luRGlhZ25vc3RpY3MgPSBwbHVnaW4uZ2V0RGlhZ25vc3RpY3Moc2YpLm1hcCgoZCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gdGFnRGlhZ25vc3RpY1dpdGhQbHVnaW4ocGx1Z2luLm5hbWUsIGQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkaWFnbm9zdGljcy5wdXNoKC4uLnBsdWdpbkRpYWdub3N0aWNzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBwZXJmVHJhY2Uuc25hcHNob3RNZW1vcnlVc2FnZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBkaWFnbm9zdGljcztcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3QgZGlhZ25vc3RpYyBwbHVnaW5zIHRoYXQgd2UgYWx3YXlzIHdhbnQgaW5jbHVkZWQuXG4gKlxuICogVE9ETzogQ2FsbCBzaXRlcyBvZiBnZXREaWFnbm9zdGljcyBzaG91bGQgaW5pdGlhbGl6ZSBwbHVnaW5zIHRoZW1zZWx2ZXMsXG4gKiAgIGluY2x1ZGluZyB0aGVzZSwgYW5kIHRoZSBhcmd1bWVudHMgdG8gZ2V0RGlhZ25vc3RpY3Mgc2hvdWxkIGJlIHNpbXBsaWZpZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbipcbiAgICBnZXRDb21tb25QbHVnaW5zKFxuICAgICAgICBvcHRpb25zOiB0cy5Db21waWxlck9wdGlvbnMsIGJhemVsT3B0czogQmF6ZWxPcHRpb25zLFxuICAgICAgICBwcm9ncmFtOiB0cy5Qcm9ncmFtLFxuICAgICAgICBkaXNhYmxlZFRzZXRzZVJ1bGVzOiBzdHJpbmdbXSk6IEl0ZXJhYmxlPERpYWdub3N0aWNQbHVnaW4+IHtcbiAgaWYgKCFiYXplbE9wdHMuZGlzYWJsZVN0cmljdERlcHMpIHtcbiAgICBpZiAob3B0aW9ucy5yb290RGlyID09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU3RyaWN0RGVwc1BsdWdpbiByZXF1aXJlcyB0aGF0IHJvb3REaXIgYmUgc3BlY2lmaWVkYCk7XG4gICAgfVxuICAgIHlpZWxkIG5ldyBTdHJpY3REZXBzUGx1Z2luKHByb2dyYW0sIHtcbiAgICAgIC4uLmJhemVsT3B0cyxcbiAgICAgIHJvb3REaXI6IG9wdGlvbnMucm9vdERpcixcbiAgICB9KTtcbiAgfVxuICBpZiAoIWJhemVsT3B0cy5pc0pzVHJhbnNwaWxhdGlvbikge1xuICAgIGxldCB0c2V0c2VQbHVnaW5Db25zdHJ1Y3RvcjpcbiAgICAgICAge25ldyAocHJvZ3JhbTogdHMuUHJvZ3JhbSwgZGlzYWJsZWRSdWxlczogc3RyaW5nW10pOiBEaWFnbm9zdGljUGx1Z2lufSA9XG4gICAgICAgICAgICBCYXplbENvbmZvcm1hbmNlUGx1Z2luO1xuICAgIHlpZWxkIG5ldyB0c2V0c2VQbHVnaW5Db25zdHJ1Y3Rvcihwcm9ncmFtLCBkaXNhYmxlZFRzZXRzZVJ1bGVzKTtcbiAgfVxufVxuXG4vKipcbiAqIFJldHVybnMgYSBjb3B5IG9mIGRpYWdub3N0aWMgd2l0aCBvbmUgd2hvc2UgdGV4dCBoYXMgYmVlbiBwcmVwZW5kZWQgd2l0aFxuICogYW4gaW5kaWNhdGlvbiBvZiB3aGF0IHBsdWdpbiBjb250cmlidXRlZCB0aGF0IGRpYWdub3N0aWMuXG4gKlxuICogVGhpcyBpcyBzbGlnaHRseSBjb21wbGljYXRlZCBiZWNhdXNlIGEgZGlhZ25vc3RpYydzIG1lc3NhZ2UgdGV4dCBjYW4gYmVcbiAqIHNwbGl0IHVwIGludG8gYSBjaGFpbiBvZiBkaWFnbm9zdGljcywgZS5nLiB3aGVuIHRoZXJlJ3Mgc3VwcGxlbWVudGFyeSBpbmZvXG4gKiBhYm91dCBhIGRpYWdub3N0aWMuXG4gKi9cbmZ1bmN0aW9uIHRhZ0RpYWdub3N0aWNXaXRoUGx1Z2luKFxuICAgIHBsdWdpbk5hbWU6IHN0cmluZywgZGlhZ25vc3RpYzogUmVhZG9ubHk8dHMuRGlhZ25vc3RpYz4pOiB0cy5EaWFnbm9zdGljIHtcbiAgY29uc3QgdGFnTWVzc2FnZVdpdGhQbHVnaW5OYW1lID0gKHRleHQ6IHN0cmluZykgPT4gYFske3BsdWdpbk5hbWV9XSAke3RleHR9YDtcblxuICBsZXQgbWVzc2FnZVRleHQ7XG4gIGlmICh0eXBlb2YgZGlhZ25vc3RpYy5tZXNzYWdlVGV4dCA9PT0gJ3N0cmluZycpIHtcbiAgICAvLyBUaGUgc2ltcGxlIGNhc2UsIHdoZXJlIGEgZGlhZ25vc3RpYydzIG1lc3NhZ2UgaXMganVzdCBhIHN0cmluZy5cbiAgICBtZXNzYWdlVGV4dCA9IHRhZ01lc3NhZ2VXaXRoUGx1Z2luTmFtZShkaWFnbm9zdGljLm1lc3NhZ2VUZXh0KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBJbiB0aGUgY2FzZSBvZiBhIGNoYWluIG9mIG1lc3NhZ2VzIHdlIG9ubHkgd2FudCB0byB0YWcgdGhlIGhlYWQgb2YgdGhlXG4gICAgLy8gICBjaGFpbiwgYXMgdGhhdCdzIHRoZSBmaXJzdCBsaW5lIG9mIG1lc3NhZ2Ugb24gdGhlIENMSS5cbiAgICBjb25zdCBjaGFpbjogdHMuRGlhZ25vc3RpY01lc3NhZ2VDaGFpbiA9IGRpYWdub3N0aWMubWVzc2FnZVRleHQ7XG4gICAgbWVzc2FnZVRleHQgPSB7XG4gICAgICAuLi5jaGFpbixcbiAgICAgIG1lc3NhZ2VUZXh0OiB0YWdNZXNzYWdlV2l0aFBsdWdpbk5hbWUoY2hhaW4ubWVzc2FnZVRleHQpXG4gICAgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIC4uLmRpYWdub3N0aWMsXG4gICAgbWVzc2FnZVRleHQsXG4gIH07XG59XG5cbi8qKlxuICogZXhwYW5kU291cmNlc0Zyb21EaXJlY3RvcmllcyBmaW5kcyBhbnkgZGlyZWN0b3JpZXMgdW5kZXIgZmlsZVBhdGggYW5kIGV4cGFuZHNcbiAqIHRoZW0gdG8gdGhlaXIgLmpzIG9yIC50cyBjb250ZW50cy5cbiAqL1xuZnVuY3Rpb24gZXhwYW5kU291cmNlc0Zyb21EaXJlY3RvcmllcyhmaWxlTGlzdDogc3RyaW5nW10sIGZpbGVQYXRoOiBzdHJpbmcpIHtcbiAgaWYgKCFmcy5zdGF0U3luYyhmaWxlUGF0aCkuaXNEaXJlY3RvcnkoKSkge1xuICAgIGlmIChmaWxlUGF0aC5lbmRzV2l0aCgnLnRzJykgfHwgZmlsZVBhdGguZW5kc1dpdGgoJy50c3gnKSB8fFxuICAgICAgICBmaWxlUGF0aC5lbmRzV2l0aCgnLmpzJykpIHtcbiAgICAgIGZpbGVMaXN0LnB1c2goZmlsZVBhdGgpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgZW50cmllcyA9IGZzLnJlYWRkaXJTeW5jKGZpbGVQYXRoKTtcbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgZXhwYW5kU291cmNlc0Zyb21EaXJlY3RvcmllcyhmaWxlTGlzdCwgcGF0aC5qb2luKGZpbGVQYXRoLCBlbnRyeSkpO1xuICB9XG59XG5cbi8qKlxuICogUnVucyBhIHNpbmdsZSBidWlsZCwgcmV0dXJuaW5nIGZhbHNlIG9uIGZhaWx1cmUuICBUaGlzIGlzIHBvdGVudGlhbGx5IGNhbGxlZFxuICogbXVsdGlwbGUgdGltZXMgKG9uY2UgcGVyIGJhemVsIHJlcXVlc3QpIHdoZW4gcnVubmluZyBhcyBhIGJhemVsIHdvcmtlci5cbiAqIEFueSBlbmNvdW50ZXJlZCBlcnJvcnMgYXJlIHdyaXR0ZW4gdG8gc3RkZXJyLlxuICovXG5mdW5jdGlvbiBydW5PbmVCdWlsZChcbiAgICBhcmdzOiBzdHJpbmdbXSwgaW5wdXRzPzoge1twYXRoOiBzdHJpbmddOiBzdHJpbmd9KTogYm9vbGVhbiB7XG4gIGlmIChhcmdzLmxlbmd0aCAhPT0gMSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0V4cGVjdGVkIG9uZSBhcmd1bWVudDogcGF0aCB0byB0c2NvbmZpZy5qc29uJyk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcGVyZlRyYWNlLnNuYXBzaG90TWVtb3J5VXNhZ2UoKTtcblxuICAvLyBTdHJpcCBsZWFkaW5nIGF0LXNpZ25zLCB1c2VkIGluIGJ1aWxkX2RlZnMuYnpsIHRvIGluZGljYXRlIGEgcGFyYW1zIGZpbGVcbiAgY29uc3QgdHNjb25maWdGaWxlID0gYXJnc1swXS5yZXBsYWNlKC9eQCsvLCAnJyk7XG4gIGNvbnN0IFtwYXJzZWQsIGVycm9ycywge3RhcmdldH1dID0gcGFyc2VUc2NvbmZpZyh0c2NvbmZpZ0ZpbGUpO1xuICBpZiAoZXJyb3JzKSB7XG4gICAgY29uc29sZS5lcnJvcihiYXplbERpYWdub3N0aWNzLmZvcm1hdCh0YXJnZXQsIGVycm9ycykpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoIXBhcnNlZCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0ltcG9zc2libGUgc3RhdGU6IGlmIHBhcnNlVHNjb25maWcgcmV0dXJucyBubyBlcnJvcnMsIHRoZW4gcGFyc2VkIHNob3VsZCBiZSBub24tbnVsbCcpO1xuICB9XG4gIGNvbnN0IHtcbiAgICBvcHRpb25zLFxuICAgIGJhemVsT3B0cyxcbiAgICBmaWxlcyxcbiAgICBkaXNhYmxlZFRzZXRzZVJ1bGVzLFxuICAgIGFuZ3VsYXJDb21waWxlck9wdGlvbnNcbiAgfSA9IHBhcnNlZDtcblxuICBjb25zdCBzb3VyY2VGaWxlczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpbGVQYXRoID0gZmlsZXNbaV07XG4gICAgZXhwYW5kU291cmNlc0Zyb21EaXJlY3Rvcmllcyhzb3VyY2VGaWxlcywgZmlsZVBhdGgpO1xuICB9XG5cbiAgaWYgKGJhemVsT3B0cy5tYXhDYWNoZVNpemVNYiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbWF4Q2FjaGVTaXplQnl0ZXMgPSBiYXplbE9wdHMubWF4Q2FjaGVTaXplTWIgKiAoMSA8PCAyMCk7XG4gICAgY2FjaGUuc2V0TWF4Q2FjaGVTaXplKG1heENhY2hlU2l6ZUJ5dGVzKTtcbiAgfSBlbHNlIHtcbiAgICBjYWNoZS5yZXNldE1heENhY2hlU2l6ZSgpO1xuICB9XG5cbiAgbGV0IGZpbGVMb2FkZXI6IEZpbGVMb2FkZXI7XG4gIGlmIChpbnB1dHMpIHtcbiAgICBmaWxlTG9hZGVyID0gbmV3IENhY2hlZEZpbGVMb2FkZXIoY2FjaGUpO1xuICAgIC8vIFJlc29sdmUgdGhlIGlucHV0cyB0byBhYnNvbHV0ZSBwYXRocyB0byBtYXRjaCBUeXBlU2NyaXB0IGludGVybmFsc1xuICAgIGNvbnN0IHJlc29sdmVkSW5wdXRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhpbnB1dHMpKSB7XG4gICAgICByZXNvbHZlZElucHV0cy5zZXQocmVzb2x2ZU5vcm1hbGl6ZWRQYXRoKGtleSksIGlucHV0c1trZXldKTtcbiAgICB9XG4gICAgY2FjaGUudXBkYXRlQ2FjaGUocmVzb2x2ZWRJbnB1dHMpO1xuICB9IGVsc2Uge1xuICAgIGZpbGVMb2FkZXIgPSBuZXcgVW5jYWNoZWRGaWxlTG9hZGVyKCk7XG4gIH1cblxuICBjb25zdCBwZXJmVHJhY2VQYXRoID0gYmF6ZWxPcHRzLnBlcmZUcmFjZVBhdGg7XG4gIGlmICghcGVyZlRyYWNlUGF0aCkge1xuICAgIHJldHVybiBydW5Gcm9tT3B0aW9ucyhcbiAgICAgICAgZmlsZUxvYWRlciwgb3B0aW9ucywgYmF6ZWxPcHRzLCBzb3VyY2VGaWxlcywgZGlzYWJsZWRUc2V0c2VSdWxlcyxcbiAgICAgICAgYW5ndWxhckNvbXBpbGVyT3B0aW9ucyk7XG4gIH1cblxuICBsb2coJ1dyaXRpbmcgdHJhY2UgdG8nLCBwZXJmVHJhY2VQYXRoKTtcbiAgY29uc3Qgc3VjY2VzcyA9IHBlcmZUcmFjZS53cmFwKFxuICAgICAgJ3J1bk9uZUJ1aWxkJyxcbiAgICAgICgpID0+IHJ1bkZyb21PcHRpb25zKFxuICAgICAgICAgIGZpbGVMb2FkZXIsIG9wdGlvbnMsIGJhemVsT3B0cywgc291cmNlRmlsZXMsIGRpc2FibGVkVHNldHNlUnVsZXMsXG4gICAgICAgICAgYW5ndWxhckNvbXBpbGVyT3B0aW9ucykpO1xuICBpZiAoIXN1Y2Nlc3MpIHJldHVybiBmYWxzZTtcbiAgLy8gRm9yY2UgYSBnYXJiYWdlIGNvbGxlY3Rpb24gcGFzcy4gIFRoaXMga2VlcHMgb3VyIG1lbW9yeSB1c2FnZVxuICAvLyBjb25zaXN0ZW50IGFjcm9zcyBtdWx0aXBsZSBjb21waWxhdGlvbnMsIGFuZCBhbGxvd3MgdGhlIGZpbGVcbiAgLy8gY2FjaGUgdG8gdXNlIHRoZSBjdXJyZW50IG1lbW9yeSB1c2FnZSBhcyBhIGd1aWRlbGluZSBmb3IgZXhwaXJpbmdcbiAgLy8gZGF0YS4gIE5vdGU6IHRoaXMgaXMgaW50ZW50aW9uYWxseSBub3Qgd2l0aGluIHJ1bkZyb21PcHRpb25zKCksIGFzXG4gIC8vIHdlIHdhbnQgdG8gZ2Mgb25seSBhZnRlciBhbGwgaXRzIGxvY2FscyBoYXZlIGdvbmUgb3V0IG9mIHNjb3BlLlxuICBnbG9iYWwuZ2MoKTtcblxuICBwZXJmVHJhY2Uuc25hcHNob3RNZW1vcnlVc2FnZSgpO1xuICBwZXJmVHJhY2Uud3JpdGUocGVyZlRyYWNlUGF0aCk7XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIFdlIG9ubHkgYWxsb3cgb3VyIG93biBjb2RlIHRvIHVzZSB0aGUgZXhwZWN0ZWRfZGlhZ25vc3RpY3MgYXR0cmlidXRlXG5jb25zdCBleHBlY3REaWFnbm9zdGljc1doaXRlbGlzdDogc3RyaW5nW10gPSBbXG5dO1xuXG5mdW5jdGlvbiBydW5Gcm9tT3B0aW9ucyhcbiAgICBmaWxlTG9hZGVyOiBGaWxlTG9hZGVyLCBvcHRpb25zOiB0cy5Db21waWxlck9wdGlvbnMsXG4gICAgYmF6ZWxPcHRzOiBCYXplbE9wdGlvbnMsIGZpbGVzOiBzdHJpbmdbXSwgZGlzYWJsZWRUc2V0c2VSdWxlczogc3RyaW5nW10sXG4gICAgYW5ndWxhckNvbXBpbGVyT3B0aW9ucz86IHtba2V5OiBzdHJpbmddOiB1bmtub3dufSk6IGJvb2xlYW4ge1xuICBwZXJmVHJhY2Uuc25hcHNob3RNZW1vcnlVc2FnZSgpO1xuICBjYWNoZS5yZXNldFN0YXRzKCk7XG4gIGNhY2hlLnRyYWNlU3RhdHMoKTtcblxuICBjb25zdCBjb21waWxlckhvc3REZWxlZ2F0ZSA9XG4gICAgICB0cy5jcmVhdGVDb21waWxlckhvc3Qoe3RhcmdldDogdHMuU2NyaXB0VGFyZ2V0LkVTNX0pO1xuXG4gIGNvbnN0IG1vZHVsZVJlc29sdmVyID0gYmF6ZWxPcHRzLmlzSnNUcmFuc3BpbGF0aW9uID9cbiAgICAgIG1ha2VKc01vZHVsZVJlc29sdmVyKGJhemVsT3B0cy53b3Jrc3BhY2VOYW1lKSA6XG4gICAgICB0cy5yZXNvbHZlTW9kdWxlTmFtZTtcbiAgY29uc3QgdHNpY2tsZUNvbXBpbGVySG9zdCA9IG5ldyBDb21waWxlckhvc3QoXG4gICAgICBmaWxlcywgb3B0aW9ucywgYmF6ZWxPcHRzLCBjb21waWxlckhvc3REZWxlZ2F0ZSwgZmlsZUxvYWRlcixcbiAgICAgIG1vZHVsZVJlc29sdmVyKTtcbiAgbGV0IGNvbXBpbGVySG9zdDogUGx1Z2luQ29tcGlsZXJIb3N0ID0gdHNpY2tsZUNvbXBpbGVySG9zdDtcbiAgY29uc3QgZGlhZ25vc3RpY1BsdWdpbnM6IERpYWdub3N0aWNQbHVnaW5bXSA9IFtdO1xuXG4gIGxldCBhbmd1bGFyUGx1Z2luOiBUc2NQbHVnaW58dW5kZWZpbmVkO1xuICBpZiAoYmF6ZWxPcHRzLmNvbXBpbGVBbmd1bGFyVGVtcGxhdGVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG5nT3B0aW9ucyA9IGFuZ3VsYXJDb21waWxlck9wdGlvbnMgfHwge307XG4gICAgICAvLyBBZGQgdGhlIHJvb3REaXIgc2V0dGluZyB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gTmdUc2NQbHVnaW4uXG4gICAgICAvLyBSZXF1aXJlZCBzbyB0aGF0IHN5bnRoZXRpYyBmaWxlcyBhZGRlZCB0byB0aGUgcm9vdEZpbGVzIGluIHRoZSBwcm9ncmFtXG4gICAgICAvLyBjYW4gYmUgZ2l2ZW4gYWJzb2x1dGUgcGF0aHMsIGp1c3QgYXMgd2UgZG8gaW4gdHNjb25maWcudHMsIG1hdGNoaW5nXG4gICAgICAvLyB0aGUgYmVoYXZpb3IgaW4gVHlwZVNjcmlwdCdzIHRzY29uZmlnIHBhcnNpbmcgbG9naWMuXG4gICAgICBuZ09wdGlvbnNbJ3Jvb3REaXInXSA9IG9wdGlvbnMucm9vdERpcjtcblxuICAgICAgLy8gRHluYW1pY2FsbHkgbG9hZCB0aGUgQW5ndWxhciBjb21waWxlciBpbnN0YWxsZWQgYXMgYSBwZWVyRGVwXG4gICAgICBjb25zdCBuZ3RzYyA9IHJlcXVpcmUoJ0Bhbmd1bGFyL2NvbXBpbGVyLWNsaScpO1xuICAgICAgYW5ndWxhclBsdWdpbiA9IG5ldyBuZ3RzYy5OZ1RzY1BsdWdpbihuZ09wdGlvbnMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ3doZW4gdXNpbmcgYHRzX2xpYnJhcnkoY29tcGlsZV9hbmd1bGFyX3RlbXBsYXRlcz1UcnVlKWAsICcgK1xuICAgICAgICAgICd5b3UgbXVzdCBpbnN0YWxsIEBhbmd1bGFyL2NvbXBpbGVyLWNsaScpO1xuICAgIH1cblxuICAgIC8vIFdyYXAgaG9zdCBvbmx5IG5lZWRlZCB1bnRpbCBhZnRlciBJdnkgY2xlYW51cFxuICAgIC8vIFRPRE8oYWxleGVhZ2xlKTogcmVtb3ZlIGFmdGVyIG5nc3VtbWFyeSBhbmQgbmdmYWN0b3J5IGZpbGVzIGVsaW1pbmF0ZWRcbiAgICBjb21waWxlckhvc3QgPSBhbmd1bGFyUGx1Z2luIS53cmFwSG9zdCEoZmlsZXMsIGNvbXBpbGVySG9zdCk7XG4gIH1cblxuXG4gIGNvbnN0IG9sZFByb2dyYW0gPSBjYWNoZS5nZXRQcm9ncmFtKGJhemVsT3B0cy50YXJnZXQpO1xuICBjb25zdCBwcm9ncmFtID0gcGVyZlRyYWNlLndyYXAoXG4gICAgICAnY3JlYXRlUHJvZ3JhbScsXG4gICAgICAoKSA9PiB0cy5jcmVhdGVQcm9ncmFtKFxuICAgICAgICAgIGNvbXBpbGVySG9zdC5pbnB1dEZpbGVzLCBvcHRpb25zLCBjb21waWxlckhvc3QsIG9sZFByb2dyYW0pKTtcbiAgY2FjaGUucHV0UHJvZ3JhbShiYXplbE9wdHMudGFyZ2V0LCBwcm9ncmFtKTtcblxuXG4gIGlmICghYmF6ZWxPcHRzLmlzSnNUcmFuc3BpbGF0aW9uKSB7XG4gICAgLy8gSWYgdGhlcmUgYXJlIGFueSBUeXBlU2NyaXB0IHR5cGUgZXJyb3JzIGFib3J0IG5vdywgc28gdGhlIGVycm9yXG4gICAgLy8gbWVzc2FnZXMgcmVmZXIgdG8gdGhlIG9yaWdpbmFsIHNvdXJjZS4gIEFmdGVyIGFueSBzdWJzZXF1ZW50IHBhc3Nlc1xuICAgIC8vIChkZWNvcmF0b3IgZG93bmxldmVsaW5nIG9yIHRzaWNrbGUpIHdlIGRvIG5vdCB0eXBlIGNoZWNrLlxuICAgIGxldCBkaWFnbm9zdGljcyA9IGdhdGhlckRpYWdub3N0aWNzKFxuICAgICAgICBvcHRpb25zLCBiYXplbE9wdHMsIHByb2dyYW0sIGRpc2FibGVkVHNldHNlUnVsZXMsIGFuZ3VsYXJQbHVnaW4sXG4gICAgICAgIGRpYWdub3N0aWNQbHVnaW5zKTtcbiAgICBpZiAoIWV4cGVjdERpYWdub3N0aWNzV2hpdGVsaXN0Lmxlbmd0aCB8fFxuICAgICAgICBleHBlY3REaWFnbm9zdGljc1doaXRlbGlzdC5zb21lKHAgPT4gYmF6ZWxPcHRzLnRhcmdldC5zdGFydHNXaXRoKHApKSkge1xuICAgICAgZGlhZ25vc3RpY3MgPSBiYXplbERpYWdub3N0aWNzLmZpbHRlckV4cGVjdGVkKFxuICAgICAgICAgIGJhemVsT3B0cywgZGlhZ25vc3RpY3MsIGJhemVsRGlhZ25vc3RpY3MudWdseUZvcm1hdCk7XG4gICAgfSBlbHNlIGlmIChiYXplbE9wdHMuZXhwZWN0ZWREaWFnbm9zdGljcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGBPbmx5IHRhcmdldHMgdW5kZXIgJHtcbiAgICAgICAgICAgICAgZXhwZWN0RGlhZ25vc3RpY3NXaGl0ZWxpc3Quam9pbignLCAnKX0gY2FuIHVzZSBgICtcbiAgICAgICAgICAgICAgJ2V4cGVjdGVkX2RpYWdub3N0aWNzLCBidXQgZ290JyxcbiAgICAgICAgICBiYXplbE9wdHMudGFyZ2V0KTtcbiAgICB9XG5cbiAgICBpZiAoZGlhZ25vc3RpY3MubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5lcnJvcihiYXplbERpYWdub3N0aWNzLmZvcm1hdChiYXplbE9wdHMudGFyZ2V0LCBkaWFnbm9zdGljcykpO1xuICAgICAgZGVidWcoJ2NvbXBpbGF0aW9uIGZhaWxlZCBhdCcsIG5ldyBFcnJvcigpLnN0YWNrISk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29tcGlsYXRpb25UYXJnZXRzID0gcHJvZ3JhbS5nZXRTb3VyY2VGaWxlcygpLmZpbHRlcihcbiAgICAgIGZpbGVOYW1lID0+IGlzQ29tcGlsYXRpb25UYXJnZXQoYmF6ZWxPcHRzLCBmaWxlTmFtZSkpO1xuXG4gIGxldCBkaWFnbm9zdGljczogdHMuRGlhZ25vc3RpY1tdID0gW107XG4gIGxldCB1c2VUc2lja2xlRW1pdCA9IGJhemVsT3B0cy50c2lja2xlO1xuICBsZXQgdHJhbnNmb3JtczogdHMuQ3VzdG9tVHJhbnNmb3JtZXJzID0ge1xuICAgIGJlZm9yZTogW10sXG4gICAgYWZ0ZXI6IFtdLFxuICAgIGFmdGVyRGVjbGFyYXRpb25zOiBbXSxcbiAgfTtcblxuICBpZiAoYW5ndWxhclBsdWdpbikge1xuICAgIHRyYW5zZm9ybXMgPSBhbmd1bGFyUGx1Z2luLmNyZWF0ZVRyYW5zZm9ybWVycyEoY29tcGlsZXJIb3N0KTtcbiAgfVxuXG4gIGlmICh1c2VUc2lja2xlRW1pdCkge1xuICAgIGRpYWdub3N0aWNzID0gZW1pdFdpdGhUc2lja2xlKFxuICAgICAgICBwcm9ncmFtLCB0c2lja2xlQ29tcGlsZXJIb3N0LCBjb21waWxhdGlvblRhcmdldHMsIG9wdGlvbnMsIGJhemVsT3B0cyxcbiAgICAgICAgdHJhbnNmb3Jtcyk7XG4gIH0gZWxzZSB7XG4gICAgZGlhZ25vc3RpY3MgPSBlbWl0V2l0aFR5cGVzY3JpcHQocHJvZ3JhbSwgY29tcGlsYXRpb25UYXJnZXRzLCB0cmFuc2Zvcm1zKTtcbiAgfVxuXG4gIGlmIChkaWFnbm9zdGljcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc29sZS5lcnJvcihiYXplbERpYWdub3N0aWNzLmZvcm1hdChiYXplbE9wdHMudGFyZ2V0LCBkaWFnbm9zdGljcykpO1xuICAgIGRlYnVnKCdjb21waWxhdGlvbiBmYWlsZWQgYXQnLCBuZXcgRXJyb3IoKS5zdGFjayEpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNhY2hlLnByaW50U3RhdHMoKTtcbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGVtaXRXaXRoVHlwZXNjcmlwdChcbiAgICBwcm9ncmFtOiB0cy5Qcm9ncmFtLCBjb21waWxhdGlvblRhcmdldHM6IHRzLlNvdXJjZUZpbGVbXSxcbiAgICB0cmFuc2Zvcm1zOiB0cy5DdXN0b21UcmFuc2Zvcm1lcnMpOiB0cy5EaWFnbm9zdGljW10ge1xuICBjb25zdCBkaWFnbm9zdGljczogdHMuRGlhZ25vc3RpY1tdID0gW107XG4gIGZvciAoY29uc3Qgc2Ygb2YgY29tcGlsYXRpb25UYXJnZXRzKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gcHJvZ3JhbS5lbWl0KFxuICAgICAgICBzZiwgLyp3cml0ZUZpbGUqLyB1bmRlZmluZWQsXG4gICAgICAgIC8qY2FuY2VsbGF0aW9uVG9rZW4qLyB1bmRlZmluZWQsIC8qZW1pdE9ubHlEdHNGaWxlcyovIHVuZGVmaW5lZCxcbiAgICAgICAgdHJhbnNmb3Jtcyk7XG4gICAgZGlhZ25vc3RpY3MucHVzaCguLi5yZXN1bHQuZGlhZ25vc3RpY3MpO1xuICB9XG4gIHJldHVybiBkaWFnbm9zdGljcztcbn1cblxuLyoqXG4gKiBSdW5zIHRoZSBlbWl0IHBpcGVsaW5lIHdpdGggVHNpY2tsZSB0cmFuc2Zvcm1hdGlvbnMgLSBnb29nLm1vZHVsZSByZXdyaXRpbmdcbiAqIGFuZCBDbG9zdXJlIHR5cGVzIGVtaXR0ZWQgaW5jbHVkZWQuXG4gKiBFeHBvcnRlZCB0byBiZSB1c2VkIGJ5IHRoZSBpbnRlcm5hbCBnbG9iYWwgcmVmYWN0b3JpbmcgdG9vbHMuXG4gKiBUT0RPKHJhZG9raXJvdik6IGludmVzdGlnYXRlIHVzaW5nIHJ1bldpdGhPcHRpb25zIGFuZCBtYWtpbmcgdGhpcyBwcml2YXRlXG4gKiBhZ2FpbiwgaWYgd2UgY2FuIG1ha2UgY29tcGlsZXJIb3N0cyBtYXRjaC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVtaXRXaXRoVHNpY2tsZShcbiAgICBwcm9ncmFtOiB0cy5Qcm9ncmFtLCBjb21waWxlckhvc3Q6IENvbXBpbGVySG9zdCxcbiAgICBjb21waWxhdGlvblRhcmdldHM6IHRzLlNvdXJjZUZpbGVbXSwgb3B0aW9uczogdHMuQ29tcGlsZXJPcHRpb25zLFxuICAgIGJhemVsT3B0czogQmF6ZWxPcHRpb25zLFxuICAgIHRyYW5zZm9ybXM6IHRzLkN1c3RvbVRyYW5zZm9ybWVycyk6IHRzLkRpYWdub3N0aWNbXSB7XG4gIGNvbnN0IGVtaXRSZXN1bHRzOiB0c2lja2xlLkVtaXRSZXN1bHRbXSA9IFtdO1xuICBjb25zdCBkaWFnbm9zdGljczogdHMuRGlhZ25vc3RpY1tdID0gW107XG4gIC8vIFRoZSAndHNpY2tsZScgaW1wb3J0IGFib3ZlIGlzIG9ubHkgdXNlZCBpbiB0eXBlIHBvc2l0aW9ucywgc28gaXQgd29uJ3RcbiAgLy8gcmVzdWx0IGluIGEgcnVudGltZSBkZXBlbmRlbmN5IG9uIHRzaWNrbGUuXG4gIC8vIElmIHRoZSB1c2VyIHJlcXVlc3RzIHRoZSB0c2lja2xlIGVtaXQsIHRoZW4gd2UgZHluYW1pY2FsbHkgcmVxdWlyZSBpdFxuICAvLyBoZXJlIGZvciB1c2UgYXQgcnVudGltZS5cbiAgbGV0IG9wdFRzaWNrbGU6IHR5cGVvZiB0c2lja2xlO1xuICB0cnkge1xuICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby1yZXF1aXJlLWltcG9ydHNcbiAgICBvcHRUc2lja2xlID0gcmVxdWlyZSgndHNpY2tsZScpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKGUuY29kZSAhPT0gJ01PRFVMRV9OT1RfRk9VTkQnKSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdXaGVuIHNldHRpbmcgYmF6ZWxPcHRzIHsgdHNpY2tsZTogdHJ1ZSB9LCAnICtcbiAgICAgICAgJ3lvdSBtdXN0IGFsc28gYWRkIGEgZGV2RGVwZW5kZW5jeSBvbiB0aGUgdHNpY2tsZSBucG0gcGFja2FnZScpO1xuICB9XG4gIHBlcmZUcmFjZS53cmFwKCdlbWl0JywgKCkgPT4ge1xuICAgIGZvciAoY29uc3Qgc2Ygb2YgY29tcGlsYXRpb25UYXJnZXRzKSB7XG4gICAgICBwZXJmVHJhY2Uud3JhcChgZW1pdCAke3NmLmZpbGVOYW1lfWAsICgpID0+IHtcbiAgICAgICAgZW1pdFJlc3VsdHMucHVzaChvcHRUc2lja2xlLmVtaXRXaXRoVHNpY2tsZShcbiAgICAgICAgICAgIHByb2dyYW0sIGNvbXBpbGVySG9zdCwgY29tcGlsZXJIb3N0LCBvcHRpb25zLCBzZixcbiAgICAgICAgICAgIC8qd3JpdGVGaWxlKi8gdW5kZWZpbmVkLFxuICAgICAgICAgICAgLypjYW5jZWxsYXRpb25Ub2tlbiovIHVuZGVmaW5lZCwgLyplbWl0T25seUR0c0ZpbGVzKi8gdW5kZWZpbmVkLCB7XG4gICAgICAgICAgICAgIGJlZm9yZVRzOiB0cmFuc2Zvcm1zLmJlZm9yZSxcbiAgICAgICAgICAgICAgYWZ0ZXJUczogdHJhbnNmb3Jtcy5hZnRlcixcbiAgICAgICAgICAgICAgYWZ0ZXJEZWNsYXJhdGlvbnM6IHRyYW5zZm9ybXMuYWZ0ZXJEZWNsYXJhdGlvbnMsXG4gICAgICAgICAgICB9KSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBlbWl0UmVzdWx0ID0gb3B0VHNpY2tsZS5tZXJnZUVtaXRSZXN1bHRzKGVtaXRSZXN1bHRzKTtcbiAgZGlhZ25vc3RpY3MucHVzaCguLi5lbWl0UmVzdWx0LmRpYWdub3N0aWNzKTtcblxuICAvLyBJZiB0c2lja2xlIHJlcG9ydGVkIGRpYWdub3N0aWNzLCBkb24ndCBwcm9kdWNlIGV4dGVybnMgb3IgbWFuaWZlc3Qgb3V0cHV0cy5cbiAgaWYgKGRpYWdub3N0aWNzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gZGlhZ25vc3RpY3M7XG4gIH1cblxuICBsZXQgZXh0ZXJucyA9ICcvKiogQGV4dGVybnMgKi9cXG4nICtcbiAgICAgICcvLyBnZW5lcmF0aW5nIGV4dGVybnMgd2FzIGRpc2FibGVkIHVzaW5nIGdlbmVyYXRlX2V4dGVybnM9RmFsc2VcXG4nO1xuICBpZiAoYmF6ZWxPcHRzLnRzaWNrbGVHZW5lcmF0ZUV4dGVybnMpIHtcbiAgICBleHRlcm5zID1cbiAgICAgICAgb3B0VHNpY2tsZS5nZXRHZW5lcmF0ZWRFeHRlcm5zKGVtaXRSZXN1bHQuZXh0ZXJucywgb3B0aW9ucy5yb290RGlyISk7XG4gIH1cblxuICBpZiAoYmF6ZWxPcHRzLnRzaWNrbGVFeHRlcm5zUGF0aCkge1xuICAgIC8vIE5vdGU6IHdoZW4gdHNpY2tsZUV4dGVybnNQYXRoIGlzIHByb3ZpZGVkLCB3ZSBhbHdheXMgd3JpdGUgYSBmaWxlIGFzIGFcbiAgICAvLyBtYXJrZXIgdGhhdCBjb21waWxhdGlvbiBzdWNjZWVkZWQsIGV2ZW4gaWYgaXQncyBlbXB0eSAoanVzdCBjb250YWluaW5nIGFuXG4gICAgLy8gQGV4dGVybnMpLlxuICAgIGZzLndyaXRlRmlsZVN5bmMoYmF6ZWxPcHRzLnRzaWNrbGVFeHRlcm5zUGF0aCwgZXh0ZXJucyk7XG5cbiAgICAvLyBXaGVuIGdlbmVyYXRpbmcgZXh0ZXJucywgZ2VuZXJhdGUgYW4gZXh0ZXJucyBmaWxlIGZvciBlYWNoIG9mIHRoZSBpbnB1dFxuICAgIC8vIC5kLnRzIGZpbGVzLlxuICAgIGlmIChiYXplbE9wdHMudHNpY2tsZUdlbmVyYXRlRXh0ZXJucyAmJlxuICAgICAgICBjb21waWxlckhvc3QucHJvdmlkZUV4dGVybmFsTW9kdWxlRHRzTmFtZXNwYWNlKSB7XG4gICAgICBmb3IgKGNvbnN0IGV4dGVybiBvZiBjb21waWxhdGlvblRhcmdldHMpIHtcbiAgICAgICAgaWYgKCFleHRlcm4uaXNEZWNsYXJhdGlvbkZpbGUpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBvdXRwdXRCYXNlRGlyID0gb3B0aW9ucy5vdXREaXIhO1xuICAgICAgICBjb25zdCByZWxhdGl2ZU91dHB1dFBhdGggPVxuICAgICAgICAgICAgY29tcGlsZXJIb3N0LnJlbGF0aXZlT3V0cHV0UGF0aChleHRlcm4uZmlsZU5hbWUpO1xuICAgICAgICBta2RpcnAob3V0cHV0QmFzZURpciwgcGF0aC5kaXJuYW1lKHJlbGF0aXZlT3V0cHV0UGF0aCkpO1xuICAgICAgICBjb25zdCBvdXRwdXRQYXRoID0gcGF0aC5qb2luKG91dHB1dEJhc2VEaXIsIHJlbGF0aXZlT3V0cHV0UGF0aCk7XG4gICAgICAgIGNvbnN0IG1vZHVsZU5hbWUgPSBjb21waWxlckhvc3QucGF0aFRvTW9kdWxlTmFtZSgnJywgZXh0ZXJuLmZpbGVOYW1lKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhcbiAgICAgICAgICAgIG91dHB1dFBhdGgsXG4gICAgICAgICAgICBgZ29vZy5tb2R1bGUoJyR7bW9kdWxlTmFtZX0nKTtcXG5gICtcbiAgICAgICAgICAgICAgICBgLy8gRXhwb3J0IGFuIGVtcHR5IG9iamVjdCBvZiB1bmtub3duIHR5cGUgdG8gYWxsb3cgaW1wb3J0cy5cXG5gICtcbiAgICAgICAgICAgICAgICBgLy8gVE9ETzogdXNlIHR5cGVvZiBvbmNlIGF2YWlsYWJsZVxcbmAgK1xuICAgICAgICAgICAgICAgIGBleHBvcnRzID0gLyoqIEB0eXBlIHs/fSAqLyAoe30pO1xcbmApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChiYXplbE9wdHMubWFuaWZlc3QpIHtcbiAgICBwZXJmVHJhY2Uud3JhcCgnbWFuaWZlc3QnLCAoKSA9PiB7XG4gICAgICBjb25zdCBtYW5pZmVzdCA9XG4gICAgICAgICAgY29uc3RydWN0TWFuaWZlc3QoZW1pdFJlc3VsdC5tb2R1bGVzTWFuaWZlc3QsIGNvbXBpbGVySG9zdCk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGJhemVsT3B0cy5tYW5pZmVzdCwgbWFuaWZlc3QpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGRpYWdub3N0aWNzO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgZGlyZWN0b3JpZXMgc3ViZGlyIChhIHNsYXNoIHNlcGFyYXRlZCByZWxhdGl2ZSBwYXRoKSBzdGFydGluZyBmcm9tXG4gKiBiYXNlLlxuICovXG5mdW5jdGlvbiBta2RpcnAoYmFzZTogc3RyaW5nLCBzdWJkaXI6IHN0cmluZykge1xuICBjb25zdCBzdGVwcyA9IHN1YmRpci5zcGxpdChwYXRoLnNlcCk7XG4gIGxldCBjdXJyZW50ID0gYmFzZTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGVwcy5sZW5ndGg7IGkrKykge1xuICAgIGN1cnJlbnQgPSBwYXRoLmpvaW4oY3VycmVudCwgc3RlcHNbaV0pO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhjdXJyZW50KSkgZnMubWtkaXJTeW5jKGN1cnJlbnQpO1xuICB9XG59XG5cblxuLyoqXG4gKiBSZXNvbHZlIG1vZHVsZSBmaWxlbmFtZXMgZm9yIEpTIG1vZHVsZXMuXG4gKlxuICogSlMgbW9kdWxlIHJlc29sdXRpb24gbmVlZHMgdG8gYmUgZGlmZmVyZW50IGJlY2F1c2Ugd2hlbiB0cmFuc3BpbGluZyBKUyB3ZVxuICogZG8gbm90IHBhc3MgaW4gYW55IGRlcGVuZGVuY2llcywgc28gdGhlIFRTIG1vZHVsZSByZXNvbHZlciB3aWxsIG5vdCByZXNvbHZlXG4gKiBhbnkgZmlsZXMuXG4gKlxuICogRm9ydHVuYXRlbHksIEpTIG1vZHVsZSByZXNvbHV0aW9uIGlzIHZlcnkgc2ltcGxlLiBUaGUgaW1wb3J0ZWQgbW9kdWxlIG5hbWVcbiAqIG11c3QgZWl0aGVyIGEgcmVsYXRpdmUgcGF0aCwgb3IgdGhlIHdvcmtzcGFjZSByb290IChpLmUuICdnb29nbGUzJyksXG4gKiBzbyB3ZSBjYW4gcGVyZm9ybSBtb2R1bGUgcmVzb2x1dGlvbiBlbnRpcmVseSBiYXNlZCBvbiBmaWxlIG5hbWVzLCB3aXRob3V0XG4gKiBsb29raW5nIGF0IHRoZSBmaWxlc3lzdGVtLlxuICovXG5mdW5jdGlvbiBtYWtlSnNNb2R1bGVSZXNvbHZlcih3b3Jrc3BhY2VOYW1lOiBzdHJpbmcpIHtcbiAgLy8gVGhlIGxpdGVyYWwgJy8nIGhlcmUgaXMgY3Jvc3MtcGxhdGZvcm0gc2FmZSBiZWNhdXNlIGl0J3MgbWF0Y2hpbmcgb25cbiAgLy8gaW1wb3J0IHNwZWNpZmllcnMsIG5vdCBmaWxlIG5hbWVzLlxuICBjb25zdCB3b3Jrc3BhY2VNb2R1bGVTcGVjaWZpZXJQcmVmaXggPSBgJHt3b3Jrc3BhY2VOYW1lfS9gO1xuICBjb25zdCB3b3Jrc3BhY2VEaXIgPSBgJHtwYXRoLnNlcH0ke3dvcmtzcGFjZU5hbWV9JHtwYXRoLnNlcH1gO1xuICBmdW5jdGlvbiBqc01vZHVsZVJlc29sdmVyKFxuICAgICAgbW9kdWxlTmFtZTogc3RyaW5nLCBjb250YWluaW5nRmlsZTogc3RyaW5nLFxuICAgICAgY29tcGlsZXJPcHRpb25zOiB0cy5Db21waWxlck9wdGlvbnMsIGhvc3Q6IHRzLk1vZHVsZVJlc29sdXRpb25Ib3N0KTpcbiAgICAgIHRzLlJlc29sdmVkTW9kdWxlV2l0aEZhaWxlZExvb2t1cExvY2F0aW9ucyB7XG4gICAgbGV0IHJlc29sdmVkRmlsZU5hbWU7XG4gICAgaWYgKGNvbnRhaW5pbmdGaWxlID09PSAnJykge1xuICAgICAgLy8gSW4gdHNpY2tsZSB3ZSByZXNvbHZlIHRoZSBmaWxlbmFtZSBhZ2FpbnN0ICcnIHRvIGdldCB0aGUgZ29vZyBtb2R1bGVcbiAgICAgIC8vIG5hbWUgb2YgYSBzb3VyY2VmaWxlLlxuICAgICAgcmVzb2x2ZWRGaWxlTmFtZSA9IG1vZHVsZU5hbWU7XG4gICAgfSBlbHNlIGlmIChtb2R1bGVOYW1lLnN0YXJ0c1dpdGgod29ya3NwYWNlTW9kdWxlU3BlY2lmaWVyUHJlZml4KSkge1xuICAgICAgLy8gR2l2ZW4gYSB3b3Jrc3BhY2UgbmFtZSBvZiAnZm9vJywgd2Ugd2FudCB0byByZXNvbHZlIGltcG9ydCBzcGVjaWZpZXJzXG4gICAgICAvLyBsaWtlOiAnZm9vL3Byb2plY3QvZmlsZS5qcycgdG8gdGhlIGFic29sdXRlIGZpbGVzeXN0ZW0gcGF0aCBvZlxuICAgICAgLy8gcHJvamVjdC9maWxlLmpzIHdpdGhpbiB0aGUgd29ya3NwYWNlLlxuICAgICAgY29uc3Qgd29ya3NwYWNlRGlyTG9jYXRpb24gPSBjb250YWluaW5nRmlsZS5pbmRleE9mKHdvcmtzcGFjZURpcik7XG4gICAgICBpZiAod29ya3NwYWNlRGlyTG9jYXRpb24gPCAwKSB7XG4gICAgICAgIHJldHVybiB7cmVzb2x2ZWRNb2R1bGU6IHVuZGVmaW5lZH07XG4gICAgICB9XG4gICAgICBjb25zdCBhYnNvbHV0ZVBhdGhUb1dvcmtzcGFjZURpciA9XG4gICAgICAgICAgY29udGFpbmluZ0ZpbGUuc2xpY2UoMCwgd29ya3NwYWNlRGlyTG9jYXRpb24pO1xuICAgICAgcmVzb2x2ZWRGaWxlTmFtZSA9IHBhdGguam9pbihhYnNvbHV0ZVBhdGhUb1dvcmtzcGFjZURpciwgbW9kdWxlTmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghbW9kdWxlTmFtZS5zdGFydHNXaXRoKCcuLycpICYmICFtb2R1bGVOYW1lLnN0YXJ0c1dpdGgoJy4uLycpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBVbnN1cHBvcnRlZCBtb2R1bGUgaW1wb3J0IHNwZWNpZmllcjogJHtcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShtb2R1bGVOYW1lKX0uXFxuYCArXG4gICAgICAgICAgICBgSlMgbW9kdWxlIGltcG9ydHMgbXVzdCBlaXRoZXIgYmUgcmVsYXRpdmUgcGF0aHMgYCArXG4gICAgICAgICAgICBgKGJlZ2lubmluZyB3aXRoICcuJyBvciAnLi4nKSwgYCArXG4gICAgICAgICAgICBgb3IgdGhleSBtdXN0IGJlZ2luIHdpdGggJyR7d29ya3NwYWNlTmFtZX0vJy5gKTtcbiAgICAgIH1cbiAgICAgIHJlc29sdmVkRmlsZU5hbWUgPSBwYXRoLmpvaW4ocGF0aC5kaXJuYW1lKGNvbnRhaW5pbmdGaWxlKSwgbW9kdWxlTmFtZSk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICByZXNvbHZlZE1vZHVsZToge1xuICAgICAgICByZXNvbHZlZEZpbGVOYW1lLFxuICAgICAgICBleHRlbnNpb246IHRzLkV4dGVuc2lvbi5KcywgIC8vIGpzIGNhbiBvbmx5IGltcG9ydCBqc1xuICAgICAgICAvLyBUaGVzZSB0d28gZmllbGRzIGFyZSBjYXJnbyBjdWx0ZWQgZnJvbSB3aGF0IHRzLnJlc29sdmVNb2R1bGVOYW1lXG4gICAgICAgIC8vIHNlZW1zIHRvIHJldHVybi5cbiAgICAgICAgcGFja2FnZUlkOiB1bmRlZmluZWQsXG4gICAgICAgIGlzRXh0ZXJuYWxMaWJyYXJ5SW1wb3J0OiBmYWxzZSxcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIGpzTW9kdWxlUmVzb2x2ZXI7XG59XG5cblxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIC8vIERvIG5vdCBjYWxsIHByb2Nlc3MuZXhpdCgpLCBhcyB0aGF0IHRlcm1pbmF0ZXMgdGhlIGJpbmFyeSBiZWZvcmVcbiAgLy8gY29tcGxldGluZyBwZW5kaW5nIG9wZXJhdGlvbnMsIHN1Y2ggYXMgd3JpdGluZyB0byBzdGRvdXQgb3IgZW1pdHRpbmcgdGhlXG4gIC8vIHY4IHBlcmZvcm1hbmNlIGxvZy4gUmF0aGVyLCBzZXQgdGhlIGV4aXQgY29kZSBhbmQgZmFsbCBvZmYgdGhlIG1haW5cbiAgLy8gdGhyZWFkLCB3aGljaCB3aWxsIGNhdXNlIG5vZGUgdG8gdGVybWluYXRlIGNsZWFubHkuXG4gIHByb2Nlc3MuZXhpdENvZGUgPSBtYWluKHByb2Nlc3MuYXJndi5zbGljZSgyKSk7XG59XG4iXX0=