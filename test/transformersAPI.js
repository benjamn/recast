var assert = require("assert");
var recast = require("../main");
var b = recast.builders;
var n = recast.namedTypes;


function reprint(code) {
  var parsed = recast.parse(code);
  return recast.print(parsed).code;
}

function makeTransformer(visitors) {
  var retTransformer = {};
  retTransformer.visitors = visitors;
  retTransformer.transform = function(ast) {
    return recast.visit(ast, retTransformer.visitors);
  }
  retTransformer.parse = recast.genParse(retTransformer.transform);
  retTransformer.compile = recast.genCompile(retTransformer.transform);
  return retTransformer;
}

var simpleVisitors = {
  visitIdentifier: function(nodePath) {
    nodePath.value.name += "__modified";
    this.traverse();
  }
};
var testTransformer = makeTransformer(simpleVisitors);

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
    var counter = 0;
    /* This visitor will replace all functions with an if statement that first
     * compares the function's name to "iffunc" and if the condition matches,
     * the content of the function will be executed as statements, otherwise
     * the original function will be defined normally. The transformer also
     * replaces all property names with "var{counter}" where the counter is
     * incremented every time a replacement is made.
     *
     * All in all, the whole point of this is to have a function that shows
     * how to use reverse traversal with this transformer API since that even
     * though the function is visited before the property, the result traversal
     * stack suggests that the property was traversed first. I definitely could
     * have achieved the same effect with a simpler transformer, and I regret
     * not doing so, but I put plenty of time and effort into writing this
     * transformer so I'm just gonna keep it here.
     *
     * thanks for reading this whole comment btw.
     */
    var complexVisitors = {
      // we'll use post order traversal in this case
      visitFunctionDeclaration: function(nodePath) {
        this.traverse();
        nodePath.replace(b.ifStatement(
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
        nodePath.replace(b.property(
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
    var complexTransformer = makeTransformer(complexVisitors);

    var source = [
      "function iffunc() {",
      "  console.log({ aProp: 5 });",
      "}"
    ].join("\n");

    complexTransformer.compile(source)
    // the result of the test is that after the transformer runs on the code,
    // the property was traversed before the function is traversed hence the
    // result should be ['property', 'function'] whereas the same transformer
    // written by calling nodePath.traverse() at the end of both visit methods
    // (which is simple in-order traversal) would normally yield
    // ['function', 'property'] as the function is indeed visited before the
    // property
    assert.equal(traversal_stack.indexOf('property'), 0);
    assert.equal(traversal_stack.indexOf('function'), 1);

  });

  it("should be valid to call recast.visit with a transformer", function() {
    //replaces all functions with `var myVar = 5;`
    var visitors = {
      visitFunctionDeclaration: function(nodePath) {
        nodePath.replace(b.variableDeclaration(
          "var",
          [b.variableDeclarator(
            b.identifier("myVar"),
            b.literal(5)
          )]));
        this.traverse();
      }
    };
    var transformer = makeTransformer(visitors);
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
        nodePath.replace(b.variableDeclaration(
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
        nodePath.replace(b.variableDeclaration(
          "var",
          [b.variableDeclarator(
            b.identifier("yourVar"),
            b.literal(6)
          )]));
        this.traverse();
      }
    }
    var transformerA = makeTransformer(visitorsA);
    var transformerB = makeTransformer(visitorsB);

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
});

describe("Transformers Errors and Warnings", function() {
  it("Should fail if a visitor doesn't call traverse", function() {
    var badVisitors = {
      visitIdentifier: function(nodePath) {
        nodePath.replace(b.identifier("identifier"));
      }
    };
    var badTransformer = makeTransformer(badVisitors);
    var source = [
      "function iffunc() {",
      "  console.log({ aProp: 5 });",
      "}"
    ].join("\n");

    assert.throws(function() {
      badTransformer.compile(source)
    });
  });

  it("Should fail if a visitor calls traverse multiple times", function() {
    var badVisitors = {
      visitIdentifier: function(nodePath) {
        this.traverse();
        nodePath.replace(b.identifier("identifier"));
        this.traverse(); //only call traverse once per visit
      }
    };
    var badTransformer = makeTransformer(badVisitors);
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
