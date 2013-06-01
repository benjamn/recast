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
    if (!this.parent)
        return false;

    var node = this.node;
    var parent = this.parent.node;

    if (n.UnaryExpression.check(node))
        return n.MemberExpression.check(parent)
            && parent.object === node;

    return false; // TODO
};

exports.Path = Path;
