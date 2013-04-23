var types = require("../lib/types");
var b = types.builders;

exports.testShallowAndDeepChecks = function(t, assert) {
    var index = b.identifier("foo");
    var decl = b.variableDeclaration(
        "var", [b.variableDeclarator(
            index, b.literal(42))]);

    assert.ok(types.Node.check(decl));
    assert.ok(types.Statement.check(decl));
    assert.ok(types.Declaration.check(decl));
    assert.ok(types.VariableDeclaration.check(decl));

    assert.ok(types.Node.check(decl, true));
    assert.ok(types.Statement.check(decl, true));
    assert.ok(types.Declaration.check(decl, true));
    assert.ok(types.VariableDeclaration.check(decl, true));

    // Not an Expression.
    assert.ok(!types.Expression.check(decl));

    // This makes decl cease to conform to types.VariableDeclaration.
    decl.declarations.push(b.identifier("bar"));

    assert.ok(types.Node.check(decl));
    assert.ok(types.Statement.check(decl));
    assert.ok(types.Declaration.check(decl));
    assert.ok(types.VariableDeclaration.check(decl));

    assert.ok(types.Node.check(decl, true));
    assert.ok(types.Statement.check(decl, true));
    assert.ok(types.Declaration.check(decl, true));

    // As foretold above.
    assert.ok(!types.VariableDeclaration.check(decl, true));

    // Still not an Expression.
    assert.ok(!types.Expression.check(decl));

    var fs = b.forStatement(
        decl,
        b.binaryExpression("<", index, b.literal(48)),
        b.updateExpression("++", index, true),
        b.blockStatement([
            b.expressionStatement(
                b.callExpression(index, []))
        ]));

    assert.ok(types.Node.check(fs));
    assert.ok(types.Statement.check(fs));
    assert.ok(types.ForStatement.check(fs));

    assert.ok(types.Node.check(fs, true));
    assert.ok(types.Statement.check(fs, true));

    // Not a true ForStatement because fs.init is not a true
    // VariableDeclaration.
    assert.ok(!types.ForStatement.check(fs, true));

    t.finish();
};
