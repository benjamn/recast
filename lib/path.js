var assert = require("assert");
var n = require("./types").namedTypes;
var builtIn = require("ast-types").builtInTypes;
var Visitor = require("./visitor").Visitor;

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

Pp.consProperty = function(property) {
    return this.cons(this.node[property]);
};

Pp.consArrayElement = function(arrayProperty, index) {
    var array = this.node[arrayProperty];
    builtIn.array.assert(array);
    return this.cons(array[index]);
};

Pp.needsParens = function() {
    if (!this.parent)
        return false;

    var node = this.node;
    var parent = this.parent.node;

    if (!n.Expression.check(node))
        return false;

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

        if (isBinary(parent)) {
            var po = parent.operator;
            var pp = PRECEDENCE[po];
            var no = node.operator;
            var np = PRECEDENCE[no];
            if (pp > np || (pp == np && node === parent.right))
                return true;
        }
    }

    if (n.SequenceExpression.check(node))
        return n.CallExpression.check(parent)
            || n.UnaryExpression.check(parent)
            || isBinary(parent)
            || n.VariableDeclarator.check(parent)
            || n.MemberExpression.check(parent)
            || n.ArrayExpression.check(parent)
            || n.Property.check(parent)
            || n.ConditionalExpression.check(parent);

    if (n.NewExpression.check(parent) &&
        parent.callee === node)
        try {
            callVisitor.visit(node);
            return false;
        } catch (thrown) {
            if (n.CallExpression.check(thrown))
                return true;
            throw thrown;
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

    if (n.FunctionExpression.check(node) &&
        this.firstInStatement())
        return true;

    if (n.ObjectExpression.check(node) &&
        this.firstInStatement())
        return true;

    return false;
};

function isBinary(node) {
    return n.BinaryExpression.check(node)
        || n.LogicalExpression.check(node);
}

var PRECEDENCE = {};
[["||"],
 ["&&"],
 ["|"],
 ["^"],
 ["&"],
 ["==", "===", "!=", "!=="],
 ["<", ">", "<=", ">=", "in", "instanceof"],
 [">>", "<<", ">>>"],
 ["+", "-"],
 ["*", "/", "%"]
].forEach(function(tier, i) {
    tier.forEach(function(op) {
        PRECEDENCE[op] = i;
    });
});

var callVisitor = new (Visitor.extend({
    visitCallExpression: function(callExp) {
        throw callExp
    }
}));

Pp.firstInStatement = function() {
    return firstInStatement(this);
};

function firstInStatement(path) {
    for (var node, parent; path.parent; path = path.parent) {
        node = path.node;
        parent = path.parent.node;

        if (n.BlockStatement.check(parent) &&
            parent.body[0] === node)
            return true;

        if (n.ExpressionStatement.check(parent) &&
            parent.expression === node)
            return true;

        if (n.SequenceExpression.check(parent) &&
            parent.expressions[0] === node)
            continue;

        if (n.CallExpression.check(parent) &&
            parent.callee === node)
            continue;

        if (n.MemberExpression.check(parent) &&
            parent.object === node)
            continue;

        if (n.ConditionalExpression.check(parent) &&
            parent.test === node)
            continue;

        if (isBinary(parent) &&
            parent.left === node)
            continue;

        if (n.UnaryExpression.check(parent) &&
            !parent.prefix &&
            parent.argument === node)
            continue;

        return false;
    }

    return true;
}

exports.Path = Path;
