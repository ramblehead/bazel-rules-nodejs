import * as ts from 'typescript';
import { CompilerHost } from './compiler_host';
import { DiagnosticPlugin, TscPlugin } from './plugin_api';
import { BazelOptions } from './tsconfig';
/**
 * Top-level entry point for tsc_wrapped.
 */
export declare function main(args: string[]): 0 | 1;
/**
 * Gather diagnostics from TypeScript's type-checker as well as other plugins we
 * install such as strict dependency checking.
 */
export declare function gatherDiagnostics(options: ts.CompilerOptions, bazelOpts: BazelOptions, program: ts.Program, disabledTsetseRules: string[], angularPlugin?: TscPlugin, plugins?: DiagnosticPlugin[]): ts.Diagnostic[];
/**
 * Construct diagnostic plugins that we always want included.
 *
 * TODO: Call sites of getDiagnostics should initialize plugins themselves,
 *   including these, and the arguments to getDiagnostics should be simplified.
 */
export declare function getCommonPlugins(options: ts.CompilerOptions, bazelOpts: BazelOptions, program: ts.Program, disabledTsetseRules: string[]): Iterable<DiagnosticPlugin>;
/**
 * Runs the emit pipeline with Tsickle transformations - goog.module rewriting
 * and Closure types emitted included.
 * Exported to be used by the internal global refactoring tools.
 * TODO(radokirov): investigate using runWithOptions and making this private
 * again, if we can make compilerHosts match.
 */
export declare function emitWithTsickle(program: ts.Program, compilerHost: CompilerHost, compilationTargets: ts.SourceFile[], options: ts.CompilerOptions, bazelOpts: BazelOptions, transforms: ts.CustomTransformers): ts.Diagnostic[];
