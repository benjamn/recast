// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript and TypeScript code with Oxc:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/oxc")
//   });
//
export interface OxcParserOptions {
  /**
   * Oxc uses the filename in diagnostics. Syntax selection is controlled by
   * `lang`, which defaults to `tsx` so the parser accepts JavaScript, JSX,
   * TypeScript, and TSX syntax.
   */
  filename?: string;
  lang?: "js" | "jsx" | "ts" | "tsx" | "dts";
  sourceType?: "script" | "module" | "commonjs" | "unambiguous";
  astType?: "js" | "ts";
  range?: boolean;
  preserveParens?: boolean;
  showSemanticErrors?: boolean;
}

interface RecastParserOptions {
  range?: boolean;
  sourceType?: OxcParserOptions["sourceType"];
}

interface Position {
  line: number;
  column: number;
}

interface SourceLocation {
  start: Position;
  end: Position;
}

interface OffsetNode {
  type?: string;
  start?: number;
  end?: number;
  loc?: SourceLocation;
  [key: string]: unknown;
}

interface OxcComment {
  type: "Line" | "Block";
  value: string;
  start: number;
  end: number;
}

interface OxcError {
  message: string;
  labels: Array<{
    message: string | null;
    start: number;
    end: number;
  }>;
}

interface OxcParseResult {
  program: OffsetNode;
  comments: OxcComment[];
  errors: OxcError[];
}

const parseSync: (
  filename: string,
  source: string,
  options: OxcParserOptions,
) => OxcParseResult = require("oxc-parser").parseSync;

export function createOxcParser(parserOptions: OxcParserOptions = {}) {
  const {
    filename = "source.tsx",
    lang = "tsx",
    astType = "ts",
    preserveParens = true,
    ...baseOptions
  } = parserOptions;

  return {
    parse(source: string, recastOptions: RecastParserOptions = {}) {
      const result = parseSync(filename, source, {
        ...baseOptions,
        lang,
        astType,
        // Oxc does not currently expose tokens. Explicit parenthesis nodes
        // let Recast preserve parentheses without token look-behind/ahead.
        preserveParens,
        range: recastOptions.range ?? baseOptions.range,
        sourceType: recastOptions.sourceType ?? baseOptions.sourceType,
      });

      if (result.errors.length > 0) {
        throw toSyntaxError(result.errors[0], source);
      }

      const getLocation = createLocationResolver(source);
      const program = result.program;
      addLocations(program, getLocation);

      const hashbang = program.hashbang as OffsetNode | null;
      if (hashbang) {
        const interpreterEnd = includeFollowingLineTerminator(
          source,
          hashbang.end!,
        );
        program.interpreter = {
          type: "InterpreterDirective",
          value: hashbang.value,
          start: hashbang.start,
          end: interpreterEnd,
          loc: {
            start: hashbang.loc!.start,
            end: getLocation(interpreterEnd),
          },
        };
        // Oxc excludes the hashbang from Program.start. Recast expects the
        // Program location to contain its interpreter, or a changed Program
        // can preserve the original hashbang and print the interpreter again.
        program.start = hashbang.start;
        program.loc!.start = hashbang.loc!.start;
        if (Array.isArray(program.range)) {
          program.range[0] = hashbang.start;
        }
        delete program.hashbang;
      }

      const comments = result.comments
        // Oxc reports a hashbang both as Program.hashbang and as a line
        // comment. Recast prints it through Program.interpreter.
        .filter(
          (comment) =>
            !hashbang ||
            comment.start !== hashbang.start ||
            comment.end !== hashbang.end,
        )
        .map((comment) => ({
          ...comment,
          loc: {
            start: getLocation(comment.start),
            end: getLocation(comment.end),
          },
        }));

      program.comments = comments;
      // Supplying an empty array prevents Recast from falling back to
      // Esprima's tokenizer, which cannot tokenize TypeScript. Explicit
      // ParenthesizedExpression nodes cover Recast's main use of tokens.
      program.tokens = [];

      return program;
    },
  };
}

const parser = createOxcParser();

export function parse(
  source: string,
  options?: RecastParserOptions,
): OffsetNode {
  return parser.parse(source, options);
}

function addLocations(
  value: unknown,
  getLocation: (offset: number) => Position,
  seen = new Set<object>(),
): void {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);

  const node = value as OffsetNode;
  if (typeof node.start === "number" && typeof node.end === "number") {
    node.loc = {
      start: getLocation(node.start),
      end: getLocation(node.end),
    };
  }

  Object.keys(node).forEach((key) => {
    if (key === "loc") {
      return;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => addLocations(item, getLocation, seen));
    } else {
      addLocations(child, getLocation, seen);
    }
  });
}

function createLocationResolver(source: string) {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    const character = source.charCodeAt(index);
    if (character === 13 && source.charCodeAt(index + 1) === 10) {
      lineStarts.push(index + 2);
      index++;
    } else if (
      character === 10 ||
      character === 13 ||
      character === 0x2028 ||
      character === 0x2029
    ) {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number): Position => {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (lineStarts[middle] <= offset) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return {
      line: low + 1,
      column: offset - lineStarts[low],
    };
  };
}

function includeFollowingLineTerminator(
  source: string,
  offset: number,
): number {
  if (source[offset] === "\r" && source[offset + 1] === "\n") {
    return offset + 2;
  }
  if (source[offset] === "\r" || source[offset] === "\n") {
    return offset + 1;
  }
  return offset;
}

function toSyntaxError(diagnostic: OxcError, source: string): SyntaxError {
  const error = new SyntaxError(diagnostic.message);
  const label = diagnostic.labels[0];
  if (label) {
    const position = createLocationResolver(source)(label.start);
    Object.assign(error, {
      loc: position,
      pos: label.start,
    });
  }
  Object.defineProperty(error, "cause", {
    value: diagnostic,
    configurable: true,
  });
  return error;
}
