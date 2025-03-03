import invariant from "tiny-invariant";
import * as types from "ast-types";
import { printComments } from "./comments";
import FastPath from "./fast-path";
import { concat, fromString, Lines } from "./lines";
import { normalize as normalizeOptions } from "./options";
import { getReprinter } from "./patcher";
import * as util from "./util";
const namedTypes = types.namedTypes;
const isString = types.builtInTypes.string;
const isObject = types.builtInTypes.object;

export interface PrintResultType {
  code: string;
  map?: any;
  toString(): string;
}

interface PrintResultConstructor {
  new (code: any, sourceMap?: any): PrintResultType;
}

const PrintResult = function PrintResult(
  this: PrintResultType,
  code: any,
  sourceMap?: any,
) {
  invariant(this instanceof PrintResult);

  isString.assert(code);
  this.code = code;

  if (sourceMap) {
    isObject.assert(sourceMap);
    this.map = sourceMap;
  }
} as any as PrintResultConstructor;

const PRp: PrintResultType = PrintResult.prototype;
let warnedAboutToString = false;

PRp.toString = function () {
  if (!warnedAboutToString) {
    console.warn(
      "Deprecation warning: recast.print now returns an object with " +
        "a .code property. You appear to be treating the object as a " +
        "string, which might still work but is strongly discouraged.",
    );

    warnedAboutToString = true;
  }

  return this.code;
};

const emptyPrintResult = new PrintResult("");

interface PrinterType {
  print(ast: any): PrintResultType;
  printGenerically(ast: any): PrintResultType;
}

interface PrinterConstructor {
  new (config?: any): PrinterType;
}

const Printer = function Printer(this: PrinterType, config?: any) {
  invariant(this instanceof Printer);

  const explicitTabWidth = config && config.tabWidth;
  config = normalizeOptions(config);

  // It's common for client code to pass the same options into both
  // recast.parse and recast.print, but the Printer doesn't need (and
  // can be confused by) config.sourceFileName, so we null it out.
  config.sourceFileName = null;

  // Non-destructively modifies options with overrides, and returns a
  // new print function that uses the modified options.
  function makePrintFunctionWith(options: any, overrides: any) {
    options = Object.assign({}, options, overrides);
    return (path: any) => print(path, options);
  }

  function print(path: any, options: any) {
    invariant(path instanceof FastPath);
    options = options || {};

    if (options.includeComments) {
      return printComments(
        path,
        makePrintFunctionWith(options, {
          includeComments: false,
        }),
      );
    }

    const oldTabWidth = config.tabWidth;

    if (!explicitTabWidth) {
      const loc = path.getNode().loc;
      if (loc && loc.lines && loc.lines.guessTabWidth) {
        config.tabWidth = loc.lines.guessTabWidth();
      }
    }

    const reprinter = getReprinter(path);
    const lines = reprinter
      ? // Since the print function that we pass to the reprinter will
        // be used to print "new" nodes, it's tempting to think we
        // should pass printRootGenerically instead of print, to avoid
        // calling maybeReprint again, but that would be a mistake
        // because the new nodes might not be entirely new, but merely
        // moved from elsewhere in the AST. The print function is the
        // right choice because it gives us the opportunity to reprint
        // such nodes using their original source.
        reprinter(print)
      : genericPrint(
          path,
          config,
          options,
          makePrintFunctionWith(options, {
            includeComments: true,
            avoidRootParens: false,
          }),
        );

    config.tabWidth = oldTabWidth;

    return lines;
  }

  this.print = function (ast) {
    if (!ast) {
      return emptyPrintResult;
    }

    const lines = print(FastPath.from(ast), {
      includeComments: true,
      avoidRootParens: false,
    });

    return new PrintResult(
      lines.toString(config),
      util.composeSourceMaps(
        config.inputSourceMap,
        lines.getSourceMap(config.sourceMapName, config.sourceRoot),
      ),
    );
  };

  this.printGenerically = function (ast) {
    if (!ast) {
      return emptyPrintResult;
    }

    // Print the entire AST generically.
    function printGenerically(path: any) {
      return printComments(path, (path: any) =>
        genericPrint(
          path,
          config,
          {
            includeComments: true,
            avoidRootParens: false,
          },
          printGenerically,
        ),
      );
    }

    const path = FastPath.from(ast);
    const oldReuseWhitespace = config.reuseWhitespace;

    // Do not reuse whitespace (or anything else, for that matter)
    // when printing generically.
    config.reuseWhitespace = false;

    // TODO Allow printing of comments?
    const pr = new PrintResult(printGenerically(path).toString(config));
    config.reuseWhitespace = oldReuseWhitespace;
    return pr;
  };
} as any as PrinterConstructor;

export { Printer };

function genericPrint(path: any, config: any, options: any, printPath: any) {
  invariant(path instanceof FastPath);

  const node = path.getValue();
  const parts = [];
  const linesWithoutParens = genericPrintNoParens(path, config, printPath);

  if (!node || linesWithoutParens.isEmpty()) {
    return linesWithoutParens;
  }

  let shouldAddParens = false;
  const decoratorsLines = printDecorators(path, printPath);

  if (decoratorsLines.isEmpty()) {
    // Nodes with decorators can't have parentheses, so we can avoid
    // computing path.needsParens() except in this case.
    if (!options.avoidRootParens) {
      shouldAddParens = path.needsParens();
    }
  } else {
    parts.push(decoratorsLines);
  }

  if (shouldAddParens) {
    parts.unshift("(");
  }

  parts.push(linesWithoutParens);

  if (shouldAddParens) {
    parts.push(")");
  }

  return concat(parts);
}

