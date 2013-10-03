var Path = require("ast-path").Path;
var NodePath = require("../lib/path").NodePath;
var n = require("../lib/types").namedTypes;
var b = require("../lib/types").builders;

exports.testConstructor = function(t, assert) {
    assert.strictEqual(new Path({}).constructor, Path);

    var np = new NodePath(b.identifier("foo"));
    assert.strictEqual(np.constructor, NodePath);
    assert.ok(np.get("name") instanceof NodePath);

    t.finish();
};

exports.testNodePath = function(t, assert) {
    var ast = b.expressionStatement(
        b.unaryExpression("!", b.sequenceExpression([
            b.identifier("a"),
            b.identifier("b"),
            b.identifier("c")
        ]))
    );

    var path = new NodePath(ast);

    var opPath = path.get("expression", "operator");
    assert.strictEqual(opPath.value, "!");
    assert.strictEqual(opPath.node, ast.expression);
    assert.strictEqual(opPath.parent, path);
    assert.strictEqual(opPath.parent.node, ast);

    var argPath = path.get("expression", "argument");
    assert.ok(argPath.needsParens());

    var exprsPath = argPath.get("expressions");
    assert.ok(!exprsPath.needsParens());
    assert.strictEqual(exprsPath.get("length").value, 3);
    assert.ok(!exprsPath.get(1).needsParens());

    t.finish();
};
