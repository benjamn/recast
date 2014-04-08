var assert = require("assert");
var linesModule = require("./lines");
var typesModule = require("./types");
var getFieldValue = typesModule.getFieldValue;
var Node = typesModule.namedTypes.Node;
var util = require("./util");
var comparePos = util.comparePos;
var types = require("./types");
var NodePath = types.NodePath;
var isObject = types.builtInTypes.object;
var isArray = types.builtInTypes.array;
var isString = types.builtInTypes.string;

function Patcher(lines) {
    assert.ok(this instanceof Patcher);
    assert.ok(lines instanceof linesModule.Lines);

    var self = this,
        replacements = [];

    self.replace = function(loc, lines) {
        if (isString.check(lines))
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
            assert.ok(comparePos(from, to) <= 0);
            toConcat.push(lines.slice(from, to));
        }

        replacements.sort(function(a, b) {
            return comparePos(a.start, b.start);
        }).forEach(function(rep) {
            if (comparePos(sliceFrom, rep.start) > 0) {
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

exports.getReprinter = function(path) {
    assert.ok(path instanceof NodePath);

    // Make sure that this path refers specifically to a Node, rather than
    // some non-Node subproperty of a Node.
    if (path.node !== path.value)
        return;

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
            // The indent returned by lines.getIndentAt is the column of
            // the first non-space character in the line, but start.column
            // may fall before that character, as when a file begins with
            // whitespace but its start.column nevertheless must be 0.
            assert.ok(start.column <= lines.getIndentAt(start.line));
            return start.column;
        }
    }

    return naiveIndent;
}

function findReprints(path, reprints) {
    var node = path.node;
    assert.ok(node.original);
    assert.deepEqual(reprints, []);

    var canReprint = findChildReprints(path, node.original, reprints);

    if (!canReprint) {
        // Make absolutely sure the calling code does not attempt to reprint
        // any nodes.
        reprints.length = 0;
    }

    return canReprint;
}

function findAnyReprints(path, oldNode, reprints) {
    var newNode = path.value;
    if (newNode === oldNode)
        return true;

    if (isArray.check(newNode))
        return findArrayReprints(path, oldNode, reprints);

    if (isObject.check(newNode))
        return findObjectReprints(path, oldNode, reprints);

    return false;
}

function findArrayReprints(path, oldNode, reprints) {
    var newNode = path.value;
    isArray.assert(newNode);
    var len = newNode.length;

    if (!(isArray.check(oldNode) &&
          oldNode.length === len))
        return false;

    for (var i = 0; i < len; ++i)
        if (!findAnyReprints(path.get(i), oldNode[i], reprints))
            return false;

    return true;
}

function findObjectReprints(path, oldNode, reprints) {
    var newNode = path.value;
    isObject.assert(newNode);
    if (!isObject.check(oldNode))
        return false;

    var childReprints = [];
    var canReprintChildren = findChildReprints(path, oldNode, childReprints);

    if (Node.check(newNode)) {
        // TODO Decompose this check: if (!printTheSame(newNode, oldNode))
        if (newNode.type !== oldNode.type)
            return false;

        if (!canReprintChildren) {
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
        var pos = lines.skipSpaces(loc.start, true);
        if (pos && lines.prevPos(pos) && lines.charAt(pos) === "(") {
            pos = lines.skipSpaces(loc.end);
            if (pos && lines.charAt(pos) === ")")
                return true;
        }
    }

    return false;
}

function findChildReprints(path, oldNode, reprints) {
    var newNode = path.value;
    isObject.assert(oldNode);
    isObject.assert(newNode);

    // If this node needs parentheses and will not be wrapped with
    // parentheses when reprinted, then return false to skip reprinting
    // and let it be printed generically.
    if (path.needsParens() && !hasParens(oldNode))
        return false;

    for (var k in util.getUnionOfKeys(newNode, oldNode)) {
        if (k === "loc")
            continue;

        var oldChild = getFieldValue(oldNode, k);
        var newChild = getFieldValue(newNode, k);

        // Normally we would use path.get(k), but that might not produce a
        // Path with newChild as its .value (for instance, if a default
        // value was returned), so we must forge this path by hand.
        var newChildPath = new NodePath(newChild, path, k);

        if (!findAnyReprints(newChildPath, oldChild, reprints))
            return false;
    }

    return true;
}
