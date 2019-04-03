import assert from "assert";
import fs from "fs";
import path from "path";
import { fromString, concat, countSpaces, Lines } from "../lib/lines";
import { EOL as eol } from "os";

function check(a: any, b: any) {
    assert.strictEqual(a.toString({
        lineTerminator: eol
    }), b.toString({
        lineTerminator: eol
    }));
}

describe("lines", function() {
    describe('line terminators', function() {
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

        terminators.forEach(function(t) {
            it('can handle ' + escape(t) + ' as line terminator', function() {
                var lines = fromString(source.join(t));
                assert.strictEqual(lines.length, 2);
                assert.strictEqual(lines.getLineLength(1), 4);
            });
        });
    });

    it("FromString", function() {
        function checkIsCached(s: any) {
            assert.strictEqual(fromString(s), fromString(s));
            check(fromString(s), s);
        }

        checkIsCached("");
        checkIsCached(",");
        checkIsCached(eol);
        checkIsCached("this");
        checkIsCached(", ");
        checkIsCached(": ");

        var longer = "This is a somewhat longer string that we do not want to cache.";
        assert.notStrictEqual(
            fromString(longer),
            fromString(longer));

        // Since Lines objects are immutable, if one is passed to fromString,
        // we can return it as-is without having to make a defensive copy.
        var longerLines = fromString(longer);
        assert.strictEqual(fromString(longerLines), longerLines);
    });

    it("ToString", function ToStringTest() {
        var code = String(ToStringTest);
        var lines = fromString(code);
        check(lines, code);
        check(lines.indentTail(5)
                   .indentTail(-7)
                   .indentTail(2),
              code);
    });

    function testEachPosHelper(lines: any, code: any) {
        check(lines, code);

        var chars: any[] = [];
        var emptyCount = 0;

        function iterator(pos: any) {
            var ch = lines.charAt(pos);
            if (ch === "")
                emptyCount += 1;
            chars.push(ch);
        }

        lines.eachPos(iterator, null);

        // The character at the position just past the end (as returned by
        // lastPos) should be the only empty string.
        assert.strictEqual(emptyCount, 1);

        // Function.prototype.toString uses \r\n line endings on non-*NIX
        // systems, so normalize those to \n characters.
        code = code.replace(/\r\n/g, "\n");

        var joined = chars.join("");
        assert.strictEqual(joined.length, code.length);
        assert.strictEqual(joined, code);

        var withoutSpaces = code.replace(/\s+/g, "");
        chars.length = emptyCount = 0;
        lines.eachPos(iterator, null, true); // Skip spaces this time.
        assert.strictEqual(emptyCount, 0);
        joined = chars.join("");
        assert.strictEqual(joined.length, withoutSpaces.length);
        assert.strictEqual(joined, withoutSpaces);
    }

    it("EachPos", function EachPosTest() {
        var code = String(EachPosTest);
        var lines = fromString(code);

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
        var lines = fromString(code);

        function compare(pos: any) {
            assert.strictEqual(
                lines.charAt(pos),
                lines.bootstrapCharAt(pos));
        }

        lines.eachPos(compare);

        // Try a bunch of crazy positions to verify equivalence for
        // out-of-bounds input positions.
        fromString(exports.testBasic).eachPos(compare);

        var original = fromString("  ab" + eol + "  c"),
            indented = original.indentTail(4),
            reference = fromString("  ab" + eol + "      c");

        function compareIndented(pos: any) {
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

    it("Concat", function() {
        var strings = ["asdf", "zcxv", "qwer"],
            lines = fromString(strings.join(eol)),
            indented = lines.indentTail(4);

        assert.strictEqual(lines.length, 3);

        check(indented, strings.join(eol + "    "));

        assert.strictEqual(5, concat([lines, indented]).length);
        assert.strictEqual(5, concat([indented, lines]).length);

        check(concat([lines, indented]),
              lines.toString() + indented.toString());

        check(concat([lines, indented]).indentTail(4),
              strings.join(eol + "    ") +
              strings.join(eol + "        "));

        check(concat([indented, lines]),
              strings.join(eol + "    ") + lines.toString());

        check(concat([lines, indented]),
              lines.concat(indented));

        check(concat([indented, lines]),
              indented.concat(lines));

        check(concat([]), fromString(""));
        assert.strictEqual(concat([]), fromString(""));

        check(fromString(" ").join([
            fromString("var"),
            fromString("foo")
        ]), fromString("var foo"));

        check(fromString(" ").join(["var", "foo"]),
              fromString("var foo"));

        check(concat([
            fromString("var"),
            fromString(" "),
            fromString("foo")
        ]), fromString("var foo"));

        check(concat(["var", " ", "foo"]),
              fromString("var foo"));

        check(concat([
            fromString("debugger"), ";"
        ]), fromString("debugger;"));
    });

    it("Empty", function() {
        function c(s: any) {
            var lines = fromString(s);
            check(lines, s);
            assert.strictEqual(
                lines.isEmpty(),
                s.length === 0);

            assert.ok(lines.trimLeft().isEmpty());
            assert.ok(lines.trimRight().isEmpty());
            assert.ok(lines.trim().isEmpty());
        }

        c("");
        c(" ");
        c("    ");
        c(" " + eol);
        c(eol + " ");
        c(" " + eol + " ");
        c(eol + " " + eol + " ");
        c(" " + eol + eol + " ");
        c(" " + eol + " " + eol + " ");
        c(" " + eol + " " + eol + eol);
    });

    it("SingleLine", function() {
        var string = "asdf",
            line = fromString(string);

        check(line, string);
        check(line.indentTail(4), string);
        check(line.indentTail(-4), string);

        // Single-line Lines objects are completely unchanged by indentTail.
        assert.strictEqual(line.indentTail(10), line);

        // Multi-line Lines objects are altered by indentTail, but only if the
        // amount of the indentation is non-zero.
        var twice = line.concat(eol, line);
        assert.notStrictEqual(twice.indentTail(10), twice);
        assert.strictEqual(twice.indentTail(0), twice);

        check(line.concat(line), string + string);
        check(line.indentTail(4).concat(line), string + string);
        check(line.concat(line.indentTail(4)), string + string);
        check(line.indentTail(8).concat(line.indentTail(4)), string + string);

        line.eachPos(function(start) {
            line.eachPos(function(end) {
                check(line.slice(start, end),
                      string.slice(start.column, end.column));
            }, start);
        });
    });

    it("Slice", function SliceTest() {
        var code = String(SliceTest),
            lines = fromString(code);
        checkAllSlices(lines);
    });

    function checkAllSlices(lines: any) {
        lines.eachPos(function(start: any) {
            lines.eachPos(function(end: any) {
                check(lines.slice(start, end),
                      lines.bootstrapSlice(start, end));
                check(lines.sliceString(start, end),
                      lines.bootstrapSliceString(start, end));
            }, start);
        });
    }

    function getSourceLocation(lines: any) {
        return { start: lines.firstPos(),
                 end: lines.lastPos() };
    }

    it("GetSourceLocation", function GetSourceLocationTest() {
        var code = String(GetSourceLocationTest),
            lines = fromString(code);

        function verify(indent: any) {
            var indented = lines.indentTail(indent),
                loc = getSourceLocation(indented),
                string = indented.toString(),
                strings = string.split(eol),
                lastLine = strings[strings.length - 1];

            assert.strictEqual(loc.end.line, strings.length);
            assert.strictEqual(loc.end.column, lastLine.length);

            assert.deepEqual(loc, getSourceLocation(
                indented.slice(loc.start, loc.end)));
        }

        verify(0);
        verify(4);
        verify(-4);
    });

    it("Trim", function() {
        var string = "  xxx " + eol + " ";
        var options = { tabWidth: 4 };
        fromString(string);

        function test(string: string) {
            var lines = fromString(string, options);
            check(lines.trimLeft(), fromString(string.replace(/^\s+/, ""), options));
            check(lines.trimRight(), fromString(string.replace(/\s+$/, ""), options));
            check(lines.trim(), fromString(string.replace(/^\s+|\s+$/g, ""), options));
        }

        test("");
        test(" ");
        test("  xxx " + eol + " ");
        test("  xxx");
        test("xxx  ");
        test(eol + "x" + eol + "x" + eol + "x" + eol);
        test("\t" + eol + "x" + eol + "x" + eol + "x" + eol + "\t" + eol);
        test("xxx");
    });

    it("NoIndentEmptyLines", function() {
        var lines = fromString("a" + eol + eol + "b"),
            indented = lines.indent(4),
            tailIndented = lines.indentTail(5);

        check(indented, fromString("    a" + eol + eol + "    b"));
        check(tailIndented, fromString("a" + eol + eol + "     b"));

        check(indented.indent(-4), lines);
        check(tailIndented.indent(-5), lines);
    });

    it("CountSpaces", function() {
        var count = countSpaces;

        assert.strictEqual(count(""), 0);
        assert.strictEqual(count(" "), 1);
        assert.strictEqual(count("  "), 2);
        assert.strictEqual(count("   "), 3);

        function check(s: string, tabWidth: number, result: number) {
            assert.strictEqual(count(s, tabWidth), result);
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

    it("IndentWithTabs", function() {
        var tabWidth = 4;
        var tabOpts = { tabWidth: tabWidth, useTabs: true };
        var noTabOpts = { tabWidth: tabWidth, useTabs: false };

        var code = [
            "function f() {",
            "\treturn this;",
            "}"
        ].join(eol);

        function checkUnchanged(lines: Lines, code: string) {
            check(lines.toString(tabOpts), code);
            check(lines.toString(noTabOpts), code);
            check(lines.indent(3).indent(-5).indent(2).toString(tabOpts), code);
            check(lines.indent(-3).indent(4).indent(-1).toString(noTabOpts), code);
        }

        var lines = fromString(code, tabOpts);
        checkUnchanged(lines, code);

        check(lines.indent(1).toString(tabOpts), [
            " function f() {",
            "\t return this;",
            " }"
        ].join(eol));

        check(lines.indent(tabWidth).toString(tabOpts), [
            "\tfunction f() {",
            "\t\treturn this;",
            "\t}"
        ].join(eol));

        check(lines.indent(1).toString(noTabOpts), [
            " function f() {",
            "     return this;",
            " }"
        ].join(eol));

        check(lines.indent(tabWidth).toString(noTabOpts), [
            "    function f() {",
            "        return this;",
            "    }"
        ].join(eol));

        var funkyCode = [
            " function g() { \t ",
            " \t\t  return this;  ",
            "\t} "
        ].join(eol);

        var funky = fromString(funkyCode, tabOpts);
        checkUnchanged(funky, funkyCode);

        check(funky.indent(1).toString(tabOpts), [
            "  function g() { \t ",
            "\t\t   return this;  ",
            "\t } "
        ].join(eol));

        check(funky.indent(2).toString(tabOpts), [
            "   function g() { \t ",
            "\t\t\treturn this;  ",
            "\t  } "
        ].join(eol));

        check(funky.indent(1).toString(noTabOpts), [
            "  function g() { \t ",
            "           return this;  ",
            "     } "
        ].join(eol));

        check(funky.indent(2).toString(noTabOpts), [
            "   function g() { \t ",
            "            return this;  ",
            "      } "
        ].join(eol));

        // Test that '\v' characters are ignored for the purposes of indentation,
        // but preserved when printing untouched lines.
        code = [
            "\vfunction f() {\v",
            " \v   return \vthis;\v",
            "\v} \v "
        ].join(eol);

        lines = fromString(code, tabOpts);

        checkUnchanged(lines, code);

        check(lines.indent(4).toString(noTabOpts), [
            "    function f() {\v",
            "        return \vthis;\v",
            "    } \v "
        ].join(eol));

        check(lines.indent(5).toString(tabOpts), [
            "\t function f() {\v",
            "\t\t return \vthis;\v",
            "\t } \v "
        ].join(eol));
    });

    it("GuessTabWidth", function GuessTabWidthTest(done) {
        var lines;
        lines = fromString([
            "function identity(x) {",
            "    return x;",
            "}"
        ].join(eol));
        assert.strictEqual(lines.guessTabWidth(), 4);

        lines = fromString([
            "function identity(x) {",
            "  return x;",
            "}"
        ].join(eol));
        assert.strictEqual(lines.guessTabWidth(), 2);
        assert.strictEqual(lines.indent(5).guessTabWidth(), 2);
        assert.strictEqual(lines.indent(-4).guessTabWidth(), 2);

        fs.readFile(__filename, "utf-8", function(err, source) {
            assert.equal(err, null);
            assert.strictEqual(fromString(source).guessTabWidth(), 4);

            fs.readFile(path.join(
                __dirname,
                "..",
                "package.json"
            ), "utf-8", function(err, source) {
                assert.equal(err, null);
                assert.strictEqual(fromString(source).guessTabWidth(), 2);

                done();
            });
        });
    });

    it("ExoticWhitespace", function() {
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
        var lines = fromString(source, options);

        assert.strictEqual(lines.length, 5);
        assert.strictEqual(lines.getLineLength(1), options.tabWidth);
        assert.strictEqual(lines.getIndentAt(1), options.tabWidth);

        assert.strictEqual(lines.slice({
            line: 5,
            column: lines.getLineLength(5) - 1
        }).toString(options), "x");

        assert.ok(spacePattern.test(
            lines.slice(lines.firstPos(), {
                line: 5,
                column: lines.getLineLength(5) - 1
            }).toString(options)
        ));
    });
});
