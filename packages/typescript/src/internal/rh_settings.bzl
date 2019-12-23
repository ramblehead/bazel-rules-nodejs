# Hey Emacs, this is -*- coding: utf-8; mode: bazel -*-

RhTargetProvider = provider(fields = ["target"])

RhModuleProvider = provider(fields = ["module"])

valid_targets = [
    "default",
    "es3",
    "es5",
    "es6",
    "es2015",
    "es2016",
    "es2017",
    "es2018",
    "esnext",
]

valid_modules = [
    "default",
    "none",
    "commonjs",
    "amd",
    "system",
    "umd",
    "es6",
    "es2015",
    "esnext",
]

def _rh_target_impl(ctx):
    target = ctx.build_setting_value
    if target not in valid_targets:
        fail(str(ctx.label) + " build setting allowed to take values in " +
             str(valid_targets) + " but was set to unallowed value " + target)
    return RhTargetProvider(target = target)

rh_target = rule(
    implementation = _rh_target_impl,
    build_setting = config.string(flag = False)
)

def _rh_module_impl(ctx):
    module = ctx.build_setting_value
    if module not in valid_modules:
        fail(str(ctx.label) + " build setting allowed to take values in " +
             str(valid_modules) + " but was set to unallowed value " + module)
    return RhModuleProvider(module = module)

rh_module = rule(
    implementation = _rh_module_impl,
    build_setting = config.string(flag = False)
)
