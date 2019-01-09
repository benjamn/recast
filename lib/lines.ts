import assert from "assert";
import sourceMap from "source-map";
import { normalize as normalizeOptions } from "./options";
import { makeUniqueKey } from "private";
var secretKey = makeUniqueKey();
import types from "./types";
var isString = types.builtInTypes.string;
import { comparePos } from "./util";
import Mapping from "./mapping";

// Goals:
// 1. Minimize new string creation.
// 2. Keep (de)identation O(lines) time.
// 3. Permit negative indentations.
// 4. Enforce immutability.
// 5. No newline characters.

var useSymbol = typeof Symbol === "function";
// @ts-ignore Subsequent variable declarations must have the same type.
var secretKey = "recastLinesSecret";
if (useSymbol) {
  secretKey = Symbol.for(secretKey);
}

function getSecret(lines: any) {
  return lines[secretKey];
}

export type Pos = { line: number, column: number };

export interface LinesType {
  length: any;
  name: any;
  toString(options?: any): any;
  getSourceMap(sourceMapName: any, sourceRoot: any): any;
  bootstrapCharAt(pos: any): any;
  charAt(pos: any): any;
  stripMargin(width: any, skipFirstLine: any): any;
  indent(by: number): any;
  indentTail(by: any): any;
  lockIndentTail (): any;
  getIndentAt(line: any): any;
  guessTabWidth(): any;
  startsWithComment (): any;
  isOnlyWhitespace(): any;
  isPrecededOnlyByWhitespace(pos: any): any;
  getLineLength(line: any): any;
  nextPos(pos: any, skipSpaces?: any): any;
  prevPos(pos: any, skipSpaces?: any): any;
  firstPos(): Pos;
  lastPos(): Pos;
  skipSpaces(pos: any, backward?: any, modifyInPlace?: any): any;
  trimLeft(): any;
  trimRight(): any;
  trim(): any;
  eachPos(callback: (pos: Pos) => any, startPos?: any, skipSpaces?: any): any;
  bootstrapSlice(start: any, end: any): any;
  slice(start?: Pos, end?: Pos): LinesType;
  bootstrapSliceString(start: any, end: any, options: any): any;
  sliceString(start: any, end: any, options?: any): any;
  isEmpty(): any;
  join(elements: any): any;
  concat(...args: any[]): any;
}

interface LinesConstructor {
  new(infos: any, sourceFileName?: any): LinesType;
}

const Lines = function Lines(this: LinesType, infos: any, sourceFileName?: any) {
  assert.ok(this instanceof Lines);
  assert.ok(infos.length > 0);

  if (sourceFileName) {
    isString.assert(sourceFileName);
  } else {
    sourceFileName = null;
  }

  setSymbolOrKey(this, secretKey, {
    infos: infos,
    mappings: [],
    name: sourceFileName,
    cachedSourceMap: null
  });

  this.length = infos.length;
  this.name = sourceFileName;

  if (sourceFileName) {
    getSecret(this).mappings.push(new Mapping(this, {
      start: this.firstPos(),
      end: this.lastPos()
    }));
  }
} as any as LinesConstructor;

// Exposed for instanceof checks. The fromString function should be used
// to create new Lines objects.
export { Lines };

function setSymbolOrKey(obj: any, key: any, value: any) {
  if (useSymbol) {
    return obj[key] = value;
  }

  Object.defineProperty(obj, key, {
    value: value,
    enumerable: false,
    writable: false,
    configurable: true
  });

  return value;
}

var Lp: LinesType = Lines.prototype;

function copyLineInfo(info: any) {
  return {
    line: info.line,
    indent: info.indent,
    locked: info.locked,
    sliceStart: info.sliceStart,
    sliceEnd: info.sliceEnd
  };
}

var fromStringCache: any = {};
var hasOwn = fromStringCache.hasOwnProperty;
var maxCacheKeyLen = 10;

