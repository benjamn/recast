var assert = require("assert");
var linesModule = require("./lines");
var n = require("./types").namedTypes;
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

exports.getReprinter = function(path) {
    assert.ok(path instanceof Path);

    var orig = path.node.original;
    var origLoc = orig && orig.loc;
    var lines = origLoc && origLoc.lines;
    var reprints = [];

    if (!lines || !findReprints(path, reprints))
        return;

    return function(print) {
        var patcher = new Patcher(lines);

        reprints.forEach(function(reprint) {
            var old = reprint.oldNode;
            patcher.replace(
                old.loc,
                print(reprint.newPath).indentTail(
                    getIndent(old)));
        });

        return patcher.get(origLoc).indentTail(-getIndent(orig));
    };
};

// Get the indentation of the first ancestor node on a line with nothing
// before it but whitespace.
function getIndent(orig) {
    var naiveIndent = orig.loc.lines.getIndentAt(
        orig.loc.start.line);

    for (var loc, start, lines;
         orig &&
         (loc = orig.loc) &&
         (start = loc.start) &&
         (lines = loc.lines);
         orig = orig.parentNode)
    {
        if (lines.isPrecededOnlyByWhitespace(start)) {
            var indent = lines.getIndentAt(start.line);
            assert.strictEqual(indent, start.column);
            return indent;
        }
    }

    return naiveIndent;
}

function findReprints(path, reprints) {
    var node = path.node;
    assert.ok(node.original);
    assert.deepEqual(reprints, []);

    var canReprint = findChildReprints(path, node, node.original, reprints);

    if (!canReprint) {
        // Make absolutely sure the calling code does not attempt to reprint
        // any nodes.
        reprints.length = 0;
    }

    return canReprint;
}

function findAnyReprints(path, newNode, oldNode, reprints) {
    if (newNode === oldNode)
        return true;

    if (newNode instanceof Array)
        return findArrayReprints(path, newNode, oldNode, reprints);

    if (typeof newNode === "object")
        return findObjectReprints(path, newNode, oldNode, reprints);

    return false;
}

function findArrayReprints(path, newNode, oldNode, reprints) {
    assert.ok(newNode instanceof Array);
    var len = newNode.length;

    if (!(oldNode instanceof Array &&
          oldNode.length === len))
        return false;

    for (var i = 0; i < len; ++i)
        if (!findAnyReprints(path, newNode[i], oldNode[i], reprints))
            return false;

    return true;
}

function findObjectReprints(path, newNode, oldNode, reprints) {
    assert.strictEqual(typeof newNode, "object");
    if (!newNode || !oldNode || typeof oldNode !== "object")
        return false;

    path = path.cons(newNode);
    var childReprints = [];
    var canReprintChildren = findChildReprints(path, newNode, oldNode, childReprints);

    if (n.Node.check(newNode)) {
        if (n.Statement.check(oldNode) &&
            n.Statement.check(newNode))
        {
            // If both nodes are Statements, then they should print the
            // same way as far as the surrounding code is concerned.
        } else if (newNode.type !== oldNode.type) {
            // If at least one of the nodes is not a Statement and their
            // types are different, conservatively assume they do not
            // necessarily print the same.
            return false;
        }

        if (!canReprintChildren ||
            // Require reprinting if additional parentheses are needed.
            (path.needsParens() && !hasParens(oldNode)))
        {
            reprints.push({
                newPath: path,
                oldNode: oldNode
            });

            return true;
        }
    }

    reprints.push.apply(reprints, childReprints);
    return canReprintChildren;
}

function hasParens(oldNode) {
    var loc = oldNode.loc;
    var lines = loc && loc.lines;

    if (lines) {
        // This logic can technically be fooled if the node has
        // parentheses but there are comments intervening between the
        // parentheses and the node. In such cases the node will be
        // harmlessly wrapped in an additional layer of parentheses.
        var pos = lines.lastNonSpacePos(loc.start);
        if (pos && lines.charAt(pos) === "(") {
            pos = lines.firstNonSpacePos(loc.end);
            if (pos && lines.charAt(pos) === ")")
                return true;
        }
    }

    return false;
}

function findChildReprints(path, newNode, oldNode, reprints) {
    assert.strictEqual(path.node, newNode);
    assert.strictEqual(typeof newNode, "object");
    assert.strictEqual(typeof oldNode, "object");

    for (var k in util.getUnionOfKeys(newNode, oldNode)) {
        if (k === "loc")
            continue;

        if (!findAnyReprints(path, newNode[k], oldNode[k], reprints))
            return false;
    }

    return true;
}
