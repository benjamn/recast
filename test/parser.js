var assert = require("assert"),
    Parser = require("../lib/parser").Parser,
    getReprinter = require("../lib/parser").getReprinter,
    Printer = require("../lib/printer").Printer,
    Visitor = require("../lib/visitor").Visitor,
    Syntax = require("../lib/types").Syntax,
    printComment = require("../lib/comments").print,
    fromString = require("../lib/lines").fromString;

// Esprima seems unable to handle unnamed top-level functions, so declare
// test functions with names and then export them later.

function testParser(t) {
    var code = testParser + "",
        parser = new Parser(code),
        ast = parser.getAst();

    assert.strictEqual(ast.type, Syntax.File);
    assert.ok(getReprinter(ast));

    var funDecl = ast.program.body[0],
        funBody = funDecl.body;

    assert.strictEqual(funDecl.type, Syntax.FunctionDeclaration);
    assert.strictEqual(funBody.type, Syntax.BlockStatement);
    assert.ok(getReprinter(funBody));

    var lastStatement = funBody.body.pop(),
        tFinish = lastStatement.expression;

    assert.ok(!getReprinter(funBody));
    assert.ok(getReprinter(ast));

    funBody.body.push(lastStatement);
    assert.ok(getReprinter(funBody));

    assert.strictEqual(tFinish.callee.object.name, "t");
    assert.strictEqual(tFinish.callee.property.name, "finish");

    assert.ok(lastStatement.comments);
    assert.ok(lastStatement.comments instanceof Array);
    assert.strictEqual(lastStatement.comments.length, 2);

    var printedComments = lastStatement.comments.map(printComment),
        joinedComments = fromString("\n").join(printedComments),
        printedComments = joinedComments.toString();

    assert.strictEqual(joinedComments.length, 2);
    assert.strictEqual(printedComments.indexOf("Make sure"), 3);

    // Make sure t.finish() remains the final statement in this function,
    // or the above assertions will probably fail.
    t.finish();
}
exports.testParser = testParser;

function testLocationFixer(t, assert) {
    var code = [
        "function foo() {",
        "    a()",
        "    b()",
        "}"].join("\n");
        parser = new Parser(code),
        printer = new Printer(parser),
        ast = parser.getAst();

    new FunctionBodyReverser().visit(ast);

    var altered = code
        .replace("a()", "xxx")
        .replace("b()", "a()")
        .replace("xxx", "b()");

    assert.strictEqual(altered, printer.print(ast).toString());

    t.finish();
}
exports.testLocationFixer = testLocationFixer;

var FunctionBodyReverser = Visitor.extend({
    visitFunctionDeclaration: function(expr) {
        expr.body.body.reverse();
    }
});

exports.testTabHandling = function(t) {
    function check(code, tabWidth) {
        var lines = fromString(code, tabWidth);
        assert.strictEqual(lines.length, 1);
        new IdentVisitor(lines).visit(
            new Parser(code, {
                tabWidth: tabWidth
            }).getAst());
    }

    for (var tabWidth = 1; tabWidth <= 8; ++tabWidth) {
        check("\t\ti = 10;", tabWidth);
        check("\t\ti \t= 10;", tabWidth);
        check("\t\ti \t=\t 10;", tabWidth);
        check("\t \ti \t=\t 10;", tabWidth);
        check("\t \ti \t=\t 10;\t", tabWidth);
        check("\t \ti \t=\t 10;\t ", tabWidth);
    }

    t.finish();
};

var IdentVisitor = Visitor.extend({
    init: function(lines) {
        this.lines = lines;
    },

    check: function(s, loc) {
        var sliced = this.lines.slice(loc.start, loc.end);
        assert.strictEqual(s + "", sliced.toString());
    },

    visitIdentifier: function(ident) {
        this.check(ident.name, ident.loc);
    },

    visitLiteral: function(lit) {
        this.check(lit.value, lit.loc);
    }
});

exports.testAlternateEsprima = function(t, assert) {
    var types = require("../lib/types");
    var b = types.builders;
    var esprima = {
        parse: function(code) {
            var program = b.program([
                b.expressionStatement(b.identifier("surprise"))
            ]);
            program.comments = [];
            return program;
        }
    };
    var parser = new Parser("ignored", { esprima: esprima });
    var ast = parser.getAst();
    var printer = new Printer(parser);

    types.namedTypes.File.assert(ast, true);
    assert.strictEqual(
        printer.printGenerically(ast).toString(),
        "surprise;");

    t.finish();
};