export function countSpaces(spaces: any, tabWidth?: number) {
  var count = 0;
  var len = spaces.length;

  for (var i = 0; i < len; ++i) {
    switch (spaces.charCodeAt(i)) {
    case 9: // '\t'
      assert.strictEqual(typeof tabWidth, "number");
      assert.ok(tabWidth! > 0);

      var next = Math.ceil(count / tabWidth!) * tabWidth!;
      if (next === count) {
        count += tabWidth!;
      } else {
        count = next;
      }

      break;

    case 11: // '\v'
    case 12: // '\f'
    case 13: // '\r'
    case 0xfeff: // zero-width non-breaking space
      // These characters contribute nothing to indentation.
      break;

    case 32: // ' '
    default: // Treat all other whitespace like ' '.
      count += 1;
      break;
    }
  }

  return count;
}

var leadingSpaceExp = /^\s*/;

// As specified here: http://www.ecma-international.org/ecma-262/6.0/#sec-line-terminators
var lineTerminatorSeqExp =
  /\u000D\u000A|\u000D(?!\u000A)|\u000A|\u2028|\u2029/;

/**
 * @param {Object} options - Options object that configures printing.
 */
export function fromString(string: string | LinesType, options?: any): LinesType {
  if (string instanceof Lines)
    return string;

  string += "";

  var tabWidth = options && options.tabWidth;
  var tabless = string.indexOf("\t") < 0;
  var locked = !! (options && options.locked);
  var cacheable = !options && tabless && (string.length <= maxCacheKeyLen);

  assert.ok(tabWidth || tabless, "No tab width specified but encountered tabs in string\n" + string);

  if (cacheable && hasOwn.call(fromStringCache, string))
    return fromStringCache[string];

  var lines = new Lines(string.split(lineTerminatorSeqExp).map(function(line) {
    // TODO: handle null exec result
    var spaces = leadingSpaceExp.exec(line)![0];
    return {
      line: line,
      indent: countSpaces(spaces, tabWidth),
      // Boolean indicating whether this line can be reindented.
      locked: locked,
      sliceStart: spaces.length,
      sliceEnd: line.length
    };
  }), normalizeOptions(options).sourceFileName);

  if (cacheable)
    fromStringCache[string] = lines;

  return lines;
}

function isOnlyWhitespace(string: string) {
  return !/\S/.test(string);
}

Lp.toString = function(options) {
  return this.sliceString(this.firstPos(), this.lastPos(), options);
};

Lp.getSourceMap = function(sourceMapName, sourceRoot) {
  if (!sourceMapName) {
    // Although we could make up a name or generate an anonymous
    // source map, instead we assume that any consumer who does not
    // provide a name does not actually want a source map.
    return null;
  }

  var targetLines = this;

  function updateJSON(json?: any) {
    json = json || {};

    isString.assert(sourceMapName);
    json.file = sourceMapName;

    if (sourceRoot) {
      isString.assert(sourceRoot);
      json.sourceRoot = sourceRoot;
    }

    return json;
  }

  var secret = getSecret(targetLines);
  if (secret.cachedSourceMap) {
    // Since Lines objects are immutable, we can reuse any source map
    // that was previously generated. Nevertheless, we return a new
    // JSON object here to protect the cached source map from outside
    // modification.
    return updateJSON(secret.cachedSourceMap.toJSON());
  }

  var smg = new sourceMap.SourceMapGenerator(updateJSON());
  var sourcesToContents: any = {};

  secret.mappings.forEach(function(mapping: any) {
    var sourceCursor = mapping.sourceLines.skipSpaces(
      mapping.sourceLoc.start
    ) || mapping.sourceLines.lastPos();

    var targetCursor = targetLines.skipSpaces(
      mapping.targetLoc.start
    ) || targetLines.lastPos();

    while (comparePos(sourceCursor, mapping.sourceLoc.end) < 0 &&
           comparePos(targetCursor, mapping.targetLoc.end) < 0) {

      var sourceChar = mapping.sourceLines.charAt(sourceCursor);
      var targetChar = targetLines.charAt(targetCursor);
      assert.strictEqual(sourceChar, targetChar);

      var sourceName = mapping.sourceLines.name;

      // Add mappings one character at a time for maximum resolution.
      smg.addMapping({
        source: sourceName,
        original: { line: sourceCursor.line,
                    column: sourceCursor.column },
        generated: { line: targetCursor.line,
                     column: targetCursor.column }
      });

      if (!hasOwn.call(sourcesToContents, sourceName)) {
        var sourceContent = mapping.sourceLines.toString();
        smg.setSourceContent(sourceName, sourceContent);
        sourcesToContents[sourceName] = sourceContent;
      }

      targetLines.nextPos(targetCursor, true);
      mapping.sourceLines.nextPos(sourceCursor, true);
    }
  });

  secret.cachedSourceMap = smg;

  return (smg as any).toJSON();
};

