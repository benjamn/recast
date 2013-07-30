var assert = require("assert");
var normalizeOptions = require("./options").normalize;
var getSecret = require("private").makeAccessor();

// Goals:
// 1. Minimize new string creation.
// 2. Keep (de)identation O(lines) time.
// 3. Permit negative indentations.
// 4. Enforce immutability.
// 5. No newline characters.

function Lines(infos) {
    var self = this;

    assert.ok(self instanceof Lines);
    assert.ok(infos.length > 0);

    getSecret(self).infos = infos;

    Object.defineProperties(self, {
        length: { value: infos.length }
    });
}

// Exposed for instanceof checks. The fromString function should be used
// to create new Lines objects.
exports.Lines = Lines;

var Lp = Lines.prototype,
    leadingSpaceExp = /^\s*/,
    secret;

function copyLineInfo(info) {
    return {
        line: info.line,
        indent: info.indent,
        sliceStart: info.sliceStart,
        sliceEnd: info.sliceEnd
    };
}

var fromStringCache = {};
var hasOwn = fromStringCache.hasOwnProperty;
var maxCacheKeyLen = 10;

function countSpaces(spaces, tabWidth) {
    var count = 0;
    var len = spaces.length;

    for (var i = 0; i < len; ++i) {
        var ch = spaces.charAt(i);

        if (ch === " ") {
            count += 1;

        } else if (ch === "\t") {
            assert.strictEqual(typeof tabWidth, "number");
            assert.ok(tabWidth > 0);

            var next = Math.ceil(count / tabWidth) * tabWidth;
            if (next === count) {
                count += tabWidth;
            } else {
                count = next;
            }

        } else if (ch === "\r") {
            // Ignore carriage return characters.

        } else {
            assert.fail("unexpected whitespace character", ch);
        }
    }

    return count;
}
exports.countSpaces = countSpaces;

function fromString(string, tabWidth) {
    if (string instanceof Lines)
        return string;

    string += "";

    var tabless = string.indexOf("\t") < 0;
    var cacheable = tabless && (string.length <= maxCacheKeyLen);

    assert.ok(tabWidth || tabless, "encountered tabs, but no tab width specified");

    if (cacheable && hasOwn.call(fromStringCache, string))
        return fromStringCache[string];

    var lines = new Lines(string.split("\n").map(function(line) {
        var spaces = leadingSpaceExp.exec(line)[0];
        return {
            line: line,
            indent: countSpaces(spaces, tabWidth),
            sliceStart: spaces.length,
            sliceEnd: line.length
        };
    }));

    if (cacheable)
        fromStringCache[string] = lines;

    return lines;
}
exports.fromString = fromString;
var emptyLines = fromString("");

function isOnlyWhitespace(string) {
    return !/\S/.test(string);
}

Lp.toString = function(options) {
    options = normalizeOptions(options);

    var secret = getSecret(this),
        tabWidth = options.tabWidth;

    return secret.infos.map(function(info) {
        var indent = Math.max(info.indent, 0);
        var before = info.line.slice(0, info.sliceStart);

        if (options.reuseWhitespace &&
            isOnlyWhitespace(before) &&
            (countSpaces(before, options.tabWidth) === indent))
            // Reuse original spaces if the indentation is correct.
            return info.line.slice(0, info.sliceEnd);

        var tabs = 0;
        var spaces = indent;

        if (options.useTabs) {
            tabs = Math.floor(indent / tabWidth);
            spaces -= tabs * tabWidth;
        }

        var result = "";

        if (tabs > 0)
            result += new Array(tabs + 1).join("\t");

        if (spaces > 0)
            result += new Array(spaces + 1).join(" ");

        result += info.line.slice(
            info.sliceStart,
            info.sliceEnd);

        return result;
    }).join("\n");
};

Lp.bootstrapCharAt = function(pos) {
    assert.strictEqual(typeof pos, "object");
    assert.strictEqual(typeof pos.line, "number");
    assert.strictEqual(typeof pos.column, "number");

    var line = pos.line,
        column = pos.column,
        strings = this.toString().split("\n"),
        string = strings[line - 1];

    if (typeof string === "undefined")
        return "";

    if (column === string.length &&
        line < strings.length)
        return "\n";

    return string.charAt(column);
};

