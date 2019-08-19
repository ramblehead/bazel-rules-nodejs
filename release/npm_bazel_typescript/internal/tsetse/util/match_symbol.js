(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./ast_tools"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const ast_tools_1 = require("./ast_tools");
    const JS_IDENTIFIER_FORMAT = '[\\w\\d_-]+';
    const FQN_FORMAT = `(${JS_IDENTIFIER_FORMAT}\.)*${JS_IDENTIFIER_FORMAT}`;
    // A fqn made out of a dot-separated chain of JS identifiers.
    const ABSOLUTE_RE = new RegExp(`^${FQN_FORMAT}$`);
    /**
     * This class matches symbols given a "foo.bar.baz" name, where none of the
     * steps are instances of classes.
     *
     * Note that this isn't smart about subclasses and types: to write a check, we
     * strongly suggest finding the expected symbol in externs to find the object
     * name on which the symbol was initially defined.
     *
     * TODO(rjamet): add a file-based optional filter, since FQNs tell you where
     * your imported symbols were initially defined. That would let us be more
     * specific in matches (say, you want to ban the fromLiteral in foo.ts but not
     * the one from bar.ts).
     */
    class AbsoluteMatcher {
        /**
         * From a "path/to/file.ts:foo.bar.baz" or "foo.bar.baz" matcher
         * specification, builds a Matcher.
         */
        constructor(bannedName) {
            this.bannedName = bannedName;
            if (!bannedName.match(ABSOLUTE_RE)) {
                throw new Error('Malformed matcher selector.');
            }
            // JSConformance used to use a Foo.prototype.bar syntax for bar on
            // instances of Foo. TS doesn't surface the prototype part in the FQN, and
            // so you can't tell static `bar` on `foo` from the `bar` property/method
            // on `foo`. To avoid any confusion, throw there if we see `prototype` in
            // the spec: that way, it's obvious that you're not trying to match
            // properties.
            if (this.bannedName.match('.prototype.')) {
                throw new Error('Your pattern includes a .prototype, but the AbsoluteMatcher is ' +
                    'meant for non-object matches. Use the PropertyMatcher instead, or ' +
                    'the Property-based PatternKinds.');
            }
        }
        matches(n, tc) {
            // Get the symbol (or the one at the other end of this alias) that we're
            // looking at.
            const s = ast_tools_1.dealias(tc.getSymbolAtLocation(n), tc);
            if (!s) {
                ast_tools_1.debugLog(`cannot get symbol`);
                return false;
            }
            // The TS-provided FQN tells us the full identifier, and the origin file
            // in some circumstances.
            const fqn = tc.getFullyQualifiedName(s);
            ast_tools_1.debugLog(`got FQN ${fqn}`);
            // Name-based check
            if (!(fqn.endsWith('.' + this.bannedName) || fqn === this.bannedName)) {
                ast_tools_1.debugLog(`FQN ${fqn} doesn't match name ${this.bannedName}`);
                return false; // not a use of the symbols we want
            }
            // Check if it's part of a declaration or import. The check is cheap. If
            // we're looking for the uses of a symbol, we don't alert on the imports, to
            // avoid flooding users with warnings (as the actual use will be alerted)
            // and bad fixes.
            const p = n.parent;
            if (p && (ast_tools_1.isDeclaration(p) || ast_tools_1.isPartOfImportStatement(p))) {
                ast_tools_1.debugLog(`We don't flag symbol declarations`);
                return false;
            }
            // No file info in the FQN means it's not explicitly imported.
            // That must therefore be a local variable, or an ambient symbol
            // (and we only care about ambients here). Those could come from
            // either a declare somewhere, or one of the core libraries that
            // are loaded by default.
            if (!fqn.startsWith('"')) {
                // We need to trace things back, so get declarations of the symbol.
                const declarations = s.getDeclarations();
                if (!declarations) {
                    ast_tools_1.debugLog(`Symbol never declared?`);
                    return false;
                }
                if (!declarations.some(ast_tools_1.isAmbientDeclaration) &&
                    !declarations.some(ast_tools_1.isInStockLibraries)) {
                    ast_tools_1.debugLog(`Symbol neither ambient nor from the stock libraries`);
                    return false;
                }
            }
            ast_tools_1.debugLog(`all clear, report finding`);
            return true;
        }
    }
    exports.AbsoluteMatcher = AbsoluteMatcher;
    // TODO: Export the matched node kinds here.
    /**
     * This class matches a property access node, based on a property holder type
     * (through its name), i.e. a class, and a property name.
     *
     * The logic is voluntarily simple: if a matcher for `a.b` tests a `x.y` node,
     * it will return true if:
     * - `x` is of type `a` either directly (name-based) or through inheritance
     *   (ditto),
     * - and, textually, `y` === `b`.
     *
     * Note that the logic is different from TS's type system: this matcher doesn't
     * have any knowledge of structural typing.
     */
    class PropertyMatcher {
        constructor(bannedType, bannedProperty) {
            this.bannedType = bannedType;
            this.bannedProperty = bannedProperty;
        }
        static fromSpec(spec) {
            if (spec.indexOf('.prototype.') === -1) {
                throw new Error(`BANNED_PROPERTY expects a .prototype in your query.`);
            }
            const requestParser = /^([\w\d_.-]+)\.prototype\.([\w\d_.-]+)$/;
            const matches = requestParser.exec(spec);
            if (!matches) {
                throw new Error('Cannot understand the BannedProperty spec' + spec);
            }
            const [bannedType, bannedProperty] = matches.slice(1);
            return new PropertyMatcher(bannedType, bannedProperty);
        }
        /**
         * @param n The PropertyAccessExpression we're looking at.
         */
        matches(n, tc) {
            return n.name.text === this.bannedProperty &&
                this.typeMatches(tc.getTypeAtLocation(n.expression));
        }
        exactTypeMatches(inspectedType) {
            const typeSymbol = inspectedType.getSymbol() || false;
            return typeSymbol && typeSymbol.getName() === this.bannedType;
        }
        // TODO: Account for unknown types/ '?', and 'loose type matches', i.e. if the
        // actual type is a supertype of the prohibited type.
        typeMatches(inspectedType) {
            if (this.exactTypeMatches(inspectedType)) {
                return true;
            }
            const baseTypes = inspectedType.getBaseTypes() || [];
            return baseTypes.some(base => this.exactTypeMatches(base));
        }
    }
    exports.PropertyMatcher = PropertyMatcher;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0Y2hfc3ltYm9sLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZXJuYWwvYnVpbGRfYmF6ZWxfcnVsZXNfdHlwZXNjcmlwdC9pbnRlcm5hbC90c2V0c2UvdXRpbC9tYXRjaF9zeW1ib2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7SUFHQSwyQ0FBZ0k7SUFFaEksTUFBTSxvQkFBb0IsR0FBRyxhQUFhLENBQUM7SUFDM0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxvQkFBb0IsT0FBTyxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pFLDZEQUE2RDtJQUM3RCxNQUFNLFdBQVcsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFFbEQ7Ozs7Ozs7Ozs7OztPQVlHO0lBQ0gsTUFBYSxlQUFlO1FBQzFCOzs7V0FHRztRQUNILFlBQXFCLFVBQWtCO1lBQWxCLGVBQVUsR0FBVixVQUFVLENBQVE7WUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEVBQUU7Z0JBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQzthQUNoRDtZQUVELGtFQUFrRTtZQUNsRSwwRUFBMEU7WUFDMUUseUVBQXlFO1lBQ3pFLHlFQUF5RTtZQUN6RSxtRUFBbUU7WUFDbkUsY0FBYztZQUNkLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUU7Z0JBQ3hDLE1BQU0sSUFBSSxLQUFLLENBQ1gsaUVBQWlFO29CQUNqRSxvRUFBb0U7b0JBQ3BFLGtDQUFrQyxDQUFDLENBQUM7YUFDekM7UUFDSCxDQUFDO1FBRUQsT0FBTyxDQUFDLENBQVUsRUFBRSxFQUFrQjtZQUNwQyx3RUFBd0U7WUFDeEUsY0FBYztZQUNkLE1BQU0sQ0FBQyxHQUFHLG1CQUFPLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLENBQUMs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Q3pELENBQUM7UUFJRDs7V0FFRztRQUNILE9BQU8sQ0FBQyxDQUE4QixFQUFFLEVBQWtCO1lBQ3hELE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLGNBQWM7Z0JBQ3RDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFTyxnQkFBZ0IsQ0FBQyxhQUFzQjtZQUM3QyxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsU0FBUyxFQUFFLElBQUksS0FBSyxDQUFDO1lBQ3RELE9BQU8sVUFBVSxJQUFJLFVBQVUsQ0FBQyxPQUFPLEVBQUUsS0FBSyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ2hFLENBQUM7UUFFRCw4RUFBOEU7UUFDOUUscURBQXFEO1FBQzdDLFdBQVcsQ0FBQyxhQUFzQjtZQUN4QyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsRUFBRTtnQkFDeEMsT0FBTyxJQUFJLENBQUM7YUFDYjtZQUNELE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDckQsT0FBTyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0QsQ0FBQztLQUNGO0lBdENELDBDQXNDQyIsInNvdXJjZXNDb250ZW50IjpbIlxuXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7ZGVhbGlhcywgZGVidWdMb2csIGlzQW1iaWVudERlY2xhcmF0aW9uLCBpc0RlY2xhcmF0aW9uLCBpc0luU3RvY2tMaWJyYXJpZXMsIGlzUGFydE9mSW1wb3J0U3RhdGVtZW50fSBmcm9tICcuL2FzdF90b29scyc7XG5cbmNvbnN0IEpTX0lERU5USUZJRVJfRk9STUFUID0gJ1tcXFxcd1xcXFxkXy1dKyc7XG5jb25zdCBGUU5fRk9STUFUID0gYCgke0pTX0lERU5USUZJRVJfRk9STUFUfVxcLikqJHtKU19JREVOVElGSUVSX0ZPUk1BVH1gO1xuLy8gQSBmcW4gbWFkZSBvdXQgb2YgYSBkb3Qtc2VwYXJhdGVkIGNoYWluIG9mIEpTIGlkZW50aWZpZXJzLlxuY29uc3QgQUJTT0xVVEVfUkUgPSBuZXcgUmVnRXhwKGBeJHtGUU5fRk9STUFUfSRgKTtcblxuLyoqXG4gKiBUaGlzIGNsYXNzIG1hdGNoZXMgc3ltYm9scyBnaXZlbiBhIFwiZm9vLmJhci5iYXpcIiBuYW1lLCB3aGVyZSBub25lIG9mIHRoZVxuICogc3RlcHMgYXJlIGluc3RhbmNlcyBvZiBjbGFzc2VzLlxuICpcbiAqIE5vdGUgdGhhdCB0aGlzIGlzbid0IHNtYXJ0IGFib3V0IHN1YmNsYXNzZXMgYW5kIHR5cGVzOiB0byB3cml0ZSBhIGNoZWNrLCB3ZVxuICogc3Ryb25nbHkgc3VnZ2VzdCBmaW5kaW5nIHRoZSBleHBlY3RlZCBzeW1ib2wgaW4gZXh0ZXJucyB0byBmaW5kIHRoZSBvYmplY3RcbiAqIG5hbWUgb24gd2hpY2ggdGhlIHN5bWJvbCB3YXMgaW5pdGlhbGx5IGRlZmluZWQuXG4gKlxuICogVE9ETyhyamFtZXQpOiBhZGQgYSBmaWxlLWJhc2VkIG9wdGlvbmFsIGZpbHRlciwgc2luY2UgRlFOcyB0ZWxsIHlvdSB3aGVyZVxuICogeW91ciBpbXBvcnRlZCBzeW1ib2xzIHdlcmUgaW5pdGlhbGx5IGRlZmluZWQuIFRoYXQgd291bGQgbGV0IHVzIGJlIG1vcmVcbiAqIHNwZWNpZmljIGluIG1hdGNoZXMgKHNheSwgeW91IHdhbnQgdG8gYmFuIHRoZSBmcm9tTGl0ZXJhbCBpbiBmb28udHMgYnV0IG5vdFxuICogdGhlIG9uZSBmcm9tIGJhci50cykuXG4gKi9cbmV4cG9ydCBjbGFzcyBBYnNvbHV0ZU1hdGNoZXIge1xuICAvKipcbiAgICogRnJvbSBhIFwicGF0aC90by9maWxlLnRzOmZvby5iYXIuYmF6XCIgb3IgXCJmb28uYmFyLmJhelwiIG1hdGNoZXJcbiAgICogc3BlY2lmaWNhdGlvbiwgYnVpbGRzIGEgTWF0Y2hlci5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGJhbm5lZE5hbWU6IHN0cmluZykge1xuICAgIGlmICghYmFubmVkTmFtZS5tYXRjaChBQlNPTFVURV9SRSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWFsZm9ybWVkIG1hdGNoZXIgc2VsZWN0b3IuJyk7XG4gICAgfVxuXG4gICAgLy8gSlNDb25mb3JtYW5jZSB1c2VkIHRvIHVzZSBhIEZvby5wcm90b3R5cGUuYmFyIHN5bnRheCBmb3IgYmFyIG9uXG4gICAgLy8gaW5zdGFuY2VzIG9mIEZvby4gVFMgZG9lc24ndCBzdXJmYWNlIHRoZSBwcm90b3R5cGUgcGFydCBpbiB0aGUgRlFOLCBhbmRcbiAgICAvLyBzbyB5b3UgY2FuJ3QgdGVsbCBzdGF0aWMgYGJhcmAgb24gYGZvb2AgZnJvbSB0aGUgYGJhcmAgcHJvcGVydHkvbWV0aG9kXG4gICAgLy8gb24gYGZvb2AuIFRvIGF2b2lkIGFueSBjb25mdXNpb24sIHRocm93IHRoZXJlIGlmIHdlIHNlZSBgcHJvdG90eXBlYCBpblxuICAgIC8vIHRoZSBzcGVjOiB0aGF0IHdheSwgaXQncyBvYnZpb3VzIHRoYXQgeW91J3JlIG5vdCB0cnlpbmcgdG8gbWF0Y2hcbiAgICAvLyBwcm9wZXJ0aWVzLlxuICAgIGlmICh0aGlzLmJhbm5lZE5hbWUubWF0Y2goJy5wcm90b3R5cGUuJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnWW91ciBwYXR0ZXJuIGluY2x1ZGVzIGEgLnByb3RvdHlwZSwgYnV0IHRoZSBBYnNvbHV0ZU1hdGNoZXIgaXMgJyArXG4gICAgICAgICAgJ21lYW50IGZvciBub24tb2JqZWN0IG1hdGNoZXMuIFVzZSB0aGUgUHJvcGVydHlNYXRjaGVyIGluc3RlYWQsIG9yICcgK1xuICAgICAgICAgICd0aGUgUHJvcGVydHktYmFzZWQgUGF0dGVybktpbmRzLicpO1xuICAgIH1cbiAgfVxuXG4gIG1hdGNoZXMobjogdHMuTm9kZSwgdGM6IHRzLlR5cGVDaGVja2VyKTogYm9vbGVhbiB7XG4gICAgLy8gR2V0IHRoZSBzeW1ib2wgKG9yIHRoZSBvbmUgYXQgdGhlIG90aGVyIGVuZCBvZiB0aGlzIGFsaWFzKSB0aGF0IHdlJ3JlXG4gICAgLy8gbG9va2luZyBhdC5cbiAgICBjb25zdCBzID0gZGVhbGlhcyh0Yy5nZXRTeW1ib2xBdExvY2F0aW9uKG4pLCB0Yyk7XG4gICAgaWYgKCFzKSB7XG4gICAgICBkZWJ1Z0xvZyhgY2Fubm90IGdldCBzeW1ib2xgKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBUaGUgVFMtcHJvdmlkZWQgRlFOIHRlbGxzIHVzIHRoZSBmdWxsIGlkZW50aWZpZXIsIGFuZCB0aGUgb3JpZ2luIGZpbGVcbiAgICAvLyBpbiBzb21lIGNpcmN1bXN0YW5jZXMuXG4gICAgY29uc3QgZnFuID0gdGMuZ2V0RnVsbHlRdWFsaWZpZWROYW1lKHMpO1xuICAgIGRlYnVnTG9nKGBnb3QgRlFOICR7ZnFufWApO1xuXG4gICAgLy8gTmFtZS1iYXNlZCBjaGVja1xuICAgIGlmICghKGZxbi5lbmRzV2l0aCgnLicgKyB0aGlzLmJhbm5lZE5hbWUpIHx8IGZxbiA9PT0gdGhpcy5iYW5uZWROYW1lKSkge1xuICAgICAgZGVidWdMb2coYEZRTiAke2Zxbn0gZG9lc24ndCBtYXRjaCBuYW1lICR7dGhpcy5iYW5uZWROYW1lfWApO1xuICAgICAgcmV0dXJuIGZhbHNlOyAgLy8gbm90IGEgdXNlIG9mIHRoZSBzeW1ib2xzIHdlIHdhbnRcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBpdCdzIHBhcnQgb2YgYSBkZWNsYXJhdGlvbiBvciBpbXBvcnQuIFRoZSBjaGVjayBpcyBjaGVhcC4gSWZcbiAgICAvLyB3ZSdyZSBsb29raW5nIGZvciB0aGUgdXNlcyBvZiBhIHN5bWJvbCwgd2UgZG9uJ3QgYWxlcnQgb24gdGhlIGltcG9ydHMsIHRvXG4gICAgLy8gYXZvaWQgZmxvb2RpbmcgdXNlcnMgd2l0aCB3YXJuaW5ncyAoYXMgdGhlIGFjdHVhbCB1c2Ugd2lsbCBiZSBhbGVydGVkKVxuICAgIC8vIGFuZCBiYWQgZml4ZXMuXG4gICAgY29uc3QgcCA9IG4ucGFyZW50O1xuICAgIGlmIChwICYmIChpc0RlY2xhcmF0aW9uKHApIHx8IGlzUGFydE9mSW1wb3J0U3RhdGVtZW50KHApKSkge1xuICAgICAgZGVidWdMb2coYFdlIGRvbid0IGZsYWcgc3ltYm9sIGRlY2xhcmF0aW9uc2ApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIE5vIGZpbGUgaW5mbyBpbiB0aGUgRlFOIG1lYW5zIGl0J3Mgbm90IGV4cGxpY2l0bHkgaW1wb3J0ZWQuXG4gICAgLy8gVGhhdCBtdXN0IHRoZXJlZm9yZSBiZSBhIGxvY2FsIHZhcmlhYmxlLCBvciBhbiBhbWJpZW50IHN5bWJvbFxuICAgIC8vIChhbmQgd2Ugb25seSBjYXJlIGFib3V0IGFtYmllbnRzIGhlcmUpLiBUaG9zZSBjb3VsZCBjb21lIGZyb21cbiAgICAvLyBlaXRoZXIgYSBkZWNsYXJlIHNvbWV3aGVyZSwgb3Igb25lIG9mIHRoZSBjb3JlIGxpYnJhcmllcyB0aGF0XG4gICAgLy8gYXJlIGxvYWRlZCBieSBkZWZhdWx0LlxuICAgIGlmICghZnFuLnN0YXJ0c1dpdGgoJ1wiJykpIHtcbiAgICAgIC8vIFdlIG5lZWQgdG8gdHJhY2UgdGhpbmdzIGJhY2ssIHNvIGdldCBkZWNsYXJhdGlvbnMgb2YgdGhlIHN5bWJvbC5cbiAgICAgIGNvbnN0IGRlY2xhcmF0aW9ucyA9IHMuZ2V0RGVjbGFyYXRpb25zKCk7XG4gICAgICBpZiAoIWRlY2xhcmF0aW9ucykge1xuICAgICAgICBkZWJ1Z0xvZyhgU3ltYm9sIG5ldmVyIGRlY2xhcmVkP2ApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoIWRlY2xhcmF0aW9ucy5zb21lKGlzQW1iaWVudERlY2xhcmF0aW9uKSAmJlxuICAgICAgICAgICFkZWNsYXJhdGlvbnMuc29tZShpc0luU3RvY2tMaWJyYXJpZXMpKSB7XG4gICAgICAgIGRlYnVnTG9nKGBTeW1ib2wgbmVpdGhlciBhbWJpZW50IG5vciBmcm9tIHRoZSBzdG9jayBsaWJyYXJpZXNgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGRlYnVnTG9nKGBhbGwgY2xlYXIsIHJlcG9ydCBmaW5kaW5nYCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuLy8gVE9ETzogRXhwb3J0IHRoZSBtYXRjaGVkIG5vZGUga2luZHMgaGVyZS5cbi8qKlxuICogVGhpcyBjbGFzcyBtYXRjaGVzIGEgcHJvcGVydHkgYWNjZXNzIG5vZGUsIGJhc2VkIG9uIGEgcHJvcGVydHkgaG9sZGVyIHR5cGVcbiAqICh0aHJvdWdoIGl0cyBuYW1lKSwgaS5lLiBhIGNsYXNzLCBhbmQgYSBwcm9wZXJ0eSBuYW1lLlxuICpcbiAqIFRoZSBsb2dpYyBpcyB2b2x1bnRhcmlseSBzaW1wbGU6IGlmIGEgbWF0Y2hlciBmb3IgYGEuYmAgdGVzdHMgYSBgeC55YCBub2RlLFxuICogaXQgd2lsbCByZXR1cm4gdHJ1ZSBpZjpcbiAqIC0gYHhgIGlzIG9mIHR5cGUgYGFgIGVpdGhlciBkaXJlY3RseSAobmFtZS1iYXNlZCkgb3IgdGhyb3VnaCBpbmhlcml0YW5jZVxuICogICAoZGl0dG8pLFxuICogLSBhbmQsIHRleHR1YWxseSwgYHlgID09PSBgYmAuXG4gKlxuICogTm90ZSB0aGF0IHRoZSBsb2dpYyBpcyBkaWZmZXJlbnQgZnJvbSBUUydzIHR5cGUgc3lzdGVtOiB0aGlzIG1hdGNoZXIgZG9lc24ndFxuICogaGF2ZSBhbnkga25vd2xlZGdlIG9mIHN0cnVjdHVyYWwgdHlwaW5nLlxuICovXG5leHBvcnQgY2xhc3MgUHJvcGVydHlNYXRjaGVyIHtcbiAgc3RhdGljIGZyb21TcGVjKHNwZWM6IHN0cmluZyk6IFByb3BlcnR5TWF0Y2hlciB7XG4gICAgaWYgKHNwZWMuaW5kZXhPZignLnByb3RvdHlwZS4nKSA9PT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQkFOTkVEX1BST1BFUlRZIGV4cGVjdHMgYSAucHJvdG90eXBlIGluIHlvdXIgcXVlcnkuYCk7XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RQYXJzZXIgPSAvXihbXFx3XFxkXy4tXSspXFwucHJvdG90eXBlXFwuKFtcXHdcXGRfLi1dKykkLztcbiAgICBjb25zdCBtYXRjaGVzID0gcmVxdWVzdFBhcnNlci5leGVjKHNwZWMpO1xuICAgIGlmICghbWF0Y2hlcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdW5kZXJzdGFuZCB0aGUgQmFubmVkUHJvcGVydHkgc3BlYycgKyBzcGVjKTtcbiAgICB9XG4gICAgY29uc3QgW2Jhbm5lZFR5cGUsIGJhbm5lZFByb3BlcnR5XSA9IG1hdGNoZXMuc2xpY2UoMSk7XG4gICAgcmV0dXJuIG5ldyBQcm9wZXJ0eU1hdGNoZXIoYmFubmVkVHlwZSwgYmFubmVkUHJvcGVydHkpO1xuICB9XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgYmFubmVkVHlwZTogc3RyaW5nLCByZWFkb25seSBiYW5uZWRQcm9wZXJ0eTogc3RyaW5nKSB7fVxuXG4gIC8qKlxuICAgKiBAcGFyYW0gbiBUaGUgUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uIHdlJ3JlIGxvb2tpbmcgYXQuXG4gICAqL1xuICBtYXRjaGVzKG46IHRzLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiwgdGM6IHRzLlR5cGVDaGVja2VyKSB7XG4gICAgcmV0dXJuIG4ubmFtZS50ZXh0ID09PSB0aGlzLmJhbm5lZFByb3BlcnR5ICYmXG4gICAgICAgIHRoaXMudHlwZU1hdGNoZXModGMuZ2V0VHlwZUF0TG9jYXRpb24obi5leHByZXNzaW9uKSk7XG4gIH1cblxuICBwcml2YXRlIGV4YWN0VHlwZU1hdGNoZXMoaW5zcGVjdGVkVHlwZTogdHMuVHlwZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHR5cGVTeW1ib2wgPSBpbnNwZWN0ZWRUeXBlLmdldFN5bWJvbCgpIHx8IGZhbHNlO1xuICAgIHJldHVybiB0eXBlU3ltYm9sICYmIHR5cGVTeW1ib2wuZ2V0TmFtZSgpID09PSB0aGlzLmJhbm5lZFR5cGU7XG4gIH1cblxuICAvLyBUT0RPOiBBY2NvdW50IGZvciB1bmtub3duIHR5cGVzLyAnPycsIGFuZCAnbG9vc2UgdHlwZSBtYXRjaGVzJywgaS5lLiBpZiB0aGVcbiAgLy8gYWN0dWFsIHR5cGUgaXMgYSBzdXBlcnR5cGUgb2YgdGhlIHByb2hpYml0ZWQgdHlwZS5cbiAgcHJpdmF0ZSB0eXBlTWF0Y2hlcyhpbnNwZWN0ZWRUeXBlOiB0cy5UeXBlKTogYm9vbGVhbiB7XG4gICAgaWYgKHRoaXMuZXhhY3RUeXBlTWF0Y2hlcyhpbnNwZWN0ZWRUeXBlKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IGJhc2VUeXBlcyA9IGluc3BlY3RlZFR5cGUuZ2V0QmFzZVR5cGVzKCkgfHwgW107XG4gICAgcmV0dXJuIGJhc2VUeXBlcy5zb21lKGJhc2UgPT4gdGhpcy5leGFjdFR5cGVNYXRjaGVzKGJhc2UpKTtcbiAgfVxufVxuIl19