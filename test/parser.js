"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var parser_1 = require("../lib/parser");
var patcher_1 = require("../lib/patcher");
var printer_1 = require("../lib/printer");
var lines_1 = require("../lib/lines");
var types = __importStar(require("ast-types"));
var namedTypes = types.namedTypes;
var fast_path_1 = __importDefault(require("../lib/fast-path"));
var os_1 = require("os");
var nodeMajorVersion = parseInt(process.versions.node, 10);
// Esprima seems unable to handle unnamed top-level functions, so declare
// test functions with names and then export them later.
describe("parser", function () {
    ["../parsers/acorn",
        "../parsers/babel",
        "../parsers/esprima",
        "../parsers/flow",
        "../parsers/typescript",
    ].forEach(runTestsForParser);
    it("AlternateParser", function () {
        var b = types.builders;
        var parser = {
            parse: function () {
                var program = b.program([
                    b.expressionStatement(b.identifier("surprise"))
                ]);
                program.comments = [];
                return program;
            }
        };
        function check(options) {
            var ast = parser_1.parse("ignored", options);
            var printer = new printer_1.Printer;
            types.namedTypes.File.assert(ast, true);
            assert_1.default.strictEqual(printer.printGenerically(ast).code, "surprise;");
        }
        check({ esprima: parser });
        check({ parser: parser });
    });
});
function runTestsForParser(parserId) {
    var parserName = parserId.split("/").pop();
    if (nodeMajorVersion < 6 &&
        (parserName === "babel" ||
            parserName === "flow" ||
            parserName === "typescript")) {
        // Babel 7 no longer supports Node 4 or 5.
        return;
    }
    if (!parserName) {
        return;
    }
    var parser = require(parserId);
    it("[" + parserName + "] empty source", function () {
        var printer = new printer_1.Printer;
        function check(code) {
            var ast = parser_1.parse(code, { parser: parser });
            assert_1.default.strictEqual(printer.print(ast).code, code);
        }
        check("");
        check("/* block comment */");
        check("// line comment");
        check("\t\t\t");
        check(os_1.EOL);
        check(os_1.EOL + os_1.EOL);
        check("    ");
    });
    var lineCommentTypes = {
        acorn: "Line",
        babel: "CommentLine",
        esprima: "Line",
        flow: "CommentLine",
        typescript: "CommentLine"
    };
    it("[" + parserName + "] parser basics", function testParser(done) {
        var code = testParser + "";
        var ast = parser_1.parse(code, { parser: parser });
        namedTypes.File.assert(ast);
        assert_1.default.ok(patcher_1.getReprinter(fast_path_1.default.from(ast)));
        var funDecl = ast.program.body[0];
        var funBody = funDecl.body;
        namedTypes.FunctionDeclaration.assert(funDecl);
        namedTypes.BlockStatement.assert(funBody);
        assert_1.default.ok(patcher_1.getReprinter(fast_path_1.default.from(funBody)));
        var lastStatement = funBody.body.pop();
        var doneCall = lastStatement.expression;
        assert_1.default.ok(!patcher_1.getReprinter(fast_path_1.default.from(funBody)));
        assert_1.default.ok(patcher_1.getReprinter(fast_path_1.default.from(ast)));
        funBody.body.push(lastStatement);
        assert_1.default.ok(patcher_1.getReprinter(fast_path_1.default.from(funBody)));
        assert_1.default.strictEqual(doneCall.callee.name, "done");
        assert_1.default.strictEqual(lastStatement.comments.length, 2);
        var firstComment = lastStatement.comments[0];
        assert_1.default.strictEqual(firstComment.type, lineCommentTypes[parserName]);
        assert_1.default.strictEqual(firstComment.leading, true);
        assert_1.default.strictEqual(firstComment.trailing, false);
        assert_1.default.strictEqual(firstComment.value, " Make sure done() remains the final statement in this function,");
        var secondComment = lastStatement.comments[1];
        assert_1.default.strictEqual(secondComment.type, lineCommentTypes[parserName]);
        assert_1.default.strictEqual(secondComment.leading, true);
        assert_1.default.strictEqual(secondComment.trailing, false);
        assert_1.default.strictEqual(secondComment.value, " or the above assertions will probably fail.");
        // Make sure done() remains the final statement in this function,
        // or the above assertions will probably fail.
        done();
    });
    it("[" + parserName + "] LocationFixer", function () {
        var code = [
            "function foo() {",
            "    a()",
            "    b()",
            "}"
        ].join(os_1.EOL);
        var ast = parser_1.parse(code, { parser: parser });
        var printer = new printer_1.Printer;
        types.visit(ast, {
            visitFunctionDeclaration: function (path) {
                if (namedTypes.BlockStatement.check(path.node.body)) {
                    path.node.body.body.reverse();
                }
                this.traverse(path);
            }
        });
        var altered = code
            .replace("a()", "xxx")
            .replace("b()", "a()")
            .replace("xxx", "b()");
        assert_1.default.strictEqual(altered, printer.print(ast).code);
    });
    it("[" + parserName + "] TabHandling", function () {
        function check(code, tabWidth) {
            var lines = lines_1.fromString(code, { tabWidth: tabWidth });
            assert_1.default.strictEqual(lines.length, 1);
            function checkId(s, loc) {
                var sliced = lines.slice(loc.start, loc.end);
                assert_1.default.strictEqual(s + "", sliced.toString());
            }
            types.visit(parser_1.parse(code, {
                tabWidth: tabWidth,
                parser: parser,
            }), {
                visitIdentifier: function (path) {
                    var ident = path.node;
                    checkId(ident.name, ident.loc);
                    this.traverse(path);
                },
                visitLiteral: function (path) {
                    var lit = path.node;
                    checkId(lit.value, lit.loc);
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
    it("[" + parserName + "] Only comment followed by space", function () {
        var printer = new printer_1.Printer;
        function check(code) {
            var ast = parser_1.parse(code, { parser: parser });
            assert_1.default.strictEqual(printer.print(ast).code, code);
        }
        check("// comment");
        check("// comment ");
        check("// comment\n");
        check("// comment\n\n");
        check(" // comment\n");
        check(" // comment\n ");
        check(" // comment \n ");
        check("/* comment */");
        check("/* comment */ ");
        check(" /* comment */");
        check("\n/* comment */");
        check("\n/* comment */\n");
        check("\n /* comment */\n ");
        check("/* comment */\n ");
        check("/* com\n\nment */");
        check("/* com\n\nment */ ");
        check(" /* com\n\nment */ ");
    });
}
