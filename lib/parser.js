var assert = require("assert");
var types = require("./types");
var n = types.namedTypes;
var b = types.builders;
var Patcher = require("./patcher").Patcher;
var Visitor = require("./visitor").Visitor;
var normalizeOptions = require("./options").normalize;
var Path = require("./path").Path;

exports.parse = function(source, options) {
    options = normalizeOptions(options);

    var lines = require("./lines").fromString(
        source, options.tabWidth);

    var pure = options.esprima.parse(lines.toString({
        tabWidth: options.tabWidth,
        reuseWhitespace: false,
        useTabs: false
    }), {
        loc: true,
        comment: true
    });

    new LocationFixer(lines).visit(pure);

    require("./comments").add(pure);

    // In order to ensure we reprint leading and trailing program
    // comments, wrap the original Program node with a File node.
    pure = b.file(pure);
    pure.loc = {
        lines: lines,
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
    },

    genericVisit: function(node) {
        this._super(node);

        var loc = node && node.loc,
            start = loc && loc.start,
            end = loc && loc.end;

        if (loc) {
            Object.defineProperty(loc, "lines", {
                value: this.lines
            });
        }

        if (start) {
            start.line = Math.max(start.line, 1);
        }

        if (end) {
            end.line = Math.max(end.line, 1);

            var lines = loc.lines, pos = {
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

function copyAst(node, parentPath) {
    if (typeof node === "object" &&
        node !== null)
    {
        if (node instanceof RegExp)
            return node;

        if (node instanceof Array) {
            return node.map(function(child) {
                return copyAst(child, parentPath);
            });
        }

        var copy = {};
        var path = n.Node.check(node)
            ? new Path(node, parentPath)
            : parentPath;

        for (var key in node) {
            if (node.hasOwnProperty(key)) {
                var val = copyAst(node[key], path);
                if (typeof val !== "function")
                    copy[key] = val;
            }
        }

        Object.defineProperty(copy, "originalPath", {
            value: path,
            configurable: false,
            enumerable: false,
            writable: true
        });

        return copy;
    }

    return node;
}