Lp.bootstrapCharAt = function(pos) {
  assert.strictEqual(typeof pos, "object");
  assert.strictEqual(typeof pos.line, "number");
  assert.strictEqual(typeof pos.column, "number");

  var line = pos.line,
  column = pos.column,
  strings = this.toString().split(lineTerminatorSeqExp),
  string = strings[line - 1];

  if (typeof string === "undefined")
    return "";

  if (column === string.length &&
      line < strings.length)
    return "\n";

  if (column >= string.length)
    return "";

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

  if (c >= info.sliceEnd)
    return "";

  return info.line.charAt(c);
};

Lp.stripMargin = function(width, skipFirstLine) {
  if (width === 0)
    return this;

  assert.ok(width > 0, "negative margin: " + width);

  if (skipFirstLine && this.length === 1)
    return this;

  var secret = getSecret(this);

  var lines = new Lines(secret.infos.map(function(info: any, i: any) {
    if (info.line && (i > 0 || !skipFirstLine)) {
      info = copyLineInfo(info);
      info.indent = Math.max(0, info.indent - width);
    }
    return info;
  }));

  if (secret.mappings.length > 0) {
    var newMappings = getSecret(lines).mappings;
    assert.strictEqual(newMappings.length, 0);
    secret.mappings.forEach(function(mapping: any) {
      newMappings.push(mapping.indent(width, skipFirstLine, true));
    });
  }

  return lines;
};

Lp.indent = function(by) {
  if (by === 0)
    return this;

  var secret = getSecret(this);

  var lines = new Lines(secret.infos.map(function(info: any) {
    if (info.line && ! info.locked) {
      info = copyLineInfo(info);
      info.indent += by;
    }
    return info
  }));

  if (secret.mappings.length > 0) {
    var newMappings = getSecret(lines).mappings;
    assert.strictEqual(newMappings.length, 0);
    secret.mappings.forEach(function(mapping: any) {
      newMappings.push(mapping.indent(by));
    });
  }

  return lines;
};

Lp.indentTail = function(by) {
  if (by === 0)
    return this;

  if (this.length < 2)
    return this;

  var secret = getSecret(this);

  var lines = new Lines(secret.infos.map(function(info: any, i: any) {
    if (i > 0 && info.line && ! info.locked) {
      info = copyLineInfo(info);
      info.indent += by;
    }

    return info;
  }));

  if (secret.mappings.length > 0) {
    var newMappings = getSecret(lines).mappings;
    assert.strictEqual(newMappings.length, 0);
    secret.mappings.forEach(function(mapping: any) {
      newMappings.push(mapping.indent(by, true));
    });
  }

  return lines;
};

Lp.lockIndentTail = function () {
  if (this.length < 2) {
    return this;
  }

  var infos = getSecret(this).infos;

  return new Lines(infos.map(function (info: any, i: any) {
    info = copyLineInfo(info);
    info.locked = i > 0;
    return info;
  }));
};

Lp.getIndentAt = function(line) {
  assert.ok(line >= 1, "no line " + line + " (line numbers start from 1)");
  var secret = getSecret(this),
  info = secret.infos[line - 1];
  return Math.max(info.indent, 0);
};