Lp.charAt = function(pos) {
    assert.strictEqual(typeof pos, "object");
    assert.strictEqual(typeof pos.line, "number");
    assert.strictEqual(typeof pos.column, "number");

    var line = pos.line,
        column = pos.column,
        secret = getSecret(this),
        infos = secret.infos,
        info = infos[line - 1],
        c = column;

    if (typeof info === "undefined" || c < 0)
        return "";

    var indent = this.getIndentAt(line);
    if (c < indent)
        return " ";

    c += info.sliceStart - indent;
    if (c === info.sliceEnd &&
        line < this.length)
        return "\n";

    return info.line.charAt(c);
};

Lp.stripMargin = function(width, skipFirstLine) {
    if (width === 0)
        return this;

    assert.ok(width > 0, "negative margin: " + width);

    if (skipFirstLine && this.length === 1)
        return this;

    var infos = getSecret(this).infos;

    return new Lines(infos.map(function(info, i) {
        if (info.line && (i > 0 || !skipFirstLine)) {
            info = copyLineInfo(info);
            info.indent = Math.max(0, info.indent - width);
        }
        return info;
    }));
};

Lp.indent = function(by) {
    if (by === 0)
        return this;

    var infos = getSecret(this).infos;

    return new Lines(infos.map(function(info) {
        if (info.line) {
            info = copyLineInfo(info);
            info.indent += by;
        }
        return info
    }));
};

Lp.indentTail = function(by) {
    if (by === 0)
        return this;

    if (this.length < 2)
        return this;

    var infos = getSecret(this).infos;

    return new Lines(infos.map(function(info, i) {
        if (i > 0 && info.line) {
            info = copyLineInfo(info);
            info.indent += by;
        }

        return info;
    }));
};

Lp.getIndentAt = function(line) {
    assert.ok(line >= 1, "no line " + line + " (line numbers start from 1)");
    var secret = getSecret(this),
        info = secret.infos[line - 1];
    return Math.max(info.indent, 0);
};

Lp.isOnlyWhitespace = function() {
    return isOnlyWhitespace(this.toString());
};

Lp.isPrecededOnlyByWhitespace = function(pos) {
    return this.slice({
        line: pos.line,
        column: 0
    }, pos).isOnlyWhitespace();
};

Lp.getLineLength = function(line) {
    var secret = getSecret(this),
        info = secret.infos[line - 1];
    return this.getIndentAt(line) + info.sliceEnd - info.sliceStart;
};

Lp.nextPos = function(pos) {
    var l = Math.max(pos.line, 0),
        c = Math.max(pos.column, 0);

    if (c < this.getLineLength(l)) {
        pos.column += 1;
        return true;
    }

    if (l < this.length) {
        pos.line += 1;
        pos.column = 0;
        return true;
    }

    return false;
};

Lp.prevPos = function(pos) {
    var l = pos.line,
        c = pos.column;

    if (c < 1) {
        l -= 1;

        if (l < 1)
            return false;

        c = this.getLineLength(l);

    } else {
        c = Math.min(c - 1, this.getLineLength(l));
    }

    pos.line = l;
    pos.column = c;

    return true;
};

Lp.firstPos = function() {
    // Trivial, but provided for completeness.
    return { line: 1, column: 0 };
};

// Returns the position of the first non-whitespace character, starting
// from and including startPos (or lines.firstPos() if startPos is not
// specified).
Lp.firstNonSpacePos = function(startPos) {
    var lines = this;
    var pos = startPos ? {
        line: startPos.line,
        column: startPos.column
    } : lines.firstPos();

    while (isOnlyWhitespace(lines.charAt(pos)))
        if (!lines.nextPos(pos))
            return null;

    return pos;
};

Lp.lastPos = function() {
    return {
        line: this.length,
        column: this.getLineLength(this.length)
    };
};

// Returns the position of the last non-whitespace character before endPos
// (or lines.lastPos() if endPos is not specified).
Lp.lastNonSpacePos = function(endPos) {
    var lines = this;
    var pos = endPos ? {
        line: endPos.line,
        column: endPos.column
    } : lines.lastPos();

    while (lines.prevPos(pos))
        if (!isOnlyWhitespace(lines.charAt(pos)))
            return pos;

    return null;
};

