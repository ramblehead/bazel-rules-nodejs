# Copyright 2017 The Bazel Authors. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"TypeScript compilation"

load("@build_bazel_rules_nodejs//:providers.bzl", "NpmPackageInfo", "js_ecma_script_module_info", "js_named_module_info", "node_modules_aspect")

# pylint: disable=unused-argument
# pylint: disable=missing-docstring
load("@build_bazel_rules_typescript//internal:common/compilation.bzl", "COMMON_ATTRIBUTES", "DEPS_ASPECTS", "compile_ts", "ts_providers_dict_to_struct")
load("@build_bazel_rules_typescript//internal:common/tsconfig.bzl", "create_tsconfig")
load("//internal:ts_config.bzl", "TsConfigInfo")

load(":rh_settings.bzl", "RhTargetProvider", "RhModuleProvider")

_DEFAULT_COMPILER = "@npm//@bazel/typescript/bin:tsc_wrapped"
_DEFAULT_NODE_MODULES = Label("@npm//typescript:typescript__typings")

def _trim_package_node_modules(package_name):
    # trim a package name down to its path prior to a node_modules
    # segment. 'foo/node_modules/bar' would become 'foo' and
    # 'node_modules/bar' would become ''
    segments = []
    for n in package_name.split("/"):
        if n == "node_modules":
            break
        segments += [n]
    return "/".join(segments)

# Detect use of bazel-managed node modules.
# Return True if the node_modules is the default or a course-grained deps
#   `node_modules = "@npm//:node_modules"`
# Return False if the user used a hand-rolled filegroup
#   `node_modules = "//:my_node_modules"`
# Note: this works for ts_library since we have a default for node_modules
#       but wouldn't work for other rules like nodejs_binary
def _uses_bazel_managed_node_modules(ctx):
    # If the user put a filegroup as the node_modules it will have no provider
    return NpmPackageInfo in ctx.attr.node_modules

# This function is similar but slightly different than _compute_node_modules_root
# in /internal/node/node.bzl. TODO(gregmagolan): consolidate these functions
def _compute_node_modules_root(ctx):
    """Computes the node_modules root from the node_modules and deps attributes.

    Args:
      ctx: the skylark execution context

    Returns:
      The node_modules root as a string
    """
    node_modules_root = None
    if ctx.attr.node_modules:
        if NpmPackageInfo in ctx.attr.node_modules:
            node_modules_root = "/".join(["external", ctx.attr.node_modules[NpmPackageInfo].workspace, "node_modules"])
        elif ctx.files.node_modules:
            # ctx.files.node_modules is not an empty list
            node_modules_root = "/".join([f for f in [
                ctx.attr.node_modules.label.workspace_root,
                _trim_package_node_modules(ctx.attr.node_modules.label.package),
                "node_modules",
            ] if f])
    for d in ctx.attr.deps:
        if NpmPackageInfo in d:
            possible_root = "/".join(["external", d[NpmPackageInfo].workspace, "node_modules"])
            if not node_modules_root:
                node_modules_root = possible_root
            elif node_modules_root != possible_root:
                fail("All npm dependencies need to come from a single workspace. Found '%s' and '%s'." % (node_modules_root, possible_root))
    if not node_modules_root:
        # there are no fine grained deps and the node_modules attribute is an empty filegroup
        # but we still need a node_modules_root even if its empty
        node_modules_root = "/".join([f for f in [
            ctx.attr.node_modules.label.workspace_root,
            ctx.attr.node_modules.label.package,
            "node_modules",
        ] if f])
    return node_modules_root

def _filter_ts_inputs(all_inputs):
    return [
        f
        for f in all_inputs
        if f.extension in ["js", "jsx", "ts", "tsx", "json"]
    ]

