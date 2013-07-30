var assert = require("assert");
var Syntax = require("./types").Syntax;
var printComments = require("./comments").printComments;
var linesModule = require("./lines");
var fromString = linesModule.fromString;
var concat = linesModule.concat;
var normalizeOptions = require("./options").normalize;
var getReprinter = require("./patcher").getReprinter;
var types = require("./types").namedTypes;
var Path = require("./path").Path;

function Printer(options) {
    assert.ok(this instanceof Printer);

    options = normalizeOptions(options);

    function printWithComments(path) {
        assert.ok(path instanceof Path);
        return printComments(path.node.comments, print(path));
    }

    function print(path, includeComments) {
        if (includeComments)
            return printWithComments(path);

        assert.ok(path instanceof Path);

        var reprinter = getReprinter(path);
        if (reprinter)
            return reprinter(printRootGenerically);

        return printRootGenerically(path);
    }

    // Print the root node generically, but then resume reprinting its
    // children non-generically.
    function printRootGenerically(path) {
        return genericPrint(path, options, printWithComments);
    }

    // Print the entire AST generically.
    function printGenerically(path) {
        return genericPrint(path, options, printGenerically);
    }

    this.print = function(ast) {
        if (!ast) return "";
        return print(new Path(ast), true).toString(options);
    };

    this.printGenerically = function(ast) {
        if (!ast) return "";
        return printGenerically(new Path(ast)).toString(options);
    };
}

exports.Printer = Printer;

function genericPrint(path, options, printPath) {
    var lines = genericPrintNoParens(path.node, options, function(node) {
        if (!node)
            return fromString("");

        if (typeof node === "string")
            return fromString(node, options.tabWidth);

        return printPath(path.cons(node));
    });

    if (path.needsParens())
        return concat(["(", lines, ")"]);

    return lines;
}

