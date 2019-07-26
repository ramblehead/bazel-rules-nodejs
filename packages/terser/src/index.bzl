"User configuration to run the terser binary under bazel"

TERSER_ATTRS = {
    "src": attr.label(
        doc = "TODO",
        allow_single_file = True,
    ),
    "debug": attr.bool(
        doc = """Configure terser to produce more readable output.

        Instead of setting this attribute, consider setting the DEBUG env variable instead
        DEBUG=true bazel build //my/terser:target
        so that it only affects the current build.
        """,
    ),
    "terser_bin": attr.label(
        default = Label("@npm//@bazel/terser/bin:terser"),
        executable = True,
        cfg = "host",
    ),
}

TERSER_OUTS = {
    "optimized": "%{name}.js",
}

def _terser(ctx):
    output = ctx.outputs.optimized
    args = ctx.actions.args()

    # CLI arguments; see https://www.npmjs.com/package/terser#command-line-usage
    args.add(ctx.file.src.path)
    args.add_all(["--output", output.path])

    ctx.actions.run(
        inputs = [ctx.file.src],
        outputs = [output],
        executable = ctx.executable.terser_bin,
        arguments = [args],
        progress_message = "Optimizing JavaScript %s [terser]" % output.short_path,
    )
    return [
        DefaultInfo(files = depset([output])),
    ]

terser = rule(
    implementation = _terser,
    attrs = TERSER_ATTRS,
    outputs = TERSER_OUTS,
)
