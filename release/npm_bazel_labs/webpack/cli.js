(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define("npm_bazel_labs/webpack/cli", ["require", "exports", "webpack", "fs", "path"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /// <reference lib="es2015"/>
    const webpack = require("webpack");
    const fs = require("fs");
    const path = require("path");
    function unquoteArgs(s) {
        return s.replace(/^'(.*)'$/, '$1');
    }
    function configure(args) {
        const [bundleOut, sourcemapOut, entryPoint] = args;
        return {
            mode: 'production',
            entry: path.resolve(entryPoint),
            output: {
                path: path.dirname(path.resolve(bundleOut)),
                filename: path.basename(bundleOut),
                sourceMapFilename: path.basename(sourcemapOut),
            },
            devtool: 'cheap-source-map',
        };
    }
    function main(config) {
        const compiler = webpack(config);
        let exitCode = 0;
        compiler.run((err, stats) => {
            if (err) {
                console.error('Webpack failed, run with --subcommands for details');
                console.error(err.stack || err);
                if (err.details) {
                    console.error(err.details);
                }
                exitCode = 1;
            }
            if (stats.hasErrors()) {
                console.error('Errors in Webpack inputs', stats.toJson());
                exitCode = 1;
            }
        });
        return exitCode;
    }
    if (require.main === module) {
        // Avoid limitations of length of argv by using a flagfile
        // This also makes it easier to debug - you can just look
        // at this flagfile to see what args were passed to webpack
        const args = fs.readFileSync(process.argv[2], { encoding: 'utf-8' }).split('\n').map(unquoteArgs);
        process.exitCode = main(configure(args));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZXJuYWwvbnBtX2JhemVsX2xhYnMvd2VicGFjay9jbGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7SUFBQSw2QkFBNkI7SUFDN0IsbUNBQW9DO0lBQ3BDLHlCQUF5QjtJQUN6Qiw2QkFBNkI7SUFFN0IsU0FBUyxXQUFXLENBQUMsQ0FBUztRQUM1QixPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxTQUFTLFNBQVMsQ0FBQyxJQUFjO1FBQy9CLE1BQU0sQ0FBQyxTQUFTLEVBQUUsWUFBWSxFQUFFLFVBQVUsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUNuRCxPQUFPO1lBQ0wsSUFBSSxFQUFFLFlBQVk7WUFDbEIsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDO1lBQy9CLE1BQU0sRUFBRTtnQkFDTixJQUFJLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMzQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7Z0JBQ2xDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDO2FBQy9DO1lBQ0QsT0FBTyxFQUFFLGtCQUFrQjtTQUM1QixDQUFDO0lBQ0osQ0FBQztJQUVELFNBQVMsSUFBSSxDQUFDLE1BQTZCO1FBQ3pDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQyxJQUFJLFFBQVEsR0FBUSxDQUFDLENBQUM7UUFDdEIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUMxQixJQUFJLEdBQUcsRUFBRTtnQkFDUCxPQUFPLENBQUMsS0FBSyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7Z0JBQ3BFLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsQ0FBQztnQkFDaEMsSUFBSyxHQUFXLENBQUMsT0FBTyxFQUFFO29CQUN4QixPQUFPLENBQUMsS0FBSyxDQUFFLEdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztpQkFDckM7Z0JBQ0QsUUFBUSxHQUFHLENBQUMsQ0FBQzthQUNkO1lBQ0QsSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUU7Z0JBQ3JCLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7Z0JBQzFELFFBQVEsR0FBRyxDQUFDLENBQUM7YUFDZDtRQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztJQUVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7UUFDM0IsMERBQTBEO1FBQzFELHlEQUF5RDtRQUN6RCwyREFBMkQ7UUFDM0QsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUMsUUFBUSxFQUFFLE9BQU8sRUFBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNoRyxPQUFPLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztLQUMxQyIsInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIGxpYj1cImVzMjAxNVwiLz5cbmltcG9ydCB3ZWJwYWNrID0gcmVxdWlyZSgnd2VicGFjaycpO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZnVuY3Rpb24gdW5xdW90ZUFyZ3Moczogc3RyaW5nKSB7XG4gIHJldHVybiBzLnJlcGxhY2UoL14nKC4qKSckLywgJyQxJyk7XG59XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyZShhcmdzOiBzdHJpbmdbXSk6IHdlYnBhY2suQ29uZmlndXJhdGlvbiB7XG4gIGNvbnN0IFtidW5kbGVPdXQsIHNvdXJjZW1hcE91dCwgZW50cnlQb2ludF0gPSBhcmdzO1xuICByZXR1cm4ge1xuICAgIG1vZGU6ICdwcm9kdWN0aW9uJyxcbiAgICBlbnRyeTogcGF0aC5yZXNvbHZlKGVudHJ5UG9pbnQpLFxuICAgIG91dHB1dDoge1xuICAgICAgcGF0aDogcGF0aC5kaXJuYW1lKHBhdGgucmVzb2x2ZShidW5kbGVPdXQpKSxcbiAgICAgIGZpbGVuYW1lOiBwYXRoLmJhc2VuYW1lKGJ1bmRsZU91dCksXG4gICAgICBzb3VyY2VNYXBGaWxlbmFtZTogcGF0aC5iYXNlbmFtZShzb3VyY2VtYXBPdXQpLFxuICAgIH0sXG4gICAgZGV2dG9vbDogJ2NoZWFwLXNvdXJjZS1tYXAnLFxuICB9O1xufVxuXG5mdW5jdGlvbiBtYWluKGNvbmZpZzogd2VicGFjay5Db25maWd1cmF0aW9uKTogMHwxIHtcbiAgY29uc3QgY29tcGlsZXIgPSB3ZWJwYWNrKGNvbmZpZyk7XG4gIGxldCBleGl0Q29kZTogMHwxID0gMDtcbiAgY29tcGlsZXIucnVuKChlcnIsIHN0YXRzKSA9PiB7XG4gICAgaWYgKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcignV2VicGFjayBmYWlsZWQsIHJ1biB3aXRoIC0tc3ViY29tbWFuZHMgZm9yIGRldGFpbHMnKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrIHx8IGVycik7XG4gICAgICBpZiAoKGVyciBhcyBhbnkpLmRldGFpbHMpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcigoZXJyIGFzIGFueSkuZGV0YWlscyk7XG4gICAgICB9XG4gICAgICBleGl0Q29kZSA9IDE7XG4gICAgfVxuICAgIGlmIChzdGF0cy5oYXNFcnJvcnMoKSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3JzIGluIFdlYnBhY2sgaW5wdXRzJywgc3RhdHMudG9Kc29uKCkpO1xuICAgICAgZXhpdENvZGUgPSAxO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBleGl0Q29kZTtcbn1cblxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIC8vIEF2b2lkIGxpbWl0YXRpb25zIG9mIGxlbmd0aCBvZiBhcmd2IGJ5IHVzaW5nIGEgZmxhZ2ZpbGVcbiAgLy8gVGhpcyBhbHNvIG1ha2VzIGl0IGVhc2llciB0byBkZWJ1ZyAtIHlvdSBjYW4ganVzdCBsb29rXG4gIC8vIGF0IHRoaXMgZmxhZ2ZpbGUgdG8gc2VlIHdoYXQgYXJncyB3ZXJlIHBhc3NlZCB0byB3ZWJwYWNrXG4gIGNvbnN0IGFyZ3MgPSBmcy5yZWFkRmlsZVN5bmMocHJvY2Vzcy5hcmd2WzJdLCB7ZW5jb2Rpbmc6ICd1dGYtOCd9KS5zcGxpdCgnXFxuJykubWFwKHVucXVvdGVBcmdzKTtcbiAgcHJvY2Vzcy5leGl0Q29kZSA9IG1haW4oY29uZmlndXJlKGFyZ3MpKTtcbn1cbiJdfQ==