Lp.guessTabWidth = function() {
  var secret = getSecret(this);
  if (hasOwn.call(secret, "cachedTabWidth")) {
    return secret.cachedTabWidth;
  }

  var counts: any[] = []; // Sparse array.
  var lastIndent = 0;

  for (var line = 1, last = this.length; line <= last; ++line) {
    var info = secret.infos[line - 1];
    var sliced = info.line.slice(info.sliceStart, info.sliceEnd);

    // Whitespace-only lines don't tell us much about the likely tab
    // width of this code.
    if (isOnlyWhitespace(sliced)) {
      continue;
    }

    var diff = Math.abs(info.indent - lastIndent);
    counts[diff] = ~~counts[diff] + 1;
    lastIndent = info.indent;
  }

  var maxCount = -1;
  var result = 2;

  for (var tabWidth = 1;
       tabWidth < counts.length;
       tabWidth += 1) {
    if (hasOwn.call(counts, tabWidth) &&
        counts[tabWidth] > maxCount) {
      maxCount = counts[tabWidth];
      result = tabWidth;
    }
  }

  return secret.cachedTabWidth = result;
};

// Determine if the list of lines has a first line that starts with a //
// or /* comment. If this is the case, the code may need to be wrapped in
// parens to avoid ASI issues.
Lp.startsWithComment = function () {
  var secret = getSecret(this);
  if (secret.infos.length === 0) {
    return false;
  }
  var firstLineInfo = secret.infos[0],
  sliceStart = firstLineInfo.sliceStart,
  sliceEnd = firstLineInfo.sliceEnd,
  firstLine = firstLineInfo.line.slice(sliceStart, sliceEnd).trim();
  return firstLine.length === 0 ||
    firstLine.slice(0, 2) === "//" ||
    firstLine.slice(0, 2) === "/*";
};

Lp.isOnlyWhitespace = function() {
  return isOnlyWhitespace(this.toString());
};

Lp.isPrecededOnlyByWhitespace = function(pos) {
  var secret = getSecret(this);
  var info = secret.infos[pos.line - 1];
  var indent = Math.max(info.indent, 0);

  var diff = pos.column - indent;
  if (diff <= 0) {
    // If pos.column does not exceed the indentation amount, then
    // there must be only whitespace before it.
    return true;
  }

  var start = info.sliceStart;
  var end = Math.min(start + diff, info.sliceEnd);
  var prefix = info.line.slice(start, end);

  return isOnlyWhitespace(prefix);
};

Lp.getLineLength = function(line) {
  var secret = getSecret(this),
  info = secret.infos[line - 1];
  return this.getIndentAt(line) + info.sliceEnd - info.sliceStart;
};

Lp.nextPos = function(pos, skipSpaces) {
  var l = Math.max(pos.line, 0),
  c = Math.max(pos.column, 0);

  if (c < this.getLineLength(l)) {
    pos.column += 1;

    return skipSpaces
      ? !!this.skipSpaces(pos, false, true)
      : true;
  }

  if (l < this.length) {
    pos.line += 1;
    pos.column = 0;

    return skipSpaces
      ? !!this.skipSpaces(pos, false, true)
      : true;
  }

  return false;
};

Lp.prevPos = function(pos, skipSpaces) {
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

  return skipSpaces
    ? !!this.skipSpaces(pos, true, true)
    : true;
};

Lp.firstPos = function() {
  // Trivial, but provided for completeness.
  return { line: 1, column: 0 };
};

Lp.lastPos = function() {
  return {
    line: this.length,
    column: this.getLineLength(this.length)
  };
};

Lp.skipSpaces = function(pos, backward, modifyInPlace) {
  if (pos) {
    pos = modifyInPlace ? pos : {
      line: pos.line,
      column: pos.column
    };
  } else if (backward) {
    pos = this.lastPos();
  } else {
    pos = this.firstPos();
  }

  if (backward) {
    while (this.prevPos(pos)) {
      if (!isOnlyWhitespace(this.charAt(pos)) &&
          this.nextPos(pos)) {
        return pos;
      }
    }

    return null;

  } else {
    while (isOnlyWhitespace(this.charAt(pos))) {
      if (!this.nextPos(pos)) {
        return null;
      }
    }

    return pos;
  }
};

