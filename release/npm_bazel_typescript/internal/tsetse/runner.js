/**
 * @fileoverview Runner is the entry point of running Tsetse checks in compiler.
 */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./checker", "./rules/ban_expect_truthy_promise_rule", "./rules/ban_promise_as_condition_rule", "./rules/check_return_value_rule", "./rules/equals_nan_rule", "./rules/must_use_promises_rule"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const checker_1 = require("./checker");
    const ban_expect_truthy_promise_rule_1 = require("./rules/ban_expect_truthy_promise_rule");
    const ban_promise_as_condition_rule_1 = require("./rules/ban_promise_as_condition_rule");
    const check_return_value_rule_1 = require("./rules/check_return_value_rule");
    const equals_nan_rule_1 = require("./rules/equals_nan_rule");
    const must_use_promises_rule_1 = require("./rules/must_use_promises_rule");
    /**
     * List of Tsetse rules. Shared between the program plugin and the language
     * service plugin.
     */
    const ENABLED_RULES = [
        new check_return_value_rule_1.Rule(),
        new equals_nan_rule_1.Rule(),
        new ban_expect_truthy_promise_rule_1.Rule(),
        new must_use_promises_rule_1.Rule(),
        new ban_promise_as_condition_rule_1.Rule(),
    ];
    /**
     * The Tsetse check plugin performs compile-time static analysis for TypeScript
     * code.
     */
    class Plugin {
        constructor(program, disabledTsetseRules = []) {
            this.name = 'tsetse';
            this.checker = new checker_1.Checker(program);
            registerRules(this.checker, disabledTsetseRules);
        }
        getDiagnostics(sourceFile) {
            return this.checker.execute(sourceFile)
                .map(failure => failure.toDiagnostic());
        }
    }
    exports.Plugin = Plugin;
    function registerRules(checker, disabledTsetseRules) {
        for (const rule of ENABLED_RULES) {
            if (disabledTsetseRules.indexOf(rule.ruleName) === -1) {
                rule.register(checker);
            }
        }
    }
    exports.registerRules = registerRules;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVubmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZXJuYWwvYnVpbGRfYmF6ZWxfcnVsZXNfdHlwZXNjcmlwdC9pbnRlcm5hbC90c2V0c2UvcnVubmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztHQUVHOzs7Ozs7Ozs7Ozs7SUFPSCx1Q0FBa0M7SUFFbEMsMkZBQTBGO0lBQzFGLHlGQUF3RjtJQUN4Riw2RUFBNkU7SUFDN0UsNkRBQThEO0lBQzlELDJFQUEyRTtJQUUzRTs7O09BR0c7SUFDSCxNQUFNLGFBQWEsR0FBbUI7UUFDcEMsSUFBSSw4QkFBb0IsRUFBRTtRQUMxQixJQUFJLHNCQUFhLEVBQUU7UUFDbkIsSUFBSSxxQ0FBMEIsRUFBRTtRQUNoQyxJQUFJLDZCQUFtQixFQUFFO1FBQ3pCLElBQUksb0NBQXlCLEVBQUU7S0FDaEMsQ0FBQztJQUVGOzs7T0FHRztJQUNILE1BQWEsTUFBTTtRQUdqQixZQUFZLE9BQW1CLEVBQUUsc0JBQWdDLEVBQUU7WUFGMUQsU0FBSSxHQUFHLFFBQVEsQ0FBQztZQUd2QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksaUJBQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNwQyxhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFFRCxjQUFjLENBQUMsVUFBeUI7WUFDdEMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7aUJBQ2xDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLENBQUM7S0FDRjtJQVpELHdCQVlDO0lBRUQsU0FBZ0IsYUFBYSxDQUFDLE9BQWdCLEVBQUUsbUJBQTZCO1FBQzNFLEtBQUssTUFBTSxJQUFJLElBQUksYUFBYSxFQUFFO1lBQ2hDLElBQUksbUJBQW1CLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtnQkFDckQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUN4QjtTQUNGO0lBQ0gsQ0FBQztJQU5ELHNDQU1DIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAZmlsZW92ZXJ2aWV3IFJ1bm5lciBpcyB0aGUgZW50cnkgcG9pbnQgb2YgcnVubmluZyBUc2V0c2UgY2hlY2tzIGluIGNvbXBpbGVyLlxuICovXG5cbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG5pbXBvcnQgKiBhcyBwZXJmVHJhY2UgZnJvbSAnLi4vdHNjX3dyYXBwZWQvcGVyZl90cmFjZSc7XG5pbXBvcnQgKiBhcyBwbHVnaW5BcGkgZnJvbSAnLi4vdHNjX3dyYXBwZWQvcGx1Z2luX2FwaSc7XG5cbmltcG9ydCB7Q2hlY2tlcn0gZnJvbSAnLi9jaGVja2VyJztcbmltcG9ydCB7QWJzdHJhY3RSdWxlfSBmcm9tICcuL3J1bGUnO1xuaW1wb3J0IHtSdWxlIGFzIEJhbkV4cGVjdFRydXRoeVByb21pc2VSdWxlfSBmcm9tICcuL3J1bGVzL2Jhbl9leHBlY3RfdHJ1dGh5X3Byb21pc2VfcnVsZSc7XG5pbXBvcnQge1J1bGUgYXMgQmFuUHJvbWlzZUFzQ29uZGl0aW9uUnVsZX0gZnJvbSAnLi9ydWxlcy9iYW5fcHJvbWlzZV9hc19jb25kaXRpb25fcnVsZSc7XG5pbXBvcnQge1J1bGUgYXMgQ2hlY2tSZXR1cm5WYWx1ZVJ1bGV9IGZyb20gJy4vcnVsZXMvY2hlY2tfcmV0dXJuX3ZhbHVlX3J1bGUnO1xuaW1wb3J0IHtSdWxlIGFzIEVxdWFsc05hblJ1bGV9IGZyb20gJy4vcnVsZXMvZXF1YWxzX25hbl9ydWxlJztcbmltcG9ydCB7UnVsZSBhcyBNdXN0VXNlUHJvbWlzZXNSdWxlfSBmcm9tICcuL3J1bGVzL211c3RfdXNlX3Byb21pc2VzX3J1bGUnO1xuXG4vKipcbiAqIExpc3Qgb2YgVHNldHNlIHJ1bGVzLiBTaGFyZWQgYmV0d2VlbiB0aGUgcHJvZ3JhbSBwbHVnaW4gYW5kIHRoZSBsYW5ndWFnZVxuICogc2VydmljZSBwbHVnaW4uXG4gKi9cbmNvbnN0IEVOQUJMRURfUlVMRVM6IEFic3RyYWN0UnVsZVtdID0gW1xuICBuZXcgQ2hlY2tSZXR1cm5WYWx1ZVJ1bGUoKSxcbiAgbmV3IEVxdWFsc05hblJ1bGUoKSxcbiAgbmV3IEJhbkV4cGVjdFRydXRoeVByb21pc2VSdWxlKCksXG4gIG5ldyBNdXN0VXNlUHJvbWlzZXNSdWxlKCksXG4gIG5ldyBCYW5Qcm9taXNlQXNDb25kaXRpb25SdWxlKCksXG5dO1xuXG4vKipcbiAqIFRoZSBUc2V0c2UgY2hlY2sgcGx1Z2luIHBlcmZvcm1zIGNvbXBpbGUtdGltZSBzdGF0aWMgYW5hbHlzaXMgZm9yIFR5cGVTY3JpcHRcbiAqIGNvZGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBQbHVnaW4gaW1wbGVtZW50cyBwbHVnaW5BcGkuRGlhZ25vc3RpY1BsdWdpbiB7XG4gIHJlYWRvbmx5IG5hbWUgPSAndHNldHNlJztcbiAgcHJpdmF0ZSByZWFkb25seSBjaGVja2VyOiBDaGVja2VyO1xuICBjb25zdHJ1Y3Rvcihwcm9ncmFtOiB0cy5Qcm9ncmFtLCBkaXNhYmxlZFRzZXRzZVJ1bGVzOiBzdHJpbmdbXSA9IFtdKSB7XG4gICAgdGhpcy5jaGVja2VyID0gbmV3IENoZWNrZXIocHJvZ3JhbSk7XG4gICAgcmVnaXN0ZXJSdWxlcyh0aGlzLmNoZWNrZXIsIGRpc2FibGVkVHNldHNlUnVsZXMpO1xuICB9XG5cbiAgZ2V0RGlhZ25vc3RpY3Moc291cmNlRmlsZTogdHMuU291cmNlRmlsZSkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrZXIuZXhlY3V0ZShzb3VyY2VGaWxlKVxuICAgICAgICAubWFwKGZhaWx1cmUgPT4gZmFpbHVyZS50b0RpYWdub3N0aWMoKSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUnVsZXMoY2hlY2tlcjogQ2hlY2tlciwgZGlzYWJsZWRUc2V0c2VSdWxlczogc3RyaW5nW10pIHtcbiAgZm9yIChjb25zdCBydWxlIG9mIEVOQUJMRURfUlVMRVMpIHtcbiAgICBpZiAoZGlzYWJsZWRUc2V0c2VSdWxlcy5pbmRleE9mKHJ1bGUucnVsZU5hbWUpID09PSAtMSkge1xuICAgICAgcnVsZS5yZWdpc3RlcihjaGVja2VyKTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==