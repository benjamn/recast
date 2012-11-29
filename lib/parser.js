var assert = require("assert"),
    Syntax = require("./syntax"),
    Patcher = require("./patcher").Patcher,
    Visitor = require("./visitor").Visitor,
    normalizeOptions = require("./options").normalize;

function Parser(source, options) {
    assert.ok(this instanceof Parser);

    options = normalizeOptions(options);

    var self = this;

    var lines = require("./lines").fromString(
        source, options.tabWidth);

    var pure = require("esprima").parse(lines.toString({
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
        loc: { start: lines.firstPos(),
               end: lines.lastPos() }
    };

    self.getAst = function() {
        // Return a copy of the original AST so that any changes made may
        // be compared to the original.
        return copyAst(pure);
    };

    function getIndent(node) {
        // TODO Improve this.
        return lines.getIndentAt(node.loc.start.line);
    }

    self.getReprinter = function(node) {
        var orig = node.original,
            reprints = [];

        if (!orig ||
            !traverse(orig, node, reprints, true))
            return;

        return function(print) {
            var patcher = new Patcher(lines);

            reprints.forEach(function(reprint) {
                var old = reprint.oldNode;
                patcher.replace(
                    old.loc,
                    print(reprint.newNode).indentTail(
                        getIndent(old)));
            });

            return patcher.get(orig.loc).indentTail(-getIndent(orig));
        };
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
            end = loc && loc.end;

        if (end) {
            var lines = this.lines, pos = {
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

function traverse(a, b, reprints, ignoreFirst) {
    if (a === b)
        return true;

    if (a instanceof Array) {
        assert.ok(b instanceof Array);

        if (a.length !== b.length)
            return false;

        for (var i = 0, len = a.length; i < len; ++i)
            if (!traverse(a[i], b[i], reprints))
                return false;

    } else if (typeof a === "object") {
        assert.ok(typeof b === "object");

        if (a === null ||
            b === null)
            return false;

        if (a.type in Syntax) {
            assert.ok(b.type in Syntax);

            // TODO Decompose this check: if (!printTheSame(a, b))
            if (a.type !== b.type)
                return false;

            if (!ignoreFirst) {
                reprints.push({
                    oldNode: a,
                    newNode: b
                });

                return true;
            }
        }

        for (var k in getUnionOfKeys(a, b)) {
            if (k === "loc")
                continue;

            if (!traverse(a[k], b[k], reprints))
                return false;
        }

    } else {
        return false;
    }

    return true;
}

function getUnionOfKeys(obj) {
    for (var i = 0, key,
             result = {},
             objs = arguments,
             argc = objs.length;
         i < argc;
         i += 1)
    {
        obj = objs[i];
        for (key in obj)
            if (obj.hasOwnProperty(key))
                result[key] = true;
    }
    return result;
}
