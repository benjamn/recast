var Path = require("../lib/path").Path;
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

exports.testPath = function(t, assert) {
    var path = new Path({
        a: "asdf",
        b: {
            foo: 42,
            list: [1, 2, 3, 4, 5]
        },
    });

    var aPath = path.get("a");
    var fooPath = path.get("b", "foo");

    assert.strictEqual(aPath.value, "asdf");
    assert.strictEqual(fooPath.value, 42);
    assert.strictEqual(path.get("b"), fooPath.parentPath);

    var odds = path.get("b", "list").filter(function(childPath) {
        return childPath.value % 2 === 1;
    });

    assert.strictEqual(odds.length, 3);
    assert.deepEqual(odds.map(function(childPath) {
        return childPath.value;
    }), [1, 3, 5]);

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