// Note that the `options` parameter of this function is what other
// functions in this file call the `config` object (that is, the
// configuration object originally passed into the Printer constructor).
// Its properties are documented in lib/options.js.
function genericPrintNoParens(path: any, options: any, print: any) {
  const n = path.getValue();

  if (!n) {
    return fromString("");
  }

  if (typeof n === "string") {
    return fromString(n, options);
  }

  namedTypes.Printable.assert(n);

  const parts: (string | Lines)[] = [];

  switch (n.type) {
    case "File":
      return path.call(print, "program");

    case "Program":
      // Babel 6
      if (n.directives) {
        path.each(function (childPath: any) {
          parts.push(print(childPath), ";\n");
        }, "directives");
      }

      if (n.interpreter) {
        parts.push(path.call(print, "interpreter"));
      }

      parts.push(
        path.call(
          (bodyPath: any) => printStatementSequence(bodyPath, options, print),
          "body",
        ),
      );

      return concat(parts);

    case "Noop": // Babel extension.
    case "EmptyStatement":
      return fromString("");

    case "ExpressionStatement":
      return concat([path.call(print, "expression"), ";"]);

    case "ParenthesizedExpression": // Babel extension.
      return concat(["(", path.call(print, "expression"), ")"]);

    case "BinaryExpression":
    case "LogicalExpression":
    case "AssignmentExpression":
      return fromString(" ").join([
        path.call(print, "left"),
        n.operator,
        path.call(print, "right"),
      ]);

    case "AssignmentPattern":
      return concat([
        path.call(print, "left"),
        " = ",
        path.call(print, "right"),
      ]);

    case "MemberExpression":
    case "OptionalMemberExpression": {
      parts.push(path.call(print, "object"));

      const property = path.call(print, "property");

      // Like n.optional, except with defaults applied, so optional
      // defaults to true for OptionalMemberExpression nodes.
      const optional = types.getFieldValue(n, "optional");

      if (n.computed) {
        parts.push(optional ? "?.[" : "[", property, "]");
      } else {
        parts.push(optional ? "?." : ".", property);
      }

      return concat(parts);
    }

    case "ChainExpression":
      return path.call(print, "expression");

    case "MetaProperty":
      return concat([
        path.call(print, "meta"),
        ".",
        path.call(print, "property"),
      ]);

    case "BindExpression":
      if (n.object) {
        parts.push(path.call(print, "object"));
      }

      parts.push("::", path.call(print, "callee"));

      return concat(parts);

    case "Path":
      return fromString(".").join(n.body);

    case "Identifier":
      return concat([
        fromString(n.name, options),
        n.optional ? "?" : "",
        path.call(print, "typeAnnotation"),
      ]);

    case "SpreadElement":
    case "SpreadElementPattern":
    case "RestProperty": // Babel 6 for ObjectPattern
    case "SpreadProperty":
    case "SpreadPropertyPattern":
    case "ObjectTypeSpreadProperty":
    case "RestElement":
      return concat([
        "...",
        path.call(print, "argument"),
        path.call(print, "typeAnnotation"),
      ]);

    case "FunctionDeclaration":
    case "FunctionExpression":
    case "TSDeclareFunction":
      if (n.declare) {
        parts.push("declare ");
      }

      if (n.async) {
        parts.push("async ");
      }

      parts.push("function");

      if (n.generator) parts.push("*");

      if (n.id) {
        parts.push(
          " ",
          path.call(print, "id"),
          path.call(print, "typeParameters"),
        );
      } else {
        if (n.typeParameters) {
          parts.push(path.call(print, "typeParameters"));
        }
      }

      parts.push(
        "(",
        printFunctionParams(path, options, print),
        ")",
        path.call(print, "returnType"),
      );

      if (n.body) {
        parts.push(" ", path.call(print, "body"));
      }

      return concat(parts);

    case "ArrowFunctionExpression":
      if (n.async) {
        parts.push("async ");
      }

      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }

      if (
        !options.arrowParensAlways &&
        n.params.length === 1 &&
        !n.rest &&
        n.params[0].type === "Identifier" &&
        !n.params[0].typeAnnotation &&
        !n.returnType
      ) {
        parts.push(path.call(print, "params", 0));
      } else {
        parts.push(
          "(",
          printFunctionParams(path, options, print),
          ")",
          path.call(print, "returnType"),
        );
      }

      parts.push(" => ", path.call(print, "body"));

      return concat(parts);

    case "MethodDefinition":
      return printMethod(path, options, print);

    case "YieldExpression":
      parts.push("yield");

      if (n.delegate) parts.push("*");

      if (n.argument) parts.push(" ", path.call(print, "argument"));

      return concat(parts);

    case "AwaitExpression":
      parts.push("await");

      if (n.all) parts.push("*");

      if (n.argument) parts.push(" ", path.call(print, "argument"));

      return concat(parts);

    case "ModuleExpression":
      return concat([
        "module {\n",
        path.call(print, "body").indent(options.tabWidth),
        "\n}",
      ]);

    case "ModuleDeclaration":
      parts.push("module", path.call(print, "id"));

      if (n.source) {
        invariant(!n.body);
        parts.push("from", path.call(print, "source"));
      } else {
        parts.push(path.call(print, "body"));
      }

      return fromString(" ").join(parts);

    case "ImportSpecifier":
      if (n.importKind && n.importKind !== "value") {
        parts.push(n.importKind + " ");
      }
      if (n.imported) {
        parts.push(path.call(print, "imported"));
        if (n.local && n.local.name !== n.imported.name) {
          parts.push(" as ", path.call(print, "local"));
        }
      } else if (n.id) {
        parts.push(path.call(print, "id"));
        if (n.name) {
          parts.push(" as ", path.call(print, "name"));
        }
      }

      return concat(parts);

    case "ExportSpecifier":
      if (n.exportKind && n.exportKind !== "value") {
        parts.push(n.exportKind + " ");
      }
      if (n.local) {
        parts.push(path.call(print, "local"));
        if (n.exported && n.exported.name !== n.local.name) {
          parts.push(" as ", path.call(print, "exported"));
        }
      } else if (n.id) {
        parts.push(path.call(print, "id"));
        if (n.name) {
          parts.push(" as ", path.call(print, "name"));
        }
      }

      return concat(parts);

    case "ExportBatchSpecifier":
      return fromString("*");

    case "ImportNamespaceSpecifier":
      parts.push("* as ");
      if (n.local) {
        parts.push(path.call(print, "local"));
      } else if (n.id) {
        parts.push(path.call(print, "id"));
      }
      return concat(parts);

    case "ImportDefaultSpecifier":
      if (n.local) {
        return path.call(print, "local");
      }
      return path.call(print, "id");

    case "TSExportAssignment":
      return concat(["export = ", path.call(print, "expression")]);

    case "ExportDeclaration":
    case "ExportDefaultDeclaration":
    case "ExportNamedDeclaration":
      return printExportDeclaration(path, options, print);

    case "ExportAllDeclaration":
      parts.push("export *");

      if (n.exported) {
        parts.push(" as ", path.call(print, "exported"));
      }

      parts.push(" from ", path.call(print, "source"), ";");

      return concat(parts);

    case "TSNamespaceExportDeclaration":
      parts.push("export as namespace ", path.call(print, "id"));
      return maybeAddSemicolon(concat(parts));

    case "ExportNamespaceSpecifier":
      return concat(["* as ", path.call(print, "exported")]);

    case "ExportDefaultSpecifier":
      return path.call(print, "exported");

    case "Import":
      return fromString("import", options);

    // Recast and ast-types currently support dynamic import(...) using
    // either this dedicated ImportExpression type or a CallExpression
    // whose callee has type Import.
    // https://github.com/benjamn/ast-types/pull/365#issuecomment-605214486
    case "ImportExpression":
      return concat(["import(", path.call(print, "source"), ")"]);

    case "ImportDeclaration": {
      parts.push("import ");

      if (n.importKind && n.importKind !== "value") {
        parts.push(n.importKind + " ");
      }

      if (n.specifiers && n.specifiers.length > 0) {
        const unbracedSpecifiers: any[] = [];
        const bracedSpecifiers: any[] = [];

        path.each(function (specifierPath: any) {
          const spec = specifierPath.getValue();
          if (spec.type === "ImportSpecifier") {
            bracedSpecifiers.push(print(specifierPath));
          } else if (
            spec.type === "ImportDefaultSpecifier" ||
            spec.type === "ImportNamespaceSpecifier"
          ) {
            unbracedSpecifiers.push(print(specifierPath));
          }
        }, "specifiers");

        unbracedSpecifiers.forEach((lines, i) => {
          if (i > 0) {
            parts.push(", ");
          }
          parts.push(lines);
        });

        if (bracedSpecifiers.length > 0) {
          let lines = fromString(", ").join(bracedSpecifiers);
          if (lines.getLineLength(1) > options.wrapColumn) {
            lines = concat([
              fromString(",\n").join(bracedSpecifiers).indent(options.tabWidth),
              ",",
            ]);
          }

          if (unbracedSpecifiers.length > 0) {
            parts.push(", ");
          }

          if (lines.length > 1) {
            parts.push("{\n", lines, "\n}");
          } else if (options.objectCurlySpacing) {
            parts.push("{ ", lines, " }");
          } else {
            parts.push("{", lines, "}");
          }
        }

        parts.push(" from ");
      }

      parts.push(
        path.call(print, "source"),
        maybePrintImportAssertions(path, options, print),
        ";",
      );

      return concat(parts);
    }

    case "ImportAttribute":
      return concat([path.call(print, "key"), ": ", path.call(print, "value")]);

    case "StaticBlock":
      parts.push("static ");
    // Intentionally fall through to BlockStatement below.

    case "BlockStatement": {
      const naked = path.call(
        (bodyPath: any) => printStatementSequence(bodyPath, options, print),
        "body",
      );

      if (naked.isEmpty()) {
        if (!n.directives || n.directives.length === 0) {
          parts.push("{}");
          return concat(parts);
        }
      }

      parts.push("{\n");
      // Babel 6
      if (n.directives) {
        path.each(function (childPath: any) {
          parts.push(
            maybeAddSemicolon(print(childPath).indent(options.tabWidth)),
            n.directives.length > 1 || !naked.isEmpty() ? "\n" : "",
          );
        }, "directives");
      }
      parts.push(naked.indent(options.tabWidth));
      parts.push("\n}");

      return concat(parts);
    }

    case "ReturnStatement": {
      parts.push("return");

      if (n.argument) {
        const argIsJsxElement =
          namedTypes.JSXElement?.check(n.argument) ||
          namedTypes.JSXFragment?.check(n.argument);

        let argLines = path.call(print, "argument");
        if (
          argLines.startsWithComment() ||
          (argLines.length > 1 && argIsJsxElement)
        ) {
          // Babel: regenerate parenthesized jsxElements so we don't double parentheses
          if (argIsJsxElement && n.argument.extra?.parenthesized) {
            n.argument.extra.parenthesized = false;
            argLines = path.call(print, "argument");
            n.argument.extra.parenthesized = true;
          }
          parts.push(
            " ",
            concat(["(\n", argLines]).indentTail(options.tabWidth),
            "\n)",
          );
        } else {
          parts.push(" ", argLines);
        }
      }

      parts.push(";");

      return concat(parts);
    }

    case "CallExpression":
    case "OptionalCallExpression":
      parts.push(path.call(print, "callee"));

      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }

      if (n.typeArguments) {
        parts.push(path.call(print, "typeArguments"));
      }

      // Like n.optional, but defaults to true for OptionalCallExpression
      // nodes that are missing an n.optional property (unusual),
      // according to the OptionalCallExpression definition in ast-types.
      if (types.getFieldValue(n, "optional")) {
        parts.push("?.");
      }

      parts.push(printArgumentsList(path, options, print));

      return concat(parts);

    case "RecordExpression":
      parts.push("#");
    // Intentionally fall through to printing the object literal...
    case "ObjectExpression":
    case "ObjectPattern":
    case "ObjectTypeAnnotation": {
      const isTypeAnnotation = n.type === "ObjectTypeAnnotation";
      const separator = options.flowObjectCommas
        ? ","
        : isTypeAnnotation
        ? ";"
        : ",";
      const fields = [];
      let allowBreak = false;

      if (isTypeAnnotation) {
        fields.push("indexers", "callProperties");
        if (n.internalSlots != null) {
          fields.push("internalSlots");
        }
      }

      fields.push("properties");

      let len = 0;
      fields.forEach(function (field) {
        len += n[field].length;
      });

      const oneLine = (isTypeAnnotation && len === 1) || len === 0;
      const leftBrace = n.exact ? "{|" : "{";
      const rightBrace = n.exact ? "|}" : "}";
      parts.push(oneLine ? leftBrace : leftBrace + "\n");
      const leftBraceIndex = parts.length - 1;

      let i = 0;
      fields.forEach(function (field) {
        path.each(function (childPath: any) {
          let lines = print(childPath);

          if (!oneLine) {
            lines = lines.indent(options.tabWidth);
          }

          const multiLine = !isTypeAnnotation && lines.length > 1;
          if (multiLine && allowBreak) {
            // Similar to the logic for BlockStatement.
            parts.push("\n");
          }

          parts.push(lines);

          if (i < len - 1) {
            // Add an extra line break if the previous object property
            // had a multi-line value.
            parts.push(separator + (multiLine ? "\n\n" : "\n"));
            allowBreak = !multiLine;
          } else if (len !== 1 && isTypeAnnotation) {
            parts.push(separator);
          } else if (
            !oneLine &&
            util.isTrailingCommaEnabled(options, "objects") &&
            childPath.getValue().type !== "RestElement"
          ) {
            parts.push(separator);
          }
          i++;
        }, field);
      });

      if (n.inexact) {
        const line = fromString("...", options);
        if (oneLine) {
          if (len > 0) {
            parts.push(separator, " ");
          }
          parts.push(line);
        } else {
          // No trailing separator after ... to maintain parity with prettier.
          parts.push("\n", line.indent(options.tabWidth));
        }
      }

      parts.push(oneLine ? rightBrace : "\n" + rightBrace);

      if (i !== 0 && oneLine && options.objectCurlySpacing) {
        parts[leftBraceIndex] = leftBrace + " ";
        parts[parts.length - 1] = " " + rightBrace;
      }

      if (n.typeAnnotation) {
        parts.push(path.call(print, "typeAnnotation"));
      }

      return concat(parts);
    }

    case "PropertyPattern":
      return concat([
        path.call(print, "key"),
        ": ",
        path.call(print, "pattern"),
      ]);

    case "ObjectProperty": // Babel 6
    case "Property": {
      // Non-standard AST node type.
      if (n.method || n.kind === "get" || n.kind === "set") {
        return printMethod(path, options, print);
      }

      if (n.shorthand && n.value.type === "AssignmentPattern") {
        return path.call(print, "value");
      }

      const key = path.call(print, "key");
      if (n.computed) {
        parts.push("[", key, "]");
      } else {
        parts.push(key);
      }

      if (!n.shorthand || n.key.name !== n.value.name) {
        parts.push(": ", path.call(print, "value"));
      }

      return concat(parts);
    }

    case "ClassMethod": // Babel 6
    case "ObjectMethod": // Babel 6
    case "ClassPrivateMethod":
    case "TSDeclareMethod":
      return printMethod(path, options, print);

    case "PrivateName":
      return concat(["#", path.call(print, "id")]);

    case "Decorator":
      return concat(["@", path.call(print, "expression")]);

    case "TupleExpression":
      parts.push("#");
    // Intentionally fall through to printing the tuple elements...
    case "ArrayExpression":
    case "ArrayPattern": {
      const elems: any[] = n.elements;
      const len = elems.length;
      const printed = path.map(print, "elements");
      const joined = fromString(", ").join(printed);
      const oneLine = joined.getLineLength(1) <= options.wrapColumn;

      if (oneLine) {
        if (options.arrayBracketSpacing) {
          parts.push("[ ");
        } else {
          parts.push("[");
        }
      } else {
        parts.push("[\n");
      }

      path.each(function (elemPath: any) {
        const i = elemPath.getName();
        const elem = elemPath.getValue();
        if (!elem) {
          // If the array expression ends with a hole, that hole
          // will be ignored by the interpreter, but if it ends with
          // two (or more) holes, we need to write out two (or more)
          // commas so that the resulting code is interpreted with
          // both (all) of the holes.
          parts.push(",");
        } else {
          let lines = printed[i];
          if (oneLine) {
            if (i > 0) parts.push(" ");
          } else {
            lines = lines.indent(options.tabWidth);
          }
          parts.push(lines);
          if (
            i < len - 1 ||
            (!oneLine && util.isTrailingCommaEnabled(options, "arrays"))
          )
            parts.push(",");
          if (!oneLine) parts.push("\n");
        }
      }, "elements");

      if (oneLine && options.arrayBracketSpacing) {
        parts.push(" ]");
      } else {
        parts.push("]");
      }

      if (n.typeAnnotation) {
        parts.push(path.call(print, "typeAnnotation"));
      }

      return concat(parts);
    }

    case "SequenceExpression":
      return fromString(", ").join(path.map(print, "expressions"));

    case "ThisExpression":
      return fromString("this");

    case "Super":
      return fromString("super");

    case "NullLiteral": // Babel 6 Literal split
      return fromString("null");

    case "RegExpLiteral": // Babel 6 Literal split
      return fromString(
        getPossibleRaw(n) || `/${n.pattern}/${n.flags || ""}`,
        options,
      );

    case "BigIntLiteral": // Babel 7 Literal split
      return fromString(getPossibleRaw(n) || n.value + "n", options);

    case "NumericLiteral": // Babel 6 Literal Split
      return fromString(getPossibleRaw(n) || n.value, options);

    case "DecimalLiteral":
      return fromString(getPossibleRaw(n) || n.value + "m", options);

    case "StringLiteral":
      return fromString(nodeStr(n.value, options));

    case "BooleanLiteral": // Babel 6 Literal split
    case "Literal":
      return fromString(
        getPossibleRaw(n) ||
          (typeof n.value === "string" ? nodeStr(n.value, options) : n.value),
        options,
      );

    case "Directive": // Babel 6
      return path.call(print, "value");

    case "DirectiveLiteral": // Babel 6
      return fromString(
        getPossibleRaw(n) || nodeStr(n.value, options),
        options,
      );

    case "InterpreterDirective":
      return fromString(`#!${n.value}\n`, options);

    case "ModuleSpecifier":
      if (n.local) {
        throw new Error("The ESTree ModuleSpecifier type should be abstract");
      }

      // The Esprima ModuleSpecifier type is just a string-valued
      // Literal identifying the imported-from module.
      return fromString(nodeStr(n.value, options), options);

    case "UnaryExpression":
      parts.push(n.operator);
      if (/[a-z]$/.test(n.operator)) parts.push(" ");
      parts.push(path.call(print, "argument"));
      return concat(parts);

    case "UpdateExpression":
      parts.push(path.call(print, "argument"), n.operator);

      if (n.prefix) parts.reverse();

      return concat(parts);

    case "ConditionalExpression":
      return concat([
        path.call(print, "test"),
        " ? ",
        path.call(print, "consequent"),
        " : ",
        path.call(print, "alternate"),
      ]);

    case "NewExpression": {
      parts.push("new ", path.call(print, "callee"));
      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }
      if (n.typeArguments) {
        parts.push(path.call(print, "typeArguments"));
      }
      const args = n.arguments;
      if (args) {
        parts.push(printArgumentsList(path, options, print));
      }

      return concat(parts);
    }

    case "VariableDeclaration": {
      if (n.declare) {
        parts.push("declare ");
      }

      parts.push(n.kind, " ");

      let maxLen = 0;
      const printed = path.map(function (childPath: any) {
        const lines = print(childPath);
        maxLen = Math.max(lines.length, maxLen);
        return lines;
      }, "declarations");

      if (maxLen === 1) {
        parts.push(fromString(", ").join(printed));
      } else if (printed.length > 1) {
        parts.push(
          fromString(",\n")
            .join(printed)
            .indentTail(n.kind.length + 1),
        );
      } else {
        parts.push(printed[0]);
      }

      // We generally want to terminate all variable declarations with a
      // semicolon, except when they are children of for loops.
      const parentNode = path.getParentNode();
      if (
        !namedTypes.ForStatement.check(parentNode) &&
        !namedTypes.ForInStatement.check(parentNode) &&
        !(
          namedTypes.ForOfStatement &&
          namedTypes.ForOfStatement.check(parentNode)
        ) &&
        !(
          namedTypes.ForAwaitStatement &&
          namedTypes.ForAwaitStatement.check(parentNode)
        )
      ) {
        parts.push(";");
      }

      return concat(parts);
    }

    case "VariableDeclarator":
      return n.init
        ? fromString(" = ").join([
            path.call(print, "id"),
            path.call(print, "init"),
          ])
        : path.call(print, "id");

    case "WithStatement":
      return concat([
        "with (",
        path.call(print, "object"),
        ") ",
        path.call(print, "body"),
      ]);

    case "IfStatement": {
      const con = adjustClause(path.call(print, "consequent"), options);
      parts.push("if (", path.call(print, "test"), ")", con);

      if (n.alternate)
        parts.push(
          endsWithBrace(con) ? " else" : "\nelse",
          adjustClause(path.call(print, "alternate"), options),
        );

      return concat(parts);
    }

    case "ForStatement": {
      // TODO Get the for (;;) case right.
      const init = path.call(print, "init");
      const sep = init.length > 1 ? ";\n" : "; ";
      const forParen = "for (";
      const indented = fromString(sep)
        .join([init, path.call(print, "test"), path.call(print, "update")])
        .indentTail(forParen.length);
      const head = concat([forParen, indented, ")"]);
      let clause = adjustClause(path.call(print, "body"), options);

      parts.push(head);

      if (head.length > 1) {
        parts.push("\n");
        clause = clause.trimLeft();
      }

      parts.push(clause);

      return concat(parts);
    }

    case "WhileStatement":
      return concat([
        "while (",
        path.call(print, "test"),
        ")",
        adjustClause(path.call(print, "body"), options),
      ]);

    case "ForInStatement":
      // Note: esprima can't actually parse "for each (".
      return concat([
        n.each ? "for each (" : "for (",
        path.call(print, "left"),
        " in ",
        path.call(print, "right"),
        ")",
        adjustClause(path.call(print, "body"), options),
      ]);

    case "ForOfStatement":
    case "ForAwaitStatement":
      parts.push("for ");

      if (n.await || n.type === "ForAwaitStatement") {
        parts.push("await ");
      }

      parts.push(
        "(",
        path.call(print, "left"),
        " of ",
        path.call(print, "right"),
        ")",
        adjustClause(path.call(print, "body"), options),
      );

      return concat(parts);

    case "DoWhileStatement": {
      const doBody = concat([
        "do",
        adjustClause(path.call(print, "body"), options),
      ]);

      parts.push(doBody);

      if (endsWithBrace(doBody)) parts.push(" while");
      else parts.push("\nwhile");

      parts.push(" (", path.call(print, "test"), ");");

      return concat(parts);
    }

    case "DoExpression": {
      const statements = path.call(
        (bodyPath: any) => printStatementSequence(bodyPath, options, print),
        "body",
      );

      return concat(["do {\n", statements.indent(options.tabWidth), "\n}"]);
    }

    case "BreakStatement":
      parts.push("break");
      if (n.label) parts.push(" ", path.call(print, "label"));
      parts.push(";");
      return concat(parts);

    case "ContinueStatement":
      parts.push("continue");
      if (n.label) parts.push(" ", path.call(print, "label"));
      parts.push(";");
      return concat(parts);

    case "LabeledStatement":
      return concat([
        path.call(print, "label"),
        ":\n",
        path.call(print, "body"),
      ]);

    case "TryStatement":
      parts.push("try ", path.call(print, "block"));

      if (n.handler) {
        parts.push(" ", path.call(print, "handler"));
      } else if (n.handlers) {
        path.each(function (handlerPath: any) {
          parts.push(" ", print(handlerPath));
        }, "handlers");
      }

      if (n.finalizer) {
        parts.push(" finally ", path.call(print, "finalizer"));
      }

      return concat(parts);

    case "CatchClause":
      parts.push("catch ");

      if (n.param) {
        parts.push("(", path.call(print, "param"));
      }

      if (n.guard) {
        // Note: esprima does not recognize conditional catch clauses.
        parts.push(" if ", path.call(print, "guard"));
      }

      if (n.param) {
        parts.push(") ");
      }

      parts.push(path.call(print, "body"));

      return concat(parts);

    case "ThrowStatement":
      return concat(["throw ", path.call(print, "argument"), ";"]);

    case "SwitchStatement":
      return concat([
        "switch (",
        path.call(print, "discriminant"),
        ") {\n",
        fromString("\n").join(path.map(print, "cases")),
        "\n}",
      ]);

    // Note: ignoring n.lexical because it has no printing consequences.

    case "SwitchCase":
      if (n.test) parts.push("case ", path.call(print, "test"), ":");
      else parts.push("default:");

      if (n.consequent.length > 0) {
        parts.push(
          "\n",
          path
            .call(
              (consequentPath: any) =>
                printStatementSequence(consequentPath, options, print),
              "consequent",
            )
            .indent(options.tabWidth),
        );
      }

      return concat(parts);

    case "DebuggerStatement":
      return fromString("debugger;");

    // JSX extensions below.

    case "JSXAttribute":
      parts.push(path.call(print, "name"));
      if (n.value) parts.push("=", path.call(print, "value"));
      return concat(parts);

    case "JSXIdentifier":
      return fromString(n.name, options);

    case "JSXNamespacedName":
      return fromString(":").join([
        path.call(print, "namespace"),
        path.call(print, "name"),
      ]);

    case "JSXMemberExpression":
      return fromString(".").join([
        path.call(print, "object"),
        path.call(print, "property"),
      ]);

    case "JSXSpreadAttribute":
      return concat(["{...", path.call(print, "argument"), "}"]);

    case "JSXSpreadChild":
      return concat(["{...", path.call(print, "expression"), "}"]);

    case "JSXExpressionContainer":
      return concat(["{", path.call(print, "expression"), "}"]);

    case "JSXElement":
    case "JSXFragment": {
      const openingPropName =
        "opening" + (n.type === "JSXElement" ? "Element" : "Fragment");
      const closingPropName =
        "closing" + (n.type === "JSXElement" ? "Element" : "Fragment");
      const openingLines = path.call(print, openingPropName);

      if (n[openingPropName].selfClosing) {
        invariant(
          !n[closingPropName],
          "unexpected " +
            closingPropName +
            " element in self-closing " +
            n.type,
        );
        return openingLines;
      }

      const childLines = concat(
        path.map(function (childPath: any) {
          const child = childPath.getValue();

          if (
            namedTypes.Literal.check(child) &&
            typeof child.value === "string"
          ) {
            if (/\S/.test(child.value)) {
              return child.value.replace(/^\s+/g, "");
            } else if (/\n/.test(child.value)) {
              return "\n";
            }
          }

          return print(childPath);
        }, "children"),
      ).indentTail(options.tabWidth);

      const closingLines = path.call(print, closingPropName);

      return concat([openingLines, childLines, closingLines]);
    }

    case "JSXOpeningElement": {
      parts.push("<", path.call(print, "name"));
      const typeDefPart = path.call(print, "typeParameters");
      if (typeDefPart.length) parts.push(typeDefPart);
      const attrParts: any[] = [];

      path.each(function (attrPath: any) {
        attrParts.push(" ", print(attrPath));
      }, "attributes");

      let attrLines = concat(attrParts);

      const needLineWrap =
        attrLines.length > 1 || attrLines.getLineLength(1) > options.wrapColumn;

      if (needLineWrap) {
        attrParts.forEach(function (part, i) {
          if (part === " ") {
            invariant(i % 2 === 0);
            attrParts[i] = "\n";
          }
        });

        attrLines = concat(attrParts).indentTail(options.tabWidth);
      }

      parts.push(attrLines, n.selfClosing ? " />" : ">");

      return concat(parts);
    }

    case "JSXClosingElement":
      return concat(["</", path.call(print, "name"), ">"]);

    case "JSXOpeningFragment":
      return fromString("<>");

    case "JSXClosingFragment":
      return fromString("</>");

    case "JSXText":
      return fromString(n.value, options);

    case "JSXEmptyExpression":
      return fromString("");

    case "TypeAnnotatedIdentifier":
      return concat([
        path.call(print, "annotation"),
        " ",
        path.call(print, "identifier"),
      ]);

    case "ClassBody":
      if (n.body.length === 0) {
        return fromString("{}");
      }

      return concat([
        "{\n",
        path
          .call(
            (bodyPath: any) => printStatementSequence(bodyPath, options, print),
            "body",
          )
          .indent(options.tabWidth),
        "\n}",
      ]);

    case "ClassPropertyDefinition":
      parts.push("static ", path.call(print, "definition"));
      if (!namedTypes.MethodDefinition.check(n.definition)) parts.push(";");
      return concat(parts);

    case "ClassProperty": {
      if (n.declare) {
        parts.push("declare ");
      }

      const access = n.accessibility || n.access;
      if (typeof access === "string") {
        parts.push(access, " ");
      }

      if (n.static) {
        parts.push("static ");
      }

      if (n.abstract) {
        parts.push("abstract ");
      }

      if (n.readonly) {
        parts.push("readonly ");
      }

      let key = path.call(print, "key");

      if (n.computed) {
        key = concat(["[", key, "]"]);
      }

      if (n.variance) {
        key = concat([printVariance(path, print), key]);
      }

      parts.push(key);

      if (n.optional) {
        parts.push("?");
      }

      if (n.definite) {
        parts.push("!");
      }

      if (n.typeAnnotation) {
        parts.push(path.call(print, "typeAnnotation"));
      }

      if (n.value) {
        parts.push(" = ", path.call(print, "value"));
      }

      parts.push(";");
      return concat(parts);
    }

    case "ClassPrivateProperty":
      if (n.static) {
        parts.push("static ");
      }

      parts.push(path.call(print, "key"));

      if (n.typeAnnotation) {
        parts.push(path.call(print, "typeAnnotation"));
      }

      if (n.value) {
        parts.push(" = ", path.call(print, "value"));
      }

      parts.push(";");
      return concat(parts);

    case "ClassAccessorProperty": {
      parts.push(...printClassMemberModifiers(n), "accessor ");

      if (n.computed) {
        parts.push("[", path.call(print, "key"), "]");
      } else {
        parts.push(path.call(print, "key"));
      }

      if (n.optional) {
        parts.push("?");
      }

      if (n.definite) {
        parts.push("!");
      }

      if (n.typeAnnotation) {
        parts.push(path.call(print, "typeAnnotation"));
      }

      if (n.value) {
        parts.push(" = ", path.call(print, "value"));
      }

      parts.push(";");

      return concat(parts);
    }

    case "ClassDeclaration":
    case "ClassExpression":
    case "DeclareClass":
      if (n.declare) {
        parts.push("declare ");
      }

      if (n.abstract) {
        parts.push("abstract ");
      }

      parts.push("class");

      if (n.id) {
        parts.push(" ", path.call(print, "id"));
      }

      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }

      if (n.superClass) {
        // ClassDeclaration and ClassExpression only
        parts.push(
          " extends ",
          path.call(print, "superClass"),
          path.call(print, "superTypeParameters"),
        );
      }

      if (n.extends && n.extends.length > 0) {
        // DeclareClass only
        parts.push(
          " extends ",
          fromString(", ").join(path.map(print, "extends")),
        );
      }

      if (n["implements"] && n["implements"].length > 0) {
        parts.push(
          " implements ",
          fromString(", ").join(path.map(print, "implements")),
        );
      }

      parts.push(" ", path.call(print, "body"));

      if (n.type === "DeclareClass") {
        return printFlowDeclaration(path, parts);
      } else {
        return concat(parts);
      }

    case "TemplateElement":
      return fromString(n.value.raw, options).lockIndentTail();

    case "TemplateLiteral": {
      const expressions = path.map(print, "expressions");
      parts.push("`");

      path.each(function (childPath: any) {
        const i = childPath.getName();
        parts.push(print(childPath));
        if (i < expressions.length) {
          parts.push("${", expressions[i], "}");
        }
      }, "quasis");

      parts.push("`");

      return concat(parts).lockIndentTail();
    }

    case "TaggedTemplateExpression":
      parts.push(path.call(print, "tag"));
      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }
      parts.push(path.call(print, "quasi"));
      return concat(parts);

    // These types are unprintable because they serve as abstract
    // supertypes for other (printable) types.
    case "Node":
    case "Printable":
    case "SourceLocation":
    case "Position":
    case "Statement":
    case "Function":
    case "Pattern":
    case "Expression":
    case "Declaration":
    case "Specifier":
    case "NamedSpecifier":
    case "Comment": // Supertype of Block and Line
    case "Flow": // Supertype of all Flow AST node types
    case "FlowType": // Supertype of all Flow types
    case "FlowPredicate": // Supertype of InferredPredicate and DeclaredPredicate
    case "MemberTypeAnnotation": // Flow
    case "Type": // Flow
    case "TSHasOptionalTypeParameterInstantiation":
    case "TSHasOptionalTypeParameters":
    case "TSHasOptionalTypeAnnotation":
    case "ChainElement": // Supertype of MemberExpression and CallExpression
      throw new Error("unprintable type: " + JSON.stringify(n.type));

    case "CommentBlock": // Babel block comment.
    case "Block": // Esprima block comment.
      return concat(["/*", fromString(n.value, options), "*/"]);

    case "CommentLine": // Babel line comment.
    case "Line": // Esprima line comment.
      return concat(["//", fromString(n.value, options)]);

    // Type Annotations for Facebook Flow, typically stripped out or
    // transformed away before printing.
    case "TypeAnnotation":
      if (n.typeAnnotation) {
        if (n.typeAnnotation.type !== "FunctionTypeAnnotation") {
          parts.push(": ");
        }
        parts.push(path.call(print, "typeAnnotation"));
        return concat(parts);
      }

      return fromString("");

    case "ExistentialTypeParam":
    case "ExistsTypeAnnotation":
      return fromString("*", options);

    case "EmptyTypeAnnotation":
      return fromString("empty", options);

    case "AnyTypeAnnotation":
      return fromString("any", options);

    case "MixedTypeAnnotation":
      return fromString("mixed", options);

    case "ArrayTypeAnnotation":
      return concat([path.call(print, "elementType"), "[]"]);

    case "TupleTypeAnnotation": {
      const printed = path.map(print, "types");
      const joined = fromString(", ").join(printed);
      const oneLine = joined.getLineLength(1) <= options.wrapColumn;
      if (oneLine) {
        if (options.arrayBracketSpacing) {
          parts.push("[ ");
        } else {
          parts.push("[");
        }
      } else {
        parts.push("[\n");
      }

      path.each(function (elemPath: any) {
        const i = elemPath.getName();
        const elem = elemPath.getValue();
        if (!elem) {
          // If the array expression ends with a hole, that hole
          // will be ignored by the interpreter, but if it ends with
          // two (or more) holes, we need to write out two (or more)
          // commas so that the resulting code is interpreted with
          // both (all) of the holes.
          parts.push(",");
        } else {
          let lines = printed[i];
          if (oneLine) {
            if (i > 0) parts.push(" ");
          } else {
            lines = lines.indent(options.tabWidth);
          }
          parts.push(lines);
          if (
            i < n.types.length - 1 ||
            (!oneLine && util.isTrailingCommaEnabled(options, "arrays"))
          )
            parts.push(",");
          if (!oneLine) parts.push("\n");
        }
      }, "types");

      if (oneLine && options.arrayBracketSpacing) {
        parts.push(" ]");
      } else {
        parts.push("]");
      }

      return concat(parts);
    }

    case "BooleanTypeAnnotation":
      return fromString("boolean", options);

    case "BooleanLiteralTypeAnnotation":
      invariant(typeof n.value === "boolean");
      return fromString("" + n.value, options);

    case "InterfaceTypeAnnotation":
      parts.push("interface");
      if (n.extends && n.extends.length > 0) {
        parts.push(
          " extends ",
          fromString(", ").join(path.map(print, "extends")),
        );
      }
      parts.push(" ", path.call(print, "body"));
      return concat(parts);

    case "DeclareFunction":
      return printFlowDeclaration(path, [
        "function ",
        path.call(print, "id"),
        ";",
      ]);

    case "DeclareModule":
      return printFlowDeclaration(path, [
        "module ",
        path.call(print, "id"),
        " ",
        path.call(print, "body"),
      ]);

    case "DeclareModuleExports":
      return printFlowDeclaration(path, [
        "module.exports",
        path.call(print, "typeAnnotation"),
      ]);

    case "DeclareVariable":
      return printFlowDeclaration(path, ["var ", path.call(print, "id"), ";"]);

    case "DeclareExportDeclaration":
    case "DeclareExportAllDeclaration":
      return concat(["declare ", printExportDeclaration(path, options, print)]);

    case "EnumDeclaration":
      return concat([
        "enum ",
        path.call(print, "id"),
        path.call(print, "body"),
      ]);

    case "EnumBooleanBody":
    case "EnumNumberBody":
    case "EnumStringBody":
    case "EnumSymbolBody": {
      if (n.type === "EnumSymbolBody" || n.explicitType) {
        parts.push(
          " of ",
          // EnumBooleanBody => boolean, etc.
          n.type.slice(4, -4).toLowerCase(),
        );
      }

      parts.push(
        " {\n",
        fromString("\n")
          .join(path.map(print, "members"))
          .indent(options.tabWidth),
        "\n}",
      );

      return concat(parts);
    }

    case "EnumDefaultedMember":
      return concat([path.call(print, "id"), ","]);

    case "EnumBooleanMember":
    case "EnumNumberMember":
    case "EnumStringMember":
      return concat([
        path.call(print, "id"),
        " = ",
        path.call(print, "init"),
        ",",
      ]);

    case "InferredPredicate":
      return fromString("%checks", options);

    case "DeclaredPredicate":
      return concat(["%checks(", path.call(print, "value"), ")"]);

    case "FunctionTypeAnnotation": {
      // FunctionTypeAnnotation is ambiguous:
      // declare function(a: B): void; OR
      // const A: (a: B) => void;
      const parent = path.getParentNode(0);
      const isArrowFunctionTypeAnnotation = !(
        namedTypes.ObjectTypeCallProperty.check(parent) ||
        (namedTypes.ObjectTypeInternalSlot.check(parent) && parent.method) ||
        namedTypes.DeclareFunction.check(path.getParentNode(2))
      );

      const needsColon =
        isArrowFunctionTypeAnnotation &&
        !namedTypes.FunctionTypeParam.check(parent) &&
        !namedTypes.TypeAlias.check(parent);

      if (needsColon) {
        parts.push(": ");
      }

      const hasTypeParameters = !!n.typeParameters;
      const needsParens =
        hasTypeParameters || n.params.length !== 1 || n.params[0].name;

      parts.push(
        hasTypeParameters ? path.call(print, "typeParameters") : "",
        needsParens ? "(" : "",
        printFunctionParams(path, options, print),
        needsParens ? ")" : "",
      );

      // The returnType is not wrapped in a TypeAnnotation, so the colon
      // needs to be added separately.
      if (n.returnType) {
        parts.push(
          isArrowFunctionTypeAnnotation ? " => " : ": ",
          path.call(print, "returnType"),
        );
      }

      return concat(parts);
    }

    case "FunctionTypeParam": {
      const name = path.call(print, "name");
      parts.push(name);
      if (n.optional) {
        parts.push("?");
      }
      if (name.infos[0].line) {
        parts.push(": ");
      }
      parts.push(path.call(print, "typeAnnotation"));

      return concat(parts);
    }

    case "GenericTypeAnnotation":
      return concat([
        path.call(print, "id"),
        path.call(print, "typeParameters"),
      ]);

    case "DeclareInterface":
      parts.push("declare ");
    // Fall through to InterfaceDeclaration...

    case "InterfaceDeclaration":
    case "TSInterfaceDeclaration":
      if (n.declare) {
        parts.push("declare ");
      }

      parts.push(
        "interface ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
        " ",
      );

      if (n["extends"] && n["extends"].length > 0) {
        parts.push(
          "extends ",
          fromString(", ").join(path.map(print, "extends")),
          " ",
        );
      }

      if (n.body) {
        parts.push(path.call(print, "body"));
      }

      return concat(parts);

    case "ClassImplements":
    case "InterfaceExtends":
      return concat([
        path.call(print, "id"),
        path.call(print, "typeParameters"),
      ]);

    case "IntersectionTypeAnnotation":
      return fromString(" & ").join(path.map(print, "types"));

    case "NullableTypeAnnotation":
      return concat(["?", path.call(print, "typeAnnotation")]);

    case "NullLiteralTypeAnnotation":
      return fromString("null", options);

    case "ThisTypeAnnotation":
      return fromString("this", options);

    case "NumberTypeAnnotation":
      return fromString("number", options);

    case "ObjectTypeCallProperty":
      return path.call(print, "value");

    case "ObjectTypeIndexer":
      if (n.static) {
        parts.push("static ");
      }

      parts.push(printVariance(path, print), "[");

      if (n.id) {
        parts.push(path.call(print, "id"), ": ");
      }

      parts.push(path.call(print, "key"), "]: ", path.call(print, "value"));

      return concat(parts);

    case "ObjectTypeProperty":
      return concat([
        printVariance(path, print),
        path.call(print, "key"),
        n.optional ? "?" : "",
        ": ",
        path.call(print, "value"),
      ]);

    case "ObjectTypeInternalSlot":
      return concat([
        n.static ? "static " : "",
        "[[",
        path.call(print, "id"),
        "]]",
        n.optional ? "?" : "",
        n.value.type !== "FunctionTypeAnnotation" ? ": " : "",
        path.call(print, "value"),
      ]);

    case "QualifiedTypeIdentifier":
      return concat([
        path.call(print, "qualification"),
        ".",
        path.call(print, "id"),
      ]);

    case "StringLiteralTypeAnnotation":
      return fromString(nodeStr(n.value, options), options);

    case "NumberLiteralTypeAnnotation":
    case "NumericLiteralTypeAnnotation":
      invariant(typeof n.value === "number");
      return fromString(JSON.stringify(n.value), options);

    case "BigIntLiteralTypeAnnotation":
      return fromString(n.raw, options);

    case "StringTypeAnnotation":
      return fromString("string", options);

    case "DeclareTypeAlias":
      parts.push("declare ");
    // Fall through to TypeAlias...

    case "TypeAlias":
      return concat([
        "type ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
        " = ",
        path.call(print, "right"),
        ";",
      ]);

    case "DeclareOpaqueType":
      parts.push("declare ");
    // Fall through to OpaqueType...

    case "OpaqueType":
      parts.push(
        "opaque type ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
      );

      if (n["supertype"]) {
        parts.push(": ", path.call(print, "supertype"));
      }

      if (n["impltype"]) {
        parts.push(" = ", path.call(print, "impltype"));
      }

      parts.push(";");

      return concat(parts);

    case "TypeCastExpression":
      return concat([
        "(",
        path.call(print, "expression"),
        path.call(print, "typeAnnotation"),
        ")",
      ]);

    case "TypeParameterDeclaration":
    case "TypeParameterInstantiation":
      return concat([
        "<",
        fromString(", ").join(path.map(print, "params")),
        ">",
      ]);

    case "Variance":
      if (n.kind === "plus") {
        return fromString("+");
      }

      if (n.kind === "minus") {
        return fromString("-");
      }

      return fromString("");

    case "TypeParameter":
      if (n.variance) {
        parts.push(printVariance(path, print));
      }

      parts.push(path.call(print, "name"));

      if (n.bound) {
        parts.push(path.call(print, "bound"));
      }

      if (n["default"]) {
        parts.push("=", path.call(print, "default"));
      }

      return concat(parts);

    case "TypeofTypeAnnotation":
      return concat([
        fromString("typeof ", options),
        path.call(print, "argument"),
      ]);

    case "IndexedAccessType":
    case "OptionalIndexedAccessType":
      return concat([
        path.call(print, "objectType"),
        n.optional ? "?." : "",
        "[",
        path.call(print, "indexType"),
        "]",
      ]);

    case "UnionTypeAnnotation":
      return fromString(" | ").join(path.map(print, "types"));

    case "VoidTypeAnnotation":
      return fromString("void", options);

    case "NullTypeAnnotation":
      return fromString("null", options);

    case "SymbolTypeAnnotation":
      return fromString("symbol", options);

    case "BigIntTypeAnnotation":
      return fromString("bigint", options);

    // Type Annotations for TypeScript (when using Babylon as parser)
    case "TSType":
      throw new Error("unprintable type: " + JSON.stringify(n.type));

    case "TSNumberKeyword":
      return fromString("number", options);

    case "TSBigIntKeyword":
      return fromString("bigint", options);

    case "TSObjectKeyword":
      return fromString("object", options);

    case "TSBooleanKeyword":
      return fromString("boolean", options);

    case "TSStringKeyword":
      return fromString("string", options);

    case "TSSymbolKeyword":
      return fromString("symbol", options);

    case "TSAnyKeyword":
      return fromString("any", options);

    case "TSVoidKeyword":
      return fromString("void", options);

    case "TSIntrinsicKeyword":
      return fromString("intrinsic", options);

    case "TSThisType":
      return fromString("this", options);

    case "TSNullKeyword":
      return fromString("null", options);

    case "TSUndefinedKeyword":
      return fromString("undefined", options);

    case "TSUnknownKeyword":
      return fromString("unknown", options);

    case "TSNeverKeyword":
      return fromString("never", options);

    case "TSArrayType":
      return concat([path.call(print, "elementType"), "[]"]);

    case "TSLiteralType":
      return path.call(print, "literal");

    case "TSUnionType":
      return fromString(" | ").join(path.map(print, "types"));

    case "TSIntersectionType":
      return fromString(" & ").join(path.map(print, "types"));

    case "TSConditionalType":
      parts.push(
        path.call(print, "checkType"),
        " extends ",
        path.call(print, "extendsType"),
        " ? ",
        path.call(print, "trueType"),
        " : ",
        path.call(print, "falseType"),
      );

      return concat(parts);

    case "TSInferType":
      parts.push("infer ", path.call(print, "typeParameter"));

      return concat(parts);

    case "TSParenthesizedType":
      return concat(["(", path.call(print, "typeAnnotation"), ")"]);

    case "TSFunctionType":
      return concat([
        path.call(print, "typeParameters"),
        "(",
        printFunctionParams(path, options, print),
        ") => ",
        path.call(print, "typeAnnotation", "typeAnnotation"),
      ]);

    case "TSConstructorType":
      return concat([
        "new ",
        path.call(print, "typeParameters"),
        "(",
        printFunctionParams(path, options, print),
        ") => ",
        path.call(print, "typeAnnotation", "typeAnnotation"),
      ]);

    case "TSMappedType": {
      parts.push(
        n.readonly ? "readonly " : "",
        "[",
        path.call(print, "typeParameter"),
        "]",
        n.optional ? "?" : "",
      );

      if (n.typeAnnotation) {
        parts.push(": ", path.call(print, "typeAnnotation"), ";");
      }

      return concat(["{\n", concat(parts).indent(options.tabWidth), "\n}"]);
    }

    case "TSTupleType":
      return concat([
        "[",
        fromString(", ").join(path.map(print, "elementTypes")),
        "]",
      ]);

    case "TSNamedTupleMember":
      parts.push(path.call(print, "label"));

      if (n.optional) {
        parts.push("?");
      }

      parts.push(": ", path.call(print, "elementType"));

      return concat(parts);

    case "TSRestType":
      return concat(["...", path.call(print, "typeAnnotation")]);

    case "TSOptionalType":
      return concat([path.call(print, "typeAnnotation"), "?"]);

    case "TSIndexedAccessType":
      return concat([
        path.call(print, "objectType"),
        "[",
        path.call(print, "indexType"),
        "]",
      ]);

    case "TSTypeOperator":
      return concat([
        path.call(print, "operator"),
        " ",
        path.call(print, "typeAnnotation"),
      ]);

    case "TSTypeLiteral": {
      const members = fromString("\n").join(
        path.map(print, "members").map((member: Lines) => {
          if (lastNonSpaceCharacter(member) !== ";") {
            return member.concat(";");
          }
          return member;
        }),
      );

      if (members.isEmpty()) {
        return fromString("{}", options);
      }

      parts.push("{\n", members.indent(options.tabWidth), "\n}");

      return concat(parts);
    }

    case "TSEnumMember":
      parts.push(path.call(print, "id"));
      if (n.initializer) {
        parts.push(" = ", path.call(print, "initializer"));
      }
      return concat(parts);

    case "TSTypeQuery":
      return concat(["typeof ", path.call(print, "exprName")]);

    case "TSParameterProperty":
      if (n.accessibility) {
        parts.push(n.accessibility, " ");
      }

      if (n.export) {
        parts.push("export ");
      }

      if (n.static) {
        parts.push("static ");
      }

      if (n.readonly) {
        parts.push("readonly ");
      }

      parts.push(path.call(print, "parameter"));

      return concat(parts);

    case "TSTypeReference":
      return concat([
        path.call(print, "typeName"),
        path.call(print, "typeParameters"),
      ]);

    case "TSQualifiedName":
      return concat([path.call(print, "left"), ".", path.call(print, "right")]);

    case "TSAsExpression":
    case "TSSatisfiesExpression": {
      const expression = path.call(print, "expression");
      parts.push(
        expression,
        n.type === "TSSatisfiesExpression" ? " satisfies " : " as ",
        path.call(print, "typeAnnotation"),
      );
      return concat(parts);
    }

    case "TSTypeCastExpression":
      return concat([
        path.call(print, "expression"),
        path.call(print, "typeAnnotation"),
      ]);

    case "TSNonNullExpression":
      return concat([path.call(print, "expression"), "!"]);

    case "TSTypeAnnotation":
      return concat([": ", path.call(print, "typeAnnotation")]);

    case "TSIndexSignature":
      return concat([
        n.readonly ? "readonly " : "",
        "[",
        path.map(print, "parameters"),
        "]",
        path.call(print, "typeAnnotation"),
      ]);

    case "TSPropertySignature":
      parts.push(printVariance(path, print), n.readonly ? "readonly " : "");

      if (n.computed) {
        parts.push("[", path.call(print, "key"), "]");
      } else {
        parts.push(path.call(print, "key"));
      }

      parts.push(n.optional ? "?" : "", path.call(print, "typeAnnotation"));

      return concat(parts);

    case "TSMethodSignature":
      if (n.kind === "get") {
        parts.push("get ");
      } else if (n.kind === "set") {
        parts.push("set ");
      }

      if (n.computed) {
        parts.push("[", path.call(print, "key"), "]");
      } else {
        parts.push(path.call(print, "key"));
      }

      if (n.optional) {
        parts.push("?");
      }

      parts.push(
        path.call(print, "typeParameters"),
        "(",
        printFunctionParams(path, options, print),
        ")",
        path.call(print, "typeAnnotation"),
      );

      return concat(parts);

    case "TSTypePredicate":
      if (n.asserts) {
        parts.push("asserts ");
      }

      parts.push(path.call(print, "parameterName"));

      if (n.typeAnnotation) {
        parts.push(
          " is ",
          path.call(print, "typeAnnotation", "typeAnnotation"),
        );
      }

      return concat(parts);

    case "TSCallSignatureDeclaration":
      return concat([
        path.call(print, "typeParameters"),
        "(",
        printFunctionParams(path, options, print),
        ")",
        path.call(print, "typeAnnotation"),
      ]);

    case "TSConstructSignatureDeclaration":
      if (n.typeParameters) {
        parts.push("new", path.call(print, "typeParameters"));
      } else {
        parts.push("new ");
      }

      parts.push(
        "(",
        printFunctionParams(path, options, print),
        ")",
        path.call(print, "typeAnnotation"),
      );

      return concat(parts);

    case "TSTypeAliasDeclaration":
      return concat([
        n.declare ? "declare " : "",
        "type ",
        path.call(print, "id"),
        path.call(print, "typeParameters"),
        " = ",
        path.call(print, "typeAnnotation"),
        ";",
      ]);

    case "TSTypeParameter": {
      parts.push(path.call(print, "name"));

      // ambiguous because of TSMappedType
      const parent = path.getParentNode(0);
      const isInMappedType = namedTypes.TSMappedType.check(parent);

      if (n.constraint) {
        parts.push(
          isInMappedType ? " in " : " extends ",
          path.call(print, "constraint"),
        );
      }

      if (n["default"]) {
        parts.push(" = ", path.call(print, "default"));
      }

      return concat(parts);
    }

    case "TSTypeAssertion": {
      parts.push(
        "<",
        path.call(print, "typeAnnotation"),
        "> ",
        path.call(print, "expression"),
      );
      return concat(parts);
    }

    case "TSTypeParameterDeclaration":
    case "TSTypeParameterInstantiation":
      return concat([
        "<",
        fromString(", ").join(path.map(print, "params")),
        ">",
      ]);

    case "TSEnumDeclaration": {
      parts.push(
        n.declare ? "declare " : "",
        n.const ? "const " : "",
        "enum ",
        path.call(print, "id"),
      );

      const memberLines = fromString(",\n").join(path.map(print, "members"));

      if (memberLines.isEmpty()) {
        parts.push(" {}");
      } else {
        parts.push(" {\n", memberLines.indent(options.tabWidth), "\n}");
      }

      return concat(parts);
    }

    case "TSExpressionWithTypeArguments":
      return concat([
        path.call(print, "expression"),
        path.call(print, "typeParameters"),
      ]);

    case "TSInterfaceBody": {
      const lines = fromString("\n").join(
        path.map(print, "body").map((element: Lines) => {
          if (lastNonSpaceCharacter(element) !== ";") {
            return element.concat(";");
          }
          return element;
        }),
      );
      if (lines.isEmpty()) {
        return fromString("{}", options);
      }
      return concat(["{\n", lines.indent(options.tabWidth), "\n}"]);
    }

    case "TSImportType":
      parts.push("import(", path.call(print, "argument"), ")");

      if (n.qualifier) {
        parts.push(".", path.call(print, "qualifier"));
      }

      if (n.typeParameters) {
        parts.push(path.call(print, "typeParameters"));
      }

      return concat(parts);

    case "TSImportEqualsDeclaration":
      if (n.isExport) {
        parts.push("export ");
      }

      parts.push(
        "import ",
        path.call(print, "id"),
        " = ",
        path.call(print, "moduleReference"),
      );

      return maybeAddSemicolon(concat(parts));

    case "TSExternalModuleReference":
      return concat(["require(", path.call(print, "expression"), ")"]);

    case "TSModuleDeclaration": {
      const parent = path.getParentNode();

      if (parent.type === "TSModuleDeclaration") {
        parts.push(".");
      } else {
        if (n.declare) {
          parts.push("declare ");
        }

        if (!n.global) {
          const isExternal =
            n.id.type === "StringLiteral" ||
            (n.id.type === "Literal" && typeof n.id.value === "string");

          if (isExternal) {
            parts.push("module ");
          } else if (n.loc && n.loc.lines && n.id.loc) {
            const prefix = n.loc.lines.sliceString(n.loc.start, n.id.loc.start);

            // These keywords are fundamentally ambiguous in the
            // Babylon parser, and not reflected in the AST, so
            // the best we can do is to match the original code,
            // when possible.
            if (prefix.indexOf("module") >= 0) {
              parts.push("module ");
            } else {
              parts.push("namespace ");
            }
          } else {
            parts.push("namespace ");
          }
        }
      }

      parts.push(path.call(print, "id"));

      if (n.body) {
        parts.push(" ");
        parts.push(path.call(print, "body"));
      }

      return concat(parts);
    }

    case "TSModuleBlock": {
      const naked = path.call(
        (bodyPath: any) => printStatementSequence(bodyPath, options, print),
        "body",
      );

      if (naked.isEmpty()) {
        parts.push("{}");
      } else {
        parts.push("{\n", naked.indent(options.tabWidth), "\n}");
      }

      return concat(parts);
    }

    case "TSInstantiationExpression": {
      parts.push(
        path.call(print, "expression"),
        path.call(print, "typeParameters"),
      );

      return concat(parts);
    }

    // https://github.com/babel/babel/pull/10148
    case "V8IntrinsicIdentifier":
      return concat(["%", path.call(print, "name")]);

    // https://github.com/babel/babel/pull/13191
    case "TopicReference":
      return fromString("#");

    // Unhandled types below. If encountered, nodes of these types should
    // be either left alone or desugared into AST types that are fully
    // supported by the pretty-printer.
    case "ClassHeritage": // TODO
    case "ComprehensionBlock": // TODO
    case "ComprehensionExpression": // TODO
    case "Glob": // TODO
    case "GeneratorExpression": // TODO
    case "LetStatement": // TODO
    case "LetExpression": // TODO
    case "GraphExpression": // TODO
    case "GraphIndexExpression": // TODO
    case "XMLDefaultDeclaration":
    case "XMLAnyName":
    case "XMLQualifiedIdentifier":
    case "XMLFunctionQualifiedIdentifier":
    case "XMLAttributeSelector":
    case "XMLFilterExpression":
    case "XML":
    case "XMLElement":
    case "XMLList":
    case "XMLEscape":
    case "XMLText":
    case "XMLStartTag":
    case "XMLEndTag":
    case "XMLPointTag":
    case "XMLName":
    case "XMLAttribute":
    case "XMLCdata":
    case "XMLComment":
    case "XMLProcessingInstruction":
    default:
      debugger;
      throw new Error("unknown type: " + JSON.stringify(n.type));
  }
}