def _compile_action(ctx, inputs, outputs, tsconfig_file, node_opts, description = "prodmode"):
    externs_files = []
    action_inputs = inputs
    action_outputs = []
    for output in outputs:
        if output.basename.endswith(".externs.js"):
            externs_files.append(output)
        elif output.basename.endswith(".es5.MF"):
            ctx.actions.write(output, content = "")
        else:
            action_outputs.append(output)

    # TODO(plf): For now we mock creation of files other than {name}.js.
    for externs_file in externs_files:
        ctx.actions.write(output = externs_file, content = "")

    # A ts_library that has only .d.ts inputs will have no outputs,
    # therefore there are no actions to execute
    if not action_outputs:
        return None

    action_inputs.extend(_filter_ts_inputs(ctx.files.node_modules))

    # Also include files from npm fine grained deps as action_inputs.
    # These deps are identified by the NpmPackageInfo provider.
    for d in ctx.attr.deps:
        if NpmPackageInfo in d:
            # Note: we can't avoid calling .to_list() on sources
            action_inputs.extend(_filter_ts_inputs(d[NpmPackageInfo].sources.to_list()))

    if ctx.file.tsconfig:
        action_inputs.append(ctx.file.tsconfig)
        if TsConfigInfo in ctx.attr.tsconfig:
            action_inputs.extend(ctx.attr.tsconfig[TsConfigInfo].deps)

    # Pass actual options for the node binary in the special "--node_options" argument.
    arguments = ["--node_options=%s" % opt for opt in node_opts]

    # One at-sign makes this a params-file, enabling the worker strategy.
    # Two at-signs escapes the argument so it's passed through to tsc_wrapped
    # rather than the contents getting expanded.
    if ctx.attr.supports_workers:
        arguments.append("@@" + tsconfig_file.path)
        mnemonic = "TypeScriptCompile"
    else:
        arguments.append("-p")
        arguments.append(tsconfig_file.path)
        mnemonic = "tsc"

    ctx.actions.run(
        progress_message = "Compiling TypeScript (%s) %s" % (description, ctx.label),
        mnemonic = mnemonic,
        inputs = action_inputs,
        outputs = action_outputs,
        # Use the built-in shell environment
        # Allow for users who set a custom shell that can locate standard binaries like tr and uname
        # See https://github.com/NixOS/nixpkgs/issues/43955#issuecomment-407546331
        use_default_shell_env = True,
        arguments = arguments,
        executable = ctx.executable.compiler,
        execution_requirements = {
            "supports-workers": str(int(ctx.attr.supports_workers)),
        },
    )

    # Enable the replay_params in case an aspect needs to re-build this library.
    return struct(
        label = ctx.label,
        tsconfig = tsconfig_file,
        inputs = action_inputs,
        outputs = action_outputs,
        compiler = ctx.executable.compiler,
    )

def _devmode_compile_action(ctx, inputs, outputs, tsconfig_file, node_opts):
    _compile_action(
        ctx,
        inputs,
        outputs,
        tsconfig_file,
        node_opts,
        description = "devmode",
    )

def tsc_wrapped_tsconfig(
        ctx,
        files,
        srcs,
        devmode_manifest = None,
        jsx_factory = None,
        **kwargs):
    """Produce a tsconfig.json that sets options required under Bazel.

    Args:
      ctx: the Bazel starlark execution context
      files: Labels of all TypeScript compiler inputs
      srcs: Immediate sources being compiled, as opposed to transitive deps
      devmode_manifest: path to the manifest file to write for --target=es5
      jsx_factory: the setting for tsconfig.json compilerOptions.jsxFactory
      **kwargs: remaining args to pass to the create_tsconfig helper

    Returns:
      The generated tsconfig.json as an object
    """

    # The location of tsconfig.json is interpreted as the root of the project
    # when it is passed to the TS compiler with the `-p` option:
    #   https://www.typescriptlang.org/docs/handbook/tsconfig-json.html.
    # Our tsconfig.json is in bazel-foo/bazel-out/local-fastbuild/bin/{package_path}
    # because it's generated in the execution phase. However, our source files are in
    # bazel-foo/ and therefore we need to strip some parent directories for each
    # f.path.

    node_modules_root = _compute_node_modules_root(ctx)
    config = create_tsconfig(
        ctx,
        files,
        srcs,
        devmode_manifest = devmode_manifest,
        node_modules_root = node_modules_root,
        **kwargs
    )
    config["bazelOptions"]["nodeModulesPrefix"] = node_modules_root

    rh_target_override = ctx.attr.rh_target_override[RhTargetProvider].target
    if(rh_target_override == "default"):
        # Override the target so we use es2015 for devmode
        # Since g3 isn't ready to do this yet
        config["compilerOptions"]["target"] = 'es2015'
    else:
        config["compilerOptions"]["target"] = rh_target_override

    rh_module_override = ctx.attr.rh_module_override[RhModuleProvider].module
    if(rh_module_override != "default"):
        config["compilerOptions"]["module"] = rh_module_override

    # It's fine for users to have types[] in their tsconfig.json to help the editor
    # know which of the node_modules/@types/* entries to include in the program.
    # But we don't want TypeScript to do any automatic resolution under tsc_wrapped
    # because when not run in a sandbox, it will scan the @types directory and find
    # entries that aren't in the action inputs.
    # See https://github.com/bazelbuild/rules_typescript/issues/449
    # This setting isn't shared with g3 because there is no node_modules directory there.
    # NB: Under user-managed dependencies we don't have a Provider in the node_modules
    #     so our mechanism to collect typings and put them into the program doesn't work.
    #     In that case we leave the types[] alone.
    if _uses_bazel_managed_node_modules(ctx):
        config["compilerOptions"]["types"] = []

    # If the user gives a tsconfig attribute, the generated file should extend
    # from the user's tsconfig.
    # See https://github.com/Microsoft/TypeScript/issues/9876
    # We subtract the ".json" from the end before handing to TypeScript because
    # this gives extra error-checking.
    if ctx.file.tsconfig:
        workspace_path = config["compilerOptions"]["rootDir"]
        config["extends"] = "/".join([workspace_path, ctx.file.tsconfig.path[:-len(".json")]])

    if jsx_factory:
        config["compilerOptions"]["jsxFactory"] = jsx_factory

    return config

