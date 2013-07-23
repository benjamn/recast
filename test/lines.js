var assert = require("assert"),
    linesModule = require("../lib/lines"),
    fromString = linesModule.fromString,
    concat = linesModule.concat;

function check(a, b) {
    assert.strictEqual(a.toString(), b.toString());
}

exports.testFromString = function(t) {
    function checkIsCached(s) {
        assert.strictEqual(fromString(s), fromString(s));
        check(fromString(s), s);
    }

    checkIsCached("");
    checkIsCached(",");
    checkIsCached("\n");
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

    t.finish();
};

exports.testToString = function(t) {
    var code = arguments.callee + "",
        lines = fromString(code);

    check(lines, code);
    check(lines.indentTail(5)
               .indentTail(-7)
               .indentTail(2),
          code);

    t.finish();
};

function testEachPosHelper(lines, code) {
    var lengths = [];

    check(lines, code);

    var chars = [],
        emptyCount = 0;

    lines.eachPos(function(pos) {
        var ch = lines.charAt(pos);
        if (ch === "")
            emptyCount += 1;
        chars.push(ch);
    });

    // The character at the position just past the end (as returned by
    // lastPos) should be the only empty string.
    assert.strictEqual(emptyCount, 1);

    var joined = chars.join("");
    assert.strictEqual(joined.length, code.length);
    assert.strictEqual(joined, code);
}

exports.testEachPos = function(t) {
    var code = arguments.callee + "",
        lines = fromString(code);

    testEachPosHelper(lines, code);

    lines = lines.indentTail(5);
    testEachPosHelper(lines, lines.toString());

    lines = lines.indentTail(-9);
    testEachPosHelper(lines, lines.toString());

    lines = lines.indentTail(4);
    testEachPosHelper(lines, code);

    t.finish();
};

exports.testCharAt = function(t) {
    var code = arguments.callee + "",
        lines = fromString(code);

    function compare(pos) {
        assert.strictEqual(
            lines.charAt(pos),
            lines.bootstrapCharAt(pos));
    }

    lines.eachPos(compare);

    // Try a bunch of crazy positions to verify equivalence for
    // out-of-bounds input positions.
    fromString(exports.testBasic).eachPos(compare);

    var original = fromString("  ab\n  c"),
        indented = original.indentTail(4),
        reference = fromString("  ab\n      c");

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

    t.finish();
};

exports.testConcat = function(t) {
    var strings = ["asdf", "zcxv", "qwer"],
        lines = fromString(strings.join("\n")),
        indented = lines.indentTail(4);

    assert.strictEqual(lines.length, 3);

    check(indented, strings.join("\n    "));

    assert.strictEqual(5, concat([lines, indented]).length);
    assert.strictEqual(5, concat([indented, lines]).length);

    check(concat([lines, indented]),
          lines.toString() + indented.toString());

    check(concat([lines, indented]).indentTail(4),
          strings.join("\n    ") +
          strings.join("\n        "));

    check(concat([indented, lines]),
          strings.join("\n    ") + lines.toString());

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

    t.finish();
};