function printDecorators(path: any, printPath: any) {
  const parts: any[] = [];
  const node = path.getValue();

  if (
    node.decorators &&
    node.decorators.length > 0 &&
    // If the parent node is an export declaration, it will be
    // responsible for printing node.decorators.
    !util.getParentExportDeclaration(path)
  ) {
    path.each(function (decoratorPath: any) {
      parts.push(printPath(decoratorPath), "\n");
    }, "decorators");
  } else if (
    util.isExportDeclaration(node) &&
    node.declaration &&
    node.declaration.decorators
  ) {
    // Export declarations are responsible for printing any decorators
    // that logically apply to node.declaration.
    path.each(
      function (decoratorPath: any) {
        parts.push(printPath(decoratorPath), "\n");
      },
      "declaration",
      "decorators",
    );
  }

  return concat(parts);
}

function printStatementSequence(path: any, options: any, print: any) {
  const filtered: any[] = [];
  let sawComment = false;
  let sawStatement = false;

  path.each(function (stmtPath: any) {
    const stmt = stmtPath.getValue();

    // Just in case the AST has been modified to contain falsy
    // "statements," it's safer simply to skip them.
    if (!stmt) {
      return;
    }

    // Skip printing EmptyStatement nodes to avoid leaving stray
    // semicolons lying around.
    if (
      stmt.type === "EmptyStatement" &&
      !(stmt.comments && stmt.comments.length > 0)
    ) {
      return;
    }

    if (namedTypes.Comment.check(stmt)) {
      // The pretty printer allows a dangling Comment node to act as
      // a Statement when the Comment can't be attached to any other
      // non-Comment node in the tree.
      sawComment = true;
    } else if (namedTypes.Statement.check(stmt)) {
      sawStatement = true;
    } else {
      // When the pretty printer encounters a string instead of an
      // AST node, it just prints the string. This behavior can be
      // useful for fine-grained formatting decisions like inserting
      // blank lines.
      isString.assert(stmt);
    }

    // We can't hang onto stmtPath outside of this function, because
    // it's just a reference to a mutable FastPath object, so we have
    // to go ahead and print it here.
    filtered.push({
      node: stmt,
      printed: print(stmtPath),
    });
  });

  if (sawComment) {
    invariant(
      sawStatement === false,
      "Comments may appear as statements in otherwise empty statement " +
        "lists, but may not coexist with non-Comment nodes.",
    );
  }

  let prevTrailingSpace: any = null;
  const len = filtered.length;
  const parts: any[] = [];

  filtered.forEach(function (info, i) {
    const printed = info.printed;
    const stmt = info.node;
    const multiLine = printed.length > 1;
    const notFirst = i > 0;
    const notLast = i < len - 1;
    let leadingSpace;
    let trailingSpace;
    const lines = stmt && stmt.loc && stmt.loc.lines;
    const trueLoc =
      lines && options.reuseWhitespace && util.getTrueLoc(stmt, lines);

    if (notFirst) {
      if (trueLoc) {
        const beforeStart = lines.skipSpaces(trueLoc.start, true);
        const beforeStartLine = beforeStart ? beforeStart.line : 1;
        const leadingGap = trueLoc.start.line - beforeStartLine;
        leadingSpace = Array(leadingGap + 1).join("\n");
      } else {
        leadingSpace = multiLine ? "\n\n" : "\n";
      }
    } else {
      leadingSpace = "";
    }

    if (notLast) {
      if (trueLoc) {
        const afterEnd = lines.skipSpaces(trueLoc.end);
        const afterEndLine = afterEnd ? afterEnd.line : lines.length;
        const trailingGap = afterEndLine - trueLoc.end.line;
        trailingSpace = Array(trailingGap + 1).join("\n");
      } else {
        trailingSpace = multiLine ? "\n\n" : "\n";
      }
    } else {
      trailingSpace = "";
    }

    parts.push(maxSpace(prevTrailingSpace, leadingSpace), printed);

    if (notLast) {
      prevTrailingSpace = trailingSpace;
    } else if (trailingSpace) {
      parts.push(trailingSpace);
    }
  });

  return concat(parts);
}

