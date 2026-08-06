// This module is suitable for passing as options.parser when calling
// recast.parse to process JavaScript and TypeScript code with Oxc:
//
//   const ast = recast.parse(source, {
//     parser: require("recast/parsers/oxc")
//   });
//
import { registerOxcAstTypesExtensions } from "./_oxc_ast_types";

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

registerOxcAstTypesExtensions();

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
        range: baseOptions.range ?? recastOptions.range,
        sourceType: baseOptions.sourceType ?? recastOptions.sourceType,
      });

      if (result.errors.length > 0) {
        throw toSyntaxError(result.errors[0], source);
      }

      const getLocation = createLocationResolver(source);
      const program = result.program;
      normalizeAst(program, source);
      addLocations(program, getLocation);

      const hashbang = program.hashbang as OffsetNode | null;
      if (hashbang) {
        const interpreterEnd = includeFollowingLineTerminator(
          source,
          hashbang.end!,
        );
        const interpreter: OffsetNode = {
          type: "InterpreterDirective",
          value: hashbang.value,
          start: hashbang.start,
          end: interpreterEnd,
          loc: {
            start: hashbang.loc!.start,
            end: getLocation(interpreterEnd),
          },
        };
        if (Array.isArray(hashbang.range)) {
          interpreter.range = [hashbang.start, interpreterEnd];
        }
        program.interpreter = interpreter;
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

function normalizeAst(
  value: unknown,
  source: string,
  seen = new Set<object>(),
): void {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);

  const node = value as OffsetNode;

  switch (node.type) {
    case "PropertyDefinition":
      node.type = "ClassProperty";
      break;

    case "TSAbstractPropertyDefinition":
      node.type = "ClassProperty";
      node.abstract = true;
      break;

    case "AccessorProperty":
      node.type = "ClassAccessorProperty";
      break;

    case "TSAbstractAccessorProperty":
      node.type = "ClassAccessorProperty";
      node.abstract = true;
      break;

    case "TSInterfaceHeritage":
    case "TSClassImplements":
      node.type = "TSExpressionWithTypeArguments";
      normalizeTypeArguments(node);
      break;

    case "ClassDeclaration":
    case "ClassExpression":
      node.superTypeParameters = node.superTypeArguments;
      delete node.superTypeArguments;
      break;

    case "TSTypeReference":
    case "TSInstantiationExpression":
    case "TSTypeQuery":
    case "JSXOpeningElement":
    case "TaggedTemplateExpression":
    case "CallExpression":
    case "OptionalCallExpression":
    case "NewExpression":
      normalizeTypeArguments(node);
      break;

    case "TSFunctionType":
    case "TSConstructorType":
    case "TSMethodSignature":
    case "TSCallSignatureDeclaration":
    case "TSConstructSignatureDeclaration":
      node.parameters = node.params;
      node.typeAnnotation = node.returnType;
      delete node.params;
      delete node.returnType;
      break;

    case "TSEnumDeclaration": {
      const body = node.body as OffsetNode;
      node.members = body.members;
      delete node.body;
      break;
    }

    case "TSMappedType":
      normalizeMappedType(node);
      break;

    case "TSTypeParameter":
      if (node.constraint === null) {
        delete node.constraint;
      }
      if (node.default === null) {
        delete node.default;
      }
      break;

    case "MethodDefinition":
      if (
        (node.value as OffsetNode | undefined)?.type ===
        "TSEmptyBodyFunctionExpression"
      ) {
        normalizeDeclareMethod(node, false);
      }
      break;

    case "TSAbstractMethodDefinition":
      normalizeDeclareMethod(node, true);
      break;

    case "PrivateIdentifier": {
      const name = node.name;
      node.type = "PrivateName";
      node.id = {
        type: "Identifier",
        name,
        start: node.start! + 1,
        end: node.end,
      };
      if (Array.isArray(node.range)) {
        (node.id as OffsetNode).range = [node.start! + 1, node.end];
      }
      delete node.name;
      break;
    }

    case "ImportExpression":
      if (node.options || node.phase) {
        normalizeDynamicImport(node);
      }
      break;

    case "TSImportType":
      node.argument = node.source;
      node.typeParameters = node.typeArguments;
      delete node.source;
      delete node.typeArguments;
      break;

    case "TSTemplateLiteralType":
      normalizeTemplateLiteralType(node);
      break;

    case "TSLiteralType":
      normalizeTsLiteral(node);
      break;

    case "ImportDeclaration":
    case "ExportAllDeclaration":
    case "ExportNamedDeclaration": {
      if (Array.isArray(node.attributes)) {
        const attributes = node.attributes as OffsetNode[];
        node.assertions = attributes;
        node.importAttributesKeyword = getImportAttributesKeyword(
          node,
          attributes,
          source,
        );
        delete node.attributes;
      }
      break;
    }
  }

  Object.keys(node).forEach((key) => {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => normalizeAst(item, source, seen));
    } else {
      normalizeAst(child, source, seen);
    }
  });
}

