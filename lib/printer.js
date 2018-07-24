"use strict";

var assert = require("assert");
var sourceMap = require("source-map");
var printComments = require("./comments").printComments;
var linesModule = require("./lines");
var fromString = linesModule.fromString;
var concat = linesModule.concat;
var normalizeOptions = require("./options").normalize;
var getReprinter = require("./patcher").getReprinter;
var types = require("./types");
var namedTypes = types.namedTypes;
var isString = types.builtInTypes.string;
var isObject = types.builtInTypes.object;
var FastPath = require("./fast-path");
var util = require("./util");

function PrintResult(code, sourceMap) {
    assert.ok(this instanceof PrintResult);

    isString.assert(code);
    this.code = code;

    if (sourceMap) {
        isObject.assert(sourceMap);
        this.map = sourceMap;
    }
}

var PRp = PrintResult.prototype;
var warnedAboutToString = false;

PRp.toString = function() {
    if (!warnedAboutToString) {
        console.warn(
            "Deprecation warning: recast.print now returns an object with " +
            "a .code property. You appear to be treating the object as a " +
            "string, which might still work but is strongly discouraged."
        );

        warnedAboutToString = true;
    }

    return this.code;
};

var emptyPrintResult = new PrintResult("");

function Printer(originalOptions) {
    assert.ok(this instanceof Printer);

    var explicitTabWidth = originalOptions && originalOptions.tabWidth;
    var options = normalizeOptions(originalOptions);
    assert.notStrictEqual(options, originalOptions);

    // It's common for client code to pass the same options into both
    // recast.parse and recast.print, but the Printer doesn't need (and
    // can be confused by) options.sourceFileName, so we null it out.
    options.sourceFileName = null;

    function printWithComments(path) {
        assert.ok(path instanceof FastPath);
        return printComments(path, print);
    }

    function print(path, includeComments) {
        if (includeComments)
            return printWithComments(path);

        assert.ok(path instanceof FastPath);

        if (!explicitTabWidth) {
            var oldTabWidth = options.tabWidth;
            var loc = path.getNode().loc;
            if (loc && loc.lines && loc.lines.guessTabWidth) {
                options.tabWidth = loc.lines.guessTabWidth();
                var lines = maybeReprint(path);
                options.tabWidth = oldTabWidth;
                return lines;
            }
        }

        return maybeReprint(path);
    }

    function maybeReprint(path) {
        var reprinter = getReprinter(path);
        if (reprinter) {
            // Since the print function that we pass to the reprinter will
            // be used to print "new" nodes, it's tempting to think we
            // should pass printRootGenerically instead of print, to avoid
            // calling maybeReprint again, but that would be a mistake
            // because the new nodes might not be entirely new, but merely
            // moved from elsewhere in the AST. The print function is the
            // right choice because it gives us the opportunity to reprint
            // such nodes using their original source.
            return maybeAddParens(path, reprinter(print));
        }
        return printRootGenerically(path);
    }

    // Print the root node generically, but then resume reprinting its
    // children non-generically.
    function printRootGenerically(path, includeComments) {
        return includeComments
            ? printComments(path, printRootGenerically)
            : genericPrint(path, options, printWithComments);
    }

    // Print the entire AST generically.
    function printGenerically(path) {
        return genericPrint(path, options, printGenerically);
    }

    this.print = function(ast) {
        if (!ast) {
            return emptyPrintResult;
        }

        var lines = print(FastPath.from(ast), true);

        return new PrintResult(
            lines.toString(options),
            util.composeSourceMaps(
                options.inputSourceMap,
                lines.getSourceMap(
                    options.sourceMapName,
                    options.sourceRoot
                )
            )
        );
    };

    this.printGenerically = function(ast) {
        if (!ast) {
            return emptyPrintResult;
        }

        var path = FastPath.from(ast);
        var oldReuseWhitespace = options.reuseWhitespace;

        // Do not reuse whitespace (or anything else, for that matter)
        // when printing generically.
        options.reuseWhitespace = false;

        // TODO Allow printing of comments?
        var pr = new PrintResult(printGenerically(path).toString(options));
        options.reuseWhitespace = oldReuseWhitespace;
        return pr;
    };
}

exports.Printer = Printer;

function maybeAddParens(path, lines) {
    return path.needsParens() ? concat(["(", lines, ")"]) : lines;
}

function genericPrint(path, options, printPath) {
    assert.ok(path instanceof FastPath);

    var node = path.getValue();
    var parts = [];
    var needsParens = false;
    var linesWithoutParens =
        genericPrintNoParens(path, options, printPath);

    if (! node || linesWithoutParens.isEmpty()) {
        return linesWithoutParens;
    }

    if (node.decorators &&
        node.decorators.length > 0 &&
        // If the parent node is an export declaration, it will be
        // responsible for printing node.decorators.
        ! util.getParentExportDeclaration(path)) {

        path.each(function(decoratorPath) {
            parts.push(printPath(decoratorPath), "\n");
        }, "decorators");

    } else if (util.isExportDeclaration(node) &&
               node.declaration &&
               node.declaration.decorators) {
        // Export declarations are responsible for printing any decorators
        // that logically apply to node.declaration.
        path.each(function(decoratorPath) {
            parts.push(printPath(decoratorPath), "\n");
        }, "declaration", "decorators");

    } else {
        // Nodes with decorators can't have parentheses, so we can avoid
        // computing path.needsParens() except in this case.
        needsParens = path.needsParens();
    }

    if (needsParens) {
        parts.unshift("(");
    }

    parts.push(linesWithoutParens);

    if (needsParens) {
        parts.push(")");
    }

    return concat(parts);
}

