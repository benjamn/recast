import invariant from "tiny-invariant";
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

  slice(lines: Lines, start: Pos, end: Pos = lines.lastPos()) {
    const sourceLines = this.sourceLines;
    let sourceLoc = this.sourceLoc;
    let targetLoc = this.targetLoc;

    function skip(name: "start" | "end") {
      const sourceFromPos = sourceLoc[name];
      const targetFromPos = targetLoc[name];
      let targetToPos = start;

      if (name === "end") {
        targetToPos = end;
      } else {
        invariant(name === "start");
      }

      return skipChars(
        sourceLines,
        sourceFromPos,
        lines,
        targetFromPos,
        targetToPos,
      );
    }

    if (comparePos(start, targetLoc.start) <= 0) {
      if (comparePos(targetLoc.end, end) <= 0) {
        targetLoc = {
          start: subtractPos(targetLoc.start, start.line, start.column),
          end: subtractPos(targetLoc.end, start.line, start.column),
        };

        // The sourceLoc can stay the same because the contents of the
        // targetLoc have not changed.
      } else if (comparePos(end, targetLoc.start) <= 0) {
        return null;
      } else {
        sourceLoc = {
          start: sourceLoc.start,
          end: skip("end"),
        };

        targetLoc = {
          start: subtractPos(targetLoc.start, start.line, start.column),
          end: subtractPos(end, start.line, start.column),
        };
      }
    } else {
      if (comparePos(targetLoc.end, start) <= 0) {
        return null;
      }

      if (comparePos(targetLoc.end, end) <= 0) {
        sourceLoc = {
          start: skip("start"),
          end: sourceLoc.end,
        };

        targetLoc = {
          // Same as subtractPos(start, start.line, start.column):
          start: { line: 1, column: 0 },
          end: subtractPos(targetLoc.end, start.line, start.column),
        };
      } else {
        sourceLoc = {
          start: skip("start"),
          end: skip("end"),
        };

        targetLoc = {
          // Same as subtractPos(start, start.line, start.column):
          start: { line: 1, column: 0 },
          end: subtractPos(end, start.line, start.column),
        };
      }
    }

    return new Mapping(this.sourceLines, sourceLoc, targetLoc);
  }

  add(line: number, column: number) {
    return new Mapping(this.sourceLines, this.sourceLoc, {
      start: addPos(this.targetLoc.start, line, column),
      end: addPos(this.targetLoc.end, line, column),
    });
  }

  subtract(line: number, column: number) {
    return new Mapping(this.sourceLines, this.sourceLoc, {
      start: subtractPos(this.targetLoc.start, line, column),
      end: subtractPos(this.targetLoc.end, line, column),
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

    let targetLoc = this.targetLoc;
    const startLine = targetLoc.start.line;
    const endLine = targetLoc.end.line;

    if (skipFirstLine && startLine === 1 && endLine === 1) {
      return this;
    }

    targetLoc = {
      start: targetLoc.start,
      end: targetLoc.end,
    };

    if (!skipFirstLine || startLine > 1) {
      const startColumn = targetLoc.start.column + by;
      targetLoc.start = {
        line: startLine,
        column: noNegativeColumns ? Math.max(0, startColumn) : startColumn,
      };
    }

    if (!skipFirstLine || endLine > 1) {
      const endColumn = targetLoc.end.column + by;
      targetLoc.end = {
        line: endLine,
        column: noNegativeColumns ? Math.max(0, endColumn) : endColumn,
      };
    }

    return new Mapping(this.sourceLines, this.sourceLoc, targetLoc);
  }
}

function addPos(toPos: any, line: number, column: number) {
  return {
    line: toPos.line + line - 1,
    column: toPos.line === 1 ? toPos.column + column : toPos.column,
  };
}

function subtractPos(fromPos: any, line: number, column: number) {
  return {
    line: fromPos.line - line + 1,
    column: fromPos.line === line ? fromPos.column - column : fromPos.column,
  };
}

function skipChars(
  sourceLines: Lines,
  sourceFromPos: Pos,
  targetLines: Lines,
  targetFromPos: Pos,
  targetToPos: Pos,
) {
  const targetComparison = comparePos(targetFromPos, targetToPos);
  if (targetComparison === 0) {
    // Trivial case: no characters to skip.
    return sourceFromPos;
  }

  let sourceCursor, targetCursor;
  if (targetComparison < 0) {
    // Skipping forward.
    sourceCursor =
      sourceLines.skipSpaces(sourceFromPos) || sourceLines.lastPos();
    targetCursor =
      targetLines.skipSpaces(targetFromPos) || targetLines.lastPos();

    const lineDiff = targetToPos.line - targetCursor.line;
    sourceCursor.line += lineDiff;
    targetCursor.line += lineDiff;

    if (lineDiff > 0) {
      // If jumping to later lines, reset columns to the beginnings
      // of those lines.
      sourceCursor.column = 0;
      targetCursor.column = 0;
    } else {
      invariant(lineDiff === 0);
    }

    while (
      comparePos(targetCursor, targetToPos) < 0 &&
      targetLines.nextPos(targetCursor, true)
    ) {
      invariant(sourceLines.nextPos(sourceCursor, true));
      invariant(
        sourceLines.charAt(sourceCursor) === targetLines.charAt(targetCursor),
      );
    }
  } else {
    // Skipping backward.
    sourceCursor =
      sourceLines.skipSpaces(sourceFromPos, true) || sourceLines.firstPos();
    targetCursor =
      targetLines.skipSpaces(targetFromPos, true) || targetLines.firstPos();

    const lineDiff = targetToPos.line - targetCursor.line;
    sourceCursor.line += lineDiff;
    targetCursor.line += lineDiff;

    if (lineDiff < 0) {
      // If jumping to earlier lines, reset columns to the ends of
      // those lines.
      sourceCursor.column = sourceLines.getLineLength(sourceCursor.line);
      targetCursor.column = targetLines.getLineLength(targetCursor.line);
    } else {
      invariant(lineDiff === 0);
    }

    while (
      comparePos(targetToPos, targetCursor) < 0 &&
      targetLines.prevPos(targetCursor, true)
    ) {
      invariant(sourceLines.prevPos(sourceCursor, true));
      invariant(
        sourceLines.charAt(sourceCursor) === targetLines.charAt(targetCursor),
      );
    }
  }

  return sourceCursor;
}