function normalizeDeclareMethod(node: OffsetNode, abstract: boolean): void {
  const value = node.value as OffsetNode;
  node.type = "TSDeclareMethod";
  node.abstract = abstract;
  node.async = value.async;
  node.generator = value.generator;
  node.params = value.params;
  node.returnType = value.returnType;
  node.typeParameters = value.typeParameters;
  if (node.accessibility === null) {
    delete node.accessibility;
  }
  delete node.value;
}

function normalizeTypeArguments(node: OffsetNode): void {
  node.typeParameters = node.typeArguments;
  delete node.typeArguments;
}

function normalizeMappedType(node: OffsetNode): void {
  const key = node.key as OffsetNode;
  const constraint = node.constraint as OffsetNode;
  const typeParameter: OffsetNode = {
    type: "TSTypeParameter",
    name: key,
    constraint,
    start: key.start,
    end: constraint.end,
  };
  if (Array.isArray(node.range)) {
    typeParameter.range = [key.start, constraint.end];
  }

  node.typeParameter = typeParameter;
  delete node.key;
  delete node.constraint;
}

function normalizeTemplateLiteralType(node: OffsetNode): void {
  const literal: OffsetNode = {
    type: "TemplateLiteral",
    quasis: node.quasis,
    expressions: node.types,
    start: node.start,
    end: node.end,
  };
  if (Array.isArray(node.range)) {
    literal.range = [...node.range];
  }

  node.type = "TSLiteralType";
  node.literal = literal;
  delete node.quasis;
  delete node.types;
}

function normalizeTsLiteral(node: OffsetNode): void {
  const literal = node.literal as OffsetNode;
  if (literal.type !== "Literal") {
    return;
  }

  if (typeof literal.value === "string") {
    literal.type = "StringLiteral";
  } else if (typeof literal.value === "number") {
    literal.type = "NumericLiteral";
  } else if (typeof literal.value === "boolean") {
    literal.type = "BooleanLiteral";
  } else if (typeof literal.value === "bigint") {
    literal.type = "BigIntLiteral";
    literal.value = String(literal.bigint ?? literal.value);
    delete literal.bigint;
  }
}

function normalizeDynamicImport(node: OffsetNode): void {
  const source = node.source;
  const options = node.options;
  const phase = node.phase;
  const calleeEnd = node.start! + "import".length;
  const importCallee: OffsetNode = {
    type: "Import",
    start: node.start,
    end: calleeEnd,
  };
  if (Array.isArray(node.range)) {
    importCallee.range = [node.start, calleeEnd];
  }

  let callee = importCallee;
  if (typeof phase === "string") {
    const propertyStart = calleeEnd + 1;
    const propertyEnd = propertyStart + phase.length;
    const property: OffsetNode = {
      type: "Identifier",
      name: phase,
      start: propertyStart,
      end: propertyEnd,
    };
    callee = {
      type: "MemberExpression",
      object: importCallee,
      property,
      computed: false,
      optional: false,
      start: node.start,
      end: propertyEnd,
    };
    if (Array.isArray(node.range)) {
      property.range = [propertyStart, propertyEnd];
      callee.range = [node.start, propertyEnd];
    }
  }

  node.type = "CallExpression";
  node.callee = callee;
  node.arguments = options ? [source, options] : [source];
  node.optional = false;
  delete node.source;
  delete node.options;
  delete node.phase;
}

function getImportAttributesKeyword(
  node: OffsetNode,
  attributes: OffsetNode[],
  source: string,
): "assert" | "with" | undefined {
  const sourceNode = node.source as OffsetNode;
  const clauseEnd = attributes[0]?.start ?? node.end;
  if (typeof sourceNode?.end === "number" && typeof clauseEnd === "number") {
    const clause = source
      .slice(sourceNode.end, clauseEnd)
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, " ");
    const match = /\b(assert|with)\s*\{/.exec(clause);
    if (match) {
      return match[1] as "assert" | "with";
    }
  }
  return attributes.length > 0 ? "assert" : undefined;
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
