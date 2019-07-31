"Providers for interop between JS rules."

JSInfo = provider(
    doc = """The JSInfo provider allows rules to interoperate without knowledge of each other.

You can think of a provider as a message bus.
A rule "publishes" a message as an instance of the provider, and some other rule subscribes to these
by having a (possibly transitive) dependency on the publisher.

Note that debug output is considered orthogonal to these providers.
Any output may or may not have user debugging affordances provided, such as readable minification.
We expect that rules will have a boolean `debug` attribute, and/or accept the `DEBUG` environment variable.
Note that this means a given build either produces debug or non-debug output.
If users really need to produce both in a single build, they'll need two rules with differing 'debug' attributes.
""",
    fields = {
        # TODO: bike-shed the name
        "esnext": """JavaScript files that are intended to be consumed by downstream tooling.
                  They should use modern syntax and ESModules.
                  These files should typically be named "foo.mjs"
                  TODO: should we require that?
                  Historical note: this was the typescript.es6_sources output""",

        # TODO: bike-shed the name
        "named": """JavaScript files whose module name is self-contained.
                 For example named AMD/UMD or goog.module format.
                 These files can be efficiently served with the concatjs bundler.
                 These outputs should be named "foo.umd.js"
                 (note that renaming it from "foo.js" doesn't affect the module id)
                 Historical note: this was the typescript.es5_sources output""",

        # TODO: do we need something like a third flavor?
        # Or could this just be the DefaultInfo of tools that want to produce three flavors?
        #"user": """JavaScript files whose format is user-controlled.
        #        Consumers cannot make any assumptions about how to correctly handle it.""",

        # TODO: what about sourcemaps?
        # Each .js file in the other provider outputs might want to come with a .map
        # maybe we should return a depset of tuples instead?
        # We think the .map files can just be mixed with .js files in the above providers
    },
)

TypingsInfo = provider(
    doc = """The TypingsInfo provider allows JS rules to communicate typing information.

TypeScript's .d.ts files are used as the interop format for describing types.
""",
    fields = {
        # TODO: should they be transitive?
        # For most purposes, a .d.ts file isn't useful unless you can resolve all the referenced symbols
        # We can avoid the expense of running an aspect up the tree if typings are always transitive
        "dts": "A depset of .d.ts files",
    },
)