function maxSpace(s1: any, s2: any) {
  if (!s1 && !s2) {
    return fromString("");
  }

  if (!s1) {
    return fromString(s2);
  }

  if (!s2) {
    return fromString(s1);
  }

  const spaceLines1 = fromString(s1);
  const spaceLines2 = fromString(s2);

  if (spaceLines2.length > spaceLines1.length) {
    return spaceLines2;
  }

  return spaceLines1;
}

function printClassMemberModifiers(node: any): string[] {
  const parts = [];

  if (node.declare) {
    parts.push("declare ");
  }

  const access = node.accessibility || node.access;
  if (typeof access === "string") {
    parts.push(access, " ");
  }

  if (node.static) {
    parts.push("static ");
  }

  if (node.override) {
    parts.push("override ");
  }

  if (node.abstract) {
    parts.push("abstract ");
  }

  if (node.readonly) {
    parts.push("readonly ");
  }

  return parts;
}

function printMethod(path: any, options: any, print: any) {
  const node = path.getNode();
  const kind = node.kind;
  const parts = [];

  let nodeValue = node.value;
  if (!namedTypes.FunctionExpression.check(nodeValue)) {
    nodeValue = node;
  }

  parts.push(...printClassMemberModifiers(node));

  if (nodeValue.async) {
    parts.push("async ");
  }

  if (nodeValue.generator) {
    parts.push("*");
  }

  if (kind === "get" || kind === "set") {
    parts.push(kind, " ");
  }

  let key = path.call(print, "key");
  if (node.computed) {
    key = concat(["[", key, "]"]);
  }

  parts.push(key);

  if (node.optional) {
    parts.push("?");
  }

  if (node === nodeValue) {
    parts.push(
      path.call(print, "typeParameters"),
      "(",
      printFunctionParams(path, options, print),
      ")",
      path.call(print, "returnType"),
    );

    if (node.body) {
      parts.push(" ", path.call(print, "body"));
    } else {
      parts.push(";");
    }
  } else {
    parts.push(
      path.call(print, "value", "typeParameters"),
      "(",
      path.call(
        (valuePath: any) => printFunctionParams(valuePath, options, print),
        "value",
      ),
      ")",
      path.call(print, "value", "returnType"),
    );

    if (nodeValue.body) {
      parts.push(" ", path.call(print, "value", "body"));
    } else {
      parts.push(";");
    }
  }

  return concat(parts);
}

