"User configuration to run the terser binary under bazel"

load("@build_bazel_rules_nodejs//:providers.bzl", "JSInfo")

TERSER_ATTRS = {
    "srcs": attr.label_list(
        doc = "TODO",
        allow_files = True,
        mandatory = True,
    ),
    # TODO: wire up this attribute
    "config_file": attr.label(
        doc = """A JSON file containing Terser minify() options.

        This is the file you would pass to the --config-file argument in terser's CLI.
        https://github.com/terser-js/terser#minify-options documents the content of the file.
        
        If this isn't supplied, Bazel will use some default settings.""",
        allow_single_file = True,
    ),
    "debug": attr.bool(
        doc = """Configure terser to produce more readable output.

        Instead of setting this attribute, consider setting the DEBUG env variable instead
        DEBUG=true bazel build //my/terser:target
        so that it only affects the current build.
        """,
    ),
    "sourcemap": attr.bool(
        doc = "TODO",
        default = True,
    ),
    "terser_bin": attr.label(
        default = Label("@npm//@bazel/terser/bin:terser"),
        executable = True,
        cfg = "host",
    ),
    "deps": attr.label_list(),
}

TERSER_OUTS = {
    # TODO: should this be {name}.mjs ?
    "optimized": "%{name}.js",
}

# Translate from the things we accept in the `src` attribute
def _find_srcs(srcs, flavor):
    srcfiles = []
    for src in srcs:
        if (JSInfo in src):
            srcfiles.extend(getattr(src[JSInfo], flavor).to_list())
        else:
            srcfiles.extend(src.files.to_list())
    return srcfiles

# Converts a dict to a struct, recursing into a single level of nested dicts.
# This allows users of compile_ts to modify or augment the returned dict before
# converting it to an immutable struct.
def _dict_to_struct(d):
    for key, value in d.items():
        if type(value) == type({}):
            d[key] = struct(**value)
    return struct(**d)

def run_terser(ctx, flavor, output):
    """TODO: doc"""

    # CLI arguments; see https://www.npmjs.com/package/terser#command-line-usage
    args = ctx.actions.args()

    srcs = _find_srcs(ctx.attr.srcs, flavor)
    args.add_all([src.path for src in srcs])

    outputs = [output]
    args.add_all(["--output", output])

    # TODO: also check the env.DEBUG variable
    debug = ctx.attr.debug
    if debug:
        args.add("--debug")
        args.add("--beautify")

    # See https://github.com/terser-js/terser#minify-options
    # TODO: give user appropriate control over options
    minify_options = {
        "compress": {
            "global_defs": {"ngDevMode": False, "ngI18nClosureMode": False},
            "keep_fnames": not debug,
            "passes": 3,
            "pure_getters": True,
            "reduce_funcs": not debug,
            "reduce_vars": not debug,
            "sequences": not debug,
        },
        "mangle": not debug,
    }

    if ctx.attr.sourcemap:
        map_output = ctx.actions.declare_file(output.basename + ".map", sibling = output)
        outputs.append(map_output)

        # Source mapping options are comma-packed into one argv
        # see https://github.com/terser-js/terser#command-line-usage
        source_map_opts = ["includeSources", "base=" + ctx.bin_dir.path]
        #if in_source_map:
        #    source_map_opts.append("content=" + in_source_map.path)
        #    inputs.append(in_source_map)

        # This option doesn't work in the config file, only on the CLI
        args.add_all(["--source-map", ",".join(source_map_opts)])
        minify_options["sourceMap"] = {"filename": map_output.path}

    opts = ctx.actions.declare_file("_%s.%s.minify_options.json" % (ctx.label.name, flavor))
    ctx.actions.write(opts, _dict_to_struct(minify_options).to_json())
    args.add_all(["--config-file", opts.path])

    ctx.actions.run(
        inputs = srcs + [opts],
        outputs = outputs,
        executable = ctx.executable.terser_bin,
        arguments = [args],
        progress_message = "Optimizing %s JavaScript %s [terser]" % (flavor, output.short_path),
    )
    return outputs

def _terser(ctx):
    esnext_outputs = run_terser(ctx, "esnext", ctx.outputs.optimized)

    # NB: this one will only run if some downstream rule requests the JSInfo provider
    named_js = ctx.actions.declare_file(ctx.outputs.optimized.path.replace(".js", ".umd.js"))
    named_outputs = run_terser(ctx, "named", named_js)

    return [
        DefaultInfo(files = depset(esnext_outputs)),
        JSInfo(esnext = depset(esnext_outputs), named = depset(named_outputs)),
    ]

terser_minified = rule(
    implementation = _terser,
    attrs = TERSER_ATTRS,
    outputs = TERSER_OUTS,
)
