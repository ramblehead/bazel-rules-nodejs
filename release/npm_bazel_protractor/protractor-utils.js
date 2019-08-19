/**
 * @license
 * Copyright 2017 The Bazel Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define("@bazel/protractor/protractor-utils", ["require", "exports", "child_process", "net"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const child_process = require("child_process");
    const net = require("net");
    function isTcpPortFree(port) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.on('error', (e) => {
                resolve(false);
            });
            server.on('close', () => {
                resolve(true);
            });
            server.listen(port, () => {
                server.close();
            });
        });
    }
    exports.isTcpPortFree = isTcpPortFree;
    function isTcpPortBound(port) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            client.once('connect', () => {
                resolve(true);
            });
            client.once('error', (e) => {
                resolve(false);
            });
            client.connect(port);
        });
    }
    exports.isTcpPortBound = isTcpPortBound;
    function findFreeTcpPort() {
        return __awaiter(this, void 0, void 0, function* () {
            const range = {
                min: 32768,
                max: 60000,
            };
            for (let i = 0; i < 100; i++) {
                let port = Math.floor(Math.random() * (range.max - range.min) + range.min);
                if (yield isTcpPortFree(port)) {
                    return port;
                }
            }
            throw new Error('Unable to find a free port');
        });
    }
    exports.findFreeTcpPort = findFreeTcpPort;
    function waitForServer(port, timeout) {
        return isTcpPortBound(port).then(isBound => {
            if (!isBound) {
                if (timeout <= 0) {
                    throw new Error('Timeout waiting for server to start');
                }
                const wait = Math.min(timeout, 500);
                return new Promise((res, rej) => setTimeout(res, wait))
                    .then(() => waitForServer(port, timeout - wait));
            }
            return true;
        });
    }
    exports.waitForServer = waitForServer;
    /**
     * Runs the specified server binary from a given workspace and waits for the server
     * being ready. The server binary will be resolved from the Bazel runfiles. Note that
     * the server will be launched with a random free port in order to support test concurrency
     * with Bazel.
     */
    function runServer(workspace, serverTarget, portFlag, serverArgs, timeout = 5000) {
        return __awaiter(this, void 0, void 0, function* () {
            const serverPath = require.resolve(`${workspace}/${serverTarget}`);
            const port = yield findFreeTcpPort();
            // Start the Bazel server binary with a random free TCP port.
            const serverProcess = child_process.spawn(serverPath, serverArgs.concat([portFlag, port.toString()]), { stdio: 'inherit' });
            // In case the process exited with an error, we want to propagate the error.
            serverProcess.on('exit', exitCode => {
                if (exitCode !== 0) {
                    throw new Error(`Server exited with error code: ${exitCode}`);
                }
            });
            // Wait for the server to be bound to the given port.
            yield waitForServer(port, timeout);
            return { port };
        });
    }
    exports.runServer = runServer;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdHJhY3Rvci11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL2V4dGVybmFsL25wbV9iYXplbF9wcm90cmFjdG9yL3Byb3RyYWN0b3ItdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7OztHQWVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQUVILCtDQUErQztJQUMvQywyQkFBMkI7SUFFM0IsU0FBZ0IsYUFBYSxDQUFDLElBQVk7UUFDeEMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNyQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRTtnQkFDdkIsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pCLENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO2dCQUN0QixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7Z0JBQ3ZCLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNqQixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQWJELHNDQWFDO0lBRUQsU0FBZ0IsY0FBYyxDQUFDLElBQVk7UUFDekMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNyQyxNQUFNLE1BQU0sR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7Z0JBQzFCLE9BQU8sQ0FBQyxJ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QyxDQUFDO1lBRW5DLE9BQU8sRUFBQyxJQUFJLEVBQUMsQ0FBQztRQUNoQixDQUFDO0tBQUE7SUFyQkQsOEJBcUJDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IDIwMTcgVGhlIEJhemVsIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIGNoaWxkX3Byb2Nlc3MgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzVGNwUG9ydEZyZWUocG9ydDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3Qgc2VydmVyID0gbmV0LmNyZWF0ZVNlcnZlcigpO1xuICAgIHNlcnZlci5vbignZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgfSk7XG4gICAgc2VydmVyLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIHJlc29sdmUodHJ1ZSk7XG4gICAgfSk7XG4gICAgc2VydmVyLmxpc3Rlbihwb3J0LCAoKSA9PiB7XG4gICAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1RjcFBvcnRCb3VuZChwb3J0OiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgbmV0LlNvY2tldCgpO1xuICAgIGNsaWVudC5vbmNlKCdjb25uZWN0JywgKCkgPT4ge1xuICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICB9KTtcbiAgICBjbGllbnQub25jZSgnZXJyb3InLCAoZSkgPT4ge1xuICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgfSk7XG4gICAgY2xpZW50LmNvbm5lY3QocG9ydCk7XG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZEZyZWVUY3BQb3J0KCk6IFByb21pc2U8bnVtYmVyPiB7XG4gIGNvbnN0IHJhbmdlID0ge1xuICAgIG1pbjogMzI3NjgsXG4gICAgbWF4OiA2MDAwMCxcbiAgfTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuICAgIGxldCBwb3J0ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKHJhbmdlLm1heCAtIHJhbmdlLm1pbikgKyByYW5nZS5taW4pO1xuICAgIGlmIChhd2FpdCBpc1RjcFBvcnRGcmVlKHBvcnQpKSB7XG4gICAgICByZXR1cm4gcG9ydDtcbiAgICB9XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gZmluZCBhIGZyZWUgcG9ydCcpO1xufVxuXG4vLyBJbnRlcmZhY2UgZm9yIGNvbmZpZyBwYXJhbWV0ZXIgb2YgdGhlIHByb3RyYWN0b3Jfd2ViX3Rlc3Rfc3VpdGUgb25QcmVwYXJlIGZ1bmN0aW9uXG5leHBvcnQgaW50ZXJmYWNlIE9uUHJlcGFyZUNvbmZpZyB7XG4gIC8vIFRoZSB3b3Jrc3BhY2UgbmFtZVxuICB3b3Jrc3BhY2U6IHN0cmluZztcblxuICAvLyBUaGUgc2VydmVyIGJpbmFyeSB0byBydW5cbiAgc2VydmVyOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yU2VydmVyKHBvcnQ6IG51bWJlciwgdGltZW91dDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHJldHVybiBpc1RjcFBvcnRCb3VuZChwb3J0KS50aGVuKGlzQm91bmQgPT4ge1xuICAgIGlmICghaXNCb3VuZCkge1xuICAgICAgaWYgKHRpbWVvdXQgPD0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RpbWVvdXQgd2FpdGluZyBmb3Igc2VydmVyIHRvIHN0YXJ0Jyk7XG4gICAgICB9XG4gICAgICBjb25zdCB3YWl0ID0gTWF0aC5taW4odGltZW91dCwgNTAwKTtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHNldFRpbWVvdXQocmVzLCB3YWl0KSlcbiAgICAgICAgICAudGhlbigoKSA9PiB3YWl0Rm9yU2VydmVyKHBvcnQsIHRpbWVvdXQgLSB3YWl0KSk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcbn1cblxuLy8gUmV0dXJuIHR5cGUgZnJvbSBydW5TZXJ2ZXIgZnVuY3Rpb25cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmVyU3BlYyB7XG4gIC8vIFBvcnQgbnVtYmVyIHRoYXQgdGhlIHNlcnZlciBpcyBydW5uaW5nIG9uXG4gIHBvcnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBSdW5zIHRoZSBzcGVjaWZpZWQgc2VydmVyIGJpbmFyeSBmcm9tIGEgZ2l2ZW4gd29ya3NwYWNlIGFuZCB3YWl0cyBmb3IgdGhlIHNlcnZlclxuICogYmVpbmcgcmVhZHkuIFRoZSBzZXJ2ZXIgYmluYXJ5IHdpbGwgYmUgcmVzb2x2ZWQgZnJvbSB0aGUgQmF6ZWwgcnVuZmlsZXMuIE5vdGUgdGhhdFxuICogdGhlIHNlcnZlciB3aWxsIGJlIGxhdW5jaGVkIHdpdGggYSByYW5kb20gZnJlZSBwb3J0IGluIG9yZGVyIHRvIHN1cHBvcnQgdGVzdCBjb25jdXJyZW5jeVxuICogd2l0aCBCYXplbC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blNlcnZlcihcbiAgICB3b3Jrc3BhY2U6IHN0cmluZywgc2VydmVyVGFyZ2V0OiBzdHJpbmcsIHBvcnRGbGFnOiBzdHJpbmcsIHNlcnZlckFyZ3M6IHN0cmluZ1tdLFxuICAgIHRpbWVvdXQgPSA1MDAwKTogUHJvbWlzZTxTZXJ2ZXJTcGVjPiB7XG4gIGNvbnN0IHNlcnZlclBhdGggPSByZXF1aXJlLnJlc29sdmUoYCR7d29ya3NwYWNlfS8ke3NlcnZlclRhcmdldH1gKTtcbiAgY29uc3QgcG9ydCA9IGF3YWl0IGZpbmRGcmVlVGNwUG9ydCgpO1xuXG4gIC8vIFN0YXJ0IHRoZSBCYXplbCBzZXJ2ZXIgYmluYXJ5IHdpdGggYSByYW5kb20gZnJlZSBUQ1AgcG9ydC5cbiAgY29uc3Qgc2VydmVyUHJvY2VzcyA9IGNoaWxkX3Byb2Nlc3Muc3Bhd24oXG4gICAgICBzZXJ2ZXJQYXRoLCBzZXJ2ZXJBcmdzLmNvbmNhdChbcG9ydEZsYWcsIHBvcnQudG9TdHJpbmcoKV0pLCB7c3RkaW86ICdpbmhlcml0J30pO1xuXG4gIC8vIEluIGNhc2UgdGhlIHByb2Nlc3MgZXhpdGVkIHdpdGggYW4gZXJyb3IsIHdlIHdhbnQgdG8gcHJvcGFnYXRlIHRoZSBlcnJvci5cbiAgc2VydmVyUHJvY2Vzcy5vbignZXhpdCcsIGV4aXRDb2RlID0+IHtcbiAgICBpZiAoZXhpdENvZGUgIT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU2VydmVyIGV4aXRlZCB3aXRoIGVycm9yIGNvZGU6ICR7ZXhpdENvZGV9YCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBXYWl0IGZvciB0aGUgc2VydmVyIHRvIGJlIGJvdW5kIHRvIHRoZSBnaXZlbiBwb3J0LlxuICBhd2FpdCB3YWl0Rm9yU2VydmVyKHBvcnQsIHRpbWVvdXQpO1xuXG4gIHJldHVybiB7cG9ydH07XG59XG4iXX0=