function printArgumentsList(path: any, options: any, print: any) {
  const printed = path.map(print, "arguments");
  const trailingComma = util.isTrailingCommaEnabled(options, "parameters");

  let joined = fromString(", ").join(printed);
  if (joined.getLineLength(1) > options.wrapColumn) {
    joined = fromString(",\n").join(printed);
    return concat([
      "(\n",
      joined.indent(options.tabWidth),
      trailingComma ? ",\n)" : "\n)",
    ]);
  }

  return concat(["(", joined, ")"]);
}

function printFunctionParams(path: any, options: any, print: any) {
  const fun = path.getValue();

  let params;
  let printed: Array<Lines> = [];
  if (fun.params) {
    params = fun.params;
    printed = path.map(print, "params");
  } else if (fun.parameters) {
    params = fun.parameters;
    printed = path.map(print, "parameters");
  }

  if (fun.defaults) {
    path.each(function (defExprPath: any) {
      const i = defExprPath.getName();
      const p = printed[i];
      if (p && defExprPath.getValue()) {
        printed[i] = concat([p, " = ", print(defExprPath)]);
      }
    }, "defaults");
  }

  if (fun.rest) {
    printed.push(concat(["...", path.call(print, "rest")]));
  }

  let joined = fromString(", ").join(printed);
  if (joined.length > 1 || joined.getLineLength(1) > options.wrapColumn) {
    joined = fromString(",\n").join(printed);
    if (
      util.isTrailingCommaEnabled(options, "parameters") &&
      !fun.rest &&
      params[params.length - 1].type !== "RestElement"
    ) {
      joined = concat([joined, ",\n"]);
    } else {
      joined = concat([joined, "\n"]);
    }
    return concat(["\n", joined.indent(options.tabWidth)]);
  }

  return joined;
}

