import invariant from "tiny-invariant";
import sourceMap from "source-map";
import { normalize as normalizeOptions, Options } from "./options";
import { namedTypes } from "ast-types";
import { comparePos } from "./util";
import Mapping from "./mapping";

type Pos = namedTypes.Position;

// Goals:
// 1. Minimize new string creation.
// 2. Keep (de)identation O(lines) time.
// 3. Permit negative indentations.
// 4. Enforce immutability.
// 5. No newline characters.

type LineInfo = {
  readonly line: string;
  readonly indent: number;
  readonly locked: boolean;
  readonly sliceStart: number;
  readonly sliceEnd: number;
};

type MutableLineInfo = {
  -readonly [K in keyof LineInfo]: LineInfo[K];
};

export class Lines {
  public readonly length: number;
  public readonly name: string | null;
  private mappings: Mapping[] = [];
  private cachedSourceMap: any = null;
  private cachedTabWidth: number | void = void 0;

  constructor(private infos: LineInfo[], sourceFileName: string | null = null) {
    invariant(infos.length > 0);
    this.length = infos.length;
    this.name = sourceFileName || null;

    if (this.name) {
      this.mappings.push(
        new Mapping(this, {
          start: this.firstPos(),
          end: this.lastPos(),
        }),
      );
    }
  }

  toString(options?: Options) {
    return this.sliceString(this.firstPos(), this.lastPos(), options);
  }

  getSourceMap(sourceMapName: string, sourceRoot?: string) {
    if (!sourceMapName) {
      // Although we could make up a name or generate an anonymous
      // source map, instead we assume that any consumer who does not
      // provide a name does not actually want a source map.
      return null;
    }

    const targetLines = this;

    function updateJSON(json?: any) {
      json = json || {};

      json.file = sourceMapName;

      if (sourceRoot) {
        json.sourceRoot = sourceRoot;
      }

      return json;
    }

    if (targetLines.cachedSourceMap) {
      // Since Lines objects are immutable, we can reuse any source map
      // that was previously generated. Nevertheless, we return a new
      // JSON object here to protect the cached source map from outside
      // modification.
      return updateJSON(targetLines.cachedSourceMap.toJSON());
    }

    const smg = new sourceMap.SourceMapGenerator(updateJSON());
    const sourcesToContents: any = {};

    targetLines.mappings.forEach(function (mapping: any) {
      const sourceCursor =
        mapping.sourceLines.skipSpaces(mapping.sourceLoc.start) ||
        mapping.sourceLines.lastPos();

      const targetCursor =
        targetLines.skipSpaces(mapping.targetLoc.start) ||
        targetLines.lastPos();

      while (
        comparePos(sourceCursor, mapping.sourceLoc.end) < 0 &&
        comparePos(targetCursor, mapping.targetLoc.end) < 0
      ) {
        const sourceChar = mapping.sourceLines.charAt(sourceCursor);
        const targetChar = targetLines.charAt(targetCursor);
        invariant(sourceChar === targetChar);

        const sourceName = mapping.sourceLines.name;

        // Add mappings one character at a time for maximum resolution.
        smg.addMapping({
          source: sourceName,
          original: { line: sourceCursor.line, column: sourceCursor.column },
          generated: { line: targetCursor.line, column: targetCursor.column },
        });

        if (!hasOwn.call(sourcesToContents, sourceName)) {
          const sourceContent = mapping.sourceLines.toString();
          smg.setSourceContent(sourceName, sourceContent);
          sourcesToContents[sourceName] = sourceContent;
        }

        targetLines.nextPos(targetCursor, true);
        mapping.sourceLines.nextPos(sourceCursor, true);
      }
    });

    targetLines.cachedSourceMap = smg;

    return (smg as any).toJSON();
  }

  bootstrapCharAt(pos: Pos) {
    invariant(typeof pos === "object");
    invariant(typeof pos.line === "number");
    invariant(typeof pos.column === "number");

    const line = pos.line,
      column = pos.column,
      strings = this.toString().split(lineTerminatorSeqExp),
      string = strings[line - 1];

    if (typeof string === "undefined") return "";

    if (column === string.length && line < strings.length) return "\n";

    if (column >= string.length) return "";

    return string.charAt(column);
  }

