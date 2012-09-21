var assert = require("assert"),
    fromString = require("./lines").fromString,
    Visitor = require("./visitor").Visitor;

exports.add = function(ast) {
    var comments = ast.comments;
    assert.ok(comments instanceof Array);
    delete ast.comments;

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
        pt.getEntry(comment, "end").comment = comment;
    }

    for (key in locs) {
        loc = locs[key];
        pair = key.split(",");

        sorted.push({
            line: +pair[0],
            column: +pair[1],
            start: loc.start,
            end: loc.end,
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

        if (loc.start)
            attachTo(loc.start);
        else if (loc.end)
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
        if (entry && !entry.start)
            entry.start = node;
    },

    onEnd: function(node) {
        var entry = this.getEntry(node, "end");
        if (entry)
            entry.end = node;
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
    assert.ok(comment.type === "Block" ||
              comment.type === "Line");

    if (comment.type === "Block") {
        return fromString("/*" + comment.value + "*/").indentTail(
            -comment.loc.start.column);

    } else if (comment.type === "Line") {
        var lines = fromString("//" + comment.value);
        assert.strictEqual(lines.length, 1);
        return lines;

    } else assert.fail(comment.type);
};