function maybePrintImportAssertions(
  path: any,
  options: any,
  print: any,
): Lines {
  const n = path.getValue();
  if (n.assertions && n.assertions.length > 0) {
    const parts: (string | Lines)[] = [" assert {"];
    const printed = path.map(print, "assertions");
    const flat = fromString(", ").join(printed);
    if (flat.length > 1 || flat.getLineLength(1) > options.wrapColumn) {
      parts.push(
        "\n",
        fromString(",\n").join(printed).indent(options.tabWidth),
        "\n}",
      );
    } else {
      parts.push(" ", flat, " }");
    }
    return concat(parts);
  }
  return fromString("");
}

function printExportDeclaration(path: any, options: any, print: any) {
  const decl = path.getValue();
  const parts: (string | Lines)[] = ["export "];
  if (decl.exportKind && decl.exportKind === "type") {
    if (!decl.declaration) {
      parts.push("type ");
    }
  }
  const shouldPrintSpaces = options.objectCurlySpacing;

  namedTypes.Declaration.assert(decl);

  if (decl["default"] || decl.type === "ExportDefaultDeclaration") {
    parts.push("default ");
  }

  if (decl.declaration) {
    parts.push(path.call(print, "declaration"));
  } else if (decl.specifiers) {
    if (
      decl.specifiers.length === 1 &&
      decl.specifiers[0].type === "ExportBatchSpecifier"
    ) {
      parts.push("*");
    } else if (decl.specifiers.length === 0) {
      parts.push("{}");
    } else if (
      decl.specifiers[0].type === "ExportDefaultSpecifier" ||
      decl.specifiers[0].type === "ExportNamespaceSpecifier"
    ) {
      const unbracedSpecifiers: any[] = [];
      const bracedSpecifiers: any[] = [];

      path.each(function (specifierPath: any) {
        const spec = specifierPath.getValue();
        if (
          spec.type === "ExportDefaultSpecifier" ||
          spec.type === "ExportNamespaceSpecifier"
        ) {
          unbracedSpecifiers.push(print(specifierPath));
        } else {
          bracedSpecifiers.push(print(specifierPath));
        }
      }, "specifiers");

      unbracedSpecifiers.forEach((lines, i) => {
        if (i > 0) {
          parts.push(", ");
        }
        parts.push(lines);
      });

      if (bracedSpecifiers.length > 0) {
        let lines = fromString(", ").join(bracedSpecifiers);
        if (lines.getLineLength(1) > options.wrapColumn) {
          lines = concat([
            fromString(",\n").join(bracedSpecifiers).indent(options.tabWidth),
            ",",
          ]);
        }

        if (unbracedSpecifiers.length > 0) {
          parts.push(", ");
        }

        if (lines.length > 1) {
          parts.push("{\n", lines, "\n}");
        } else if (options.objectCurlySpacing) {
          parts.push("{ ", lines, " }");
        } else {
          parts.push("{", lines, "}");
        }
      }
    } else {
      parts.push(
        shouldPrintSpaces ? "{ " : "{",
        fromString(", ").join(path.map(print, "specifiers")),
        shouldPrintSpaces ? " }" : "}",
      );
    }

    if (decl.source) {
      parts.push(
        " from ",
        path.call(print, "source"),
        maybePrintImportAssertions(path, options, print),
      );
    }
  }

  let lines = concat(parts);
  if (
    lastNonSpaceCharacter(lines) !== ";" &&
    !(
      decl.declaration &&
      (decl.declaration.type === "FunctionDeclaration" ||
        decl.declaration.type === "ClassDeclaration" ||
        decl.declaration.type === "TSModuleDeclaration" ||
        decl.declaration.type === "TSInterfaceDeclaration" ||
        decl.declaration.type === "TSEnumDeclaration")
    )
  ) {
    lines = concat([lines, ";"]);
  }
  return lines;
}

