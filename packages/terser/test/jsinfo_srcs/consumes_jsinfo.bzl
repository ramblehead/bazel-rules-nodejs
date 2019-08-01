"fixture for testing terser"

load("@build_bazel_rules_nodejs//:providers.bzl", "JSInfo")

def _consume(ctx):
    if not JSInfo in ctx.attr.src:
        fail("Cannot consume %s because it doesn't provide JSInfo" % ctx.attr.src.label)

    named = ctx.attr.src[JSInfo].named.to_list()
    esnext = ctx.attr.src[JSInfo].esnext.to_list()

    if len(named) != 1:
        fail("expected to consume a single named file")
    if len(esnext) != 1:
        fail("expected to consume a single esnext file")

    ctx.actions.expand_template(
        template = named[0],
        output = ctx.outputs.named,
        substitutions = {},
    )
    ctx.actions.expand_template(
        template = esnext[0],
        output = ctx.outputs.esnext,
        substitutions = {},
    )

    return []

consumes_jsinfo = rule(
    _consume,
    attrs = {"src": attr.label()},
    outputs = {
        "esnext": "%{name}.mjs",
        "named": "%{name}.umd.js",
    },
)
