var assert = require("assert");
var n = require("./types").namedTypes;
var builtIn = require("ast-types").builtInTypes;

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

    if (isBinary(node)) {
        if (n.CallExpression.check(parent) &&
            parent.callee === node)
            return true;

        if (n.UnaryExpression.check(parent))
            return true;

        if (n.MemberExpression.check(parent) &&
            parent.object === node)
            return true;
    }

    if (n.Literal.check(node) &&
        builtIn.number.check(node.value) &&
        n.MemberExpression.check(parent) &&
        parent.object === node)
        return true;

    if (n.AssignmentExpression.check(node) ||
        n.ConditionalExpression.check(node))
    {
        if (n.UnaryExpression.check(parent))
            return true;

        if (isBinary(parent))
            return true;

        if (n.CallExpression.check(parent) &&
            parent.callee === node)
            return true;

        if (n.ConditionalExpression.check(parent) &&
            parent.test === node)
            return true;

        if (n.MemberExpression.check(parent) &&
            parent.object === node)
            return true;
    }

    return false; // TODO
};

function isBinary(node) {
    return n.BinaryExpression.check(node)
        || n.LogicalExpression.check(node);
}

exports.Path = Path;