Lp.trimLeft = function() {
  var pos = this.skipSpaces(this.firstPos(), false, true);
  return pos ? this.slice(pos) : emptyLines;
};

Lp.trimRight = function() {
  var pos = this.skipSpaces(this.lastPos(), true, true);
  return pos ? this.slice(this.firstPos(), pos) : emptyLines;
};

Lp.trim = function() {
  var start = this.skipSpaces(this.firstPos(), false, true);
  if (start === null)
    return emptyLines;

  var end = this.skipSpaces(this.lastPos(), true, true);
  assert.notStrictEqual(end, null);

  return this.slice(start, end);
};

Lp.eachPos = function(callback, startPos, skipSpaces) {
  var pos = this.firstPos();

  if (startPos) {
    pos.line = startPos.line,
    pos.column = startPos.column
  }

  if (skipSpaces && !this.skipSpaces(pos, false, true)) {
    return; // Encountered nothing but spaces.
  }

  do callback.call(this, pos);
  while (this.nextPos(pos, skipSpaces));
};

Lp.bootstrapSlice = function(start, end) {
  var strings = this.toString().split(
    lineTerminatorSeqExp
  ).slice(
    start.line - 1,
    end.line
  );

  strings.push(strings.pop().slice(0, end.column));
  strings[0] = strings[0].slice(start.column);

  return fromString(strings.join("\n"));
};

Lp.slice = function(start, end) {
  if (!end) {
    if (!start) {
      // The client seems to want a copy of this Lines object, but
      // Lines objects are immutable, so it's perfectly adequate to
      // return the same object.
      return this;
    }

    // Slice to the end if no end position was provided.
    end = this.lastPos();
  }

  if (!start) {
    throw new Error("cannot slice with end but not start");
  }

  var secret = getSecret(this);
  var sliced = secret.infos.slice(start.line - 1, end.line);

  if (start.line === end.line) {
    sliced[0] = sliceInfo(sliced[0], start.column, end.column);
  } else {
    assert.ok(start.line < end.line);
    sliced[0] = sliceInfo(sliced[0], start.column);
    sliced.push(sliceInfo(sliced.pop(), 0, end.column));
  }

  var lines = new Lines(sliced);

  if (secret.mappings.length > 0) {
    var newMappings = getSecret(lines).mappings;
    assert.strictEqual(newMappings.length, 0);
    secret.mappings.forEach(function(this: any, mapping: any) {
      var sliced = mapping.slice(this, start, end);
      if (sliced) {
        newMappings.push(sliced);
      }
    }, this);
  }

  return lines;
};

function sliceInfo(info: any, startCol: number, endCol?: number) {
  var sliceStart = info.sliceStart;
  var sliceEnd = info.sliceEnd;
  var indent = Math.max(info.indent, 0);
  var lineLength = indent + sliceEnd - sliceStart;

  if (typeof endCol === "undefined") {
    endCol = lineLength;
  }

  startCol = Math.max(startCol, 0);
  endCol = Math.min(endCol, lineLength);
  endCol = Math.max(endCol, startCol);

  if (endCol < indent) {
    indent = endCol;
    sliceEnd = sliceStart;
  } else {
    sliceEnd -= lineLength - endCol;
  }

  lineLength = endCol;
  lineLength -= startCol;

  if (startCol < indent) {
    indent -= startCol;
  } else {
    startCol -= indent;
    indent = 0;
    sliceStart += startCol;
  }

  assert.ok(indent >= 0);
  assert.ok(sliceStart <= sliceEnd);
  assert.strictEqual(lineLength, indent + sliceEnd - sliceStart);

  if (info.indent === indent &&
      info.sliceStart === sliceStart &&
      info.sliceEnd === sliceEnd) {
    return info;
  }

  return {
    line: info.line,
    indent: indent,
    // A destructive slice always unlocks indentation.
    locked: false,
    sliceStart: sliceStart,
    sliceEnd: sliceEnd
  };
}

Lp.bootstrapSliceString = function(start, end, options) {
  return this.slice(start, end).toString(options);
};