# ************ #
# ts_library   #
# ************ #

def _ts_library_impl(ctx):
    """Implementation of ts_library.

    Args:
      ctx: the context.

    Returns:
      the struct returned by the call to compile_ts.
    """
    ts_providers = compile_ts(
        ctx,
        is_library = True,
        RhTargetProvider = RhTargetProvider,
        deps = ctx.attr.deps,
        compile_action = _compile_action,
        devmode_compile_action = _devmode_compile_action,
        tsc_wrapped_tsconfig = tsc_wrapped_tsconfig,
    )

    # Add in shared JS providers.
    # See design doc https://docs.google.com/document/d/1ggkY5RqUkVL4aQLYm7esRW978LgX3GUCnQirrk5E1C0/edit#
    # and issue https://github.com/bazelbuild/rules_nodejs/issues/57 for more details.
    ts_providers["providers"].extend([
        js_named_module_info(
            sources = ts_providers["typescript"]["es5_sources"],
            deps = ctx.attr.deps,
        ),
        js_ecma_script_module_info(
            sources = ts_providers["typescript"]["es6_sources"],
            deps = ctx.attr.deps,
        ),
        # TODO: Add remaining shared JS provider from design doc
        # (JSModuleInfo) and remove legacy "typescript" provider
        # once it is no longer needed.
    ])

    return ts_providers_dict_to_struct(ts_providers)