Lp.trimLeft = function() {
    var pos = this.firstNonSpacePos();
    if (pos === null)
        return emptyLines;
    return this.slice(pos);
};

Lp.trimRight = function() {
    var pos = this.lastNonSpacePos();
    if (pos === null)
        return emptyLines;
    assert.ok(this.nextPos(pos));
    return this.slice(this.firstPos(), pos);
};

Lp.trim = function() {
    var start = this.firstNonSpacePos();
    if (start === null)
        return emptyLines;

    var end = this.lastNonSpacePos();
    assert.notStrictEqual(end, null);
    assert.ok(this.nextPos(end));

    return this.slice(start, end);
};

Lp.eachPos = function(callback, startPos) {
    var pos = this.firstPos();

    if (startPos) {
        pos.line = startPos.line,
        pos.column = startPos.column
    }

    do callback.call(this, pos);
    while (this.nextPos(pos));
};

Lp.bootstrapSlice = function(start, end) {
    var strings = this.toString().split("\n").slice(
            start.line - 1, end.line);

    strings.push(strings.pop().slice(0, end.column));
    strings[0] = strings[0].slice(start.column);

    return fromString(strings.join("\n"));
};

Lp.slice = function(start, end) {
    var argc = arguments.length;
    if (argc < 1)
        // The client seems to want a copy of this Lines object, but Lines
        // objects are immutable, so it's perfectly adequate to return the
        // same object.
        return this;

    if (argc < 2)
        // Slice to the end if no end position was provided.
        end = this.lastPos();

    var secret = getSecret(this),
        sliced = secret.infos.slice(start.line - 1, end.line),
        info = copyLineInfo(sliced.pop()),
        indent = this.getIndentAt(end.line),
        sc = start.column,
        ec = end.column;

    if (start.line === end.line) {
        // If the same line is getting sliced from both ends, make sure
        // end.column is not less than start.column.
        ec = Math.max(sc, ec);
    }

    if (ec < indent) {
        info.indent -= indent - ec;
        info.sliceEnd = info.sliceStart;
    } else {
        info.sliceEnd = info.sliceStart + ec - indent;
    }

    assert.ok(info.sliceStart <= info.sliceEnd);

    sliced.push(info);

    if (sliced.length > 1) {
        sliced[0] = info = copyLineInfo(sliced[0]);
        indent = this.getIndentAt(start.line);
    } else {
        assert.strictEqual(info, sliced[0]);
    }

    if (sc < indent) {
        info.indent -= sc;
    } else {
        sc -= indent;
        info.indent = 0;
        info.sliceStart += sc;
    }

    assert.ok(info.sliceStart <= info.sliceEnd);

    return new Lines(sliced);
};

Lp.isEmpty = function() {
    return this.length < 2 && this.getLineLength(1) < 1;
};

Lp.join = function(elements) {
    var separator = this,
        separatorSecret = getSecret(separator),
        infos = [],
        prevInfo;

    function appendSecret(secret) {
        if (secret === null)
            return;

        if (prevInfo) {
            var info = secret.infos[0],
                indent = new Array(info.indent + 1).join(" ");

            prevInfo.line = prevInfo.line.slice(
                0, prevInfo.sliceEnd) + indent + info.line.slice(
                    info.sliceStart, info.sliceEnd);

            prevInfo.sliceEnd = prevInfo.line.length;
        }

        secret.infos.forEach(function(info, i) {
            if (!prevInfo || i > 0) {
                prevInfo = copyLineInfo(info);
                infos.push(prevInfo);
            }
        });
    }

    function appendWithSeparator(secret, i) {
        if (i > 0)
            appendSecret(separatorSecret);
        appendSecret(secret);
    }

    elements.map(function(elem) {
        var lines = fromString(elem);
        if (lines.isEmpty())
            return null;
        return getSecret(lines);
    }).forEach(separator.isEmpty()
               ? appendSecret
               : appendWithSeparator);

    if (infos.length < 1)
        return emptyLines;

    return new Lines(infos);
};

exports.concat = function(elements) {
    return emptyLines.join(elements);
};

Lp.concat = function(other) {
    var args = arguments,
        list = [this];
    list.push.apply(list, args);
    assert.strictEqual(list.length, args.length + 1);
    return emptyLines.join(list);
};
