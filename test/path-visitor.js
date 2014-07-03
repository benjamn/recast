var assert = require("assert");
var types = require("../lib/types");
var NodePath = types.NodePath;
var PathVisitor = require("../lib/path-visitor");
var recast = require("..");
var n = recast.types.namedTypes;
var b = recast.types.builders;

describe("recast.visit", function() {
    it("should be identical to PathVisitor.visit", function() {
        assert.strictEqual(recast.visit, PathVisitor.visit);
    });

    it("should work with no visitors", function() {
        var foo = b.identifier("foo");
        assert.strictEqual(recast.visit(foo), foo);
    });

    it("should allow simple tree modifications", function() {
        var bar = recast.visit(b.identifier("foo"), {
            visitIdentifier: function(path) {
                assert.ok(path instanceof NodePath);
                path.value.name = "bar";
                return false;
            }
        });

        n.Identifier.assert(bar);
        assert.strictEqual(bar.name, "bar");
    });

    it("should complain about missing this.traverse", function() {
        var objProp = b.memberExpression(
            b.identifier("object"),
            b.identifier("property"),
            false
        );

        try {
            recast.visit(objProp, {
                visitIdentifier: function(path) {
                    // buh?
                }
            });

            assert.ok(false, "should have thrown an exception");

        } catch (err) {
            assert.strictEqual(
                err.message,
                "Must either call this.traverse or return false in visitIdentifier"
            );
        }
    });

    it("should support this.traverse", function() {
        var objProp = b.memberExpression(
            b.identifier("object"),
            b.identifier("property"),
            false
        );

        var idNames = [];

        recast.visit(objProp, {
            visitMemberExpression: function(path) {
                this.traverseChildren(path, {
                    visitIdentifier: function(path) {
                        idNames.push("*" + path.value.name + "*");
                        return false;
                    }
                });

                path.get("object", "name").replace("asdfasdf");
                path.get("property", "name").replace("zxcvzxcv");

                this.traverse(path.get("property"));
            },

            visitIdentifier: function(path) {
                idNames.push(path.value.name);
                return false;
            }
        });

        assert.deepEqual(idNames, ["*object*", "*property*", "zxcvzxcv"]);
    });

    it("should support this.traverseChildren", function() {
        var objProp = b.memberExpression(
            b.identifier("object"),
            b.identifier("property"),
            false
        );

        var idNames = [];

        recast.visit(objProp, {
            visitMemberExpression: function(path) {
                path.get("object", "name").replace("asdfasdf");
                path.get("property", "name").replace("zxcvzxcv");
                this.traverseChildren(path, {
                    visitIdentifier: function(path) {
                        idNames.push(path.value.name);
                        return false;
                    }
                });
            }
        });

        assert.deepEqual(idNames, ["asdfasdf", "zxcvzxcv"]);
    });

    it("should support this.replace", function() {
        var seqExpr = b.sequenceExpression([
            b.literal("asdf"),
            b.identifier("zxcv"),
            b.thisExpression()
        ]);

        recast.visit(seqExpr, {
            visitIdentifier: function(path) {
                assert.strictEqual(path.value.name, "zxcv");
                this.replace(
                    b.identifier("foo"),
                    b.identifier("bar")
                );
                return false;
            }
        });

        assert.strictEqual(seqExpr.expressions.length, 4);

        var foo = seqExpr.expressions[1];
        n.Identifier.assert(foo);
        assert.strictEqual(foo.name, "foo");

        var bar = seqExpr.expressions[2];
        n.Identifier.assert(bar);
        assert.strictEqual(bar.name, "bar");

        recast.visit(seqExpr, {
            visitIdentifier: function(path) {
                if (path.value.name === "foo") {
                    this.replace(path.value, path.value);
                }

                return false;
            }
        });

        assert.strictEqual(seqExpr.expressions.length, 5);

        var foo = seqExpr.expressions[1];
        n.Identifier.assert(foo);
        assert.strictEqual(foo.name, "foo");

        var foo = seqExpr.expressions[2];
        n.Identifier.assert(foo);
        assert.strictEqual(foo.name, "foo");

        var bar = seqExpr.expressions[3];
        n.Identifier.assert(bar);
        assert.strictEqual(bar.name, "bar");

        recast.visit(seqExpr, {
            visitLiteral: function(path) {
                this.replace();
            },

            visitIdentifier: function(path) {
                if (path.value.name === "bar") {
                    this.replace();
                }

                return false;
            }
        });

        assert.strictEqual(seqExpr.expressions.length, 3);

        var first = seqExpr.expressions[0];
        n.Identifier.assert(first);
        assert.strictEqual(first.name, "foo");

        var second = seqExpr.expressions[1];
        assert.strictEqual(second, first);

        var third = seqExpr.expressions[2];
        n.ThisExpression.assert(third);
    });

    it("should reuse old VisitorContext objects", function() {
        var objProp = b.memberExpression(
            b.identifier("object"),
            b.identifier("property"),
            false
        );

        var objectContext;
        var propertyContext;

        recast.visit(objProp, {
            visitIdentifier: function(path) {
                assert.strictEqual(this._needToCallTraverse, true);
                this.traverseChildren(path);
                assert.strictEqual(path.name, path.value.name);
                if (path.name === "object") {
                    objectContext = this;
                } else if (path.name === "property") {
                    propertyContext = this;
                }
            }
        });

        assert.ok(objectContext);
        assert.ok(propertyContext);
        assert.strictEqual(objectContext, propertyContext);
    });

    it("should dispatch to closest visitSupertype method", function() {
        var foo = b.identifier("foo");
        var bar = b.identifier("bar");
        var callExpr = b.callExpression(
            b.memberExpression(
                b.functionExpression(
                    b.identifier("add"),
                    [foo, bar],
                    b.blockStatement([
                        b.returnStatement(
                            b.binaryExpression("+", foo, bar)
                        )
                    ])
                ),
                b.identifier("bind"),
                false
            ),
            [b.thisExpression()]
        );

        var nodes = [];
        var expressions = [];
        var identifiers = [];
        var statements = [];
        var returnStatements = [];
        var functions = [];

        function makeVisitorMethod(array) {
            return function(path) {
                array.push(path.value);
                this.traverseChildren(path);
            };
        }

        recast.visit(callExpr, {
            visitNode:            makeVisitorMethod(nodes),
            visitExpression:      makeVisitorMethod(expressions),
            visitIdentifier:      makeVisitorMethod(identifiers),
            visitStatement:       makeVisitorMethod(statements),
            visitReturnStatement: makeVisitorMethod(returnStatements),
            visitFunction:        makeVisitorMethod(functions)
        });

        function check(array) {
            var rest = Array.prototype.slice.call(arguments, 1);
            assert.strictEqual(array.length, rest.length);
            for (var i = 0; i < rest.length; ++i) {
                assert.strictEqual(array[i], rest[i]);
            }
        }

        check(nodes);

        check(expressions,
              callExpr,
              callExpr.callee,
              callExpr.callee.object.body.body[0].argument,
              callExpr.arguments[0]);

        check(identifiers,
              callExpr.callee.object.id,
              foo,
              bar,
              foo,
              bar,
              callExpr.callee.property);

        check(statements,
              callExpr.callee.object.body);

        check(returnStatements,
              callExpr.callee.object.body.body[0]);

        check(functions,
              callExpr.callee.object);
    });
});