exports.testEmpty = function(t) {
    function c(s) {
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
    c(" \n");
    c("\n ");
    c(" \n ");
    c("\n \n ");
    c(" \n\n ");
    c(" \n \n ");
    c(" \n \n\n");

    t.finish();
};

exports.testSingleLine = function(t) {
    var string = "asdf",
        line = fromString(string);

    check(line, string);
    check(line.indentTail(4), string);
    check(line.indentTail(-4), string);

    // Single-line Lines objects are completely unchanged by indentTail.
    assert.strictEqual(line.indentTail(10), line);

    // Multi-line Lines objects are altered by indentTail, but only if the
    // amount of the indentation is non-zero.
    var twice = line.concat("\n", line);
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

    t.finish();
};

function testSlice(t) {
    var code = arguments.callee + "",
        lines = fromString(code);
    checkAllSlices(lines);
    t.finish();
}
exports.testSlice = testSlice;

function checkAllSlices(lines) {
    lines.eachPos(function(start) {
        lines.eachPos(function(end) {
            check(lines.slice(start, end),
                  lines.bootstrapSlice(start, end));
        }, start);
    });
}

function getSourceLocation(lines) {
    return { start: lines.firstPos(),
             end: lines.lastPos() };
}

exports.testGetSourceLocation = function(t) {
    var code = arguments.callee + "",
        lines = fromString(code);

    function verify(indent) {
        var indented = lines.indentTail(indent),
            loc = getSourceLocation(indented),
            string = indented.toString(),
            strings = string.split("\n"),
            lastLine = strings[strings.length - 1];

        assert.strictEqual(loc.end.line, strings.length);
        assert.strictEqual(loc.end.column, lastLine.length);

        assert.deepEqual(loc, getSourceLocation(
            indented.slice(loc.start, loc.end)));
    }

    verify(0);
    verify(4);
    verify(-4);

    t.finish();
};

exports.testTrim = function(t) {
    var string = "  xxx \n ",
        tabWidth = 4, // arbitrary
        lines = fromString(string);

    function test(string) {
        var lines = fromString(string, tabWidth);
        check(lines.trimLeft(), fromString(string.replace(/^\s+/, ""), tabWidth));
        check(lines.trimRight(), fromString(string.replace(/\s+$/, ""), tabWidth));
        check(lines.trim(), fromString(string.replace(/^\s+|\s+$/g, ""), tabWidth));
    }

    test("");
    test(" ");
    test("  xxx \n ");
    test("  xxx");
    test("xxx  ");
    test("\nx\nx\nx\n");
    test("\t\nx\nx\nx\n\t\n");
    test("xxx");

    t.finish();
};

exports.testNoIndentEmptyLines = function(t) {
    var lines = fromString("a\n\nb"),
        indented = lines.indent(4),
        tailIndented = lines.indentTail(5);

    check(indented, fromString("    a\n\n    b"));
    check(tailIndented, fromString("a\n\n     b"));

    check(indented.indent(-4), lines);
    check(tailIndented.indent(-5), lines);

    t.finish();
};

exports.testCountSpaces = function(t) {
    var count = linesModule.countSpaces;

    assert.strictEqual(count(""), 0);
    assert.strictEqual(count(" "), 1);
    assert.strictEqual(count("  "), 2);
    assert.strictEqual(count("   "), 3);

    function check(s, tabWidth, result) {
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

    t.finish();
};

exports.testIndentWithTabs = function(t) {
    var tabWidth = 4;
    var tabOpts = { tabWidth: tabWidth, useTabs: true };
    var noTabOpts = { tabWidth: tabWidth, useTabs: false };

    var code = [
        "function f() {",
        "\treturn this;",
        "}"
    ].join("\n");

    function checkUnchanged(lines, code) {
        check(lines.toString(tabOpts), code);
        check(lines.toString(noTabOpts), code);
        check(lines.indent(3).indent(-5).indent(2).toString(tabOpts), code);
        check(lines.indent(-3).indent(4).indent(-1).toString(noTabOpts), code);
    }

    var lines = fromString(code, tabWidth);
    checkUnchanged(lines, code);

    check(lines.indent(1).toString(tabOpts), [
        " function f() {",
        "\t return this;",
        " }"
    ].join("\n"));

    check(lines.indent(tabWidth).toString(tabOpts), [
        "\tfunction f() {",
        "\t\treturn this;",
        "\t}"
    ].join("\n"));

    check(lines.indent(1).toString(noTabOpts), [
        " function f() {",
        "     return this;",
        " }"
    ].join("\n"));

    check(lines.indent(tabWidth).toString(noTabOpts), [
        "    function f() {",
        "        return this;",
        "    }"
    ].join("\n"));

    var funkyCode = [
        " function g() { \t ",
        " \t\t  return this;  ",
        "\t} "
    ].join("\n");

    var funky = fromString(funkyCode, tabWidth);
    checkUnchanged(funky, funkyCode);

    check(funky.indent(1).toString(tabOpts), [
        "  function g() { \t ",
        "\t\t   return this;  ",
        "\t } "
    ].join("\n"));

    check(funky.indent(2).toString(tabOpts), [
        "   function g() { \t ",
        "\t\t\treturn this;  ",
        "\t  } "
    ].join("\n"));

    check(funky.indent(1).toString(noTabOpts), [
        "  function g() { \t ",
        "           return this;  ",
        "     } "
    ].join("\n"));

    check(funky.indent(2).toString(noTabOpts), [
        "   function g() { \t ",
        "            return this;  ",
        "      } "
    ].join("\n"));

    // Test that '\r' characters are ignored for the purposes of indentation,
    // but preserved when printing untouched lines.
    code = [
        "\rfunction f() {\r",
        " \r   return \rthis;\r",
        "\r} \r "
    ].join("\n");

    lines = fromString(code, tabWidth);

    checkUnchanged(lines, code);

    check(lines.indent(4).toString(noTabOpts), [
        "    function f() {\r",
        "        return \rthis;\r",
        "    } \r "
    ].join("\n"));

    check(lines.indent(5).toString(tabOpts), [
        "\t function f() {\r",
        "\t\t return \rthis;\r",
        "\t } \r "
    ].join("\n"));

    t.finish();
};