function genericPrintNoParens(n, options, print) {
    switch (n.type) {
    case "File":
        n = n.program;
        types.Program.assert(n);

        // intentionally fall through...

    case "Program":
        return maybeAddSemicolon(
            printStatementSequence(n.body, print)
        );

    case "EmptyStatement":
        return fromString("");

    case "ExpressionStatement":
        return concat([print(n.expression), ";"]);

    case "BinaryExpression":
    case "LogicalExpression":
    case "AssignmentExpression":
        return fromString(" ").join([
            print(n.left),
            print(n.operator),
            print(n.right)
        ]);

    case "MemberExpression":
        var parts = [print(n.object)];

        if (n.computed)
            parts.push("[", print(n.property), "]");
        else
            parts.push(".", print(n.property));

        return concat(parts);

    case "Path":
        return fromString(".").join(n.body);

    case "Identifier":
        return fromString(n.name, options.tabWidth);

    case "SpreadElement":
        return concat(["...", print(n.argument)]);

    case "FunctionDeclaration":
    case "FunctionExpression":
        var parts = ["function"];

        if (n.generator)
            parts.push("*");

        if (n.id)
            parts.push(" ", print(n.id));

        parts.push(
            "(",
            maybeWrapParams(n.params, options, print),
            ") ",
            print(n.body));

        return concat(parts);

    case "ArrowFunctionExpression":
        var parts = [];

        if (n.params.length === 1) {
            parts.push(print(n.params[0]));
        } else {
            parts.push(
                "(",
                maybeWrapParams(n.params, options, print),
                ")"
            );
        }

        parts.push(" => ", print(n.body));

        return concat(parts);

    case "MethodDefinition":
        var parts = [];

        if (!n.kind || n.kind === "init") {
            if (n.value.generator)
                parts.push("*");

        } else {
            assert.ok(
                n.kind === "get" ||
                n.kind === "set");

            parts.push(n.kind, " ");
        }

        parts.push(
            print(n.key),
            "(",
            maybeWrapParams(n.value.params, options, print),
            ") ",
            print(n.value.body)
        );

        return concat(parts);

    case "YieldExpression":
        var parts = ["yield"];

        if (n.delegate)
            parts.push("*");

        if (n.argument)
            parts.push(" ", print(n.argument));

        return concat(parts);

    case "ModuleDeclaration":
        var parts = ["module", print(n.id)];

        if (n.from) {
            assert.ok(!n.body);
            parts.push("=", print(n.from));
        } else {
            parts.push(print(n.body));
        }

        return fromString(" ").join(parts);

    case "BlockStatement":
        var naked = printStatementSequence(n.body, print);
        if (naked.isEmpty())
            return fromString("{}");

        return concat([
            "{\n",
            naked.indent(options.tabWidth),
            "\n}"
        ]);

    case "ReturnStatement":
        var parts = ["return"];

        if (n.argument)
            parts.push(" ", print(n.argument));

        return concat(parts);

    case "CallExpression":
        return concat([
            print(n.callee),
            "(",
            fromString(", ").join(n.arguments.map(print)),
            ")"
        ]);

    case "ObjectExpression":
    case "ObjectPattern":
        var allowBreak = false,
            len = n.properties.length,
            parts = [len > 0 ? "{\n" : "{"];

        n.properties.map(function(prop, i) {
            // Esprima uses these non-standard AST node types.
            if (!/^Property/.test(prop.type)) {
                if (prop.hasOwnProperty("kind")) {
                    prop.type = "Property";
                } else {
                    prop.type = Syntax.PropertyPattern || "Property";
                }
            }

            prop = print(prop).indent(options.tabWidth);

            var multiLine = prop.length > 1;
            if (multiLine && allowBreak) {
                // Similar to the logic for BlockStatement.
                parts.push("\n");
            }

            parts.push(prop);

            if (i < len - 1) {
                // Add an extra line break if the previous object property
                // had a multi-line value.
                parts.push(multiLine ? ",\n\n" : ",\n");
                allowBreak = !multiLine;
            }
        });

        parts.push(len > 0 ? "\n}" : "}");

        return concat(parts);

    case "PropertyPattern":
        return concat([
            print(n.key),
            ": ",
            print(n.pattern)
        ]);

    case "Property": // Non-standard AST node type.
        var key = print(n.key),
            val = print(n.value);

        if (!n.kind || n.kind === "init")
            return fromString(": ").join([key, val]);

        types.FunctionExpression.assert(val);
        assert.ok(val.id);
        assert.ok(n.kind === "get" ||
                  n.kind === "set");

        return concat([
            n.kind,
            " ",
            print(val.id),
            "(",
            maybeWrapParams(val.params, options, print),
            ")",
            print(val.body)
        ]);

    case "ArrayExpression":
    case "ArrayPattern":
        var elems = n.elements,
            len = elems.length,
            parts = ["["];

        elems.forEach(function(elem, i) {
            if (!elem) {
                // If the array expression ends with a hole, that hole
                // will be ignored by the interpreter, but if it ends with
                // two (or more) holes, we need to write out two (or more)
                // commas so that the resulting code is interpreted with
                // both (all) of the holes.
                parts.push(",");
            } else {
                if (i > 0)
                    parts.push(" ");
                parts.push(print(elem));
                if (i < len - 1)
                    parts.push(",");
            }
        });

        parts.push("]");

        return concat(parts);

    case "SequenceExpression":
        return fromString(", ").join(n.expressions.map(print));

    case "ThisExpression":
        return fromString("this");

    case "Literal":
        if (typeof n.value === "string")
            return fromString(nodeStr(n), options.tabWidth);
        return fromString(n.value, options.tabWidth);

    case "UnaryExpression":
        var parts = [print(n.operator)];
        if (/[a-z]$/.test(n.operator))
            parts.push(" ");
        parts.push(print(n.argument));
        return concat(parts);

    case "UpdateExpression":
        var parts = [
            print(n.argument),
            print(n.operator)
        ];

        if (n.prefix)
            parts.reverse();

        return concat(parts);

    case "ConditionalExpression":
        return concat([
            "(", print(n.test),
            " ? ", print(n.consequent),
            " : ", print(n.alternate), ")"
        ]);

    case "NewExpression":
        var parts = ["new ", print(n.callee)];
        var args = n.arguments;

        if (args) {
            parts.push(
                "(",
                fromString(", ").join(args.map(print)),
                ")"
            );
        }

        return concat(parts);

    case "VariableDeclaration":
        var parts = [n.kind];

        n.declarations.forEach(function(decl, i) {
            if (i === 0)
                parts.push(" ", print(decl));
            else
                parts.push(",\n", print(decl).indent(options.tabWidth));
        });

        return concat(parts);

    case "VariableDeclarator":
        return n.init ? fromString(" = ").join([
            print(n.id),
            print(n.init)
        ]) : print(n.id);

    case "WithStatement":
        return concat([
            "with (",
            print(n.object),
            ") ",
            print(n.body)
        ]);

    case "IfStatement":
        var con = adjustClause(print(n.consequent), options),
            parts = ["if (", print(n.test), ")", con];

        if (n.alternate)
            parts.push(
                endsWithBrace(con) ? " else" : "\nelse",
                adjustClause(print(n.alternate), options));

        return concat(parts);

    case "ForStatement":
        // TODO Get the for (;;) case right.
        var init = print(n.init),
            sep = init.length > 1 ? ";\n" : "; ",
            forParen = "for (",
            indented = fromString(sep).join([
                init,
                print(n.test),
                print(n.update)
            ]).indentTail(forParen.length),
            head = concat([forParen, indented, ")"]),
            clause = adjustClause(print(n.body), options),
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
            print(n.test),
            ")",
            adjustClause(print(n.body), options)
        ]);

    case "ForInStatement":
        // Note: esprima can't actually parse "for each (".
        return concat([
            n.each ? "for each (" : "for (",
            print(n.left),
            " in ",
            print(n.right),
            ")",
            adjustClause(print(n.body), options)
        ]);

    case "ForOfStatement":
        return concat([
            "for (",
            print(n.left),
            " of ",
            print(n.right),
            ")",
            adjustClause(print(n.body), options)
        ]);

    case "DoWhileStatement":
        var doBody = concat([
            "do",
            adjustClause(print(n.body), options)
        ]), parts = [doBody];

        if (endsWithBrace(doBody))
            parts.push(" while");
        else
            parts.push("\nwhile");

        parts.push(" (", print(n.test), ");");

        return concat(parts);

    case "BreakStatement":
        var parts = ["break"];
        if (n.label)
            parts.push(" ", print(n.label));
        return concat(parts);

    case "ContinueStatement":
        var parts = ["continue"];
        if (n.label)
            parts.push(" ", print(n.label));
        return concat(parts);

    case "LabeledStatement":
        return concat([
            print(n.label),
            ":\n",
            print(n.body)
        ]);

    case "TryStatement":
        var parts = [
            "try ",
            print(n.block)
        ];

        n.handlers.forEach(function(handler) {
            parts.push(" ", print(handler));
        });

        if (n.finalizer)
            parts.push(" finally ", print(n.finalizer));

        return concat(parts);

    case "CatchClause":
        var parts = ["catch (", print(n.param)];

        if (n.guard)
            // Note: esprima does not recognize conditional catch clauses.
            parts.push(" if ", print(n.guard));

        parts.push(") ", print(n.body));

        return concat(parts);

    case "ThrowStatement":
        return concat([
            "throw ",
            print(n.argument)
        ]);

    case "SwitchStatement":
        return concat([
            "switch (",
            print(n.discriminant),
            ") {\n",
            fromString("\n").join(n.cases.map(print)),
            "\n}"
        ]);

        // Note: ignoring n.lexical because it has no printing consequences.

    case "SwitchCase":
        var parts = [];

        if (n.test)
            parts.push("case ", print(n.test), ":");
        else
            parts.push("default:");

        if (n.consequent.length > 0) {
            parts.push("\n", printStatementSequence(
                n.consequent,
                print
            ).indent(options.tabWidth));
        }

        return concat(parts);

    case "DebuggerStatement":
        return fromString("debugger");

    // XJS extensions below.

    case "XJSAttribute":
        var parts = [print(n.name)];
        if (n.value)
            parts.push("=", print(n.value));
        return concat(parts);

    case "XJSIdentifier":
        var str = n.name;
        if (typeof n.namespace === "string")
            str = n.namespace + ":" + str;
        return fromString(str, options.tabWidth);

    case "XJSExpressionContainer":
        return concat(["{", print(n.expression), "}"]);

    case "XJSElement":
        var parts = [print(n.openingElement)];

        if (!n.selfClosing) {
            parts.push(
                concat(n.children.map(function(child) {
                    if (child.type === Syntax.Literal)
                        child.type = Syntax.XJSText;
                    return print(child);
                })),
                print(n.closingElement)
            );
        }

        return concat(parts);

    case "XJSOpeningElement":
        var parts = ["<", print(n.name)];

        n.attributes.forEach(function(attr) {
            parts.push(" ", print(attr));
        });

        parts.push(n.selfClosing ? " />" : ">");

        return concat(parts);

    case "XJSClosingElement":
        return concat(["</", print(n.name), ">"]);

    case "XJSText":
        return fromString(n.value, options.tabWidth);

    case "ClassBody":
        return concat([
            "{\n",
            printStatementSequence(n.body, print, true)
                .indent(options.tabWidth),
            "\n}"
        ]);

    case "ClassPropertyDefinition":
        var parts = ["static ", print(n.definition)];
        if (!types.MethodDefinition.check(n.definition))
            parts.push(";");
        return concat(parts);

    case "ClassDeclaration":
    case "ClassExpression":
        var parts = ["class"];

        if (n.id)
            parts.push(" ", print(n.id));

        if (n.superClass)
            parts.push(" extends ", print(n.superClass));

        parts.push(" ", print(n.body));

        return concat(parts);

    // Unhandled types below. If encountered, nodes of these types should
    // be either left alone or desugared into AST types that are fully
    // supported by the pretty-printer.

    case "ClassHeritage": // TODO
    case "ComprehensionBlock": // TODO
    case "ComprehensionExpression": // TODO
    case "ExportDeclaration": // TODO
    case "ExportSpecifier": // TODO
    case "ExportSpecifierSet": // TODO
    case "Glob": // TODO
    case "ImportDeclaration": // TODO
    case "ImportSpecifier": // TODO
    case "TaggedTemplateExpression": // TODO
    case "TemplateElement": // TODO
    case "TemplateLiteral": // TODO
    case "GeneratorExpression": // TODO
    case "LetStatement": // TODO
    case "LetExpression": // TODO
    case "GraphExpression": // TODO
    case "GraphIndexExpression": // TODO
    default:
        debugger;
        throw new Error("unknown type: " + JSON.stringify(n.type));
    }

    return p;
}

