var assert = require("assert");
var linesModule = require("./lines");
var Syntax = require("./types").Syntax;
var util = require("./util");
var Path = require("./path").Path;

function Patcher(lines) {
    assert.ok(this instanceof Patcher);
    assert.ok(lines instanceof linesModule.Lines);

    var self = this,
        replacements = [];

    self.replace = function(loc, lines) {
        if (typeof lines === "string")
            lines = linesModule.fromString(lines);

        replacements.push({
            lines: lines,
            start: loc.start,
            end: loc.end
        });
    };

    self.get = function(loc) {
        // If no location is provided, return the complete Lines object.
        loc = loc || {
            start: { line: 1, column: 0 },
            end: { line: lines.length,
                   column: lines.getLineLength(lines.length) }
        };

        var sliceFrom = loc.start,
            toConcat = [];

        function pushSlice(from, to) {
            assert.ok(cmpPos(from, to) <= 0);
            toConcat.push(lines.slice(from, to));
        }

        replacements.sort(function(a, b) {
            return cmpPos(a.start, b.start);
        }).forEach(function(rep) {
            if (cmpPos(sliceFrom, rep.start) > 0) {
                // Ignore nested replacement ranges.
            } else {
                pushSlice(sliceFrom, rep.start);
                toConcat.push(rep.lines);
                sliceFrom = rep.end;
            }
        });

        pushSlice(sliceFrom, loc.end);

        return linesModule.concat(toConcat);
    };
}
exports.Patcher = Patcher;

// TODO unify this with other cmpPos functions
function cmpPos(a, b) {
    return (a.line - b.line) || (a.column - b.column);
}

exports.getReprinter = function(node) {
    var origPath = node.originalPath;
    var orig = origPath && origPath.node;
    var origLoc = orig && orig.loc;
    var lines = origLoc && origLoc.lines;
    var reprints = [];

    if (!lines || !findReprints(orig, node, reprints))
        return;

    function getIndent(node) {
        // TODO Improve this.
        return lines.getIndentAt(node.loc.start.line);
    }

    return function(print) {
        var patcher = new Patcher(lines);

        reprints.forEach(function(reprint) {
            var old = reprint.oldNode;
            patcher.replace(
                old.loc,
                // TODO We shouldn't have to create a new Path here.
                print(new Path(reprint.newNode)).indentTail(
                    getIndent(old)));
        });

        return patcher.get(origLoc).indentTail(-getIndent(orig));
    };
};

function findReprints(orig, node, reprints) {
    assert.ok(orig);
    assert.deepEqual(reprints, []);

    var canReprint = findChildReprints(orig, node, reprints);

    if (!canReprint) {
        // Make absolutely sure the calling code does not attempt to reprint
        // any nodes.
        reprints.length = 0;
    }

    return canReprint;
}

function findAnyReprints(a, b, reprints) {
    if (a === b)
        return true;

    if (a instanceof Array)
        return findArrayReprints(a, b, reprints);

    if (typeof a === "object")
        return findObjectReprints(a, b, reprints);

    return false;
}

function findArrayReprints(a, b, reprints) {
    assert.ok(a instanceof Array);
    var len = a.length;

    if (!(b instanceof Array &&
          b.length === len))
        return false;

    for (var i = 0; i < len; ++i)
        if (!findAnyReprints(a[i], b[i], reprints))
            return false;

    return true;
}

function findObjectReprints(a, b, reprints) {
    assert.strictEqual(typeof a, "object");
    if (!a || !b || typeof b !== "object")
        return false;

    var childReprints = [];
    var canReprintChildren = findChildReprints(a, b, childReprints);

    if (a.type in Syntax) {
        // TODO Decompose this check: if (!printTheSame(a, b))
        if (a.type !== b.type)
            return false;

        if (!canReprintChildren) {
            reprints.push({
                oldNode: a,
                newNode: b
            });

            return true;
        }
    }

    reprints.push.apply(reprints, childReprints);
    return canReprintChildren;
}

function findChildReprints(a, b, reprints) {
    assert.strictEqual(typeof a, "object");
    assert.strictEqual(typeof b, "object");

    for (var k in util.getUnionOfKeys(a, b)) {
        if (k === "loc")
            continue;

        if (!findAnyReprints(a[k], b[k], reprints))
            return false;
    }

    return true;
}