Lp.sliceString = function(start, end, options) {
  if (!end) {
    if (!start) {
      // The client seems to want a copy of this Lines object, but
      // Lines objects are immutable, so it's perfectly adequate to
      // return the same object.
      return this;
    }

    // Slice to the end if no end position was provided.
    end = this.lastPos();
  }

  options = normalizeOptions(options);

  var infos = getSecret(this).infos;
  var parts = [];
  var tabWidth = options.tabWidth;

  for (var line = start.line; line <= end.line; ++line) {
    var info = infos[line - 1];

    if (line === start.line) {
      if (line === end.line) {
        info = sliceInfo(info, start.column, end.column);
      } else {
        info = sliceInfo(info, start.column);
      }
    } else if (line === end.line) {
      info = sliceInfo(info, 0, end.column);
    }

    var indent = Math.max(info.indent, 0);

    var before = info.line.slice(0, info.sliceStart);
    if (options.reuseWhitespace &&
        isOnlyWhitespace(before) &&
        countSpaces(before, options.tabWidth) === indent) {
      // Reuse original spaces if the indentation is correct.
      parts.push(info.line.slice(0, info.sliceEnd));
      continue;
    }

    var tabs = 0;
    var spaces = indent;

    if (options.useTabs) {
      tabs = Math.floor(indent / tabWidth);
      spaces -= tabs * tabWidth;
    }

    var result = "";

    if (tabs > 0) {
      result += new Array(tabs + 1).join("\t");
    }

    if (spaces > 0) {
      result += new Array(spaces + 1).join(" ");
    }

    result += info.line.slice(info.sliceStart, info.sliceEnd);

    parts.push(result);
  }

  return parts.join(options.lineTerminator);
};

Lp.isEmpty = function() {
  return this.length < 2 && this.getLineLength(1) < 1;
};

Lp.join = function(elements) {
  var separator = this;
  var separatorSecret = getSecret(separator);
  var infos: any[] = [];
  var mappings: any[] = [];
  var prevInfo: any;

  function appendSecret(secret: any) {
    if (secret === null)
      return;

    if (prevInfo) {
      var info = secret.infos[0];
      var indent = new Array(info.indent + 1).join(" ");
      var prevLine = infos.length;
      var prevColumn = Math.max(prevInfo.indent, 0) +
        prevInfo.sliceEnd - prevInfo.sliceStart;

      prevInfo.line = prevInfo.line.slice(
        0, prevInfo.sliceEnd) + indent + info.line.slice(
          info.sliceStart, info.sliceEnd);

      // If any part of a line is indentation-locked, the whole line
      // will be indentation-locked.
      prevInfo.locked = prevInfo.locked || info.locked;

      prevInfo.sliceEnd = prevInfo.line.length;

      if (secret.mappings.length > 0) {
        secret.mappings.forEach(function(mapping: any) {
          mappings.push(mapping.add(prevLine, prevColumn));
        });
      }

    } else if (secret.mappings.length > 0) {
      mappings.push.apply(mappings, secret.mappings);
    }

    secret.infos.forEach(function(info: any, i: any) {
      if (!prevInfo || i > 0) {
        prevInfo = copyLineInfo(info);
        infos.push(prevInfo);
      }
    });
  }

  function appendWithSeparator(secret: any, i: any) {
    if (i > 0)
      appendSecret(separatorSecret);
    appendSecret(secret);
  }

  elements.map(function(elem: any) {
    var lines = fromString(elem);
    if (lines.isEmpty())
      return null;
    return getSecret(lines);
  }).forEach(separator.isEmpty()
             ? appendSecret
             : appendWithSeparator);

  if (infos.length < 1)
    return emptyLines;

  var lines = new Lines(infos);

  getSecret(lines).mappings = mappings;

  return lines;
};

export function concat(elements: any) {
  return emptyLines.join(elements);
};

Lp.concat = function(...args) {
  var list = [this];
  list.push.apply(list, args);
  assert.strictEqual(list.length, args.length + 1);
  return emptyLines.join(list);
};

// The emptyLines object needs to be created all the way down here so that
// Lines.prototype will be fully populated.
var emptyLines = fromString("");
