"Rule implementations to run rollup under Bazel"

ROLLUP_BUNDLE_ATTRS = {
    "srcs": attr.label_list(
        doc = "TODO: copy over",
        allow_files = [".js"],
    ),
    "entry_point": attr.label(
        doc = "TODO: copy over",
        mandatory = True,
        allow_single_file = True,
    ),
    "rollup_bin": attr.label(
        doc = "TODO",
        executable = True,
        cfg = "host",
        default = "@npm//@bazel/rollup/bin:rollup",
    ),
    "deps": attr.label_list(),
}

ROLLUP_BUNDLE_OUTS = {}

def _rollup_bundle(ctx):
    return []

rollup_bundle = rule(
    implementation = _rollup_bundle,
    attrs = ROLLUP_BUNDLE_ATTRS,
    outputs = ROLLUP_BUNDLE_OUTS,
)
