var assert = require("assert");
var parse = require("../lib/parser").parse;
var getReprinter = require("../lib/patcher").getReprinter;
var Printer = require("../lib/printer").Printer;
var printComments = require("../lib/comments").printComments;
var linesModule = require("../lib/lines");
var fromString = linesModule.fromString;
var concat = linesModule.concat;
var types = require("../lib/types");
var namedTypes = types.namedTypes;
var FastPath = require("../lib/fast-path");
var eol = require("os").EOL;

// Esprima seems unable to handle unnamed top-level functions, so declare
// test functions with names and then export them later.

describe("parser", function() {
  it("empty source", function () {
    var printer = new Printer;

    function check(code) {
      var ast = parse(code);
      assert.strictEqual(printer.print(ast).code, code);
    }

    check("");
    check("/* block comment */");
    check("// line comment");
    check("\t\t\t");
    check(eol);
    check(eol + eol);
    check("    ");
  });

  it("Parser", function testParser(done) {
    var code = testParser + "";
    var ast = parse(code);

    namedTypes.File.assert(ast);
    assert.ok(getReprinter(FastPath.from(ast)));

    var funDecl = ast.program.body[0];
    var funBody = funDecl.body;

    namedTypes.FunctionDeclaration.assert(funDecl);
    namedTypes.BlockStatement.assert(funBody);
    assert.ok(getReprinter(FastPath.from(funBody)));

    var lastStatement = funBody.body.pop();
    var doneCall = lastStatement.expression;

    assert.ok(!getReprinter(FastPath.from(funBody)));
    assert.ok(getReprinter(FastPath.from(ast)));

    funBody.body.push(lastStatement);
    assert.ok(getReprinter(FastPath.from(funBody)));

    assert.strictEqual(doneCall.callee.name, "done");

    assert.strictEqual(lastStatement.comments.length, 2);

    var firstComment = lastStatement.comments[0];
    assert.strictEqual(firstComment.type, "Line");
    assert.strictEqual(firstComment.leading, true);
    assert.strictEqual(firstComment.trailing, false);
    assert.strictEqual(
      firstComment.value,
      " Make sure done() remains the final statement in this function,"
    );

    var secondComment = lastStatement.comments[1];
    assert.strictEqual(secondComment.type, "Line");
    assert.strictEqual(secondComment.leading, true);
    assert.strictEqual(secondComment.trailing, false);
    assert.strictEqual(
      secondComment.value,
      " or the above assertions will probably fail."
    );

    // Make sure done() remains the final statement in this function,
    // or the above assertions will probably fail.
    done();
  });

  it("LocationFixer", function() {
    var code = [
      "function foo() {",
      "    a()",
      "    b()",
      "}"
    ].join(eol);
    var ast = parse(code);
    var printer = new Printer;

    types.visit(ast, {
      visitFunctionDeclaration: function(path) {
        path.node.body.body.reverse();
        this.traverse(path);
      }
    });

    var altered = code
      .replace("a()", "xxx")
      .replace("b()", "a()")
      .replace("xxx", "b()");

    assert.strictEqual(altered, printer.print(ast).code);
  });

  it("TabHandling", function() {
    function check(code, tabWidth) {
      var lines = fromString(code, { tabWidth: tabWidth });
      assert.strictEqual(lines.length, 1);

      types.visit(parse(code, { tabWidth: tabWidth }), {
        check: function(s, loc) {
          var sliced = lines.slice(loc.start, loc.end);
          assert.strictEqual(s + "", sliced.toString());
        },

        visitIdentifier: function(path) {
          var ident = path.node;
          this.check(ident.name, ident.loc);
          this.traverse(path);
        },

        visitLiteral: function(path) {
          var lit = path.node;
          this.check(lit.value, lit.loc);
          this.traverse(path);
        }
      });
    }

    for (var tabWidth = 1; tabWidth <= 8; ++tabWidth) {
      check("\t\ti = 10;", tabWidth);
      check("\t\ti \t= 10;", tabWidth);
      check("\t\ti \t=\t 10;", tabWidth);
      check("\t \ti \t=\t 10;", tabWidth);
      check("\t \ti \t=\t 10;\t", tabWidth);
      check("\t \ti \t=\t 10;\t ", tabWidth);
    }
  });

  it("AlternateParser", function() {
    var types = require("../lib/types");
    var b = types.builders;
    var parser = {
      parse: function(code) {
        var program = b.program([
          b.expressionStatement(b.identifier("surprise"))
        ]);
        program.comments = [];
        return program;
      }
    };

    function check(options) {
      var ast = parse("ignored", options);
      var printer = new Printer;

      types.namedTypes.File.assert(ast, true);
      assert.strictEqual(
        printer.printGenerically(ast).code,
        "surprise;"
      );
    }

    check({ esprima: parser });
    check({ parser: parser });
  });
});
