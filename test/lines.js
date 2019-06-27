"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var lines_1 = require("../lib/lines");
var os_1 = require("os");
function check(a, b) {
    assert_1.default.strictEqual(a.toString({
        lineTerminator: os_1.EOL
    }), b.toString({
        lineTerminator: os_1.EOL
    }));
}
describe("lines", function () {
    describe('line terminators', function () {
        var source = [
            'foo;',
            'bar;',
        ];
        var terminators = [
            '\u000A',
            '\u000D',
            '\u2028',
            '\u2029',
            '\u000D\u000A',
        ];
        terminators.forEach(function (t) {
            it('can handle ' + escape(t) + ' as line terminator', function () {
                var lines = lines_1.fromString(source.join(t));
                assert_1.default.strictEqual(lines.length, 2);
                assert_1.default.strictEqual(lines.getLineLength(1), 4);
            });
        });
    });
    it("FromString", function () {
        function checkIsCached(s) {
            assert_1.default.strictEqual(lines_1.fromString(s), lines_1.fromString(s));
            check(lines_1.fromString(s), s);
        }
        checkIsCached("");
        checkIsCached(",");
        checkIsCached(os_1.EOL);
        checkIsCached("this");
        checkIsCached(", ");
        checkIsCached(": ");
        var longer = "This is a somewhat longer string that we do not want to cache.";
        assert_1.default.notStrictEqual(lines_1.fromString(longer), lines_1.fromString(longer));
        // Since Lines objects are immutable, if one is passed to fromString,
        // we can return it as-is without having to make a defensive copy.
        var longerLines = lines_1.fromString(longer);
        assert_1.default.strictEqual(lines_1.fromString(longerLines), longerLines);
    });
    it("ToString", function ToStringTest() {
        var code = String(ToStringTest);
        var lines = lines_1.fromString(code);
        check(lines, code);
        check(lines.indentTail(5)
            .indentTail(-7)
            .indentTail(2), code);
    });
    function testEachPosHelper(lines, code) {
        check(lines, code);
        var chars = [];
        var emptyCount = 0;
        function iterator(pos) {
            var ch = lines.charAt(pos);
            if (ch === "")
                emptyCount += 1;
            chars.push(ch);
        }
        lines.eachPos(iterator, null);
        // The character at the position just past the end (as returned by
        // lastPos) should be the only empty string.
        assert_1.default.strictEqual(emptyCount, 1);
        // Function.prototype.toString uses \r\n line endings on non-*NIX
        // systems, so normalize those to \n characters.
        code = code.replace(/\r\n/g, "\n");
        var joined = chars.join("");
        assert_1.default.strictEqual(joined.length, code.length);
        assert_1.default.strictEqual(joined, code);
        var withoutSpaces = code.replace(/\s+/g, "");
        chars.length = emptyCount = 0;
        lines.eachPos(iterator, null, true); // Skip spaces this time.
        assert_1.default.strictEqual(emptyCount, 0);
        joined = chars.join("");
        assert_1.default.strictEqual(joined.length, withoutSpaces.length);
        assert_1.default.strictEqual(joined, withoutSpaces);
    }
    it("EachPos", function EachPosTest() {
        var code = String(EachPosTest);
        var lines = lines_1.fromString(code);
        testEachPosHelper(lines, code);
        lines = lines.indentTail(5);
        testEachPosHelper(lines, lines.toString());
        lines = lines.indentTail(-9);
        testEachPosHelper(lines, lines.toString());
        lines = lines.indentTail(4);
        testEachPosHelper(lines, code);
    });
    it("CharAt", function CharAtTest() {
        // Function.prototype.toString uses \r\n line endings on non-*NIX
        // systems, so normalize those to \n characters.
        var code = String(CharAtTest).replace(/\r\n/g, "\n");
        var lines = lines_1.fromString(code);
        function compare(pos) {
            assert_1.default.strictEqual(lines.charAt(pos), lines.bootstrapCharAt(pos));
        }
        lines.eachPos(compare);
        // Try a bunch of crazy positions to verify equivalence for
        // out-of-bounds input positions.
        lines_1.fromString(exports.testBasic).eachPos(compare);
        var original = lines_1.fromString("  ab" + os_1.EOL + "  c"), indented = original.indentTail(4), reference = lines_1.fromString("  ab" + os_1.EOL + "      c");
        function compareIndented(pos) {
            var c = indented.charAt(pos);
            check(c, reference.charAt(pos));
            check(c, indented.bootstrapCharAt(pos));
            check(c, reference.bootstrapCharAt(pos));
        }
        indented.eachPos(compareIndented);
        indented = indented.indentTail(-4);
        reference = original;
        indented.eachPos(compareIndented);
    });
    it("Concat", function () {
        var strings = ["asdf", "zcxv", "qwer"], lines = lines_1.fromString(strings.join(os_1.EOL)), indented = lines.indentTail(4);
        assert_1.default.strictEqual(lines.length, 3);
        check(indented, strings.join(os_1.EOL + "    "));
        assert_1.default.strictEqual(5, lines_1.concat([lines, indented]).length);
        assert_1.default.strictEqual(5, lines_1.concat([indented, lines]).length);
        check(lines_1.concat([lines, indented]), lines.toString() + indented.toString());
        check(lines_1.concat([lines, indented]).indentTail(4), strings.join(os_1.EOL + "    ") +
            strings.join(os_1.EOL + "        "));
        check(lines_1.concat([indented, lines]), strings.join(os_1.EOL + "    ") + lines.toString());
        check(lines_1.concat([lines, indented]), lines.concat(indented));
        check(lines_1.concat([indented, lines]), indented.concat(lines));
        check(lines_1.concat([]), lines_1.fromString(""));
        assert_1.default.strictEqual(lines_1.concat([]), lines_1.fromString(""));
        check(lines_1.fromString(" ").join([
            lines_1.fromString("var"),
            lines_1.fromString("foo")
        ]), lines_1.fromString("var foo"));
        check(lines_1.fromString(" ").join(["var", "foo"]), lines_1.fromString("var foo"));
        check(lines_1.concat([
            lines_1.fromString("var"),
            lines_1.fromString(" "),
            lines_1.fromString("foo")
        ]), lines_1.fromString("var foo"));
        check(lines_1.concat(["var", " ", "foo"]), lines_1.fromString("var foo"));
        check(lines_1.concat([
            lines_1.fromString("debugger"), ";"
        ]), lines_1.fromString("debugger;"));
    });
    it("Empty", function () {
        function c(s) {
            var lines = lines_1.fromString(s);
            check(lines, s);
            assert_1.default.strictEqual(lines.isEmpty(), s.length === 0);
            assert_1.default.ok(lines.trimLeft().isEmpty());
            assert_1.default.ok(lines.trimRight().isEmpty());
            assert_1.default.ok(lines.trim().isEmpty());
        }
        c("");
        c(" ");
        c("    ");
        c(" " + os_1.EOL);
        c(os_1.EOL + " ");
        c(" " + os_1.EOL + " ");
        c(os_1.EOL + " " + os_1.EOL + " ");
        c(" " + os_1.EOL + os_1.EOL + " ");
        c(" " + os_1.EOL + " " + os_1.EOL + " ");
        c(" " + os_1.EOL + " " + os_1.EOL + os_1.EOL);
    });
    it("SingleLine", function () {
        var string = "asdf", line = lines_1.fromString(string);
        check(line, string);
        check(line.indentTail(4), string);
        check(line.indentTail(-4), string);
        // Single-line Lines objects are completely unchanged by indentTail.
        assert_1.default.strictEqual(line.indentTail(10), line);
        // Multi-line Lines objects are altered by indentTail, but only if the
        // amount of the indentation is non-zero.
        var twice = line.concat(os_1.EOL, line);
        assert_1.default.notStrictEqual(twice.indentTail(10), twice);
        assert_1.default.strictEqual(twice.indentTail(0), twice);
        check(line.concat(line), string + string);
        check(line.indentTail(4).concat(line), string + string);
        check(line.concat(line.indentTail(4)), string + string);
        check(line.indentTail(8).concat(line.indentTail(4)), string + string);
        line.eachPos(function (start) {
            line.eachPos(function (end) {
                check(line.slice(start, end), string.slice(start.column, end.column));
            }, start);
        });
    });
    it("Slice", function SliceTest() {
        var code = String(SliceTest), lines = lines_1.fromString(code);
        checkAllSlices(lines);
    });
    function checkAllSlices(lines) {
        lines.eachPos(function (start) {
            lines.eachPos(function (end) {
                check(lines.slice(start, end), lines.bootstrapSlice(start, end));
                check(lines.sliceString(start, end), lines.bootstrapSliceString(start, end));
            }, start);
        });
    }
    function getSourceLocation(lines) {
        return { start: lines.firstPos(),
            end: lines.lastPos() };
    }
    it("GetSourceLocation", function GetSourceLocationTest() {
        var code = String(GetSourceLocationTest), lines = lines_1.fromString(code);
        function verify(indent) {
            var indented = lines.indentTail(indent), loc = getSourceLocation(indented), string = indented.toString(), strings = string.split(os_1.EOL), lastLine = strings[strings.length - 1];
            assert_1.default.strictEqual(loc.end.line, strings.length);
            assert_1.default.strictEqual(loc.end.column, lastLine.length);
            assert_1.default.deepEqual(loc, getSourceLocation(indented.slice(loc.start, loc.end)));
        }
        verify(0);
        verify(4);
        verify(-4);
    });
    it("Trim", function () {
        var string = "  xxx " + os_1.EOL + " ";
        var options = { tabWidth: 4 };
        lines_1.fromString(string);
        function test(string) {
            var lines = lines_1.fromString(string, options);
            check(lines.trimLeft(), lines_1.fromString(string.replace(/^\s+/, ""), options));
            check(lines.trimRight(), lines_1.fromString(string.replace(/\s+$/, ""), options));
            check(lines.trim(), lines_1.fromString(string.replace(/^\s+|\s+$/g, ""), options));
        }
        test("");
        test(" ");
        test("  xxx " + os_1.EOL + " ");
        test("  xxx");
        test("xxx  ");
        test(os_1.EOL + "x" + os_1.EOL + "x" + os_1.EOL + "x" + os_1.EOL);
        test("\t" + os_1.EOL + "x" + os_1.EOL + "x" + os_1.EOL + "x" + os_1.EOL + "\t" + os_1.EOL);
        test("xxx");
    });
    it("NoIndentEmptyLines", function () {
        var lines = lines_1.fromString("a" + os_1.EOL + os_1.EOL + "b"), indented = lines.indent(4), tailIndented = lines.indentTail(5);
        check(indented, lines_1.fromString("    a" + os_1.EOL + os_1.EOL + "    b"));
        check(tailIndented, lines_1.fromString("a" + os_1.EOL + os_1.EOL + "     b"));
        check(indented.indent(-4), lines);
        check(tailIndented.indent(-5), lines);
    });
    it("CountSpaces", function () {
        var count = lines_1.countSpaces;
        assert_1.default.strictEqual(count(""), 0);
        assert_1.default.strictEqual(count(" "), 1);
        assert_1.default.strictEqual(count("  "), 2);
        assert_1.default.strictEqual(count("   "), 3);
        function check(s, tabWidth, result) {
            assert_1.default.strictEqual(count(s, tabWidth), result);
        }
        check("", 2, 0);
        check("", 3, 0);
        check("", 4, 0);
        check(" ", 2, 1);
        check("\t", 2, 2);
        check("\t\t", 2, 4);
        check(" \t\t", 2, 4);
        check(" \t \t", 2, 4);
        check("  \t \t", 2, 6);
        check("  \t  \t", 2, 8);
        check(" \t   \t", 2, 6);
        check("   \t \t", 2, 6);
        check(" ", 3, 1);
        check("\t", 3, 3);
        check("\t\t", 3, 6);
        check(" \t\t", 3, 6);
        check(" \t \t", 3, 6);
        check("  \t \t", 3, 6);
        check("  \t  \t", 3, 6);
        check(" \t   \t", 3, 9);
        check("   \t \t", 3, 9);
        check("\t\t\t   ", 2, 9);
        check("\t\t\t   ", 3, 12);
        check("\t\t\t   ", 4, 15);
        check("\r", 4, 0);
        check("\r ", 4, 1);
        check(" \r ", 4, 2);
        check(" \r\r ", 4, 2);
    });
    it("IndentWithTabs", function () {
        var tabWidth = 4;
        var tabOpts = { tabWidth: tabWidth, useTabs: true };
        var noTabOpts = { tabWidth: tabWidth, useTabs: false };
        var code = [
            "function f() {",
            "\treturn this;",
            "}"
        ].join(os_1.EOL);
        function checkUnchanged(lines, code) {
            check(lines.toString(tabOpts), code);
            check(lines.toString(noTabOpts), code);
            check(lines.indent(3).indent(-5).indent(2).toString(tabOpts), code);
            check(lines.indent(-3).indent(4).indent(-1).toString(noTabOpts), code);
        }
        var lines = lines_1.fromString(code, tabOpts);
        checkUnchanged(lines, code);
        check(lines.indent(1).toString(tabOpts), [
            " function f() {",
            "\t return this;",
            " }"
        ].join(os_1.EOL));
        check(lines.indent(tabWidth).toString(tabOpts), [
            "\tfunction f() {",
            "\t\treturn this;",
            "\t}"
        ].join(os_1.EOL));
        check(lines.indent(1).toString(noTabOpts), [
            " function f() {",
            "     return this;",
            " }"
        ].join(os_1.EOL));
        check(lines.indent(tabWidth).toString(noTabOpts), [
            "    function f() {",
            "        return this;",
            "    }"
        ].join(os_1.EOL));
        var funkyCode = [
            " function g() { \t ",
            " \t\t  return this;  ",
            "\t} "
        ].join(os_1.EOL);
        var funky = lines_1.fromString(funkyCode, tabOpts);
        checkUnchanged(funky, funkyCode);
        check(funky.indent(1).toString(tabOpts), [
            "  function g() { \t ",
            "\t\t   return this;  ",
            "\t } "
        ].join(os_1.EOL));
        check(funky.indent(2).toString(tabOpts), [
            "   function g() { \t ",
            "\t\t\treturn this;  ",
            "\t  } "
        ].join(os_1.EOL));
        check(funky.indent(1).toString(noTabOpts), [
            "  function g() { \t ",
            "           return this;  ",
            "     } "
        ].join(os_1.EOL));
        check(funky.indent(2).toString(noTabOpts), [
            "   function g() { \t ",
            "            return this;  ",
            "      } "
        ].join(os_1.EOL));
        // Test that '\v' characters are ignored for the purposes of indentation,
        // but preserved when printing untouched lines.
        code = [
            "\vfunction f() {\v",
            " \v   return \vthis;\v",
            "\v} \v "
        ].join(os_1.EOL);
        lines = lines_1.fromString(code, tabOpts);
        checkUnchanged(lines, code);
        check(lines.indent(4).toString(noTabOpts), [
            "    function f() {\v",
            "        return \vthis;\v",
            "    } \v "
        ].join(os_1.EOL));
        check(lines.indent(5).toString(tabOpts), [
            "\t function f() {\v",
            "\t\t return \vthis;\v",
            "\t } \v "
        ].join(os_1.EOL));
    });
    it("GuessTabWidth", function GuessTabWidthTest(done) {
        var lines;
        lines = lines_1.fromString([
            "function identity(x) {",
            "    return x;",
            "}"
        ].join(os_1.EOL));
        assert_1.default.strictEqual(lines.guessTabWidth(), 4);
        lines = lines_1.fromString([
            "function identity(x) {",
            "  return x;",
            "}"
        ].join(os_1.EOL));
        assert_1.default.strictEqual(lines.guessTabWidth(), 2);
        assert_1.default.strictEqual(lines.indent(5).guessTabWidth(), 2);
        assert_1.default.strictEqual(lines.indent(-4).guessTabWidth(), 2);
        fs_1.default.readFile(__filename, "utf-8", function (err, source) {
            assert_1.default.equal(err, null);
            assert_1.default.strictEqual(lines_1.fromString(source).guessTabWidth(), 4);
            fs_1.default.readFile(path_1.default.join(__dirname, "..", "package.json"), "utf-8", function (err, source) {
                assert_1.default.equal(err, null);
                assert_1.default.strictEqual(lines_1.fromString(source).guessTabWidth(), 2);
                done();
            });
        });
    });
    it("ExoticWhitespace", function () {
        var source = "";
        var spacePattern = /^\s+$/;
        for (var i = 0; i < 0xffff; ++i) {
            var ch = String.fromCharCode(i);
            if (spacePattern.test(ch)) {
                source += ch;
            }
        }
        source += "x";
        var options = { tabWidth: 4 };
        var lines = lines_1.fromString(source, options);
        assert_1.default.strictEqual(lines.length, 5);
        assert_1.default.strictEqual(lines.getLineLength(1), options.tabWidth);
        assert_1.default.strictEqual(lines.getIndentAt(1), options.tabWidth);
        assert_1.default.strictEqual(lines.slice({
            line: 5,
            column: lines.getLineLength(5) - 1
        }).toString(options), "x");
        assert_1.default.ok(spacePattern.test(lines.slice(lines.firstPos(), {
            line: 5,
            column: lines.getLineLength(5) - 1
        }).toString(options)));
    });
});