function printStatementSequence(stmts, print, inClassBody) {
    var filtered = stmts.filter(function(stmt) {
        // Just in case the AST has been modified to contain falsy
        // "statements," it's safer simply to skip them.
        if (!stmt)
            return false;

        // Skip printing EmptyStatement nodes to avoid leaving stray
        // semicolons lying around.
        if (stmt.type === "EmptyStatement")
            return false;

        return true;
    });

    types.Statement.arrayOf().check(filtered);

    var allowBreak = false,
        len = filtered.length,
        parts = [];

    filtered.map(function(node) {
        var lines = print(node);

        if (inClassBody) {
            if (types.MethodDefinition.check(node))
                return lines;

            if (types.ClassPropertyDefinition.check(node) &&
                types.MethodDefinition.check(node.definition))
                return lines;
        }

        // Try to add a semicolon to anything that isn't a method in a
        // class body.
        return maybeAddSemicolon(lines);

    }).forEach(function(lines, i) {
        var multiLine = lines.length > 1;
        if (multiLine && allowBreak) {
            // Insert an additional line break before multi-line
            // statements, if we did not insert an extra line break
            // after the previous statement.
            parts.push("\n");
        }

        if (!inClassBody)
            lines = maybeAddSemicolon(lines);

        parts.push(lines);

        if (i < len - 1) {
            // Add an extra line break if the previous statement
            // spanned multiple lines.
            parts.push(multiLine ? "\n\n" : "\n");

            // Avoid adding another line break if we just added an
            // extra one.
            allowBreak = !multiLine;
        }
    });

    return concat(parts);
}

