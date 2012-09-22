var assert = require("assert");

// Goals:
// 1. Minimize new string creation.
// 2. Keep (de)identation O(1) time.
// 3. Permit negative indentations.
// 4. Enforce immutability.
// 5. No newline characters.

function Lines(infos) {
    var self = this;

    assert.ok(self instanceof Lines);
    assert.ok(infos.length > 0);

    function setSecret() {
        secret = {
            lines: self,
            infos: infos
        };
    }

    Object.defineProperties(self, {
        length: { value: infos.length },
        setSecret: { value: setSecret }
    });
}

// Exposed for instanceof checks. The fromString function should be used
// to create new Lines objects.
exports.Lines = Lines;

var Lp = Lines.prototype,
    leadingSpaceExp = /^\s*/,
    secret;

function getSecret(lines) {
    secret = null;
    try {
        lines.setSecret();
        assert.strictEqual(typeof secret, "object");
        assert.strictEqual(secret.lines, lines);
        return secret;
    } finally {
        secret = null;
    }
}

function getLineInfo(line) {
    var indent = leadingSpaceExp.exec(line)[0].length;
    return {
        line: line,
        indent: indent,
        sliceStart: indent,
        sliceEnd: line.length
    };
}

function copyLineInfo(info) {
    return {
        line: info.line,
        indent: info.indent,
        sliceStart: info.sliceStart,
        sliceEnd: info.sliceEnd
    };
}

var fromStringCache = {},
    maxCacheKeyLen = 10;

function fromString(string) {
    if (string instanceof Lines)
        return string;

    string += "";

    if (fromStringCache.hasOwnProperty(string))
        return fromStringCache[string];

    var lines = new Lines(string.split("\n").map(getLineInfo));

    if (string.length <= maxCacheKeyLen)
        fromStringCache[string] = lines;

    return lines;
}
exports.fromString = fromString;

Lp.toString = function() {
    var secret = getSecret(this);
    return secret.infos.map(function(info, i) {
        var toJoin = new Array(Math.max(info.indent, 0));

        toJoin.push(info.line.slice(
            info.sliceStart,
            info.sliceEnd));

        return toJoin.join(" ");
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
    var secret = getSecret(this),
        info = secret.infos[line - 1];
    return Math.max(info.indent, 0);
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

Lp.firstNonSpacePos = function() {
    var lines = this,
        pos = lines.firstPos();

    while (!/\S/.test(lines.charAt(pos)))
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

Lp.lastNonSpacePos = function(lines) {
    var lines = this,
        pos = lines.lastPos();

    while (lines.prevPos(pos))
        if (/\S/.test(lines.charAt(pos)))
            return pos;

    return null;
};

Lp.trimLeft = function() {
    var pos = this.firstNonSpacePos();
    if (pos === null)
        return fromString("");
    return this.slice(pos);
};

Lp.trimRight = function() {
    var pos = this.lastNonSpacePos();
    if (pos === null)
        return fromString("");
    assert.ok(this.nextPos(pos));
    return this.slice(this.firstPos(), pos);
};

Lp.trim = function() {
    var start = this.firstNonSpacePos();
    if (start === null)
        return fromString("");

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
        return fromString("");

    return new Lines(infos);
};

exports.concat = function(elements) {
    return fromString("").join(elements);
};

Lp.concat = function(other) {
    var args = arguments,
        list = [this];
    list.push.apply(list, args);
    assert.strictEqual(list.length, args.length + 1);
    return fromString("").join(list);
};
