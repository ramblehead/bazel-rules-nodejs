(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define("@bazel/karma", ["require", "exports", "crypto", "fs", "path", "process", "readline", "tmp"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /*
     * Concat all JS files before serving.
     */
    const crypto = require("crypto");
    const fs = require("fs");
    const path = require("path");
    const process = require("process");
    const readline_1 = require("readline");
    const tmp = require("tmp");
    ///<reference types="lib.dom"/>
    /**
     * Return SHA1 of data buffer.
     */
    function sha1(data) {
        const hash = crypto.createHash('sha1');
        hash.update(data);
        return hash.digest('hex');
    }
    /**
     * Entry-point for the Karma plugin.
     */
    function initConcatJs(logger, emitter, basePath, hostname, port) {
        const log = logger.create('framework.concat_js');
        // Create a tmp file for the concat bundle that is automatically cleaned up on
        // exit.
        const tmpFile = tmp.fileSync({ keep: false, dir: process.env['TEST_TMPDIR'] });
        emitter.on('file_list_modified', files => {
            const bundleFile = {
                path: '/concatjs_bundle.js',
                contentPath: tmpFile.name,
                isUrl: false,
                content: '',
                encodings: {},
            };
            const included = [];
            files.included.forEach(file => {
                if (path.extname(file.originalPath) !== '.js') {
                    // Preserve all non-JS that were there in the included list.
                    included.push(file);
                }
                else {
                    const relativePath = path.relative(basePath, file.originalPath).replace(/\\/g, '/');
                    // Remove 'use strict'.
                    let content = file.content.replace(/('use strict'|"use strict");?/, '');
                    content = JSON.stringify(`${content}\n//# sourceURL=http://${hostname}:${port}/base/` +
                        `${relativePath}\n`);
                    content = `//${relativePath}\neval(${content});\n`;
                    bundleFile.content += content;
                }
            });
            bundleFile.sha = sha1(Buffer.from(bundleFile.content));
            bundleFile.mtime = new Date();
            included.unshift(bundleFile);
            files.included = included;
            files.served.push(bundleFile);
            log.debug('Writing concatjs bundle to tmp file %s', bundleFile.contentPath);
            fs.writeFileSync(bundleFile.contentPath, bundleFile.content);
        });
    }
    initConcatJs.$inject =
        ['logger', 'emitter', 'config.basePath', 'config.hostname', 'config.port'];
    function watcher(fileList) {
        // ibazel will write this string after a successful build
        // We don't want to re-trigger tests if the compilation fails, so
        // we should only listen for this event.
        const IBAZEL_NOTIFY_BUILD_SUCCESS = 'IBAZEL_BUILD_COMPLETED SUCCESS';
        // ibazel communicates with us via stdin
        const rl = readline_1.createInterface({ input: process.stdin, terminal: false });
        rl.on('line', (chunk) => {
            if (chunk === IBAZEL_NOTIFY_BUILD_SUCCESS) {
                fileList.refresh();
            }
        });
        rl.on('close', () => {
            // Give ibazel 5s to kill our process, otherwise do it ourselves
            setTimeout(() => {
                console.error('ibazel failed to stop karma after 5s; probably a bug');
                process.exit(1);
            }, 5000);
        });
    }
    watcher.$inject = ['fileList'];
    module.exports = {
        'framework:concat_js': ['factory', initConcatJs],
        'watcher': ['value', watcher],
    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9leHRlcm5hbC9ucG1fYmF6ZWxfa2FybWEvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7SUFBQTs7T0FFRztJQUNILGlDQUFpQztJQUNqQyx5QkFBeUI7SUFDekIsNkJBQTZCO0lBQzdCLG1DQUFtQztJQUNuQyx1Q0FBeUM7SUFDekMsMkJBQTJCO0lBQzNCLCtCQUErQjtJQUUvQjs7T0FFRztJQUNILFNBQVMsSUFBSSxDQUFDLElBQUk7UUFDaEIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLFlBQVksQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSTtRQUM3RCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFFakQsOEVBQThFO1FBQzlFLFFBQVE7UUFDUixNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBQyxDQUFDLENBQUM7UUFFN0UsT0FBTyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsRUFBRTtZQUN2QyxNQUFNLFVBQVUsR0FBRztnQkFDakIsSUFBSSxFQUFFLHFCQUFxQjtnQkFDM0IsV0FBVyxFQUFFLE9BQU8sQ0FBQyxJQUFJO2dCQUN6QixLQUFLLEVBQUUsS0FBSztnQkFDWixPQUFPLEVBQUUsRUFBRTtnQkFDWCxTQUFTLEVB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Q0FBQztJQUV4QyxNQUFNLENBQUMsT0FBTyxHQUFHO1FBQ2YscUJBQXFCLEVBQUUsQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDO1FBQ2hELFNBQVMsRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7S0FDOUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb25jYXQgYWxsIEpTIGZpbGVzIGJlZm9yZSBzZXJ2aW5nLlxuICovXG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBwcm9jZXNzIGZyb20gJ3Byb2Nlc3MnO1xuaW1wb3J0IHtjcmVhdGVJbnRlcmZhY2V9IGZyb20gJ3JlYWRsaW5lJztcbmltcG9ydCAqIGFzIHRtcCBmcm9tICd0bXAnO1xuLy8vPHJlZmVyZW5jZSB0eXBlcz1cImxpYi5kb21cIi8+XG5cbi8qKlxuICogUmV0dXJuIFNIQTEgb2YgZGF0YSBidWZmZXIuXG4gKi9cbmZ1bmN0aW9uIHNoYTEoZGF0YSkge1xuICBjb25zdCBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTEnKTtcbiAgaGFzaC51cGRhdGUoZGF0YSk7XG4gIHJldHVybiBoYXNoLmRpZ2VzdCgnaGV4Jyk7XG59XG5cbi8qKlxuICogRW50cnktcG9pbnQgZm9yIHRoZSBLYXJtYSBwbHVnaW4uXG4gKi9cbmZ1bmN0aW9uIGluaXRDb25jYXRKcyhsb2dnZXIsIGVtaXR0ZXIsIGJhc2VQYXRoLCBob3N0bmFtZSwgcG9ydCkge1xuICBjb25zdCBsb2cgPSBsb2dnZXIuY3JlYXRlKCdmcmFtZXdvcmsuY29uY2F0X2pzJyk7XG5cbiAgLy8gQ3JlYXRlIGEgdG1wIGZpbGUgZm9yIHRoZSBjb25jYXQgYnVuZGxlIHRoYXQgaXMgYXV0b21hdGljYWxseSBjbGVhbmVkIHVwIG9uXG4gIC8vIGV4aXQuXG4gIGNvbnN0IHRtcEZpbGUgPSB0bXAuZmlsZVN5bmMoe2tlZXA6IGZhbHNlLCBkaXI6IHByb2Nlc3MuZW52WydURVNUX1RNUERJUiddfSk7XG5cbiAgZW1pdHRlci5vbignZmlsZV9saXN0X21vZGlmaWVkJywgZmlsZXMgPT4ge1xuICAgIGNvbnN0IGJ1bmRsZUZpbGUgPSB7XG4gICAgICBwYXRoOiAnL2NvbmNhdGpzX2J1bmRsZS5qcycsXG4gICAgICBjb250ZW50UGF0aDogdG1wRmlsZS5uYW1lLFxuICAgICAgaXNVcmw6IGZhbHNlLFxuICAgICAgY29udGVudDogJycsXG4gICAgICBlbmNvZGluZ3M6IHt9LFxuICAgIH0gYXMgYW55O1xuICAgIGNvbnN0IGluY2x1ZGVkID0gW107XG5cbiAgICBmaWxlcy5pbmNsdWRlZC5mb3JFYWNoKGZpbGUgPT4ge1xuICAgICAgaWYgKHBhdGguZXh0bmFtZShmaWxlLm9yaWdpbmFsUGF0aCkgIT09ICcuanMnKSB7XG4gICAgICAgIC8vIFByZXNlcnZlIGFsbCBub24tSlMgdGhhdCB3ZXJlIHRoZXJlIGluIHRoZSBpbmNsdWRlZCBsaXN0LlxuICAgICAgICBpbmNsdWRlZC5wdXNoKGZpbGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gcGF0aC5yZWxhdGl2ZShiYXNlUGF0aCwgZmlsZS5vcmlnaW5hbFBhdGgpLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblxuICAgICAgICAvLyBSZW1vdmUgJ3VzZSBzdHJpY3QnLlxuICAgICAgICBsZXQgY29udGVudCA9IGZpbGUuY29udGVudC5yZXBsYWNlKC8oJ3VzZSBzdHJpY3QnfFwidXNlIHN0cmljdFwiKTs/LywgJycpO1xuICAgICAgICBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgICBgJHtjb250ZW50fVxcbi8vIyBzb3VyY2VVUkw9aHR0cDovLyR7aG9zdG5hbWV9OiR7cG9ydH0vYmFzZS9gICtcbiAgICAgICAgICAgIGAke3JlbGF0aXZlUGF0aH1cXG5gKTtcbiAgICAgICAgY29udGVudCA9IGAvLyR7cmVsYXRpdmVQYXRofVxcbmV2YWwoJHtjb250ZW50fSk7XFxuYDtcbiAgICAgICAgYnVuZGxlRmlsZS5jb250ZW50ICs9IGNvbnRlbnQ7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBidW5kbGVGaWxlLnNoYSA9IHNoYTEoQnVmZmVyLmZyb20oYnVuZGxlRmlsZS5jb250ZW50KSk7XG4gICAgYnVuZGxlRmlsZS5tdGltZSA9IG5ldyBEYXRlKCk7XG4gICAgaW5jbHVkZWQudW5zaGlmdChidW5kbGVGaWxlKTtcblxuICAgIGZpbGVzLmluY2x1ZGVkID0gaW5jbHVkZWQ7XG4gICAgZmlsZXMuc2VydmVkLnB1c2goYnVuZGxlRmlsZSk7XG5cbiAgICBsb2cuZGVidWcoJ1dyaXRpbmcgY29uY2F0anMgYnVuZGxlIHRvIHRtcCBmaWxlICVzJywgYnVuZGxlRmlsZS5jb250ZW50UGF0aCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhidW5kbGVGaWxlLmNvbnRlbnRQYXRoLCBidW5kbGVGaWxlLmNvbnRlbnQpO1xuICB9KTtcbn1cblxuKGluaXRDb25jYXRKcyBhcyBhbnkpLiRpbmplY3QgPVxuICAgIFsnbG9nZ2VyJywgJ2VtaXR0ZXInLCAnY29uZmlnLmJhc2VQYXRoJywgJ2NvbmZpZy5ob3N0bmFtZScsICdjb25maWcucG9ydCddO1xuXG5mdW5jdGlvbiB3YXRjaGVyKGZpbGVMaXN0OiB7cmVmcmVzaDogKCkgPT4gdm9pZH0pIHtcbiAgLy8gaWJhemVsIHdpbGwgd3JpdGUgdGhpcyBzdHJpbmcgYWZ0ZXIgYSBzdWNjZXNzZnVsIGJ1aWxkXG4gIC8vIFdlIGRvbid0IHdhbnQgdG8gcmUtdHJpZ2dlciB0ZXN0cyBpZiB0aGUgY29tcGlsYXRpb24gZmFpbHMsIHNvXG4gIC8vIHdlIHNob3VsZCBvbmx5IGxpc3RlbiBmb3IgdGhpcyBldmVudC5cbiAgY29uc3QgSUJBWkVMX05PVElGWV9CVUlMRF9TVUNDRVNTID0gJ0lCQVpFTF9CVUlMRF9DT01QTEVURUQgU1VDQ0VTUyc7XG4gIC8vIGliYXplbCBjb21tdW5pY2F0ZXMgd2l0aCB1cyB2aWEgc3RkaW5cbiAgY29uc3QgcmwgPSBjcmVhdGVJbnRlcmZhY2Uoe2lucHV0OiBwcm9jZXNzLnN0ZGluLCB0ZXJtaW5hbDogZmFsc2V9KTtcbiAgcmwub24oJ2xpbmUnLCAoY2h1bms6IHN0cmluZykgPT4ge1xuICAgIGlmIChjaHVuayA9PT0gSUJBWkVMX05PVElGWV9CVUlMRF9TVUNDRVNTKSB7XG4gICAgICBmaWxlTGlzdC5yZWZyZXNoKCk7XG4gICAgfVxuICB9KTtcbiAgcmwub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgIC8vIEdpdmUgaWJhemVsIDVzIHRvIGtpbGwgb3VyIHByb2Nlc3MsIG90aGVyd2lzZSBkbyBpdCBvdXJzZWx2ZXNcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ2liYXplbCBmYWlsZWQgdG8gc3RvcCBrYXJtYSBhZnRlciA1czsgcHJvYmFibHkgYSBidWcnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9LCA1MDAwKTtcbiAgfSk7XG59XG5cbih3YXRjaGVyIGFzIGFueSkuJGluamVjdCA9IFsnZmlsZUxpc3QnXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICdmcmFtZXdvcms6Y29uY2F0X2pzJzogWydmYWN0b3J5JywgaW5pdENvbmNhdEpzXSxcbiAgJ3dhdGNoZXInOiBbJ3ZhbHVlJywgd2F0Y2hlcl0sXG59O1xuIl19