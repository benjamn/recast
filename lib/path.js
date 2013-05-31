var assert = require("assert");
var n = require("./types").namedTypes;

function Path(node, parent) {
    assert.ok(this instanceof Path);
    n.Node.assert(node);
    if (parent) {
        assert.ok(parent instanceof Path);
    } else {
        parent = null;
    }

    Object.defineProperties(this, {
        node: { value: node },
        parent: { value: parent }
    });
}

var Pp = Path.prototype;

Pp.cons = function(child) {
    return new Path(child, this);
};

Pp.needsParens = function() {
    // TODO This can be cached because Path objects are immutable.
    return false;
};

Pp.getOrigNode = function() {
    var op = this.node.originalPath;
    return op && op.node;
};

exports.Path = Path;
