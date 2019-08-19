(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "../error_code", "../util/pattern_engines/name_call_non_constant_argument", "../util/pattern_engines/name_engine", "../util/pattern_engines/property_non_constant_write_engine", "../util/pattern_engines/property_write_engine"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const error_code_1 = require("../error_code");
    const name_call_non_constant_argument_1 = require("../util/pattern_engines/name_call_non_constant_argument");
    const name_engine_1 = require("../util/pattern_engines/name_engine");
    const property_non_constant_write_engine_1 = require("../util/pattern_engines/property_non_constant_write_engine");
    const property_write_engine_1 = require("../util/pattern_engines/property_write_engine");
    /**
     * Builds a Rule that matches a certain pattern, given as parameter, and
     * that can additionally run a suggested fix generator on the matches.
     *
     * This is templated, mostly to ensure the nodes that have been matched
     * correspond to what the Fixer expects.
     */
    class ConformancePatternRule {
        constructor(config, fixer) {
            this.code = error_code_1.ErrorCode.CONFORMANCE_PATTERN;
            switch (config.kind) {
                case "banned-property-write" /* BANNED_PROPERTY_WRITE */:
                    this.engine = new property_write_engine_1.PropertyWriteEngine(config, fixer);
                    break;
                case "banned-property-non-constant-write" /* BANNED_PROPERTY_NON_CONSTANT_WRITE */:
                    this.engine = new property_non_constant_write_engine_1.PropertyNonConstantWriteEngine(config, fixer);
                    break;
                case "banned-name" /* BANNED_NAME */:
                    this.engine = new name_engine_1.NameEngine(config, fixer);
                    break;
                case "banned-call-non-constant-argument" /* BANNED_NAME_CALL_NON_CONSTANT_ARGUMENT */:
                    this.engine = new name_call_non_constant_argument_1.CallNonConstantArgumentEngine(config, fixer);
                    break;
                default:
                    throw new Error('Config type not recognized, or not implemented yet.');
            }
            this.ruleName = `conformance-pattern-${config.kind}`;
        }
        register(checker) {
            this.engine.register(checker);
        }
    }
    exports.ConformancePatternRule = ConformancePatternRule;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZm9ybWFuY2VfcGF0dGVybl9ydWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZXJuYWwvYnVpbGRfYmF6ZWxfcnVsZXNfdHlwZXNjcmlwdC9pbnRlcm5hbC90c2V0c2UvcnVsZXMvY29uZm9ybWFuY2VfcGF0dGVybl9ydWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0lBQ0EsOENBQXdDO0lBSXhDLDZHQUFzRztJQUN0RyxxRUFBK0Q7SUFFL0QsbUhBQTBHO0lBQzFHLHlGQUFrRjtJQUdsRjs7Ozs7O09BTUc7SUFDSCxNQUFhLHNCQUFzQjtRQU1qQyxZQUFZLE1BQWMsRUFBRSxLQUFhO1lBSmhDLFNBQUksR0FBRyxzQkFBUyxDQUFDLG1CQUFtQixDQUFDO1lBSzVDLFFBQVEsTUFBTSxDQUFDLElBQUksRUFBRTtnQkFDbkI7b0JBQ0UsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLDJDQUFtQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDckQsTUFBTTtnQkFDUjtvQkFDRSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksbUVBQThCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUNoRSxNQUFNO2dCQUNSO29CQUNFLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSx3QkFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDNUMsTUFBTTtnQkFDUjtvQkFDRSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksK0RBQTZCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUMvRCxNQUFNO2dCQUNSO29CQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMscURBQXFELENBQUMsQ0FBQzthQUMxRTtZQUNELElBQUksQ0FBQyxRQUFRLEdBQUcsdUJBQXVCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN2RCxDQUFDO1FBRUQsUUFBUSxDQUFDLE9BQWdCO1lBQ3ZCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLENBQUM7S0FDRjtJQTdCRCx3REE2QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0NoZWNrZXJ9IGZyb20gJy4uL2NoZWNrZXInO1xuaW1wb3J0IHtFcnJvckNvZGV9IGZyb20gJy4uL2Vycm9yX2NvZGUnO1xuaW1wb3J0IHtBYnN0cmFjdFJ1bGV9IGZyb20gJy4uL3J1bGUnO1xuaW1wb3J0IHtGaXhlcn0gZnJvbSAnLi4vdXRpbC9maXhlcic7XG5pbXBvcnQge0NvbmZpZywgUGF0dGVybktpbmR9IGZyb20gJy4uL3V0aWwvcGF0dGVybl9jb25maWcnO1xuaW1wb3J0IHtDYWxsTm9uQ29uc3RhbnRBcmd1bWVudEVuZ2luZX0gZnJvbSAnLi4vdXRpbC9wYXR0ZXJuX2VuZ2luZXMvbmFtZV9jYWxsX25vbl9jb25zdGFudF9hcmd1bWVudCc7XG5pbXBvcnQge05hbWVFbmdpbmV9IGZyb20gJy4uL3V0aWwvcGF0dGVybl9lbmdpbmVzL25hbWVfZW5naW5lJztcbmltcG9ydCB7UGF0dGVybkVuZ2luZX0gZnJvbSAnLi4vdXRpbC9wYXR0ZXJuX2VuZ2luZXMvcGF0dGVybl9lbmdpbmUnO1xuaW1wb3J0IHtQcm9wZXJ0eU5vbkNvbnN0YW50V3JpdGVFbmdpbmV9IGZyb20gJy4uL3V0aWwvcGF0dGVybl9lbmdpbmVzL3Byb3BlcnR5X25vbl9jb25zdGFudF93cml0ZV9lbmdpbmUnO1xuaW1wb3J0IHtQcm9wZXJ0eVdyaXRlRW5naW5lfSBmcm9tICcuLi91dGlsL3BhdHRlcm5fZW5naW5lcy9wcm9wZXJ0eV93cml0ZV9lbmdpbmUnO1xuXG5cbi8qKlxuICogQnVpbGRzIGEgUnVsZSB0aGF0IG1hdGNoZXMgYSBjZXJ0YWluIHBhdHRlcm4sIGdpdmVuIGFzIHBhcmFtZXRlciwgYW5kXG4gKiB0aGF0IGNhbiBhZGRpdGlvbmFsbHkgcnVuIGEgc3VnZ2VzdGVkIGZpeCBnZW5lcmF0b3Igb24gdGhlIG1hdGNoZXMuXG4gKlxuICogVGhpcyBpcyB0ZW1wbGF0ZWQsIG1vc3RseSB0byBlbnN1cmUgdGhlIG5vZGVzIHRoYXQgaGF2ZSBiZWVuIG1hdGNoZWRcbiAqIGNvcnJlc3BvbmQgdG8gd2hhdCB0aGUgRml4ZXIgZXhwZWN0cy5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbmZvcm1hbmNlUGF0dGVyblJ1bGUgaW1wbGVtZW50cyBBYnN0cmFjdFJ1bGUge1xuICByZWFkb25seSBydWxlTmFtZTogc3RyaW5nO1xuICByZWFkb25seSBjb2RlID0gRXJyb3JDb2RlLkNPTkZPUk1BTkNFX1BBVFRFUk47XG5cbiAgcHJpdmF0ZSByZWFkb25seSBlbmdpbmU6IFBhdHRlcm5FbmdpbmU7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBDb25maWcsIGZpeGVyPzogRml4ZXIpIHtcbiAgICBzd2l0Y2ggKGNvbmZpZy5raW5kKSB7XG4gICAgICBjYXNlIFBhdHRlcm5LaW5kLkJBTk5FRF9QUk9QRVJUWV9XUklURTpcbiAgICAgICAgdGhpcy5lbmdpbmUgPSBuZXcgUHJvcGVydHlXcml0ZUVuZ2luZShjb25maWcsIGZpeGVyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhdHRlcm5LaW5kLkJBTk5FRF9QUk9QRVJUWV9OT05fQ09OU1RBTlRfV1JJVEU6XG4gICAgICAgIHRoaXMuZW5naW5lID0gbmV3IFByb3BlcnR5Tm9uQ29uc3RhbnRXcml0ZUVuZ2luZShjb25maWcsIGZpeGVyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhdHRlcm5LaW5kLkJBTk5FRF9OQU1FOlxuICAgICAgICB0aGlzLmVuZ2luZSA9IG5ldyBOYW1lRW5naW5lKGNvbmZpZywgZml4ZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgUGF0dGVybktpbmQuQkFOTkVEX05BTUVfQ0FMTF9OT05fQ09OU1RBTlRfQVJHVU1FTlQ6XG4gICAgICAgIHRoaXMuZW5naW5lID0gbmV3IENhbGxOb25Db25zdGFudEFyZ3VtZW50RW5naW5lKGNvbmZpZywgZml4ZXIpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ29uZmlnIHR5cGUgbm90IHJlY29nbml6ZWQsIG9yIG5vdCBpbXBsZW1lbnRlZCB5ZXQuJyk7XG4gICAgfVxuICAgIHRoaXMucnVsZU5hbWUgPSBgY29uZm9ybWFuY2UtcGF0dGVybi0ke2NvbmZpZy5raW5kfWA7XG4gIH1cblxuICByZWdpc3RlcihjaGVja2VyOiBDaGVja2VyKSB7XG4gICAgdGhpcy5lbmdpbmUucmVnaXN0ZXIoY2hlY2tlcik7XG4gIH1cbn1cblxuLy8gUmUtZXhwb3J0ZWQgZm9yIGNvbnZlbmllbmNlIHdoZW4gaW5zdGFudGlhdGluZyBydWxlcy5cbi8qKlxuICogVGhlIGxpc3Qgb2Ygc3VwcG9ydGVkIHBhdHRlcm5zIHVzZWFibGUgaW4gQ29uZm9ybWFuY2VQYXR0ZXJuUnVsZS4gVGhlXG4gKiBwYXR0ZXJucyB3aG9zZSBuYW1lIG1hdGNoIEpTQ29uZm9ybWFuY2UgcGF0dGVybnMgc2hvdWxkIGJlaGF2ZSBzaW1pbGFybHkgKHNlZVxuICogaHR0cHM6Ly9naXRodWIuY29tL2dvb2dsZS9jbG9zdXJlLWNvbXBpbGVyL3dpa2kvSlMtQ29uZm9ybWFuY2UtRnJhbWV3b3JrKS5cbiAqL1xuZXhwb3J0IHtQYXR0ZXJuS2luZH07XG4iXX0=