function maybeWrapParams(params, options, print) {
    var oneLine = fromString(", ").join(params.map(print));
    if (oneLine.length > 1 ||
        oneLine.getLineLength(1) > options.wrapColumn) {
        return concat([
            "\n",
            fromString(",\n").join(
                params.map(print)
            ).indent(options.tabWidth)
        ])
    }
    return oneLine;
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

function nodeStrEscape(str) {
    return str.replace(/\\/g, "\\\\")
              .replace(/"/g, "\\\"")
              // The previous line messes up my syntax highlighting
              // unless this comment includes a " character.
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r")
              .replace(/</g, "\\u003C")
              .replace(/>/g, "\\u003E");
}

function nodeStr(n) {
    if (/[\u0000-\u001F\u0080-\uFFFF]/.test(n.value)) {
        // use the convoluted algorithm to avoid broken low/high characters
        var str = "";
        for (var i = 0; i < n.value.length; i++) {
            var c = n.value[i];
            if (c <= "\x1F" || c >= "\x80") {
                var cc = c.charCodeAt(0).toString(16);
                while (cc.length < 4) cc = "0" + cc;
                str += "\\u" + cc;
            } else {
                str += nodeStrEscape(c);
            }
        }
        return '"' + str + '"';
    }

    return '"' + nodeStrEscape(n.value) + '"';
}

function maybeAddSemicolon(lines) {
    var eoc = lastNonSpaceCharacter(lines);
    if (eoc && "\n};".indexOf(eoc) < 0)
        return concat([lines, ";"]);
    return lines;
}
