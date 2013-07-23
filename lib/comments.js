var assert = require("assert");
var linesModule = require("./lines");
var Lines = linesModule.Lines;
var concat = linesModule.concat;
var Visitor = require("./visitor").Visitor;

exports.add = function(ast, lines) {
    var comments = ast.comments;
    assert.ok(comments instanceof Array);
    delete ast.comments;

    assert.ok(lines instanceof Lines);

    var pt = new PosTracker,
        len = comments.length,
        comment,
        key,
        loc, locs = pt.locs,
        pair,
        sorted = [];

    pt.visit(ast);

    for (var i = 0; i < len; ++i) {
        comment = comments[i];
        Object.defineProperty(comment.loc, "lines", { value: lines });
        pt.getEntry(comment, "end").comment = comment;
    }

    for (key in locs) {
        loc = locs[key];
        pair = key.split(",");

        sorted.push({
            line: +pair[0],
            column: +pair[1],
            startNode: loc.startNode,
            endNode: loc.endNode,
            comment: loc.comment
        });
    }

    sorted.sort(cmpPos);

    var toAttach = [];

    function attachTo(node) {
        assert.ok(!node.comments);
        if (toAttach.length > 0) {
            node.comments = toAttach.slice(0);
            toAttach.length = 0;
        }
    }

    for (i = 0, len = sorted.length; i < len; ++i) {
        loc = sorted[i];

        if (loc.comment)
            toAttach.push(loc.comment);

        if (loc.startNode)
            attachTo(loc.startNode);
        else if (loc.endNode)
            toAttach.length = 0;
    }
};

var PosTracker = Visitor.extend({
    init: function() {
        this.locs = {};
    },

    getEntry: function(node, which) {
        var locs = this.locs,
            key = getKey(node, which);
        return key && (locs[key] || (locs[key] = {}));
    },

    onStart: function(node) {
        var entry = this.getEntry(node, "start");
        if (entry && !entry.startNode)
            entry.startNode = node;
    },

    onEnd: function(node) {
        var entry = this.getEntry(node, "end");
        if (entry)
            entry.endNode = node;
    },

    genericVisit: function(node) {
        this.onStart(node);
        this._super(node);
        this.onEnd(node);
    }
});

function getKey(node, which) {
    var loc = node && node.loc,
        pos = loc && loc[which];
    return pos && (pos.line + "," + pos.column);
}

function cmpPos(a, b) {
    return (a.line - b.line) || (a.column - b.column);
}

exports.print = function(comment) {
    var orig = comment.original;
    var loc = orig && orig.loc;
    var lines = loc && loc.lines;
    var parts = [];

    if (comment.type === "Block") {
        parts.push("/*", comment.value, "*/");
    } else if (comment.type === "Line") {
        parts.push("//", comment.value);
    } else assert.fail(comment.type);

    if (lines instanceof Lines) {
        var fnsp = lines.firstNonSpacePos(loc.end);
        parts.push(lines.slice(loc.end, fnsp));
    } else {
        parts.push("\n");
    }

    return concat(parts).stripMargin(loc ? loc.start.column : 0);
};