  charAt(pos: Pos) {
    invariant(typeof pos === "object");
    invariant(typeof pos.line === "number");
    invariant(typeof pos.column === "number");

    let line = pos.line,
      column = pos.column,
      secret = this,
      infos = secret.infos,
      info = infos[line - 1],
      c = column;

    if (typeof info === "undefined" || c < 0) return "";

    const indent = this.getIndentAt(line);
    if (c < indent) return " ";

    c += info.sliceStart - indent;

    if (c === info.sliceEnd && line < this.length) return "\n";

    if (c >= info.sliceEnd) return "";

    return info.line.charAt(c);
  }

  stripMargin(width: number, skipFirstLine: boolean) {
    if (width === 0) return this;

    invariant(width > 0, "negative margin: " + width);

    if (skipFirstLine && this.length === 1) return this;

    const lines = new Lines(
      this.infos.map(function (info, i) {
        if (info.line && (i > 0 || !skipFirstLine)) {
          info = {
            ...info,
            indent: Math.max(0, info.indent - width),
          };
        }
        return info;
      }),
    );

    if (this.mappings.length > 0) {
      const newMappings = lines.mappings;
      invariant(newMappings.length === 0);
      this.mappings.forEach(function (mapping) {
        newMappings.push(mapping.indent(width, skipFirstLine, true));
      });
    }

    return lines;
  }

  indent(by: number) {
    if (by === 0) {
      return this;
    }

    const lines = new Lines(
      this.infos.map(function (info) {
        if (info.line && !info.locked) {
          info = {
            ...info,
            indent: info.indent + by,
          };
        }
        return info;
      }),
    );

    if (this.mappings.length > 0) {
      const newMappings = lines.mappings;
      invariant(newMappings.length === 0);
      this.mappings.forEach(function (mapping) {
        newMappings.push(mapping.indent(by));
      });
    }

    return lines;
  }

  indentTail(by: number) {
    if (by === 0) {
      return this;
    }

    if (this.length < 2) {
      return this;
    }

    const lines = new Lines(
      this.infos.map(function (info, i) {
        if (i > 0 && info.line && !info.locked) {
          info = {
            ...info,
            indent: info.indent + by,
          };
        }

        return info;
      }),
    );

    if (this.mappings.length > 0) {
      const newMappings = lines.mappings;
      invariant(newMappings.length === 0);
      this.mappings.forEach(function (mapping) {
        newMappings.push(mapping.indent(by, true));
      });
    }

    return lines;
  }

  lockIndentTail() {
    if (this.length < 2) {
      return this;
    }

    return new Lines(
      this.infos.map((info, i) => ({
        ...info,
        locked: i > 0,
      })),
    );
  }

  getIndentAt(line: number) {
    invariant(line >= 1, "no line " + line + " (line numbers start from 1)");
    return Math.max(this.infos[line - 1].indent, 0);
  }

  guessTabWidth() {
    if (typeof this.cachedTabWidth === "number") {
      return this.cachedTabWidth;
    }

    const counts: number[] = []; // Sparse array.
    let lastIndent = 0;

    for (let line = 1, last = this.length; line <= last; ++line) {
      const info = this.infos[line - 1];
      const sliced = info.line.slice(info.sliceStart, info.sliceEnd);

      // Whitespace-only lines don't tell us much about the likely tab
      // width of this code.
      if (isOnlyWhitespace(sliced)) {
        continue;
      }

      const diff = Math.abs(info.indent - lastIndent);
      counts[diff] = ~~counts[diff] + 1;
      lastIndent = info.indent;
    }

    let maxCount = -1;
    let result = 2;

    for (let tabWidth = 1; tabWidth < counts.length; tabWidth += 1) {
      if (hasOwn.call(counts, tabWidth) && counts[tabWidth] > maxCount) {
        maxCount = counts[tabWidth];
        result = tabWidth;
      }
    }

    return (this.cachedTabWidth = result);
  }