function printFlowDeclaration(path: any, parts: any) {
  const parentExportDecl = util.getParentExportDeclaration(path);

  if (parentExportDecl) {
    invariant(parentExportDecl.type === "DeclareExportDeclaration");
  } else {
    // If the parent node has type DeclareExportDeclaration, then it
    // will be responsible for printing the "declare" token. Otherwise
    // it needs to be printed with this non-exported declaration node.
    parts.unshift("declare ");
  }

  return concat(parts);
}

function printVariance(path: any, print: any) {
  return path.call(function (variancePath: any) {
    const value = variancePath.getValue();

    if (value) {
      if (value === "plus") {
        return fromString("+");
      }

      if (value === "minus") {
        return fromString("-");
      }

      return print(variancePath);
    }

    return fromString("");
  }, "variance");
}

function adjustClause(clause: any, options: any) {
  if (clause.length > 1) return concat([" ", clause]);

  return concat(["\n", maybeAddSemicolon(clause).indent(options.tabWidth)]);
}

function lastNonSpaceCharacter(lines: any) {
  const pos = lines.lastPos();
  do {
    const ch = lines.charAt(pos);
    if (/\S/.test(ch)) return ch;
  } while (lines.prevPos(pos));
}

function endsWithBrace(lines: any) {
  return lastNonSpaceCharacter(lines) === "}";
}

