var assert = require("assert");
var types = require("./types");
var n = types.namedTypes;
var b = types.builders;
var Patcher = require("./patcher").Patcher;
var Visitor = require("./visitor").Visitor;
var normalizeOptions = require("./options").normalize;

exports.parse = function(source, options) {
    options = normalizeOptions(options);

    var lines = require("./lines").fromString(source, options);

    var pure = options.esprima.parse(lines.toString({
        tabWidth: options.tabWidth,
        reuseWhitespace: false,
        useTabs: false
    }), {
        loc: true,
        range: options.range,
        comment: true,
        tolerant: options.tolerant
    });

    new LocationFixer(lines).visit(pure);

    require("./comments").add(pure, lines);

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

var LocationFixer = Visitor.extend({
    init: function(lines) {
        this.lines = lines;
        this.indent = 0;
    },

    genericVisit: function(node) {
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

        this._super(node);

        // Restore original value of this.indent after the recursive call.
        this.indent = oldIndent;

        if (loc) {
            Object.defineProperties(loc, {
                lines: { value: lines },
                indent: { value: newIndent }
            });
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
    }
});

function copyAst(node, parent) {
    if (typeof node === "object" &&
        node !== null)
    {
        if (node instanceof RegExp)
            return node;

        if (node instanceof Array) {
            return node.map(function(child) {
                return copyAst(child, parent);
            });
        }

        var copy = {},
            key,
            val;

        for (key in node) {
            if (node.hasOwnProperty(key)) {
                val = copyAst(node[key], node);
                if (typeof val !== "function")
                    copy[key] = val;
            }
        }

        // Provide a link from the copy to the original.
        Object.defineProperty(copy, "original", {
            value: node,
            configurable: false,
            enumerable: false,
            writable: true,
        });

        return copy;
    }

    return node;
}
