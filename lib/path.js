var assert = require("assert");
var n = require("./types").namedTypes;
var builtIn = require("ast-types").builtInTypes;
var Visitor = require("./visitor").Visitor;
var getChildCache = require("private").makeAccessor();
var hasOwn = Object.prototype.hasOwnProperty;
var inherits = require("util").inherits;

function Path(value, parentPath, name) {
    assert.ok(this instanceof Path);

    if (parentPath) {
        assert.ok(parentPath instanceof Path);
    } else {
        parentPath = null;
        name = null;
    }

    Object.defineProperties(this, {
        // The value of parentPath.value[name].
        value: { value: value },

        // The immediate parent Path of this Path.
        parentPath: { value: parentPath },

        // The name of the property of parentPath.value through which this
        // Path's value was reached.
        name: { value: name }
    });
}

var Pp = Path.prototype;

function getChildPath(path, name) {
    var cache = getChildCache(path);
    return hasOwn.call(cache, name)
        ? cache[name]
        : cache[name] = new path.constructor(
            path.value[name], path, name);
}

Pp.get = function(name) {
    var path = this;
    var names = arguments;
    var count = names.length;

    for (var i = 0; i < count; ++i) {
        path = getChildPath(path, names[i]);
    }

    return path;
};

Pp.each = function(callback, context) {
    var path = this;
    context = context || path;

    path.value.forEach(function(elem, i) {
        var childPath = getChildPath(path, i);
        assert.strictEqual(childPath.value, elem);

        // We don't bother passing the index to the callback function,
        // because childPath.name conveys the same information.
        callback.call(context, childPath);
    });
};

Pp.map = function(callback, context) {
    var result = [];

    this.each(function(childPath) {
        result.push(callback.call(this, childPath));
    }, context);

    return result;
};

Pp.filter = function(callback, context) {
    var result = [];

    this.each(function(childPath) {
        if (callback.call(this, childPath)) {
            result.push(childPath);
        }
    }, context);

    return result;
};

function NodePath(value, parentPath, name) {
    assert.ok(this instanceof NodePath);
    Path.call(this, value, parentPath, name);

    // Conservatively update parameters to reflect any alterations made by
    // the Path constructor.
    value = this.value;
    parentPath = this.parentPath;
    name = this.name;

    var node = null;
    var pp = parentPath;

    if (n.Node.check(value)) {
        node = value;

    } else {
        while (pp && !n.Node.check(pp.value))
            pp = pp.parentPath;

        if (pp) {
            node = pp.value || null;
            pp = pp.parentPath;
        }
    }

    while (pp && !n.Node.check(pp.value))
        pp = pp.parentPath;

    if (pp && node) {
        assert.notStrictEqual(pp.value, node);
        assert.notStrictEqual(pp.node, node);
    }

    Object.defineProperties(this, {
        // The value of the closest parent whose value is a Node.
        node: { value: node },

        // The first ancestor Path whose value is a Node distinct from
        // this.node.
        parent: { value: pp }
    });
}

inherits(NodePath, Path);
var NPp = NodePath.prototype;

NPp.needsParens = function() {
    if (!this.parent)
        return false;

    var node = this.node;

    // If this NodePath object is not the direct owner of this.node, then
    // we do not need parentheses here, though the direct owner might need
    // parentheses.
    if (node !== this.value)
        return false;

    var parent = this.parent.node;

    assert.notStrictEqual(node, parent);

    if (!n.Expression.check(node))
        return false;

    if (n.UnaryExpression.check(node))
        return n.MemberExpression.check(parent)
            && this.name === "object"
            && parent.object === node;

    if (isBinary(node)) {
        if (n.CallExpression.check(parent) &&
            this.name === "callee") {
            assert.strictEqual(parent.callee, node);
            return true;
        }

        if (n.UnaryExpression.check(parent))
            return true;

        if (n.MemberExpression.check(parent) &&
            this.name === "object") {
            assert.strictEqual(parent.object, node);
            return true;
        }

        if (isBinary(parent)) {
            var po = parent.operator;
            var pp = PRECEDENCE[po];
            var no = node.operator;
            var np = PRECEDENCE[no];

            if (pp > np) {
                return true;
            }

            if (pp === np && this.name === "right") {
                assert.strictEqual(parent.right, node);
                return true;
            }
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
        this.name === "callee") {
        assert.strictEqual(parent.callee, node);

        try {
            callVisitor.visit(node);
            return false;
        } catch (thrown) {
            if (n.CallExpression.check(thrown))
                return true;
            throw thrown;
        }
    }

    if (n.Literal.check(node) &&
        builtIn.number.check(node.value) &&
        n.MemberExpression.check(parent) &&
        this.name === "object") {
        assert.strictEqual(parent.object, node);
        return true;
    }

    if (n.AssignmentExpression.check(node) ||
        n.ConditionalExpression.check(node))
    {
        if (n.UnaryExpression.check(parent))
            return true;

        if (isBinary(parent))
            return true;

        if (n.CallExpression.check(parent) &&
            this.name === "callee") {
            assert.strictEqual(parent.callee, node);
            return true;
        }

        if (n.ConditionalExpression.check(parent) &&
            this.name === "test") {
            assert.strictEqual(parent.test, node);
            return true;
        }

        if (n.MemberExpression.check(parent) &&
            this.name === "object") {
            assert.strictEqual(parent.object, node);
            return true;
        }
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

NPp.firstInStatement = function() {
    return firstInStatement(this);
};

function firstInStatement(path) {
    for (var node, parent; path.parent; path = path.parent) {
        node = path.node;
        parent = path.parent.node;

        if (n.BlockStatement.check(parent) &&
            path.parent.name === "body" &&
            path.name === 0) {
            assert.strictEqual(parent.body[0], node);
            return true;
        }

        if (n.ExpressionStatement.check(parent) &&
            path.name === "expression") {
            assert.strictEqual(parent.expression, node);
            return true;
        }

        if (n.SequenceExpression.check(parent) &&
            path.parent.name === "expressions" &&
            path.name === 0) {
            assert.strictEqual(parent.expressions[0], node);
            continue;
        }

        if (n.CallExpression.check(parent) &&
            path.name === "callee") {
            assert.strictEqual(parent.callee, node);
            continue;
        }

        if (n.MemberExpression.check(parent) &&
            path.name === "object") {
            assert.strictEqual(parent.object, node);
            continue;
        }

        if (n.ConditionalExpression.check(parent) &&
            path.name === "test") {
            assert.strictEqual(parent.test, node);
            continue;
        }

        if (isBinary(parent) &&
            path.name === "left") {
            assert.strictEqual(parent.left, node);
            continue;
        }

        if (n.UnaryExpression.check(parent) &&
            !parent.prefix &&
            path.name === "argument") {
            assert.strictEqual(parent.argument, node);
            continue;
        }

        return false;
    }

    return true;
}

exports.Path = Path;
exports.NodePath = NodePath;