  // Determine if the list of lines has a first line that starts with a //
  // or /* comment. If this is the case, the code may need to be wrapped in
  // parens to avoid ASI issues.
  startsWithComment() {
    if (this.infos.length === 0) {
      return false;
    }
    const firstLineInfo = this.infos[0],
      sliceStart = firstLineInfo.sliceStart,
      sliceEnd = firstLineInfo.sliceEnd,
      firstLine = firstLineInfo.line.slice(sliceStart, sliceEnd).trim();
    return (
      firstLine.length === 0 ||
      firstLine.slice(0, 2) === "//" ||
      firstLine.slice(0, 2) === "/*"
    );
  }

  isOnlyWhitespace() {
    return isOnlyWhitespace(this.toString());
  }

  isPrecededOnlyByWhitespace(pos: Pos) {
    const info = this.infos[pos.line - 1];
    const indent = Math.max(info.indent, 0);

    const diff = pos.column - indent;
    if (diff <= 0) {
      // If pos.column does not exceed the indentation amount, then
      // there must be only whitespace before it.
      return true;
    }

    const start = info.sliceStart;
    const end = Math.min(start + diff, info.sliceEnd);
    const prefix = info.line.slice(start, end);

    return isOnlyWhitespace(prefix);
  }

  getLineLength(line: number) {
    const info = this.infos[line - 1];
    return this.getIndentAt(line) + info.sliceEnd - info.sliceStart;
  }

  nextPos(pos: Pos, skipSpaces: boolean = false) {
    const l = Math.max(pos.line, 0),
      c = Math.max(pos.column, 0);

    if (c < this.getLineLength(l)) {
      pos.column += 1;

      return skipSpaces ? !!this.skipSpaces(pos, false, true) : true;
    }

    if (l < this.length) {
      pos.line += 1;
      pos.column = 0;

      return skipSpaces ? !!this.skipSpaces(pos, false, true) : true;
    }

    return false;
  }

  prevPos(pos: Pos, skipSpaces: boolean = false) {
    let l = pos.line,
      c = pos.column;

    if (c < 1) {
      l -= 1;

      if (l < 1) return false;

      c = this.getLineLength(l);
    } else {
      c = Math.min(c - 1, this.getLineLength(l));
    }

    pos.line = l;
    pos.column = c;

    return skipSpaces ? !!this.skipSpaces(pos, true, true) : true;
  }

  firstPos() {
    // Trivial, but provided for completeness.
    return { line: 1, column: 0 };
  }

  lastPos() {
    return {
      line: this.length,
      column: this.getLineLength(this.length),
    };
  }

