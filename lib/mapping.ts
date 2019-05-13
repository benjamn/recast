import assert from "assert";
import { comparePos } from "./util";
import { namedTypes } from "ast-types";
import { Lines } from "./lines";

type Pos = namedTypes.Position;
type Loc = namedTypes.SourceLocation;

export default class Mapping {
  constructor(
    public sourceLines: Lines,
    public sourceLoc: Loc,
    public targetLoc: Loc = sourceLoc,
  ) {}

  slice(
    lines: Lines,
    start: Pos,
    end: Pos = lines.lastPos(),
  ) {
    var sourceLines = this.sourceLines;
    var sourceLoc = this.sourceLoc;
    var targetLoc = this.targetLoc;

    function skip(name: "start" | "end") {
      var sourceFromPos = sourceLoc[name];
      var targetFromPos = targetLoc[name];
      var targetToPos = start;

      if (name === "end") {
        targetToPos = end;
      } else {
        assert.strictEqual(name, "start");
      }

      return skipChars(
        sourceLines, sourceFromPos,
        lines, targetFromPos, targetToPos
      );
    }

    if (comparePos(start, targetLoc.start) <= 0) {
      if (comparePos(targetLoc.end, end) <= 0) {
        targetLoc = {
          start: subtractPos(targetLoc.start, start.line, start.column),
          end: subtractPos(targetLoc.end, start.line, start.column)
        };

        // The sourceLoc can stay the same because the contents of the
        // targetLoc have not changed.

      } else if (comparePos(end, targetLoc.start) <= 0) {
        return null;

      } else {
        sourceLoc = {
          start: sourceLoc.start,
          end: skip("end")
        };

        targetLoc = {
          start: subtractPos(targetLoc.start, start.line, start.column),
          end: subtractPos(end, start.line, start.column)
        };
      }

    } else {
      if (comparePos(targetLoc.end, start) <= 0) {
        return null;
      }

      if (comparePos(targetLoc.end, end) <= 0) {
        sourceLoc = {
          start: skip("start"),
          end: sourceLoc.end
        };

        targetLoc = {
          // Same as subtractPos(start, start.line, start.column):
          start: { line: 1, column: 0 },
          end: subtractPos(targetLoc.end, start.line, start.column)
        };

      } else {
        sourceLoc = {
          start: skip("start"),
          end: skip("end")
        };

        targetLoc = {
          // Same as subtractPos(start, start.line, start.column):
          start: { line: 1, column: 0 },
          end: subtractPos(end, start.line, start.column)
        };
      }
    }

    return new Mapping(this.sourceLines, sourceLoc, targetLoc);
  }

  add(line: number, column: number) {
    return new Mapping(this.sourceLines, this.sourceLoc, {
      start: addPos(this.targetLoc.start, line, column),
      end: addPos(this.targetLoc.end, line, column)
    });
  }

  subtract(line: number, column: number) {
    return new Mapping(this.sourceLines, this.sourceLoc, {
      start: subtractPos(this.targetLoc.start, line, column),
      end: subtractPos(this.targetLoc.end, line, column)
    });
  }

  indent(
    by: number,
    skipFirstLine: boolean = false,
    noNegativeColumns: boolean = false,
  ) {
    if (by === 0) {
      return this;
    }

    var targetLoc = this.targetLoc;
    var startLine = targetLoc.start.line;
    var endLine = targetLoc.end.line;

    if (skipFirstLine && startLine === 1 && endLine === 1) {
      return this;
    }

    targetLoc = {
      start: targetLoc.start,
      end: targetLoc.end
    };

    if (!skipFirstLine || startLine > 1) {
      var startColumn = targetLoc.start.column + by;
      targetLoc.start = {
        line: startLine,
        column: noNegativeColumns
          ? Math.max(0, startColumn)
          : startColumn
      };
    }

    if (!skipFirstLine || endLine > 1) {
      var endColumn = targetLoc.end.column + by;
      targetLoc.end = {
        line: endLine,
        column: noNegativeColumns
          ? Math.max(0, endColumn)
          : endColumn
      };
    }

    return new Mapping(this.sourceLines, this.sourceLoc, targetLoc);
  }
}

function addPos(toPos: any, line: number, column: number) {
  return {
    line: toPos.line + line - 1,
    column: (toPos.line === 1)
      ? toPos.column + column
      : toPos.column
  };
}

function subtractPos(fromPos: any, line: number, column: number) {
  return {
    line: fromPos.line - line + 1,
    column: (fromPos.line === line)
      ? fromPos.column - column
      : fromPos.column
  };
}

function skipChars(
  sourceLines: Lines,
  sourceFromPos: Pos,
  targetLines: Lines,
  targetFromPos: Pos,
  targetToPos: Pos,
) {
  var targetComparison = comparePos(targetFromPos, targetToPos);
  if (targetComparison === 0) {
    // Trivial case: no characters to skip.
    return sourceFromPos;
  }

  if (targetComparison < 0) {
    // Skipping forward.
    var sourceCursor = sourceLines.skipSpaces(sourceFromPos) || sourceLines.lastPos();
    var targetCursor = targetLines.skipSpaces(targetFromPos) || targetLines.lastPos();

    var lineDiff = targetToPos.line - targetCursor.line;
    sourceCursor.line += lineDiff;
    targetCursor.line += lineDiff;

    if (lineDiff > 0) {
      // If jumping to later lines, reset columns to the beginnings
      // of those lines.
      sourceCursor.column = 0;
      targetCursor.column = 0;
    } else {
      assert.strictEqual(lineDiff, 0);
    }

    while (comparePos(targetCursor, targetToPos) < 0 &&
           targetLines.nextPos(targetCursor, true)) {
      assert.ok(sourceLines.nextPos(sourceCursor, true));
      assert.strictEqual(
        sourceLines.charAt(sourceCursor),
        targetLines.charAt(targetCursor)
      );
    }

  } else {
    // Skipping backward.
    var sourceCursor = sourceLines.skipSpaces(sourceFromPos, true) || sourceLines.firstPos();
    var targetCursor = targetLines.skipSpaces(targetFromPos, true) || targetLines.firstPos();

    var lineDiff = targetToPos.line - targetCursor.line;
    sourceCursor.line += lineDiff;
    targetCursor.line += lineDiff;

    if (lineDiff < 0) {
      // If jumping to earlier lines, reset columns to the ends of
      // those lines.
      sourceCursor.column = sourceLines.getLineLength(sourceCursor.line);
      targetCursor.column = targetLines.getLineLength(targetCursor.line);
    } else {
      assert.strictEqual(lineDiff, 0);
    }

    while (comparePos(targetToPos, targetCursor) < 0 &&
           targetLines.prevPos(targetCursor, true)) {
      assert.ok(sourceLines.prevPos(sourceCursor, true));
      assert.strictEqual(
        sourceLines.charAt(sourceCursor),
        targetLines.charAt(targetCursor)
      );
    }
  }

  return sourceCursor;
}
