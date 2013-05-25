var assert = require("assert"),
    Syntax = require("./types").Syntax,
    Patcher = require("./patcher").Patcher,
    Visitor = require("./visitor").Visitor,
    normalizeOptions = require("./options").normalize;

function Parser(source, options) {
    assert.ok(this instanceof Parser);

    options = normalizeOptions(options);

    var self = this;

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
    assert.strictEqual(pure.type, Syntax.Program);
    pure = {
        type: Syntax.File,
        program: pure,
        loc: { lines: lines,
               start: lines.firstPos(),
               end: lines.lastPos() }
    };

    self.getAst = function() {
        // Return a copy of the original AST so that any changes made may
        // be compared to the original.
        return copyAst(pure);
    };
}
exports.Parser = Parser;

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

function copyAst(node) {
    if (typeof node === "object" &&
        node !== null)
    {
        if (node instanceof RegExp)
            return node;

        if (node instanceof Array)
            return node.map(copyAst);

        var copy = {},
            key,
            val;

        for (key in node) {
            if (node.hasOwnProperty(key)) {
                val = copyAst(node[key]);
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