ts_library = rule(
    _ts_library_impl,
    attrs = dict(COMMON_ATTRIBUTES, **{
        "srcs": attr.label_list(
            doc = "The TypeScript source files to compile.",
            allow_files = [".ts", ".tsx"],
            mandatory = True,
        ),
        "compile_angular_templates": attr.bool(
            doc = """Run the Angular ngtsc compiler under ts_library""",
        ),
        "compiler": attr.label(
            doc = """Sets a different TypeScript compiler binary to use for this library.
For example, we use the vanilla TypeScript tsc.js for bootstrapping,
and Angular compilations can replace this with `ngc`.

The default ts_library compiler depends on the `@npm//@bazel/typescript`
target which is setup for projects that use bazel managed npm deps that
fetch the @bazel/typescript npm package. It is recommended that you use
the workspace name `@npm` for bazel managed deps so the default
compiler works out of the box. Otherwise, you'll have to override
the compiler attribute manually.
""",
            default = Label(_DEFAULT_COMPILER),
            allow_files = True,
            executable = True,
            cfg = "host",
        ),
        "internal_testing_type_check_dependencies": attr.bool(default = False, doc = "Testing only, whether to type check inputs that aren't srcs."),
        "node_modules": attr.label(
            doc = """The npm packages which should be available during the compile.

The default value is `@npm//typescript:typescript__typings` is setup
for projects that use bazel managed npm deps that. It is recommended
that you use the workspace name `@npm` for bazel managed deps so the
default node_modules works out of the box. Otherwise, you'll have to
override the node_modules attribute manually. This default is in place
since ts_library will always depend on at least the typescript
default libs which are provided by `@npm//typescript:typescript__typings`.

This attribute is DEPRECATED. As of version 0.18.0 the recommended
approach to npm dependencies is to use fine grained npm dependencies
which are setup with the `yarn_install` or `npm_install` rules.

For example, in targets that used a `//:node_modules` filegroup,

```
ts_library(
    name = "my_lib",
    ...
    node_modules = "//:node_modules",
)
```

which specifies all files within the `//:node_modules` filegroup
to be inputs to the `my_lib`. Using fine grained npm dependencies,
`my_lib` is defined with only the npm dependencies that are
needed:

```
ts_library(
    name = "my_lib",
    ...
    deps = [
        "@npm//@types/foo",
        "@npm//@types/bar",
        "@npm//foo",
        "@npm//bar",
        ...
    ],
)
```

In this case, only the listed npm packages and their
transitive deps are includes as inputs to the `my_lib` target
which reduces the time required to setup the runfiles for this
target (see https://github.com/bazelbuild/bazel/issues/5153).
The default typescript libs are also available via the node_modules
default in this case.

The @npm external repository and the fine grained npm package
targets are setup using the `yarn_install` or `npm_install` rule
in your WORKSPACE file:

```
yarn_install(
    name = "npm",
    package_json = "//:package.json",
    yarn_lock = "//:yarn.lock",
)
```
""",
            default = _DEFAULT_NODE_MODULES,
        ),
        "supports_workers": attr.bool(
            doc = """Intended for internal use only.

Allows you to disable the Bazel Worker strategy for this library.
Typically used together with the "compiler" setting when using a
non-worker aware compiler binary.""",
            default = True,
        ),

        # TODO(alexeagle): reconcile with google3: ts_library rules should
        # be portable across internal/external, so we need this attribute
        # internally as well.
        "tsconfig": attr.label(
            doc = """A tsconfig.json file containing settings for TypeScript compilation.
Note that some properties in the tsconfig are governed by Bazel and will be
overridden, such as `target` and `module`.

The default value is set to `//:tsconfig.json` by a macro. This means you must
either:

- Have your `tsconfig.json` file in the workspace root directory
- Use an alias in the root BUILD.bazel file to point to the location of tsconfig:
    `alias(name="tsconfig.json", actual="//path/to:tsconfig-something.json")`
- Give an explicit `tsconfig` attribute to all `ts_library` targets
            """,
            allow_single_file = True,
        ),
        "rh_target_override": attr.label(default = ":rh_target_override"),
        "rh_module_override": attr.label(default = ":rh_module_override"),
        "tsickle_typed": attr.bool(
            default = True,
            doc = "If using tsickle, instruct it to translate types to ClosureJS format",
        ),
        "deps": attr.label_list(
            aspects = DEPS_ASPECTS + [node_modules_aspect],
            doc = "Compile-time dependencies, typically other ts_library targets",
        ),
    }),
    outputs = {
        "tsconfig": "%{name}_tsconfig.json",
    },
    doc = """`ts_library` type-checks and compiles a set of TypeScript sources to JavaScript.

It produces declarations files (`.d.ts`) which are used for compiling downstream
TypeScript targets and JavaScript for the browser and Closure compiler.
""",
)

def ts_library_macro(tsconfig = None, **kwargs):
    """Wraps `ts_library` to set the default for the `tsconfig` attribute.

    This must be a macro so that the string is converted to a label in the context of the
    workspace that declares the `ts_library` target, rather than the workspace that defines
    `ts_library`, or the workspace where the build is taking place.

    This macro is re-exported as `ts_library` in the public API.

    Args:
      tsconfig: the label pointing to a tsconfig.json file
      **kwargs: remaining args to pass to the ts_library rule
    """
    if not tsconfig:
        tsconfig = "//:tsconfig.json"

    ts_library(tsconfig = tsconfig, **kwargs)