function swapQuotes(str: string) {
  return str.replace(/['"]/g, (m) => (m === '"' ? "'" : '"'));
}

function getPossibleRaw(
  node:
    | types.namedTypes.Literal
    | types.namedTypes.NumericLiteral
    | types.namedTypes.StringLiteral
    | types.namedTypes.RegExpLiteral
    | types.namedTypes.BigIntLiteral
    | types.namedTypes.DecimalLiteral,
): string | void {
  const value = types.getFieldValue(node, "value");
  const extra = types.getFieldValue(node, "extra");

  if (extra && typeof extra.raw === "string" && value == extra.rawValue) {
    return extra.raw;
  }

  if (node.type === "Literal") {
    const raw = (node as typeof extra).raw;
    if (typeof raw === "string" && value == raw) {
      return raw;
    }
  }
}

function jsSafeStringify(str: string) {
  return JSON.stringify(str).replace(/[\u2028\u2029]/g, function (m) {
    return "\\u" + m.charCodeAt(0).toString(16);
  });
}

function nodeStr(str: string, options: any) {
  isString.assert(str);
  switch (options.quote) {
    case "auto": {
      const double = jsSafeStringify(str);
      const single = swapQuotes(jsSafeStringify(swapQuotes(str)));
      return double.length > single.length ? single : double;
    }
    case "single":
      return swapQuotes(jsSafeStringify(swapQuotes(str)));
    case "double":
    default:
      return jsSafeStringify(str);
  }
}

function maybeAddSemicolon(lines: any) {
  const eoc = lastNonSpaceCharacter(lines);
  if (!eoc || "\n};".indexOf(eoc) < 0) return concat([lines, ";"]);
  return lines;
}
