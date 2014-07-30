var assert = require("assert");
var types = require("./types");
var n = types.namedTypes;
var b = types.builders;
var isObject = types.builtInTypes.object;
var isArray = types.builtInTypes.array;
var isFunction = types.builtInTypes.function;
var Patcher = require("./patcher").Patcher;
var normalizeOptions = require("./options").normalize;
var fromString = require("./lines").fromString;
var addComments = require("./comments").add;
var hasOwn = Object.prototype.hasOwnProperty;

exports.parse = function parse(source, options) {
    options = normalizeOptions(options);

    var lines = fromString(source, options);

    var sourceWithoutTabs = lines.toString({
        tabWidth: options.tabWidth,
        reuseWhitespace: false,
        useTabs: false
    });

    var pure = options.esprima.parse(sourceWithoutTabs, {
        loc: true,
        range: options.range,
        comment: true,
        tolerant: options.tolerant
    });

    new LocationFixer(lines).fix(pure);

    addComments(pure, lines);

    // In order to ensure we reprint leading and trailing program
    // comments, wrap the original Program node with a File node.
    pure = b.file(pure);
    pure.loc = {
        lines: lines,
        indent: 0,
        start: lines.firstPos(),
        end: lines.lastPos()
    };

    // Return a copy of the original AST so that any changes made may be
    // compared to the original.
    return copyAst(pure);
};

function LocationFixer(lines) {
    assert.ok(this instanceof LocationFixer);
    this.lines = lines;
    this.indent = 0;
}

var LFp = LocationFixer.prototype;

LFp.fix = function(node) {
    if (isArray.check(node)) {
        node.forEach(this.fix, this);
        return;
    }

    if (!isObject.check(node)) {
        return;
    }

    var lines = this.lines;
    var loc = node && node.loc;
    var start = loc && loc.start;
    var end = loc && loc.end;
    var oldIndent = this.indent;
    var newIndent = oldIndent;

    if (start) {
        start.line = Math.max(start.line, 1);

        if (lines.isPrecededOnlyByWhitespace(start)) {
            // The indent returned by lines.getIndentAt is the column of
            // the first non-space character in the line, but start.column
            // may fall before that character, as when a file begins with
            // whitespace but its start.column nevertheless must be 0.
            assert.ok(start.column <= lines.getIndentAt(start.line));
            newIndent = this.indent = start.column;
        }
    }

    var names = types.getFieldNames(node);
    for (var i = 0, len = names.length; i < len; ++i) {
        this.fix(node[names[i]]);
    }

    // Restore original value of this.indent after the recursive call.
    this.indent = oldIndent;

    if (loc) {
        loc.lines = lines;
        loc.indent = newIndent;
    }

    if (end) {
        end.line = Math.max(end.line, 1);

        var pos = {
            line: end.line,
            column: end.column
        };

        // Negative columns might indicate an Esprima bug?
        // For now, treat them as reverse indices, a la Python.
        if (pos.column < 0)
            pos.column += lines.getLineLength(pos.line);

        while (lines.prevPos(pos)) {
            if (/\S/.test(lines.charAt(pos))) {
                assert.ok(lines.nextPos(pos));

                end.line = pos.line;
                end.column = pos.column;

                break;
            }
        }
    }

    if ((n.MethodDefinition && n.MethodDefinition.check(node)) ||
        (n.Property.check(node) && (node.method || node.shorthand))) {
        // If the node is a MethodDefinition or a .method or .shorthand
        // Property, then the location information stored in
        // node.value.loc is very likely untrustworthy (just the {body}
        // part of a method, or nothing in the case of shorthand
        // properties), so we null out that information to prevent
        // accidental reuse of bogus source code during reprinting.
        node.value.loc = null;
    }
};

function copyAst(node) {
    if (typeof node !== "object") {
        return node;
    }

    if (isObject.check(node)) {
        var copy = Object.create(Object.getPrototypeOf(node), {
            original: { // Provide a link from the copy to the original.
                value: node,
                configurable: false,
                enumerable: false,
                writable: true
            }
        });

        for (var key in node) {
            var val = node[key];
            if (val && key === "loc") {
                copy.loc = {
                    start: { line: val.start.line, column: val.start.column },
                    end: { line: val.end.line, column: val.end.column }
                };
            } else if (hasOwn.call(node, key)) {
                copy[key] = copyAst(val);
            }
        }

        return copy;
    }

    if (isArray.check(node)) {
        return node.map(copyAst);
    }

    return node;
}