  skipSpaces(
    pos: Pos,
    backward: boolean = false,
    modifyInPlace: boolean = false,
  ) {
    if (pos) {
      pos = modifyInPlace
        ? pos
        : {
            line: pos.line,
            column: pos.column,
          };
    } else if (backward) {
      pos = this.lastPos();
    } else {
      pos = this.firstPos();
    }

    if (backward) {
      while (this.prevPos(pos)) {
        if (!isOnlyWhitespace(this.charAt(pos)) && this.nextPos(pos)) {
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
  }

  trimLeft() {
    const pos = this.skipSpaces(this.firstPos(), false, true);
    return pos ? this.slice(pos) : emptyLines;
  }

  trimRight() {
    const pos = this.skipSpaces(this.lastPos(), true, true);
    return pos ? this.slice(this.firstPos(), pos) : emptyLines;
  }

  trim() {
    const start = this.skipSpaces(this.firstPos(), false, true);
    if (start === null) {
      return emptyLines;
    }

    const end = this.skipSpaces(this.lastPos(), true, true);
    if (end === null) {
      return emptyLines;
    }

    return this.slice(start, end);
  }

  eachPos(
    callback: (pos: Pos) => any,
    startPos: Pos = this.firstPos(),
    skipSpaces: boolean = false,
  ) {
    const pos = this.firstPos();

    if (startPos) {
      (pos.line = startPos.line), (pos.column = startPos.column);
    }

    if (skipSpaces && !this.skipSpaces(pos, false, true)) {
      return; // Encountered nothing but spaces.
    }

    do callback.call(this, pos);
    while (this.nextPos(pos, skipSpaces));
  }

  bootstrapSlice(start: Pos, end: Pos) {
    const strings = this.toString()
      .split(lineTerminatorSeqExp)
      .slice(start.line - 1, end.line);

    if (strings.length > 0) {
      strings.push(strings.pop()!.slice(0, end.column));
      strings[0] = strings[0].slice(start.column);
    }

    return fromString(strings.join("\n"));
  }

  slice(start?: Pos, end?: Pos) {
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

    const sliced = this.infos.slice(start.line - 1, end.line);

    if (start.line === end.line) {
      sliced[0] = sliceInfo(sliced[0], start.column, end.column);
    } else {
      invariant(start.line < end.line);
      sliced[0] = sliceInfo(sliced[0], start.column);
      sliced.push(sliceInfo(sliced.pop()!, 0, end.column));
    }

    const lines = new Lines(sliced);

    if (this.mappings.length > 0) {
      const newMappings = lines.mappings;
      invariant(newMappings.length === 0);
      this.mappings.forEach(function (this: Lines, mapping) {
        const sliced = mapping.slice(this, start, end);
        if (sliced) {
          newMappings.push(sliced);
        }
      }, this);
    }

    return lines;
  }

  bootstrapSliceString(start: Pos, end: Pos, options?: Options) {
    return this.slice(start, end).toString(options);
  }

  sliceString(
    start: Pos = this.firstPos(),
    end: Pos = this.lastPos(),
    options?: Options,
  ) {
    const { tabWidth, useTabs, reuseWhitespace, lineTerminator } =
      normalizeOptions(options);

    const parts = [];

    for (let line = start.line; line <= end.line; ++line) {
      let info = this.infos[line - 1];

      if (line === start.line) {
        if (line === end.line) {
          info = sliceInfo(info, start.column, end.column);
        } else {
          info = sliceInfo(info, start.column);
        }
      } else if (line === end.line) {
        info = sliceInfo(info, 0, end.column);
      }

      const indent = Math.max(info.indent, 0);

      const before = info.line.slice(0, info.sliceStart);
      if (
        reuseWhitespace &&
        isOnlyWhitespace(before) &&
        countSpaces(before, tabWidth) === indent
      ) {
        // Reuse original spaces if the indentation is correct.
        parts.push(info.line.slice(0, info.sliceEnd));
        continue;
      }

      let tabs = 0;
      let spaces = indent;

      if (useTabs) {
        tabs = Math.floor(indent / tabWidth);
        spaces -= tabs * tabWidth;
      }

      let result = "";

      if (tabs > 0) {
        result += new Array(tabs + 1).join("\t");
      }

      if (spaces > 0) {
        result += new Array(spaces + 1).join(" ");
      }

      result += info.line.slice(info.sliceStart, info.sliceEnd);

      parts.push(result);
    }

    return parts.join(lineTerminator);
  }

  isEmpty() {
    return this.length < 2 && this.getLineLength(1) < 1;
  }

  join(elements: (string | Lines)[]) {
    const separator = this;
    const infos: LineInfo[] = [];
    const mappings: Mapping[] = [];
    let prevInfo: MutableLineInfo | undefined;

    function appendLines(linesOrNull: Lines | null) {
      if (linesOrNull === null) {
        return;
      }

      if (prevInfo) {
        const info = linesOrNull.infos[0];
        const indent = new Array(info.indent + 1).join(" ");
        const prevLine = infos.length;
        const prevColumn =
          Math.max(prevInfo.indent, 0) +
          prevInfo.sliceEnd -
          prevInfo.sliceStart;

        prevInfo.line =
          prevInfo.line.slice(0, prevInfo.sliceEnd) +
          indent +
          info.line.slice(info.sliceStart, info.sliceEnd);

        // If any part of a line is indentation-locked, the whole line
        // will be indentation-locked.
        prevInfo.locked = prevInfo.locked || info.locked;

        prevInfo.sliceEnd = prevInfo.line.length;

        if (linesOrNull.mappings.length > 0) {
          linesOrNull.mappings.forEach(function (mapping) {
            mappings.push(mapping.add(prevLine, prevColumn));
          });
        }
      } else if (linesOrNull.mappings.length > 0) {
        mappings.push.apply(mappings, linesOrNull.mappings);
      }

      linesOrNull.infos.forEach(function (info, i) {
        if (!prevInfo || i > 0) {
          prevInfo = { ...info };
          infos.push(prevInfo);
        }
      });
    }

    function appendWithSeparator(linesOrNull: Lines | null, i: number) {
      if (i > 0) appendLines(separator);
      appendLines(linesOrNull);
    }

    elements
      .map(function (elem) {
        const lines = fromString(elem);
        if (lines.isEmpty()) return null;
        return lines;
      })
      .forEach((linesOrNull, i) => {
        if (separator.isEmpty()) {
          appendLines(linesOrNull);
        } else {
          appendWithSeparator(linesOrNull, i);
        }
      });

    if (infos.length < 1) return emptyLines;

    const lines = new Lines(infos);

    lines.mappings = mappings;

    return lines;
  }

  concat(...args: (string | Lines)[]) {
    const list: typeof args = [this];
    list.push.apply(list, args);
    invariant(list.length === args.length + 1);
    return emptyLines.join(list);
  }
}

const fromStringCache: Record<string, Lines> = {};
const hasOwn = fromStringCache.hasOwnProperty;
const maxCacheKeyLen = 10;

export function countSpaces(spaces: string, tabWidth?: number) {
  let count = 0;
  const len = spaces.length;

  for (let i = 0; i < len; ++i) {
    switch (spaces.charCodeAt(i)) {
      case 9: {
        // '\t'
        invariant(typeof tabWidth === "number");
        invariant(tabWidth! > 0);

        const next = Math.ceil(count / tabWidth!) * tabWidth!;
        if (next === count) {
          count += tabWidth!;
        } else {
          count = next;
        }

        break;
      }

      case 11: // '\v'
      case 12: // '\f'
      case 13: // '\r'
      case 0xfeff: // zero-width non-breaking space
        // These characters contribute nothing to indentation.
        break;

      case 32: // ' '
      default:
        // Treat all other whitespace like ' '.
        count += 1;
        break;
    }
  }

  return count;
}

const leadingSpaceExp = /^\s*/;

// As specified here: http://www.ecma-international.org/ecma-262/6.0/#sec-line-terminators
const lineTerminatorSeqExp =
  /\u000D\u000A|\u000D(?!\u000A)|\u000A|\u2028|\u2029/;

/**
 * @param {Object} options - Options object that configures printing.
 */
export function fromString(string: string | Lines, options?: Options): Lines {
  if (string instanceof Lines) return string;

  string += "";

  const tabWidth = options && options.tabWidth;
  const tabless = string.indexOf("\t") < 0;
  const cacheable = !options && tabless && string.length <= maxCacheKeyLen;

  invariant(
    tabWidth || tabless,
    "No tab width specified but encountered tabs in string\n" + string,
  );

  if (cacheable && hasOwn.call(fromStringCache, string))
    return fromStringCache[string];

  const lines = new Lines(
    string.split(lineTerminatorSeqExp).map(function (line) {
      // TODO: handle null exec result
      const spaces = leadingSpaceExp.exec(line)![0];
      return {
        line: line,
        indent: countSpaces(spaces, tabWidth),
        // Boolean indicating whether this line can be reindented.
        locked: false,
        sliceStart: spaces.length,
        sliceEnd: line.length,
      };
    }),
    normalizeOptions(options).sourceFileName,
  );

  if (cacheable) fromStringCache[string] = lines;

  return lines;
}

function isOnlyWhitespace(string: string) {
  return !/\S/.test(string);
}

function sliceInfo(info: LineInfo, startCol: number, endCol?: number) {
  let sliceStart = info.sliceStart;
  let sliceEnd = info.sliceEnd;
  let indent = Math.max(info.indent, 0);
  let lineLength = indent + sliceEnd - sliceStart;

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

  invariant(indent >= 0);
  invariant(sliceStart <= sliceEnd);
  invariant(lineLength === indent + sliceEnd - sliceStart);

  if (
    info.indent === indent &&
    info.sliceStart === sliceStart &&
    info.sliceEnd === sliceEnd
  ) {
    return info;
  }

  return {
    line: info.line,
    indent: indent,
    // A destructive slice always unlocks indentation.
    locked: false,
    sliceStart: sliceStart,
    sliceEnd: sliceEnd,
  };
}

export function concat(elements: (string | Lines)[]) {
  return emptyLines.join(elements);
}

// The emptyLines object needs to be created all the way down here so that
// Lines.prototype will be fully populated.
const emptyLines = fromString("");
