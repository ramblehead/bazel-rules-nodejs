(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "typescript"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const ts = require("typescript");
    /**
     * A Tsetse check Failure is almost identical to a Diagnostic from TypeScript
     * except that:
     * (1) The error code is defined by each individual Tsetse rule.
     * (2) The optional `source` property is set to `Tsetse` so the host (VS Code
     * for instance) would use that to indicate where the error comes from.
     * (3) There's an optional suggestedFix field.
     */
    class Failure {
        constructor(sourceFile, start, end, failureText, code, suggestedFix) {
            this.sourceFile = sourceFile;
            this.start = start;
            this.end = end;
            this.failureText = failureText;
            this.code = code;
            this.suggestedFix = suggestedFix;
        }
        /**
         * This returns a structure compatible with ts.Diagnostic, but with added
         * fields, for convenience and to support suggested fixes.
         */
        toDiagnostic() {
            return {
                file: this.sourceFile,
                start: this.start,
                end: this.end,
                // start-end-using systems.
                length: this.end - this.start,
                messageText: this.failureText,
                category: ts.DiagnosticCategory.Error,
                code: this.code,
                // source is the name of the plugin.
                source: 'Tsetse',
                fix: this.suggestedFix
            };
        }
        toString() {
            return `{ sourceFile:${this.sourceFile ? this.sourceFile.fileName : 'unknown'}, start:${this.start}, end:${this.end}, fix:${fixToString(this.suggestedFix)} }`;
        }
    }
    exports.Failure = Failure;
    /**
     * Stringifies a Fix, replacing the ts.SourceFile with the matching filename.
     */
    function fixToString(f) {
        if (!f)
            return 'undefined';
        return '{' + JSON.stringify(f.changes.map(ic => {
            return {
                start: ic.start,
                end: ic.end,
                replacement: ic.replacement,
                fileName: ic.sourceFile.fileName
            };
        })) +
            '}';
    }
    exports.fixToString = fixToString;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmFpbHVyZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL2V4dGVybmFsL2J1aWxkX2JhemVsX3J1bGVzX3R5cGVzY3JpcHQvaW50ZXJuYWwvdHNldHNlL2ZhaWx1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7SUFBQSxpQ0FBaUM7SUFFakM7Ozs7Ozs7T0FPRztJQUNILE1BQWEsT0FBTztRQUNsQixZQUNxQixVQUF5QixFQUN6QixLQUFhLEVBQW1CLEdBQVcsRUFDM0MsV0FBbUIsRUFBbUIsSUFBWSxFQUNsRCxZQUFrQjtZQUhsQixlQUFVLEdBQVYsVUFBVSxDQUFlO1lBQ3pCLFVBQUssR0FBTCxLQUFLLENBQVE7WUFBbUIsUUFBRyxHQUFILEdBQUcsQ0FBUTtZQUMzQyxnQkFBVyxHQUFYLFdBQVcsQ0FBUTtZQUFtQixTQUFJLEdBQUosSUFBSSxDQUFRO1lBQ2xELGlCQUFZLEdBQVosWUFBWSxDQUFNO1FBQUcsQ0FBQztRQUUzQzs7O1dBR0c7UUFDSCxZQUFZO1lBQ1YsT0FBTztnQkFDTCxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVU7Z0JBQ3JCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO2dCQUNHLDJCQUEyQjtnQkFDM0MsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUs7Z0JBQzdCLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztnQkFDN0IsUUFBUSxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLO2dCQUNyQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7Z0JBQ2Ysb0NBQW9DO2dCQUNwQyxNQUFNLEVBQUUsUUFBUTtnQkFDaEIsR0FBRyxFQUFFLElBQUksQ0FBQyxZQUFZO2FBQ3ZCLENBQUM7UUFDSixDQUFDO1FBRUQsUUFBUTtZQUNOLE9BQU8sZ0JBQ0gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsV0FDdEQsSUFBSSxDQUFDLEtBQUssU0FBUyxJQUFJLENBQUMsR0FBRyxTQUFTLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztRQUM3RSxDQUFDO0tBQ0Y7SUFoQ0QsMEJBZ0NDO0lBZ0JEOztPQUVHO0lBQ0gsU0FBZ0IsV0FBVyxDQUFDLENBQU87UUFDakMsSUFBSSxDQUFDLENBQUM7WUFBRSxPQUFPLFdBQVcsQ0FBQztRQUMzQixPQUFPLEdBQUcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQzdDLE9BQU87Z0JBQ0wsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLO2dCQUNmLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRztnQkFDWCxXQUFXLEVBQUUsRUFBRSxDQUFDLFdBQVc7Z0JBQzNCLFFBQVEsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVE7YUFDakMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0MsR0FBRyxDQUFBO0lBQ1QsQ0FBQztJQVhELGtDQVdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbi8qKlxuICogQSBUc2V0c2UgY2hlY2sgRmFpbHVyZSBpcyBhbG1vc3QgaWRlbnRpY2FsIHRvIGEgRGlhZ25vc3RpYyBmcm9tIFR5cGVTY3JpcHRcbiAqIGV4Y2VwdCB0aGF0OlxuICogKDEpIFRoZSBlcnJvciBjb2RlIGlzIGRlZmluZWQgYnkgZWFjaCBpbmRpdmlkdWFsIFRzZXRzZSBydWxlLlxuICogKDIpIFRoZSBvcHRpb25hbCBgc291cmNlYCBwcm9wZXJ0eSBpcyBzZXQgdG8gYFRzZXRzZWAgc28gdGhlIGhvc3QgKFZTIENvZGVcbiAqIGZvciBpbnN0YW5jZSkgd291bGQgdXNlIHRoYXQgdG8gaW5kaWNhdGUgd2hlcmUgdGhlIGVycm9yIGNvbWVzIGZyb20uXG4gKiAoMykgVGhlcmUncyBhbiBvcHRpb25hbCBzdWdnZXN0ZWRGaXggZmllbGQuXG4gKi9cbmV4cG9ydCBjbGFzcyBGYWlsdXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwcml2YXRlIHJlYWRvbmx5IHNvdXJjZUZpbGU6IHRzLlNvdXJjZUZpbGUsXG4gICAgICBwcml2YXRlIHJlYWRvbmx5IHN0YXJ0OiBudW1iZXIsIHByaXZhdGUgcmVhZG9ubHkgZW5kOiBudW1iZXIsXG4gICAgICBwcml2YXRlIHJlYWRvbmx5IGZhaWx1cmVUZXh0OiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgY29kZTogbnVtYmVyLFxuICAgICAgcHJpdmF0ZSByZWFkb25seSBzdWdnZXN0ZWRGaXg/OiBGaXgpIHt9XG5cbiAgLyoqXG4gICAqIFRoaXMgcmV0dXJucyBhIHN0cnVjdHVyZSBjb21wYXRpYmxlIHdpdGggdHMuRGlhZ25vc3RpYywgYnV0IHdpdGggYWRkZWRcbiAgICogZmllbGRzLCBmb3IgY29udmVuaWVuY2UgYW5kIHRvIHN1cHBvcnQgc3VnZ2VzdGVkIGZpeGVzLlxuICAgKi9cbiAgdG9EaWFnbm9zdGljKCk6IHRzLkRpYWdub3N0aWMme2VuZDogbnVtYmVyLCBmaXg/OiBGaXh9IHtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZTogdGhpcy5zb3VyY2VGaWxlLFxuICAgICAgc3RhcnQ6IHRoaXMuc3RhcnQsXG4gICAgICBlbmQ6IHRoaXMuZW5kLCAgLy8gTm90IGluIHRzLkRpYWdub3N0aWMsIGJ1dCBhbHdheXMgdXNlZnVsIGZvclxuICAgICAgICAgICAgICAgICAgICAgIC8vIHN0YXJ0LWVuZC11c2luZyBzeXN0ZW1zLlxuICAgICAgbGVuZ3RoOiB0aGlzLmVuZCAtIHRoaXMuc3RhcnQsXG4gICAgICBtZXNzYWdlVGV4dDogdGhpcy5mYWlsdXJlVGV4dCxcbiAgICAgIGNhdGVnb3J5OiB0cy5EaWFnbm9zdGljQ2F0ZWdvcnkuRXJyb3IsXG4gICAgICBjb2RlOiB0aGlzLmNvZGUsXG4gICAgICAvLyBzb3VyY2UgaXMgdGhlIG5hbWUgb2YgdGhlIHBsdWdpbi5cbiAgICAgIHNvdXJjZTogJ1RzZXRzZScsXG4gICAgICBmaXg6IHRoaXMuc3VnZ2VzdGVkRml4XG4gICAgfTtcbiAgfVxuXG4gIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGB7IHNvdXJjZUZpbGU6JHtcbiAgICAgICAgdGhpcy5zb3VyY2VGaWxlID8gdGhpcy5zb3VyY2VGaWxlLmZpbGVOYW1lIDogJ3Vua25vd24nfSwgc3RhcnQ6JHtcbiAgICAgICAgdGhpcy5zdGFydH0sIGVuZDoke3RoaXMuZW5kfSwgZml4OiR7Zml4VG9TdHJpbmcodGhpcy5zdWdnZXN0ZWRGaXgpfSB9YDtcbiAgfVxufVxuXG4vKipcbiAqIEEgRml4IGlzIGEgcG90ZW50aWFsIHJlcGFpciB0byB0aGUgYXNzb2NpYXRlZCBGYWlsdXJlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEZpeCB7XG4gIC8qKlxuICAgKiBUaGUgaW5kaXZpZHVhbCB0ZXh0IHJlcGxhY2VtZW50cyBjb21wb3NpbmcgdGhhdCBmaXguXG4gICAqL1xuICBjaGFuZ2VzOiBJbmRpdmlkdWFsQ2hhbmdlW10sXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5kaXZpZHVhbENoYW5nZSB7XG4gIHNvdXJjZUZpbGU6IHRzLlNvdXJjZUZpbGUsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCByZXBsYWNlbWVudDogc3RyaW5nXG59XG5cbi8qKlxuICogU3RyaW5naWZpZXMgYSBGaXgsIHJlcGxhY2luZyB0aGUgdHMuU291cmNlRmlsZSB3aXRoIHRoZSBtYXRjaGluZyBmaWxlbmFtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpeFRvU3RyaW5nKGY/OiBGaXgpIHtcbiAgaWYgKCFmKSByZXR1cm4gJ3VuZGVmaW5lZCc7XG4gIHJldHVybiAneycgKyBKU09OLnN0cmluZ2lmeShmLmNoYW5nZXMubWFwKGljID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhcnQ6IGljLnN0YXJ0LFxuICAgICAgZW5kOiBpYy5lbmQsXG4gICAgICByZXBsYWNlbWVudDogaWMucmVwbGFjZW1lbnQsXG4gICAgICBmaWxlTmFtZTogaWMuc291cmNlRmlsZS5maWxlTmFtZVxuICAgIH07XG4gIH0pKSArXG4gICAgICAnfSdcbn1cbiJdfQ==