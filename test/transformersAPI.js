var assert = require("assert");
var recast = require("../main");
var b = recast.types.builders;
var n = recast.types.namedTypes;


function reprint(code) {
    var parsed = recast.parse(code);
    return recast.print(parsed).code;
}

var simpleVisitors = {
    visitIdentifier: function(nodePath) {
        nodePath.value.name += "__modified";
        this.traverse();
    }
};
var testTransformer = new recast.Transformer(simpleVisitors);

describe("Simple Transformer Tests", function() {
    it("correctly transforms simple code", function() {

        var source = [
            "var x = 5;",
            "function func(a, b) {",
            "  return a + b / x;",
            "}",
            "var res = func(1, 2);"
        ].join("\n");
        var expected = [
            "var x__modified = 5;",
            "function func__modified(a__modified, b__modified) {",
            "  return a__modified + b__modified / x__modified;",
            "}",
            "var res__modified = func__modified(1, 2);"
        ].join("\n");

        assert.equal(testTransformer.compile(source).code, reprint(expected));
    });

    it("works as expected with intricate visitors", function() {
        var traversal_stack = [];
        var traversal_stack2 = [];
        var counter = 0;
        /* This visitor will replace all functions with an if statement that
         * first compares the function's name to "iffunc" and if the condition
         * matches, the content of the function will be executed as statements,
         * otherwise the original function will be defined normally. The
         * transformer also replaces all property names with "var{counter}"
         * where the counter is incremented every time a replacement is made.
         *
         * All in all, the whole point of this is to have a function that shows
         * how to use reverse traversal with this transformer API since that
         * even though the function is visited before the property, the result
         * traversal stack suggests that the property was traversed first. I
         * definitely could have achieved the same effect with a simpler
         * transformer, and I regret not doing so, but I put plenty of time and
         * effort into writing this transformer so I'm just gonna keep it here.
         *
         * thanks for reading this whole comment btw.
         */
        var complexVisitors = {
            // we'll use post order traversal in this case
            visitFunctionDeclaration: function(nodePath) {
                this.traverse();
                this.replace(b.ifStatement(
                    b.binaryExpression(
                        "==",
                        b.literal(nodePath.value.id.name),
                        b.literal("iffunc")
                ),
                nodePath.value.body,
                b.blockStatement([
                    nodePath.value
                ])
                ));
                traversal_stack.push('function');
            },
            visitProperty: function(nodePath) {
                this.replace(b.property(
                    "init",
                    b.identifier("var" + counter++),
                    nodePath.value.value,
                    false,
                    false
                ));
                this.traverse();
                traversal_stack.push('property');
            }
        };
        var complexTransformer = new recast.Transformer(complexVisitors);

        var source = [
            "function iffunc() {",
            "  console.log({ aProp: 5 });",
            "}"
        ].join("\n");

        complexTransformer.compile(source)
        // the result of the test is that after the transformer runs on the
        // code, the property was traversed before the function is traversed
        // hence the result should be ['property', 'function'] whereas the same
        // transformer written by calling nodePath.traverse() at the end of
        // both visit methods (which is simple in-order traversal) would
        // normally yield ['function', 'property'] as the function is indeed
        // visited before the property
        assert.equal(traversal_stack.indexOf('property'), 0);
        assert.equal(traversal_stack.indexOf('function'), 1);

        var reversedComplexVisitors = {
            // we'll use post order traversal in this case
            visitFunctionDeclaration: function(nodePath) {
                this.replace(b.ifStatement(
                    b.binaryExpression(
                        "==",
                        b.literal(nodePath.value.id.name),
                        b.literal("iffunc")
                ),
                nodePath.value.body,
                b.blockStatement([
                    nodePath.value
                ])
                ));
                traversal_stack2.push('function');
                this.traverse();
            },
            visitProperty: function(nodePath) {
                this.replace(b.property(
                    "init",
                    b.identifier("var" + counter++),
                    nodePath.value.value,
                    false,
                    false
                ));
                traversal_stack2.push('property');
                this.traverse();
            }
        };
        var reversedComplexTransformer =
            new recast.Transformer(reversedComplexVisitors);
        reversedComplexTransformer.compile(source)
        // in in-order traversal, the function is replaced with
        assert.equal(traversal_stack2.indexOf('property'), 1);
        assert.equal(traversal_stack2.indexOf('function'), 0);
    });

    it("should be valid to call recast.visit with a transformer", function() {
        //replaces all functions with `var myVar = 5;`
        var visitors = {
            visitFunctionDeclaration: function(nodePath) {
                this.replace(b.variableDeclaration(
                    "var",
                    [b.variableDeclarator(
                        b.identifier("myVar"),
                        b.literal(5)
                    )]));
                    this.traverse();
            }
        };
        var transformer = new recast.Transformer(visitors);
        var source = [
            "function iffunc() {",
            "  console.log({ aProp: 5 });",
            "}"
        ].join("\n");
        var expected = "var myVar = 5;";

        var outputAST = recast.visit(recast.parse(source), transformer);
        assert.equal(recast.print(outputAST).code, reprint(expected));
        assert.equal(
            recast.print(outputAST).code,
            transformer.compile(source).code
        );
    });

    it("should be valid to call recast.visit with a function", function() {
        //replaces all functions with `var myVar = 5;`
        var visitorsA = {
            visitFunctionDeclaration: function(nodePath) {
                this.replace(b.variableDeclaration(
                    "var",
                    [b.variableDeclarator(
                        b.identifier("myVar"),
                        b.literal(5)
                    )]));
                    this.traverse();
            }
        };
        //replaces all functions with `var yourVar = 6;`
        var visitorsB = {
            visitFunctionDeclaration: function(nodePath) {
                this.replace(b.variableDeclaration(
                    "var",
                    [b.variableDeclarator(
                        b.identifier("yourVar"),
                        b.literal(6)
                    )]));
                    this.traverse();
            }
        }
        var transformerA = new recast.Transformer(visitorsA);
        var transformerB = new recast.Transformer(visitorsB);

        var transformFunc = function(nodePath) {
            if (n.FunctionDeclaration.check(nodePath.value)) {
                if (nodePath.value.id.name === "replaceWith5") {
                    return [transformerA];
                } else {
                    return [transformerB];
                }
            }
            return [];
        }

        var source = [
            "function replaceWith5() {",
            "  console.log({ aProp: 5 });",
            "}",
            "function replaceWith6() {",
            " console.log({aProp: 6});",
            "}"
        ].join("\n");
        var expected = "var myVar = 5;\nvar yourVar = 6;";

        var outputAST = recast.visit(recast.parse(source), transformFunc);
        assert.equal(recast.print(outputAST).code, reprint(expected));
    });

    it("should allow chaining multiple visitors on the same node", function() {
        var counter = 0;
        // replace all identifiers with `var{counter}`
        var visitorsA = {
            visitIdentifier: function(nodePath) {
                this.replace(b.identifier("var" + counter++));
                this.traverse();
            }
        };
        // appends identifier names with "__modified"
        var visitorsB = {
            visitIdentifier: function(nodePath) {
                this.replace(b.identifier(nodePath.value.name + "__modified"));
                this.traverse();
            }
        }
        var transformerA = new recast.Transformer(visitorsA);
        var transformerB = new recast.Transformer(visitorsB);

        // please note that after the transformation, this code will NOT
        // function correctly since multiple references to the same identifier
        // now refer to different identifiers.
        var source = [
            "var firstVar = 6;",
            "var secondVar = 'hello', thirdVar;",
            "function firstFunc(firstParam, secondParam){",
            "  console.log(firstParam, secondParam);",
            "}",
            "firstFunc(7, 12);"
        ].join("\n");
        var expected = [
            "var var0__modified = 6;",
            "var var1__modified = 'hello', var2__modified;",
            "function var3__modified(var4__modified, var5__modified){",
            "  var6__modified.var7__modified(var8__modified, var9__modified);",
            "}",
            "var10__modified(7, 12);"
        ].join("\n");

        var outputAST = recast.visit(
            recast.parse(source),
            [visitorsA, visitorsB]
        );
        assert.equal(recast.print(outputAST).code, reprint(expected));

    });

    it("should allow chaining visitors when the node changes type", function() {
        var counter = 0;
        // replace all functions with identifiers of the form `var{counter}`
        var visitorsA = {
            visitFunctionExpression: function(nodePath) {
                this.replace(b.identifier("var" + counter++));
                this.traverse();
            }
        };
        // appends identifier names with "__modified"
        var visitorsB = {
            visitIdentifier: function(nodePath) {
                this.replace(b.identifier(nodePath.value.name + "__modified"));
                this.traverse();
            }
        }
        var transformerA = new recast.Transformer(visitorsA);
        var transformerB = new recast.Transformer(visitorsB);

        // please note that after the transformation, this code will NOT
        // function correctly since multiple references to the same identifier
        // now refer to different identifiers.
        var source = [
            "var y = function(){};",
            "var x = function(){};"
        ].join("\n");
        var expected = [
            "var y__modified = var0__modified;",
            "var x__modified = var1__modified;"
        ].join("\n");

        var outputAST = recast.visit(
            recast.parse(source),
            [visitorsA, visitorsB]
        );
        assert.equal(recast.print(outputAST).code, reprint(expected));

    });

});

describe("Transformers Errors and Warnings", function() {
    it("Should fail if a visitor doesn't call traverse", function() {
        var badVisitors = {
            visitIdentifier: function(nodePath) {
                this.replace(b.identifier("identifier"));
            }
        };
        var badTransformer = new recast.Transformer(badVisitors);
        var source = [
            "function iffunc() {",
            "  console.log({ aProp: 5 });",
            "}"
        ].join("\n");

        assert.throws(function() {
            badTransformer.compile(source)
        });
    });

});