function genericPrintNoParens(path, options, print) {
    var n = path.getValue();

    if (!n) {
        return fromString("");
    }

    if (typeof n === "string") {
        return fromString(n, options);
    }

    namedTypes.Printable.assert(n);

    var parts = [];

    switch (n.type) {
    case "File":
        return path.call(print, "program");

    case "Program":
        // Babel 6
        if (n.directives) {
            path.each(function(childPath) {
                parts.push(print(childPath), ";\n");
            }, "directives");
        }

        parts.push(path.call(function(bodyPath) {
            return printStatementSequence(bodyPath, options, print);
        }, "body"));

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
            path.call(print, "right")
        ]);

    case "AssignmentPattern":
        return concat([
            path.call(print, "left"),
            " = ",
            path.call(print, "right")
        ]);

    case "MemberExpression":
    case "OptionalMemberExpression":
        parts.push(path.call(print, "object"));

        var property = path.call(print, "property");
        var optional = n.type === "OptionalMemberExpression";

        if (n.computed) {
            parts.push(optional ? "?.[" : "[", property, "]");
        } else {
            parts.push(optional ? "?." : ".", property);
        }

        return concat(parts);

    case "MetaProperty":
        return concat([
            path.call(print, "meta"),
            ".",
            path.call(print, "property")
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
            path.call(print, "typeAnnotation")
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
            path.call(print, "typeAnnotation")
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

        if (n.generator)
            parts.push("*");

        if (n.id) {
            parts.push(
                " ",
                path.call(print, "id"),
                path.call(print, "typeParameters")
            );
        }

        parts.push(
            "(",
            printFunctionParams(path, options, print),
            ")",
            path.call(print, "returnType")
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

        if (! options.arrowParensAlways &&
            n.params.length === 1 &&
            ! n.rest &&
            n.params[0].type === 'Identifier' &&
            ! n.params[0].typeAnnotation &&
            ! n.returnType) {
            parts.push(path.call(print, "params", 0));
        } else {
            parts.push(
                "(",
                printFunctionParams(path, options, print),
                ")",
                path.call(print, "returnType")
            );
        }

        parts.push(" => ", path.call(print, "body"));

        return concat(parts);

    case "MethodDefinition":
        return printMethod(path, options, print);

    case "YieldExpression":
        parts.push("yield");

        if (n.delegate)
            parts.push("*");

        if (n.argument)
            parts.push(" ", path.call(print, "argument"));

        return concat(parts);

    case "AwaitExpression":
        parts.push("await");

        if (n.all)
            parts.push("*");

        if (n.argument)
            parts.push(" ", path.call(print, "argument"));

        return concat(parts);

    case "ModuleDeclaration":
        parts.push("module", path.call(print, "id"));

        if (n.source) {
            assert.ok(!n.body);
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
            if (n.local &&
                n.local.name !== n.imported.name) {
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
        if (n.local) {
            parts.push(path.call(print, "local"));
            if (n.exported &&
                n.exported.name !== n.local.name) {
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

        parts.push(
            " from ",
            path.call(print, "source")
        );

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

    case "ImportDeclaration": {
        parts.push("import ");

        if (n.importKind && n.importKind !== "value") {
            parts.push(n.importKind + " ");
        }

        if (n.specifiers &&
            n.specifiers.length > 0) {

            const unbracedSpecifiers = [];
            const bracedSpecifiers = [];

            path.each(function (specifierPath) {
                const spec = specifierPath.getValue();
                if (spec.type === "ImportSpecifier") {
                    bracedSpecifiers.push(print(specifierPath));
                } else if (spec.type === "ImportDefaultSpecifier" ||
                           spec.type === "ImportNamespaceSpecifier") {
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
                        fromString(",\n").join(
                            bracedSpecifiers
                        ).indent(options.tabWidth),
                        ","
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

        parts.push(path.call(print, "source"), ";");

        return concat(parts);
    }

    case "BlockStatement":
        var naked = path.call(function(bodyPath) {
            return printStatementSequence(bodyPath, options, print);
        }, "body");


        if (naked.isEmpty()) {
            if (!n.directives || n.directives.length === 0) {
                return fromString("{}");
            }
        }

        parts.push("{\n");
        // Babel 6
        if (n.directives) {
            path.each(function(childPath) {
                parts.push(
                    print(childPath).indent(options.tabWidth),
                    ";",
                    n.directives.length > 1 || !naked.isEmpty() ? "\n" : ""
                );
            }, "directives");
        }
        parts.push(naked.indent(options.tabWidth));
        parts.push("\n}");

        return concat(parts);

    case "ReturnStatement":
        parts.push("return");

        if (n.argument) {
            var argLines = path.call(print, "argument");
            if (argLines.startsWithComment() ||
                (argLines.length > 1 &&
                    namedTypes.JSXElement &&
                    namedTypes.JSXElement.check(n.argument)
                )) {
                parts.push(
                    " (\n",
                    argLines.indent(options.tabWidth),
                    "\n)"
                );
            } else {
                parts.push(" ", argLines);
            }
        }

        parts.push(";");

        return concat(parts);

    case "CallExpression":
    case "OptionalCallExpression":
        var parts = [path.call(print, "callee")];

        if (n.type === "OptionalCallExpression" &&
            n.callee.type !== "OptionalMemberExpression") {
            parts.push("?.");
        }

        parts.push(printArgumentsList(path, options, print));

        return concat(parts);

    case "ObjectExpression":
    case "ObjectPattern":
    case "ObjectTypeAnnotation":
        var allowBreak = false;
        var isTypeAnnotation = n.type === "ObjectTypeAnnotation";
        var separator = options.flowObjectCommas ? "," : (isTypeAnnotation ? ";" : ",");
        var fields = [];

        if (isTypeAnnotation) {
            fields.push("indexers", "callProperties");
        }

        fields.push("properties");

        var len = 0;
        fields.forEach(function(field) {
            len += n[field].length;
        });

        var oneLine = (isTypeAnnotation && len === 1) || len === 0;
        var leftBrace = n.exact ? "{|" : "{";
        var rightBrace = n.exact ? "|}" : "}";
        parts.push(oneLine ? leftBrace : leftBrace + "\n");
        var leftBraceIndex = parts.length - 1;

        var i = 0;
        fields.forEach(function(field) {
            path.each(function(childPath) {
                var lines = print(childPath);

                if (!oneLine) {
                    lines = lines.indent(options.tabWidth);
                }

                var multiLine = !isTypeAnnotation && lines.length > 1;
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
                } else if (!oneLine && util.isTrailingCommaEnabled(options, "objects")) {
                    parts.push(separator);
                }
                i++;
            }, field);
        });

        parts.push(oneLine ? rightBrace : "\n" + rightBrace);

        if (i !== 0 && oneLine && options.objectCurlySpacing) {
            parts[leftBraceIndex] = leftBrace + " ";
            parts[parts.length - 1] = " " + rightBrace;
        }

        return concat(parts);

    case "PropertyPattern":
        return concat([
            path.call(print, "key"),
            ": ",
            path.call(print, "pattern")
        ]);

    case "ObjectProperty": // Babel 6
    case "Property": // Non-standard AST node type.
        if (n.method || n.kind === "get" || n.kind === "set") {
            return printMethod(path, options, print);
        }

        var key = path.call(print, "key");
        if (n.computed) {
            parts.push("[", key, "]");
        } else {
            parts.push(key);
        }

        if (! n.shorthand) {
            parts.push(": ", path.call(print, "value"));
        }

        return concat(parts);

    case "ClassMethod": // Babel 6
    case "ObjectMethod": // Babel 6
    case "TSDeclareMethod":
        return printMethod(path, options, print);

    case "Decorator":
        return concat(["@", path.call(print, "expression")]);

    case "ArrayExpression":
    case "ArrayPattern":
        var elems = n.elements,
            len = elems.length;

        var printed = path.map(print, "elements");
        var joined = fromString(", ").join(printed);
        var oneLine = joined.getLineLength(1) <= options.wrapColumn;
        if (oneLine) {
          if (options.arrayBracketSpacing) {
            parts.push("[ ");
          } else {
            parts.push("[");
          }
        } else {
          parts.push("[\n");
        }

        path.each(function(elemPath) {
            var i = elemPath.getName();
            var elem = elemPath.getValue();
            if (!elem) {
                // If the array expression ends with a hole, that hole
                // will be ignored by the interpreter, but if it ends with
                // two (or more) holes, we need to write out two (or more)
                // commas so that the resulting code is interpreted with
                // both (all) of the holes.
                parts.push(",");
            } else {
                var lines = printed[i];
                if (oneLine) {
                    if (i > 0)
                        parts.push(" ");
                } else {
                    lines = lines.indent(options.tabWidth);
                }
                parts.push(lines);
                if (i < len - 1 || (!oneLine && util.isTrailingCommaEnabled(options, "arrays")))
                    parts.push(",");
                if (!oneLine)
                    parts.push("\n");
            }
        }, "elements");

        if (oneLine && options.arrayBracketSpacing) {
          parts.push(" ]");
        } else {
          parts.push("]");
        }

        return concat(parts);

    case "SequenceExpression":
        return fromString(", ").join(path.map(print, "expressions"));

    case "ThisExpression":
        return fromString("this");

    case "Super":
        return fromString("super");

    case "NullLiteral": // Babel 6 Literal split
        return fromString("null");

    case "RegExpLiteral": // Babel 6 Literal split
        return fromString(n.extra.raw);

    case "BigIntLiteral": // Babel 7 Literal split
        return fromString(n.value + "n");

    case "NumericLiteral": // Babel 6 Literal Split
        // Keep original representation for numeric values not in base 10.
        if (n.extra &&
            typeof n.extra.raw === "string" &&
            Number(n.extra.raw) === n.value) {
            return fromString(n.extra.raw, options);
        }

        return fromString(n.value, options);

    case "BooleanLiteral": // Babel 6 Literal split

    case "StringLiteral": // Babel 6 Literal split
    case "Literal":
        // Numeric values may be in bases other than 10. Use their raw
        // representation if equivalent.
        if (typeof n.value === "number" &&
            typeof n.raw === "string" &&
            Number(n.raw) === n.value) {
            return fromString(n.raw, options);
        }

        if (typeof n.value !== "string") {
            return fromString(n.value, options);
        }

        return fromString(nodeStr(n.value, options), options);

    case "Directive": // Babel 6
        return path.call(print, "value");

    case "DirectiveLiteral": // Babel 6
        return fromString(nodeStr(n.value, options));

    case "ModuleSpecifier":
        if (n.local) {
            throw new Error(
                "The ESTree ModuleSpecifier type should be abstract"
            );
        }

        // The Esprima ModuleSpecifier type is just a string-valued
        // Literal identifying the imported-from module.
        return fromString(nodeStr(n.value, options), options);

    case "UnaryExpression":
        parts.push(n.operator);
        if (/[a-z]$/.test(n.operator))
            parts.push(" ");
        parts.push(path.call(print, "argument"));
        return concat(parts);

    case "UpdateExpression":
        parts.push(
            path.call(print, "argument"),
            n.operator
        );

        if (n.prefix)
            parts.reverse();

        return concat(parts);

    case "ConditionalExpression":
        return concat([
            "(", path.call(print, "test"),
            " ? ", path.call(print, "consequent"),
            " : ", path.call(print, "alternate"), ")"
        ]);

    case "NewExpression":
        parts.push("new ", path.call(print, "callee"));
        var args = n.arguments;
        if (args) {
            parts.push(printArgumentsList(path, options, print));
        }

        return concat(parts);

    case "VariableDeclaration":
        if (n.declare) {
            parts.push("declare ");
        }

        parts.push(n.kind, " ");

        var maxLen = 0;
        var printed = path.map(function(childPath) {
            var lines = print(childPath);
            maxLen = Math.max(lines.length, maxLen);
            return lines;
        }, "declarations");

        if (maxLen === 1) {
            parts.push(fromString(", ").join(printed));
        } else if (printed.length > 1 ) {
            parts.push(
                fromString(",\n").join(printed)
                    .indentTail(n.kind.length + 1)
            );
        } else {
            parts.push(printed[0]);
        }

        // We generally want to terminate all variable declarations with a
        // semicolon, except when they are children of for loops.
        var parentNode = path.getParentNode();
        if (!namedTypes.ForStatement.check(parentNode) &&
            !namedTypes.ForInStatement.check(parentNode) &&
            !(namedTypes.ForOfStatement &&
              namedTypes.ForOfStatement.check(parentNode)) &&
            !(namedTypes.ForAwaitStatement &&
              namedTypes.ForAwaitStatement.check(parentNode))) {
            parts.push(";");
        }

        return concat(parts);

    case "VariableDeclarator":
        return n.init ? fromString(" = ").join([
            path.call(print, "id"),
            path.call(print, "init")
        ]) : path.call(print, "id");

    case "WithStatement":
        return concat([
            "with (",
            path.call(print, "object"),
            ") ",
            path.call(print, "body")
        ]);

    case "IfStatement":
        var con = adjustClause(path.call(print, "consequent"), options),
            parts = ["if (", path.call(print, "test"), ")", con];

        if (n.alternate)
            parts.push(
                endsWithBrace(con) ? " else" : "\nelse",
                adjustClause(path.call(print, "alternate"), options));

        return concat(parts);

    case "ForStatement":
        // TODO Get the for (;;) case right.
        var init = path.call(print, "init"),
            sep = init.length > 1 ? ";\n" : "; ",
            forParen = "for (",
            indented = fromString(sep).join([
                init,
                path.call(print, "test"),
                path.call(print, "update")
            ]).indentTail(forParen.length),
            head = concat([forParen, indented, ")"]),
            clause = adjustClause(path.call(print, "body"), options),
            parts = [head];

        if (head.length > 1) {
            parts.push("\n");
            clause = clause.trimLeft();
        }

        parts.push(clause);

        return concat(parts);

    case "WhileStatement":
        return concat([
            "while (",
            path.call(print, "test"),
            ")",
            adjustClause(path.call(print, "body"), options)
        ]);

    case "ForInStatement":
        // Note: esprima can't actually parse "for each (".
        return concat([
            n.each ? "for each (" : "for (",
            path.call(print, "left"),
            " in ",
            path.call(print, "right"),
            ")",
            adjustClause(path.call(print, "body"), options)
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
            adjustClause(path.call(print, "body"), options)
        );

        return concat(parts);

    case "DoWhileStatement":
        var doBody = concat([
            "do",
            adjustClause(path.call(print, "body"), options)
        ]), parts = [doBody];

        if (endsWithBrace(doBody))
            parts.push(" while");
        else
            parts.push("\nwhile");

        parts.push(" (", path.call(print, "test"), ");");

        return concat(parts);

    case "DoExpression":
        var statements = path.call(function(bodyPath) {
            return printStatementSequence(bodyPath, options, print);
        }, "body");

        return concat([
            "do {\n",
            statements.indent(options.tabWidth),
            "\n}"
        ]);

    case "BreakStatement":
        parts.push("break");
        if (n.label)
            parts.push(" ", path.call(print, "label"));
        parts.push(";");
        return concat(parts);

    case "ContinueStatement":
        parts.push("continue");
        if (n.label)
            parts.push(" ", path.call(print, "label"));
        parts.push(";");
        return concat(parts);

    case "LabeledStatement":
        return concat([
            path.call(print, "label"),
            ":\n",
            path.call(print, "body")
        ]);

    case "TryStatement":
        parts.push(
            "try ",
            path.call(print, "block")
        );

        if (n.handler) {
            parts.push(" ", path.call(print, "handler"));
        } else if (n.handlers) {
            path.each(function(handlerPath) {
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
            "\n}"
        ]);

        // Note: ignoring n.lexical because it has no printing consequences.

    case "SwitchCase":
        if (n.test)
            parts.push("case ", path.call(print, "test"), ":");
        else
            parts.push("default:");

        if (n.consequent.length > 0) {
            parts.push("\n", path.call(function(consequentPath) {
                return printStatementSequence(consequentPath, options, print);
            }, "consequent").indent(options.tabWidth));
        }

        return concat(parts);

    case "DebuggerStatement":
        return fromString("debugger;");

    // JSX extensions below.

    case "JSXAttribute":
        parts.push(path.call(print, "name"));
        if (n.value)
            parts.push("=", path.call(print, "value"));
        return concat(parts);

    case "JSXIdentifier":
        return fromString(n.name, options);

    case "JSXNamespacedName":
        return fromString(":").join([
            path.call(print, "namespace"),
            path.call(print, "name")
        ]);

    case "JSXMemberExpression":
        return fromString(".").join([
            path.call(print, "object"),
            path.call(print, "property")
        ]);

    case "JSXSpreadAttribute":
        return concat(["{...", path.call(print, "argument"), "}"]);

    case "JSXSpreadChild":
        return concat(["{...", path.call(print, "expression"), "}"]);

    case "JSXExpressionContainer":
        return concat(["{", path.call(print, "expression"), "}"]);

    case "JSXElement":
    case "JSXFragment":
        var openingPropName = "opening" + (
            n.type === "JSXElement" ? "Element" : "Fragment");

        var closingPropName = "closing" + (
            n.type === "JSXElement" ? "Element" : "Fragment");

        var openingLines = path.call(print, openingPropName);

        if (n[openingPropName].selfClosing) {
            assert.ok(
                !n[closingPropName],
                "unexpected " + closingPropName + " element in self-closing " + n.type
            );
            return openingLines;
        }

        var childLines = concat(
            path.map(function(childPath) {
                var child = childPath.getValue();

                if (namedTypes.Literal.check(child) &&
                    typeof child.value === "string") {
                    if (/\S/.test(child.value)) {
                        return child.value.replace(/^\s+|\s+$/g, "");
                    } else if (/\n/.test(child.value)) {
                        return "\n";
                    }
                }

                return print(childPath);
            }, "children")
        ).indentTail(options.tabWidth);

        var closingLines = path.call(print, closingPropName);

        return concat([
            openingLines,
            childLines,
            closingLines
        ]);

    case "JSXOpeningElement":
        parts.push("<", path.call(print, "name"));
        var attrParts = [];

        path.each(function(attrPath) {
            attrParts.push(" ", print(attrPath));
        }, "attributes");

        var attrLines = concat(attrParts);

        var needLineWrap = (
            attrLines.length > 1 ||
            attrLines.getLineLength(1) > options.wrapColumn
        );

        if (needLineWrap) {
            attrParts.forEach(function(part, i) {
                if (part === " ") {
                    assert.strictEqual(i % 2, 0);
                    attrParts[i] = "\n";
                }
            });

            attrLines = concat(attrParts).indentTail(options.tabWidth);
        }

        parts.push(attrLines, n.selfClosing ? " />" : ">");

        return concat(parts);

    case "JSXClosingElement":
        return concat(["</", path.call(print, "name"), ">"]);

    case "JSXOpeningFragment":
        return fromString("<>");

    case "JSXClosingFragment":
        return fromString("</>")

    case "JSXText":
        return fromString(n.value, options);

    case "JSXEmptyExpression":
        return fromString("");

    case "TypeAnnotatedIdentifier":
        return concat([
            path.call(print, "annotation"),
            " ",
            path.call(print, "identifier")
        ]);

    case "ClassBody":
        if (n.body.length === 0) {
            return fromString("{}");
        }

        return concat([
            "{\n",
            path.call(function(bodyPath) {
                return printStatementSequence(bodyPath, options, print);
            }, "body").indent(options.tabWidth),
            "\n}"
        ]);

    case "ClassPropertyDefinition":
        parts.push("static ", path.call(print, "definition"));
        if (!namedTypes.MethodDefinition.check(n.definition))
            parts.push(";");
        return concat(parts);

    case "ClassProperty":
        if (typeof n.accessibility === "string") {
            parts.push(n.accessibility, " ");
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

        var key = path.call(print, "key");

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

        if (n.typeAnnotation) {
            parts.push(path.call(print, "typeAnnotation"));
        }

        if (n.value) {
            parts.push(" = ", path.call(print, "value"));
        }

        parts.push(";");
        return concat(parts);

    case "ClassDeclaration":
    case "ClassExpression":
        if (n.declare) {
            parts.push("declare ");
        }

        if (n.abstract) {
            parts.push("abstract ");
        }

        parts.push("class");

        if (n.id) {
            parts.push(
                " ",
                path.call(print, "id")
            );
        }

        if (n.typeParameters) {
            parts.push(path.call(print, "typeParameters"));
        }

        if (n.superClass) {
            parts.push(
                " extends ",
                path.call(print, "superClass"),
                path.call(print, "superTypeParameters")
            );
        }

        if (n["implements"] && n['implements'].length > 0) {
            parts.push(
                " implements ",
                fromString(", ").join(path.map(print, "implements"))
            );
        }

        parts.push(" ", path.call(print, "body"));

        return concat(parts);

    case "TemplateElement":
        return fromString(n.value.raw, options).lockIndentTail();

    case "TemplateLiteral":
        var expressions = path.map(print, "expressions");
        parts.push("`");

        path.each(function(childPath) {
            var i = childPath.getName();
            parts.push(print(childPath));
            if (i < expressions.length) {
                parts.push("${", expressions[i], "}");
            }
        }, "quasis");

        parts.push("`");

        return concat(parts).lockIndentTail();

    case "TaggedTemplateExpression":
        return concat([
            path.call(print, "tag"),
            path.call(print, "quasi")
        ]);

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
    case "TSHasOptionalTypeParameters":
    case "TSHasOptionalTypeAnnotation":
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
        return concat([
            path.call(print, "elementType"),
            "[]"
        ]);

    case "TupleTypeAnnotation":
        var printed = path.map(print, "types");
        var joined = fromString(", ").join(printed);
        var oneLine = joined.getLineLength(1) <= options.wrapColumn;
        if (oneLine) {
          if (options.arrayBracketSpacing) {
            parts.push("[ ");
          } else {
            parts.push("[");
          }
        } else {
          parts.push("[\n");
        }

        path.each(function(elemPath) {
            var i = elemPath.getName();
            var elem = elemPath.getValue();
            if (!elem) {
                // If the array expression ends with a hole, that hole
                // will be ignored by the interpreter, but if it ends with
                // two (or more) holes, we need to write out two (or more)
                // commas so that the resulting code is interpreted with
                // both (all) of the holes.
                parts.push(",");
            } else {
                var lines = printed[i];
                if (oneLine) {
                    if (i > 0)
                        parts.push(" ");
                } else {
                    lines = lines.indent(options.tabWidth);
                }
                parts.push(lines);
                if (i < n.types.length - 1 || (!oneLine && util.isTrailingCommaEnabled(options, "arrays")))
                    parts.push(",");
                if (!oneLine)
                    parts.push("\n");
            }
        }, "types");

        if (oneLine && options.arrayBracketSpacing) {
          parts.push(" ]");
        } else {
          parts.push("]");
        }

        return concat(parts);

    case "BooleanTypeAnnotation":
        return fromString("boolean", options);

    case "BooleanLiteralTypeAnnotation":
        assert.strictEqual(typeof n.value, "boolean");
        return fromString("" + n.value, options);

    case "DeclareClass":
        return printFlowDeclaration(path, [
            "class ",
            path.call(print, "id"),
            " ",
            path.call(print, "body"),
        ]);

    case "DeclareFunction":
        return printFlowDeclaration(path, [
            "function ",
            path.call(print, "id"),
            ";"
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
        return printFlowDeclaration(path, [
            "var ",
            path.call(print, "id"),
            ";"
        ]);

    case "DeclareExportDeclaration":
    case "DeclareExportAllDeclaration":
        return concat([
            "declare ",
            printExportDeclaration(path, options, print)
        ]);

    case "InferredPredicate":
        return fromString("%checks", options);

    case "DeclaredPredicate":
        return concat([
            "%checks(",
            path.call(print, "value"),
            ")"
        ]);

    case "FunctionTypeAnnotation":
        // FunctionTypeAnnotation is ambiguous:
        // declare function(a: B): void; OR
        // var A: (a: B) => void;
        var parent = path.getParentNode(0);
        var isArrowFunctionTypeAnnotation = !(
            namedTypes.ObjectTypeCallProperty.check(parent) ||
            namedTypes.DeclareFunction.check(path.getParentNode(2))
        );

        var needsColon =
            isArrowFunctionTypeAnnotation &&
            !namedTypes.FunctionTypeParam.check(parent);

        if (needsColon) {
            parts.push(": ");
        }

        parts.push(
            "(",
            fromString(", ").join(path.map(print, "params")),
            ")"
        );

        // The returnType is not wrapped in a TypeAnnotation, so the colon
        // needs to be added separately.
        if (n.returnType) {
            parts.push(
                isArrowFunctionTypeAnnotation ? " => " : ": ",
                path.call(print, "returnType")
            );
        }

        return concat(parts);

    case "FunctionTypeParam":
        return concat([
            path.call(print, "name"),
            n.optional ? '?' : '',
            ": ",
            path.call(print, "typeAnnotation"),
        ]);

    case "GenericTypeAnnotation":
        return concat([
            path.call(print, "id"),
            path.call(print, "typeParameters")
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
            " "
        );

        if (n["extends"] && n["extends"].length > 0) {
            parts.push(
                "extends ",
                fromString(", ").join(path.map(print, "extends")),
                " "
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
            path.call(print, "typeParameters")
        ]);

    case "IntersectionTypeAnnotation":
        return fromString(" & ").join(path.map(print, "types"));

    case "NullableTypeAnnotation":
        return concat([
            "?",
            path.call(print, "typeAnnotation")
        ]);

    case "NullLiteralTypeAnnotation":
        return fromString("null", options);

    case "ThisTypeAnnotation":
        return fromString("this", options);

    case "NumberTypeAnnotation":
        return fromString("number", options);

    case "ObjectTypeCallProperty":
        return path.call(print, "value");

    case "ObjectTypeIndexer":
        return concat([
            printVariance(path, print),
            "[",
            path.call(print, "id"),
            ": ",
            path.call(print, "key"),
            "]: ",
            path.call(print, "value")
        ]);

    case "ObjectTypeProperty":
        return concat([
            printVariance(path, print),
            path.call(print, "key"),
            n.optional ? "?" : "",
            ": ",
            path.call(print, "value")
        ]);

    case "QualifiedTypeIdentifier":
        return concat([
            path.call(print, "qualification"),
            ".",
            path.call(print, "id")
        ]);

    case "StringLiteralTypeAnnotation":
        return fromString(nodeStr(n.value, options), options);

    case "NumberLiteralTypeAnnotation":
    case "NumericLiteralTypeAnnotation":
        assert.strictEqual(typeof n.value, "number");
        return fromString(JSON.stringify(n.value), options);

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
            ";"
        ]);

    case "DeclareOpaqueType":
        parts.push("declare ");
        // Fall through to OpaqueType...

    case "OpaqueType":
        parts.push(
            "opaque type ",
            path.call(print, "id"),
            path.call(print, "typeParameters")
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
            ")"
        ]);

    case "TypeParameterDeclaration":
    case "TypeParameterInstantiation":
        return concat([
            "<",
            fromString(", ").join(path.map(print, "params")),
            ">"
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

        parts.push(path.call(print, 'name'));

        if (n.bound) {
            parts.push(path.call(print, 'bound'));
        }

        if (n['default']) {
            parts.push('=', path.call(print, 'default'));
        }

        return concat(parts);

    case "TypeofTypeAnnotation":
        return concat([
            fromString("typeof ", options),
            path.call(print, "argument")
        ]);

    case "UnionTypeAnnotation":
        return fromString(" | ").join(path.map(print, "types"));

    case "VoidTypeAnnotation":
        return fromString("void", options);

    case "NullTypeAnnotation":
        return fromString("null", options);

    // Type Annotations for TypeScript (when using Babylon as parser)
    case "TSType":
        throw new Error("unprintable type: " + JSON.stringify(n.type));

    case "TSNumberKeyword":
        return fromString("number", options);

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

    case "TSThisType":
        return fromString("this", options);

    case "TSNullKeyword":
        return fromString("null", options);

    case "TSUndefinedKeyword":
        return fromString("undefined", options);

    case "TSNeverKeyword":
        return fromString("never", options);

    case "TSArrayType":
        return concat([
            path.call(print, "elementType"),
            "[]"
        ]);

    case "TSLiteralType":
        return path.call(print, "literal")

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
            path.call(print, "falseType")
        );

        return concat(parts);

    case "TSInferType":
        parts.push(
            "infer ",
            path.call(print, "typeParameter")
        );

        return concat(parts);

    case "TSParenthesizedType":
        return concat([
            "(",
            path.call(print, "typeAnnotation"),
            ")"
        ]);

    case "TSFunctionType":
    case "TSConstructorType":
        return concat([
            path.call(print, "typeParameters"),
            "(",
            printFunctionParams(path, options, print),
            ")",
            path.call(print, "typeAnnotation")
        ]);

    case "TSMappedType": {
        parts.push(
            n.readonly ? "readonly " : "",
            "[",
            path.call(print, "typeParameter"),
            "]",
            n.optional ? "?" : ""
        );

        if (n.typeAnnotation) {
            parts.push(": ", path.call(print, "typeAnnotation"), ";");
        }

        return concat([
            "{\n",
            concat(parts).indent(options.tabWidth),
            "\n}",
        ]);
    }

    case "TSTupleType":
        return concat([
            "[",
            fromString(", ").join(path.map(print, "elementTypes")),
            "]"
        ]);

    case "TSIndexedAccessType":
        return concat([
            path.call(print, "objectType"),
            "[",
            path.call(print, "indexType"),
            "]"
        ]);

    case "TSTypeOperator":
        return concat([
            path.call(print, "operator"),
            " ",
            path.call(print, "typeAnnotation")
        ]);

    case "TSTypeLiteral": {
        const memberLines =
            fromString(",\n").join(path.map(print, "members"));

        if (memberLines.isEmpty()) {
            return fromString("{}", options);
        }

        parts.push(
            "{\n",
            memberLines.indent(options.tabWidth),
            "\n}"
        );

        return concat(parts);
    }

    case "TSEnumMember":
        parts.push(path.call(print, "id"));
        if (n.initializer) {
            parts.push(
                " = ",
                path.call(print, "initializer")
            );
        }
        return concat(parts);

    case "TSTypeQuery":
        return concat([
            "typeof ",
            path.call(print, "exprName"),
        ]);

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
            path.call(print, "typeParameters")
        ]);

    case "TSQualifiedName":
        return concat([
            path.call(print, "left"),
            ".",
            path.call(print, "right")
        ]);

    case "TSAsExpression": {
        var withParens = n.extra && n.extra.parenthesized === true;
        parts = [];
        if (withParens) parts.push("(");
        parts.push(
            path.call(print, "expression"),
            fromString(" as "),
            path.call(print, "typeAnnotation")
        );
        if (withParens) parts.push(")");

        return concat(parts);
    }

    case "TSNonNullExpression":
        return concat([
            path.call(print, "expression"),
            "!"
        ]);

    case "TSTypeAnnotation": {
        // similar to flow's FunctionTypeAnnotation, this can be
        // ambiguous: it can be prefixed by => or :
        // in a type predicate, it takes the for u is U
        var parent = path.getParentNode(0);
        var prefix = ": ";
        var isFunctionType = namedTypes.TSFunctionType.check(parent);
        if (namedTypes.TSFunctionType.check(parent)) {
            prefix = " => ";
        }

        if (namedTypes.TSTypePredicate.check(parent)) {
            prefix = " is ";
        }

        return concat([
            prefix,
            path.call(print, "typeAnnotation")
        ]);
    }

    case "TSIndexSignature":
        return concat([
            n.readonly ? "readonly " : "",
            "[",
            path.map(print, "parameters"),
            "]",
            path.call(print, "typeAnnotation")
        ]);

    case "TSPropertySignature":
        parts.push(
            printVariance(path, print),
            n.readonly ? "readonly " : ""
        );

        if (n.computed) {
            parts.push(
                "[",
                path.call(print, "key"),
                "]"
            );
        } else {
            parts.push(path.call(print, "key"));
        }

        parts.push(
            n.optional ? "?" : "",
            path.call(print, "typeAnnotation")
        );

        return concat(parts);

    case "TSMethodSignature":
        if (n.computed) {
            parts.push(
                "[",
                path.call(print, "key"),
                "]"
            );
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
            path.call(print, "typeAnnotation")
        );

        return concat(parts);

    case "TSTypePredicate":
        return concat([
            path.call(print, "parameterName"),
            path.call(print, "typeAnnotation")
        ]);

    case "TSCallSignatureDeclaration":
        return concat([
            path.call(print, "typeParameters"),
            "(",
            printFunctionParams(path, options, print),
            ")",
            path.call(print, "typeAnnotation")
        ]);

    case "TSConstructSignatureDeclaration":
        if (n.typeParameters) {
            parts.push(
                "new",
                path.call(print, "typeParameters")
            );
        } else {
            parts.push("new ");
        }

        parts.push(
            "(",
            printFunctionParams(path, options, print),
            ")",
            path.call(print, "typeAnnotation")
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
            ";"
        ]);

    case "TSTypeParameter":
        parts.push(path.call(print, "name"));

        // ambiguous because of TSMappedType
        var parent = path.getParentNode(0);
        var isInMappedType = namedTypes.TSMappedType.check(parent);

        if (n.constraint) {
            parts.push(
                isInMappedType ? " in " : " extends ",
                path.call(print, "constraint")
            );
        }

        if (n["default"]) {
            parts.push(" = ", path.call(print, "default"));
        }

        return concat(parts);

    case "TSTypeAssertion":
        var withParens = n.extra && n.extra.parenthesized === true;
        if (withParens) {
            parts.push("(");
        }

        parts.push(
            "<",
            path.call(print, "typeAnnotation"),
            "> ",
            path.call(print, "expression")
        );

        if (withParens) {
            parts.push(")");
        }

        return concat(parts);

    case "TSTypeParameterDeclaration":
    case "TSTypeParameterInstantiation":
        return concat([
            "<",
            fromString(", ").join(path.map(print, "params")),
            ">"
        ]);

    case "TSEnumDeclaration":
        parts.push(
            n.declare ? "declare " : "",
            n.const ? "const " : "",
            "enum ",
            path.call(print, "id")
        );

        const memberLines =
            fromString(",\n").join(path.map(print, "members"));

        if (memberLines.isEmpty()) {
            parts.push(" {}");
        } else {
            parts.push(
                " {\n",
                memberLines.indent(options.tabWidth),
                "\n}"
            );
        }

        return concat(parts);

    case "TSExpressionWithTypeArguments":
        return concat([
            path.call(print, "expression"),
            path.call(print, "typeParameters")
        ]);

    case "TSInterfaceBody":
        var lines = fromString(";\n").join(path.map(print, "body"));
        if (lines.isEmpty()) {
            return fromString("{}", options);
        }

        return concat([
            "{\n",
            lines.indent(options.tabWidth), ";",
            "\n}",
        ]);

    case "TSImportEqualsDeclaration":
        if (n.isExport) {
            parts.push("export ");
        }

        parts.push(
            "import ",
            path.call(print, "id"),
            " = ",
            path.call(print, "moduleReference")
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

            if (! n.global) {
                const isExternal = n.id.type === "StringLiteral" ||
                    (n.id.type === "Literal" &&
                     typeof n.id.value === "string");

                if (isExternal) {
                    parts.push("module ");

                } else if (n.loc &&
                           n.loc.lines &&
                           n.id.loc) {
                    const prefix = n.loc.lines.sliceString(
                        n.loc.start,
                        n.id.loc.start
                    );

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

        if (n.body && n.body.type === "TSModuleDeclaration") {
            parts.push(path.call(print, "body"));
        } else if (n.body) {
            const bodyLines = path.call(print, "body");
            if (bodyLines.isEmpty()) {
                parts.push(" {}");
            } else {
                parts.push(
                    " {\n",
                    bodyLines.indent(options.tabWidth),
                    "\n}"
                );
            }
        }

        return concat(parts);
    }

    case "TSModuleBlock":
        return path.call(function (bodyPath) {
            return printStatementSequence(bodyPath, options, print);
        }, "body");

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

    // XML types that nobody cares about or needs to print.
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

    return p;
}

function printStatementSequence(path, options, print) {
    var inClassBody =
        namedTypes.ClassBody &&
        namedTypes.ClassBody.check(path.getParentNode());

    var filtered = [];
    var sawComment = false;
    var sawStatement = false;

    path.each(function(stmtPath) {
        var i = stmtPath.getName();
        var stmt = stmtPath.getValue();

        // Just in case the AST has been modified to contain falsy
        // "statements," it's safer simply to skip them.
        if (!stmt) {
            return;
        }

        // Skip printing EmptyStatement nodes to avoid leaving stray
        // semicolons lying around.
        if (stmt.type === "EmptyStatement") {
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
            printed: print(stmtPath)
        });
    });

    if (sawComment) {
        assert.strictEqual(
            sawStatement, false,
            "Comments may appear as statements in otherwise empty statement " +
                "lists, but may not coexist with non-Comment nodes."
        );
    }

    var prevTrailingSpace = null;
    var len = filtered.length;
    var parts = [];

    filtered.forEach(function(info, i) {
        var printed = info.printed;
        var stmt = info.node;
        var multiLine = printed.length > 1;
        var notFirst = i > 0;
        var notLast = i < len - 1;
        var leadingSpace;
        var trailingSpace;
        var lines = stmt && stmt.loc && stmt.loc.lines;
        var trueLoc = lines && options.reuseWhitespace &&
            util.getTrueLoc(stmt, lines);

        if (notFirst) {
            if (trueLoc) {
                var beforeStart = lines.skipSpaces(trueLoc.start, true);
                var beforeStartLine = beforeStart ? beforeStart.line : 1;
                var leadingGap = trueLoc.start.line - beforeStartLine;
                leadingSpace = Array(leadingGap + 1).join("\n");
            } else {
                leadingSpace = multiLine ? "\n\n" : "\n";
            }
        } else {
            leadingSpace = "";
        }

        if (notLast) {
            if (trueLoc) {
                var afterEnd = lines.skipSpaces(trueLoc.end);
                var afterEndLine = afterEnd ? afterEnd.line : lines.length;
                var trailingGap = afterEndLine - trueLoc.end.line;
                trailingSpace = Array(trailingGap + 1).join("\n");
            } else {
                trailingSpace = multiLine ? "\n\n" : "\n";
            }
        } else {
            trailingSpace = "";
        }

        parts.push(
            maxSpace(prevTrailingSpace, leadingSpace),
            printed
        );

        if (notLast) {
            prevTrailingSpace = trailingSpace;
        } else if (trailingSpace) {
            parts.push(trailingSpace);
        }
    });

    return concat(parts);
}

function maxSpace(s1, s2) {
    if (!s1 && !s2) {
        return fromString("");
    }

    if (!s1) {
        return fromString(s2);
    }

    if (!s2) {
        return fromString(s1);
    }

    var spaceLines1 = fromString(s1);
    var spaceLines2 = fromString(s2);

    if (spaceLines2.length > spaceLines1.length) {
        return spaceLines2;
    }

    return spaceLines1;
}

function printMethod(path, options, print) {
    var node = path.getNode();
    var kind = node.kind;
    var parts = [];

    var nodeValue = node.value;
    if (! namedTypes.FunctionExpression.check(nodeValue)) {
        nodeValue = node;
    }

    var access = node.accessibility || node.access;
    if (typeof access === "string") {
        parts.push(access, " ");
    }

    if (node.static) {
        parts.push("static ");
    }

    if (node.abstract) {
        parts.push("abstract ");
    }

    if (node.readonly) {
        parts.push("readonly ");
    }

    if (nodeValue.async) {
        parts.push("async ");
    }

    if (nodeValue.generator) {
        parts.push("*");
    }

    if (kind === "get" || kind === "set") {
        parts.push(kind, " ");
    }

    var key = path.call(print, "key");
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
            path.call(print, "returnType")
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
            path.call(function(valuePath) {
                return printFunctionParams(valuePath, options, print);
            }, "value"),
            ")",
            path.call(print, "value", "returnType")
        );

        if (nodeValue.body) {
            parts.push(" ", path.call(print, "value", "body"));
        } else {
            parts.push(";");
        }
    }

    return concat(parts);
}

function printArgumentsList(path, options, print) {
    var printed = path.map(print, "arguments");
    var trailingComma = util.isTrailingCommaEnabled(options, "parameters");

    var joined = fromString(", ").join(printed);
    if (joined.getLineLength(1) > options.wrapColumn) {
        joined = fromString(",\n").join(printed);
        return concat([
            "(\n",
            joined.indent(options.tabWidth),
            trailingComma ? ",\n)" : "\n)"
        ]);
    }

    return concat(["(", joined, ")"]);
}

function printFunctionParams(path, options, print) {
    var fun = path.getValue();

    if (fun.params) {
        var params = fun.params;
        var printed = path.map(print, "params");
    } else if (fun.parameters) {
        params = fun.parameters;
        printed = path.map(print, "parameters");
    }

    if (fun.defaults) {
        path.each(function(defExprPath) {
            var i = defExprPath.getName();
            var p = printed[i];
            if (p && defExprPath.getValue()) {
                printed[i] = concat([p, " = ", print(defExprPath)]);
            }
        }, "defaults");
    }

    if (fun.rest) {
        printed.push(concat(["...", path.call(print, "rest")]));
    }

    var joined = fromString(", ").join(printed);
    if (joined.length > 1 ||
        joined.getLineLength(1) > options.wrapColumn) {
        joined = fromString(",\n").join(printed);
        if (util.isTrailingCommaEnabled(options, "parameters") &&
            !fun.rest &&
            params[params.length - 1].type !== 'RestElement') {
            joined = concat([joined, ",\n"]);
        } else {
            joined = concat([joined, "\n"]);
        }
        return concat(["\n", joined.indent(options.tabWidth)]);
    }

    return joined;
}

function printExportDeclaration(path, options, print) {
    var decl = path.getValue();
    var parts = ["export "];
    if (decl.exportKind && decl.exportKind !== "value") {
        parts.push(decl.exportKind + " ");
    }
    var shouldPrintSpaces = options.objectCurlySpacing;

    namedTypes.Declaration.assert(decl);

    if (decl["default"] ||
        decl.type === "ExportDefaultDeclaration") {
        parts.push("default ");
    }

    if (decl.declaration) {
        parts.push(path.call(print, "declaration"));

    } else if (decl.specifiers &&
               decl.specifiers.length > 0) {

        if (decl.specifiers.length === 1 &&
            decl.specifiers[0].type === "ExportBatchSpecifier") {
            parts.push("*");
        } else {
            parts.push(
                shouldPrintSpaces ? "{ " : "{",
                fromString(", ").join(path.map(print, "specifiers")),
                shouldPrintSpaces ? " }" : "}"
            );
        }

        if (decl.source) {
            parts.push(" from ", path.call(print, "source"));
        }
    }

    var lines = concat(parts);
    if (lastNonSpaceCharacter(lines) !== ";" &&
        ! (decl.declaration &&
           (decl.declaration.type === "FunctionDeclaration" ||
            decl.declaration.type === "ClassDeclaration" ||
            decl.declaration.type === "TSModuleDeclaration" ||
            decl.declaration.type === "TSInterfaceDeclaration" ||
            decl.declaration.type === "TSEnumDeclaration"))) {
        lines = concat([lines, ";"]);
    }
    return lines;
}

function printFlowDeclaration(path, parts) {
    var parentExportDecl = util.getParentExportDeclaration(path);

    if (parentExportDecl) {
        assert.strictEqual(
            parentExportDecl.type,
            "DeclareExportDeclaration"
        );
    } else {
        // If the parent node has type DeclareExportDeclaration, then it
        // will be responsible for printing the "declare" token. Otherwise
        // it needs to be printed with this non-exported declaration node.
        parts.unshift("declare ");
    }

    return concat(parts);
}

function printVariance(path, print) {
    return path.call(function (variancePath) {
        var value = variancePath.getValue();

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

function adjustClause(clause, options) {
    if (clause.length > 1)
        return concat([" ", clause]);

    return concat([
        "\n",
        maybeAddSemicolon(clause).indent(options.tabWidth)
    ]);
}

function lastNonSpaceCharacter(lines) {
    var pos = lines.lastPos();
    do {
        var ch = lines.charAt(pos);
        if (/\S/.test(ch))
            return ch;
    } while (lines.prevPos(pos));
}

function endsWithBrace(lines) {
    return lastNonSpaceCharacter(lines) === "}";
}

function swapQuotes(str) {
    return str.replace(/['"]/g, function(m) {
        return m === '"' ? '\'' : '"';
    });
}

function nodeStr(str, options) {
    isString.assert(str);
    switch (options.quote) {
    case "auto":
        var double = JSON.stringify(str);
        var single = swapQuotes(JSON.stringify(swapQuotes(str)));
        return double.length > single.length ? single : double;
    case "single":
        return swapQuotes(JSON.stringify(swapQuotes(str)));
    case "double":
    default:
        return JSON.stringify(str);
    }
}

function maybeAddSemicolon(lines) {
    var eoc = lastNonSpaceCharacter(lines);
    if (!eoc || "\n};".indexOf(eoc) < 0)
        return concat([lines, ";"]);
    return lines;
}
