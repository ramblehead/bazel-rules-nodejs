"Mock for testing terser interop"

load("@build_bazel_rules_nodejs//:providers.bzl", "JSInfo")

def _produces_jsinfo(ctx):
    return [
        JSInfo(
            named = depset(ctx.files.named_srcs),
            esnext = depset(ctx.files.esnext_srcs),
        ),
    ]

produces_jsinfo = rule(_produces_jsinfo, attrs = {
    "esnext_srcs": attr.label_list(allow_files = True),
    "named_srcs": attr.label_list(allow_files = True),
})
