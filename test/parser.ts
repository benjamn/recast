import assert from "assert";
import fs from "fs";
import path from "path";
import { parse } from "../lib/parser";
import * as util from "../lib/util";
import { getReprinter } from "../lib/patcher";
import { Printer } from "../lib/printer";
import { fromString } from "../lib/lines";
import * as types from "ast-types";
const namedTypes = types.namedTypes;
import FastPath from "../lib/fast-path";
import { EOL as eol } from "os";
const nodeMajorVersion = parseInt(process.versions.node, 10);
const nodeMinorVersion = parseInt(process.versions.node.split(".")[1], 10);
const supportsOxcParser =
  (nodeMajorVersion === 20 && nodeMinorVersion >= 19) ||
  nodeMajorVersion > 22 ||
  (nodeMajorVersion === 22 && nodeMinorVersion >= 12);

// Esprima seems unable to handle unnamed top-level functions, so declare
// test functions with names and then export them later.

describe("parser", function () {
  const parserIds = [
    "../parsers/acorn",
    "../parsers/babel",
    "../parsers/esprima",
    "../parsers/flow",
    "../parsers/typescript",
  ];
  if (supportsOxcParser) {
    parserIds.push("../parsers/oxc");
  }
  parserIds.forEach(runTestsForParser);

  it("AlternateParser", function () {
    const b = types.builders;
    const parser = {
      parse: function () {
        const program = b.program([
          b.expressionStatement(b.identifier("surprise")),
        ]);
        program.comments = [];
        return program;
      },
    };

    function check(options?: any) {
      const ast = parse("ignored", options);
      const printer = new Printer();

      types.namedTypes.File.assert(ast, true);
      assert.strictEqual(printer.printGenerically(ast).code, "surprise;");
    }

    check({ esprima: parser });
    check({ parser: parser });
  });

  if (supportsOxcParser) {
    describe("oxc", function () {
      const oxcParser = require("../parsers/oxc");

      it("parses and reprints TypeScript, comments, and parentheses", function () {
        const code = [
          "// config",
          "export default {",
          "  foo: (1 + 2) * 3,",
          "} satisfies Record<string, unknown>;",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });

        assert.strictEqual(new Printer().print(ast).code, code);

        ast.program.body[0].declaration.expression.properties.push(
          types.builders.property(
            "init",
            types.builders.identifier("added"),
            types.builders.literal(true),
          ),
        );

        assert.strictEqual(
          new Printer().print(ast).code,
          [
            "// config",
            "export default {",
            "  foo: (1 + 2) * 3,",
            "  added: true",
            "} satisfies Record<string, unknown>;",
          ].join("\n"),
        );
      });

      it("preserves hashbangs when inserting statements", function () {
        const code = "#!/usr/bin/env node\nexport default {};";
        const ast = parse(code, { parser: oxcParser });
        ast.program.body.unshift(
          types.builders.importDeclaration(
            [
              types.builders.importSpecifier(
                types.builders.identifier("value"),
              ),
            ],
            types.builders.literal("module"),
          ),
        );

        assert.strictEqual(
          new Printer().print(ast).code,
          [
            "#!/usr/bin/env node",
            'import { value } from "module";',
            "export default {};",
          ].join("\n"),
        );
      });

      it("calculates Unicode locations and ranges across CRLF", function () {
        const code = '// café 😀\r\nconst first = "😀"; const second = 2;';
        const program = oxcParser.parse(code, { range: true });
        const declaration = program.body[1];
        const start = code.indexOf("const second");

        assert.strictEqual(declaration.start, start);
        assert.deepStrictEqual(declaration.range, [start, code.length]);
        assert.strictEqual(declaration.loc.start.line, 2);
        assert.strictEqual(declaration.loc.start.column, 20);
        assert.strictEqual(declaration.loc.end.line, 2);
        assert.strictEqual(declaration.loc.end.column, 37);
      });

      it("reports syntax errors with locations", function () {
        assert.throws(
          () => parse("export default {", { parser: oxcParser }),
          (error: SyntaxError & { loc?: types.namedTypes.Position }) => {
            assert.strictEqual(error.name, "SyntaxError");
            assert.deepStrictEqual(error.loc, { line: 1, column: 16 });
            return true;
          },
        );
      });

      it("supports explicit language configuration", function () {
        const parser = oxcParser.createOxcParser({
          filename: "source.js",
          lang: "js",
        });

        assert.throws(
          () => parse("const value: number = 1", { parser }),
          SyntaxError,
        );
      });

      it("normalizes class and TypeScript nodes for traversal and printing", function () {
        const code = [
          "class A implements Contract<number> {",
          "  x: number;",
          "  #secret: string;",
          "  accessor value: string;",
          "  optional?(): void;",
          "}",
          "interface I extends B<string> {}",
          "abstract class C {",
          "  abstract foo(): void;",
          "  abstract count: number;",
          "  abstract accessor item: string;",
          "}",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });
        const field = ast.program.body[0].body.body[0];
        const implementation = ast.program.body[0].implements[0];
        const privateField = ast.program.body[0].body.body[1];
        const accessor = ast.program.body[0].body.body[2];
        const optionalMethod = ast.program.body[0].body.body[3];
        const heritage = ast.program.body[1].extends[0];
        const abstractMethod = ast.program.body[2].body.body[0];
        const abstractField = ast.program.body[2].body.body[1];
        const abstractAccessor = ast.program.body[2].body.body[2];

        assert.strictEqual(field.type, "ClassProperty");
        assert.strictEqual(
          implementation.type,
          "TSExpressionWithTypeArguments",
        );
        assert.strictEqual(privateField.type, "ClassProperty");
        assert.strictEqual(privateField.key.type, "PrivateName");
        assert.strictEqual(accessor.type, "ClassAccessorProperty");
        assert.strictEqual(optionalMethod.type, "TSDeclareMethod");
        assert.strictEqual(heritage.type, "TSExpressionWithTypeArguments");
        assert.strictEqual(abstractMethod.type, "TSDeclareMethod");
        assert.strictEqual(abstractField.type, "ClassProperty");
        assert.strictEqual(abstractAccessor.type, "ClassAccessorProperty");

        assert.doesNotThrow(() => {
          types.visit(ast, {
            visitNode(path) {
              this.traverse(path);
            },
          });
        });

        field.key.name = "y";
        implementation.expression.name = "OtherContract";
        privateField.key.id.name = "privateValue";
        accessor.key.name = "result";
        optionalMethod.key.name = "maybe";
        heritage.expression.name = "D";
        abstractMethod.key.name = "bar";
        abstractField.key.name = "total";
        abstractAccessor.key.name = "entry";

        assert.strictEqual(
          new Printer().print(ast).code,
          [
            "class A implements OtherContract<number> {",
            "  y: number;",
            "  #privateValue: string;",
            "  accessor result: string;",
            "  maybe?(): void;",
            "}",
            "interface I extends D<string> {}",
            "abstract class C {",
            "  abstract bar(): void;",
            "  abstract total: number;",
            "  abstract accessor entry: string;",
            "}",
          ].join("\n"),
        );
      });

      it("preserves static import attributes during generic printing", function () {
        [
          'import data from "./data.json" assert { type: "json" };',
          'import data from "./data.json" with { type: "json" };',
          'import data from "./data.json" with {};',
          'export { default as data } from "./data.json" assert { type: "json" };',
          'export * from "./data.json" with { type: "json" };',
        ].forEach((code) => {
          const ast = parse(code, { parser: oxcParser });

          assert.strictEqual(new Printer().printGenerically(ast).code, code);
        });
      });

      it("preserves type-only export-all declarations", function () {
        const code = 'export type * from "types";';
        const ast = parse(code, { parser: oxcParser });

        assert.strictEqual(ast.program.body[0].exportKind, "type");
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("exposes class decorators to ast-types visitors", function () {
        const code = [
          "@sealed",
          "export class Service {",
          "  @tracked accessor value: string;",
          "  @bound method(input: string): void {}",
          "}",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });
        const decorators: string[] = [];

        types.visit(ast, {
          visitDecorator(path) {
            decorators.push((path.node.expression as any).name);
            this.traverse(path);
          },
        });

        assert.deepStrictEqual(decorators.sort(), [
          "bound",
          "sealed",
          "tracked",
        ]);
        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          [
            "@sealed",
            "export class Service {",
            "    @tracked",
            "    accessor value: string;",
            "",
            "    @bound",
            "    method(input: string): void {}",
            "}",
          ].join("\n"),
        );
      });

      it("ignores comments when detecting import attribute keywords", function () {
        const code =
          'import data from "./data.json" /* with compatibility */ assert { type: "json" };';
        const ast = parse(code, { parser: oxcParser });

        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("preserves dynamic import options during generic printing", function () {
        const code =
          'const data = import("./data.json", { with: { type: "json" } });';
        const ast = parse(code, { parser: oxcParser });
        const importCall = ast.program.body[0].declarations[0].init;
        let visitedOptions = false;

        assert.strictEqual(importCall.type, "CallExpression");
        assert.strictEqual(importCall.callee.type, "Import");
        assert.strictEqual(importCall.arguments.length, 2);

        types.visit(importCall, {
          visitObjectExpression(path) {
            visitedOptions = true;
            this.traverse(path);
          },
        });
        assert.strictEqual(visitedOptions, true);

        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          [
            'const data = import("./data.json", {',
            "    with: {",
            '        type: "json"',
            "    }",
            "});",
          ].join("\n"),
        );
      });

      it("normalizes TypeScript generic type arguments", function () {
        const code = [
          "type T = Promise<string>;",
          "const value = create<number>;",
          "class C extends Base<boolean> {}",
          "const D = class extends Other<Date> {};",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });
        const typeReference = ast.program.body[0].typeAnnotation;
        const instantiation = ast.program.body[1].declarations[0].init;
        const classDeclaration = ast.program.body[2];
        const classExpression = ast.program.body[3].declarations[0].init;

        assert.strictEqual(typeReference.typeArguments, undefined);
        assert.strictEqual(typeReference.typeParameters.params.length, 1);
        assert.strictEqual(instantiation.typeArguments, undefined);
        assert.strictEqual(instantiation.typeParameters.params.length, 1);
        [classDeclaration, classExpression].forEach((classNode) => {
          assert.strictEqual(classNode.superTypeArguments, undefined);
          assert.strictEqual(classNode.superTypeParameters.params.length, 1);
        });
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("normalizes JSX and tagged template type arguments", function () {
        const code = [
          "const element = <Component<string> />;",
          "const output = tag<number>`value`;",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });
        const openingElement =
          ast.program.body[0].declarations[0].init.openingElement;
        const taggedTemplate = ast.program.body[1].declarations[0].init;

        [openingElement, taggedTemplate].forEach((node) => {
          assert.strictEqual(node.typeArguments, undefined);
          assert.strictEqual(node.typeParameters.params.length, 1);
        });
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("normalizes TypeScript signatures", function () {
        const code = [
          "type F = (x: string) => number;",
          "type C = new (x: string) => number;",
          "interface I {",
          "  foo(): number;",
          "  (x: string): number;",
          "  new(x: string): I;",
          "}",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });
        const functionType = ast.program.body[0].typeAnnotation;
        const constructorType = ast.program.body[1].typeAnnotation;
        const signatures = ast.program.body[2].body.body;

        [functionType, constructorType, ...signatures].forEach((signature) => {
          assert.strictEqual(signature.params, undefined);
          assert.ok(Array.isArray(signature.parameters));
          assert.strictEqual(signature.returnType, undefined);
          assert.strictEqual(signature.typeAnnotation.type, "TSTypeAnnotation");
        });

        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          [
            "type F = (x: string) => number;",
            "type C = new (x: string) => number;",
            "",
            "interface I {",
            "    foo(): number;",
            "    (x: string): number;",
            "    new (x: string): I;",
            "}",
          ].join("\n"),
        );
      });

      it("flattens TypeScript enum bodies", function () {
        const code = "enum E { A, B = 2 }";
        const ast = parse(code, { parser: oxcParser });
        const declaration = ast.program.body[0];

        assert.strictEqual(declaration.body, undefined);
        assert.strictEqual(declaration.members.length, 2);
        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          ["enum E {", "    A,", "    B = 2", "}"].join("\n"),
        );
      });

      it("normalizes TypeScript mapped types and their modifiers", function () {
        const code = "type M<T> = { -readonly [K in keyof T]+?: T[K] };";
        const ast = parse(code, { parser: oxcParser });
        const mappedType = ast.program.body[0].typeAnnotation;

        assert.strictEqual(mappedType.key, undefined);
        assert.strictEqual(mappedType.constraint, undefined);
        assert.strictEqual(mappedType.typeParameter.type, "TSTypeParameter");
        assert.strictEqual(mappedType.typeParameter.name.name, "K");
        assert.strictEqual(
          mappedType.typeParameter.constraint.type,
          "TSTypeOperator",
        );
        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          ["type M<T> = {", "    -readonly [K in keyof T]+?: T[K];", "};"].join(
            "\n",
          ),
        );
      });

      it("normalizes TypeScript import types", function () {
        const code = 'type T = import("pkg").Foo<string>;';
        const ast = parse(code, { parser: oxcParser });
        const importType = ast.program.body[0].typeAnnotation;

        assert.strictEqual(importType.source, undefined);
        assert.strictEqual(importType.argument.value, "pkg");
        assert.strictEqual(importType.typeArguments, undefined);
        assert.strictEqual(importType.typeParameters.params.length, 1);
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("preserves options on TypeScript import types", function () {
        const code =
          'type T = import("pkg", { with: { "resolution-mode": "import" } }).Foo;';
        const ast = parse(code, { parser: oxcParser });
        const importType = ast.program.body[0].typeAnnotation;

        assert.strictEqual(importType.options.type, "ObjectExpression");
        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          [
            'type T = import("pkg", {',
            "    with: {",
            '        "resolution-mode": "import"',
            "    }",
            "}).Foo;",
          ].join("\n"),
        );
      });

      it("normalizes type arguments on TypeScript type queries", function () {
        const code = "type T = typeof Foo<string>;";
        const ast = parse(code, { parser: oxcParser });
        const query = ast.program.body[0].typeAnnotation;
        let visitedStringType = false;

        types.visit(query, {
          visitTSStringKeyword(path) {
            visitedStringType = true;
            this.traverse(path);
          },
        });

        assert.strictEqual(query.typeArguments, undefined);
        assert.strictEqual(query.typeParameters.params.length, 1);
        assert.strictEqual(visitedStringType, true);
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("exposes normalized Oxc extension fields to ast-types visitors", function () {
        const code = [
          'type T = import("pkg", { with: { mode: option } }).Foo;',
          "const element = <Component<string> />;",
          "const output = tag<number>`value`;",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });
        const visited = new Set<string>();

        types.visit(ast, {
          visitIdentifier(path) {
            visited.add(path.node.name);
            this.traverse(path);
          },
          visitTSStringKeyword(path) {
            visited.add("string");
            this.traverse(path);
          },
          visitTSNumberKeyword(path) {
            visited.add("number");
            this.traverse(path);
          },
        });

        ["mode", "option", "string", "number"].forEach((name) => {
          assert.ok(visited.has(name), `expected ast-types to visit ${name}`);
        });
      });

      it("prints type arguments in typed call and constructor expressions", function () {
        const code = [
          "const called = factory<string>();",
          "const optional = factory?.<number>();",
          "const created = new Box<boolean>();",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });

        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("preserves typed optional binding patterns", function () {
        const cases = [
          {
            code: "const array = ([value]?: [number]) => value;",
            expected: "const array = ([value]?: [number]) => value;",
          },
          {
            code: "const object = ({ value }?: { value: number }) => value;",
            expected: [
              "const object = (",
              "    {",
              "        value",
              "    }?: {",
              "        value: number;",
              "    }",
              ") => value;",
            ].join("\n"),
          },
        ];

        cases.forEach(({ code, expected }) => {
          const ast = parse(code, { parser: oxcParser });
          const pattern = ast.program.body[0].declarations[0].init.params[0];
          let visitedNumberType = false;

          types.visit(pattern, {
            visitTSNumberKeyword(path) {
              visitedNumberType = true;
              this.traverse(path);
            },
          });

          assert.strictEqual(pattern.optional, true);
          assert.strictEqual(visitedNumberType, true);
          assert.strictEqual(
            new Printer().printGenerically(ast).code,
            expected,
          );
        });
      });

      it("preserves TypeScript module declaration kinds without source locations", function () {
        const code = "namespace N {}\nmodule M {}";
        const ast = parse(code, { parser: oxcParser });
        const [namespaceDeclaration, moduleDeclaration] = ast.program.body;

        assert.strictEqual(namespaceDeclaration.kind, "namespace");
        assert.strictEqual(moduleDeclaration.kind, "module");
        namespaceDeclaration.loc = null;
        moduleDeclaration.loc = null;
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("preserves TypeScript-only declaration modifiers", function () {
        const code = [
          'import type X = require("x");',
          "type Factory = abstract new () => X;",
          "interface Variance<in T, out U> {}",
          "class Box<const T> {}",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });

        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("preserves override on TypeScript parameter properties", function () {
        const code = [
          "class Base { value = 1; }",
          "class Derived extends Base {",
          "  constructor(public override value: number) {",
          "    super();",
          "  }",
          "}",
        ].join("\n");
        const ast = parse(code, { parser: oxcParser });

        assert.strictEqual(
          new Printer().printGenerically(ast).code,
          [
            "class Base {",
            "    value = 1;",
            "}",
            "",
            "class Derived extends Base {",
            "    constructor(public override value: number) {",
            "        super();",
            "    }",
            "}",
          ].join("\n"),
        );
      });

      it("preserves phased dynamic imports with options", function () {
        [
          {
            code: 'const value = import.source("x", { with: { type: "bytes" } });',
            phase: "source",
          },
          {
            code: 'const value = import.defer("x", { with: { type: "json" } });',
            phase: "defer",
          },
        ].forEach(({ code, phase }) => {
          const ast = parse(code, { parser: oxcParser });
          const importCall = ast.program.body[0].declarations[0].init;

          assert.strictEqual(importCall.type, "CallExpression");
          assert.strictEqual(importCall.callee.type, "MemberExpression");
          assert.strictEqual(importCall.callee.object.type, "Import");
          assert.strictEqual(importCall.callee.property.name, phase);
          assert.strictEqual(
            new Printer().printGenerically(ast).code,
            [
              `const value = import.${phase}("x", {`,
              "    with: {",
              `        type: "${phase === "source" ? "bytes" : "json"}"`,
              "    }",
              "});",
            ].join("\n"),
          );
        });
      });

      it("normalizes template literal types for traversal", function () {
        const code = "type Event = `on${string}`;";
        const ast = parse(code, { parser: oxcParser });
        const literalType = ast.program.body[0].typeAnnotation;

        assert.strictEqual(literalType.type, "TSLiteralType");
        assert.strictEqual(literalType.literal.type, "TemplateLiteral");
        assert.doesNotThrow(() => {
          types.visit(ast, {
            visitNode(path) {
              this.traverse(path);
            },
          });
        });
        assert.strictEqual(new Printer().printGenerically(ast).code, code);
      });

      it("honors sourceType configured on the parser factory", function () {
        const parser = oxcParser.createOxcParser({
          sourceType: "commonjs",
        });
        const code = "return new.target;";
        const ast = parse(code, { parser });

        assert.strictEqual(new Printer().print(ast).code, code);
      });

      it("honors range configured on the parser factory", function () {
        const parser = oxcParser.createOxcParser({ range: true });
        const code = "#!/usr/bin/env node\nclass A { #value: number; }";
        const ast = parse(code, { parser });
        const privateId = ast.program.body[0].body.body[0].key.id;
        const privateIdStart = code.indexOf("value");
        const interpreterEnd = code.indexOf("\n") + 1;

        assert.deepStrictEqual(ast.program.range, [0, code.length]);
        assert.deepStrictEqual(ast.program.interpreter.range, [
          0,
          interpreterEnd,
        ]);
        assert.deepStrictEqual(privateId.range, [
          privateIdStart,
          privateIdStart + "value".length,
        ]);
      });
    });
  }
});

function runTestsForParser(parserId: string) {
  const parserName = parserId.split("/").pop();

  if (!parserName) {
    return;
  }

  const parser = require(parserId);

  it("[" + parserName + "] empty source", function () {
    const printer = new Printer();

    function check(code: string) {
      const ast = parse(code, { parser });
      assert.strictEqual(printer.print(ast).code, code);
    }

    check("");
    check("/* block comment */");
    check("// line comment");
    check("\t\t\t");
    check(eol);
    check(eol + eol);
    check("    ");
  });

  const lineCommentTypes: { [name: string]: string } = {
    acorn: "Line",
    babel: "CommentLine",
    esprima: "Line",
    flow: "CommentLine",
    oxc: "Line",
    typescript: "CommentLine",
  };

  it("[" + parserName + "] parser basics", function testParser(done) {
    const code = testParser + "";
    const ast = parse(code, { parser });

    namedTypes.File.assert(ast);
    assert.ok(getReprinter(FastPath.from(ast)));

    const funDecl = ast.program.body[0];
    const funBody = funDecl.body;

    namedTypes.FunctionDeclaration.assert(funDecl);
    namedTypes.BlockStatement.assert(funBody);
    assert.ok(getReprinter(FastPath.from(funBody)));

    const lastStatement = funBody.body.pop();
    const doneCall = lastStatement.expression;

    assert.ok(!getReprinter(FastPath.from(funBody)));
    assert.ok(getReprinter(FastPath.from(ast)));

    funBody.body.push(lastStatement);
    assert.ok(getReprinter(FastPath.from(funBody)));

    assert.strictEqual(doneCall.callee.name, "done");

    assert.strictEqual(lastStatement.comments.length, 2);

    const firstComment = lastStatement.comments[0];

    assert.strictEqual(firstComment.type, lineCommentTypes[parserName]);

    assert.strictEqual(firstComment.leading, true);
    assert.strictEqual(firstComment.trailing, false);
    assert.strictEqual(
      firstComment.value,
      " Make sure done() remains the final statement in this function,",
    );

    const secondComment = lastStatement.comments[1];

    assert.strictEqual(secondComment.type, lineCommentTypes[parserName]);

    assert.strictEqual(secondComment.leading, true);
    assert.strictEqual(secondComment.trailing, false);
    assert.strictEqual(
      secondComment.value,
      " or the above assertions will probably fail.",
    );

    // Make sure done() remains the final statement in this function,
    // or the above assertions will probably fail.
    done();
  });

  it("[" + parserName + "] LocationFixer", function () {
    const code = ["function foo() {", "    a()", "    b()", "}"].join(eol);
    const ast = parse(code, { parser });
    const printer = new Printer();

    types.visit(ast, {
      visitFunctionDeclaration: function (path) {
        if (namedTypes.BlockStatement.check(path.node.body)) {
          path.node.body.body.reverse();
        }
        this.traverse(path);
      },
    });

    const altered = code
      .replace("a()", "xxx")
      .replace("b()", "a()")
      .replace("xxx", "b()");

    assert.strictEqual(altered, printer.print(ast).code);
  });

  it("[" + parserName + "] TabHandling", function () {
    function check(code: string, tabWidth: number) {
      const lines = fromString(code, { tabWidth: tabWidth });
      assert.strictEqual(lines.length, 1);

      function checkId(s: any, loc: types.namedTypes.SourceLocation) {
        const sliced = lines.slice(loc.start, loc.end);
        assert.strictEqual(s + "", sliced.toString());
      }

      types.visit(
        parse(code, {
          tabWidth: tabWidth,
          parser,
        }),
        {
          visitIdentifier(path) {
            const ident = path.node;
            checkId(ident.name, ident.loc!);
            this.traverse(path);
          },

          visitLiteral(path) {
            const lit = path.node;
            checkId(lit.value, lit.loc!);
            this.traverse(path);
          },
        },
      );
    }

    for (let tabWidth = 1; tabWidth <= 8; ++tabWidth) {
      check("\t\ti = 10;", tabWidth);
      check("\t\ti \t= 10;", tabWidth);
      check("\t\ti \t=\t 10;", tabWidth);
      check("\t \ti \t=\t 10;", tabWidth);
      check("\t \ti \t=\t 10;\t", tabWidth);
      check("\t \ti \t=\t 10;\t ", tabWidth);
    }
  });

  it("[" + parserName + "] Only comment followed by space", function () {
    const printer = new Printer();

    function check(code: string) {
      const ast = parse(code, { parser });
      assert.strictEqual(printer.print(ast).code, code);
    }

    check("// comment");
    check("// comment ");
    check("// comment\n");
    check("// comment\n\n");
    check(" // comment\n");
    check(" // comment\n ");
    check(" // comment \n ");

    check("/* comment */");
    check("/* comment */ ");
    check(" /* comment */");
    check("\n/* comment */");
    check("\n/* comment */\n");
    check("\n /* comment */\n ");
    check("/* comment */\n ");
    check("/* com\n\nment */");
    check("/* com\n\nment */ ");
    check(" /* com\n\nment */ ");
  });
}

// The token indices recast records on every node.loc are computed incrementally
// (see TreeCopier.findTokenRange), so they are only as good as the invariant
// they are supposed to maintain: loc.tokens.slice(loc.start.token,
// loc.end.token) must be exactly the tokens the node's loc covers.
//
// Tokens are sorted and don't overlap, so the tokens a loc covers are always a
// contiguous run, and checking the two tokens just inside the claimed range and
// the two just outside it is equivalent to comparing the whole run -- but costs
// O(1) per node instead of a scan over every token.
describe("token ranges", function () {
  function checkTokenRanges(source: string) {
    const ast = parse(source, { parser: require("../parsers/babel") });
    const tokens = ast.tokens;
    const seen = new Set();

    (function walk(node: any, where: string) {
      if (typeof node !== "object" || node === null || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${where}[${i}]`));
        return;
      }

      const loc = node.loc;
      if (loc && loc.start && typeof loc.start.token === "number") {
        const first = loc.start.token;
        const bound = loc.end.token;

        const covers = (i: number) =>
          util.comparePos(loc.start, tokens[i].loc.start) <= 0 &&
          util.comparePos(tokens[i].loc.end, loc.end) <= 0;

        const check = (i: number, expected: boolean) =>
          assert.strictEqual(
            covers(i),
            expected,
            `${node.type} at ${where} claims tokens [${first},${bound}) but ` +
              `${expected ? "excludes covered" : "includes uncovered"} ` +
              `token ${i} (${JSON.stringify(tokens[i].value)})`,
          );

        // Nothing outside the range may be covered...
        if (first > 0) check(first - 1, false);
        if (bound < tokens.length) check(bound, false);
        // ...and everything inside it must be.
        if (bound > first) {
          check(first, true);
          check(bound - 1, true);
        }
      }

      Object.keys(node).forEach(function (key) {
        if (key !== "loc" && key !== "tokens" && key !== "original") {
          walk(node[key], `${where}.${key}`);
        }
      });
    })(ast, "");
  }

  it("cover exactly the tokens inside each node", function () {
    checkTokenRanges(
      fs.readFileSync(path.join(__dirname, "data", "backbone.js"), "utf8"),
    );
  });

  it("include a node's final token", function () {
    // A node whose last token ends exactly where the node ends used to be
    // dropped from its own range, so a trailing comment ended up claiming no
    // tokens at all (#1399).
    checkTokenRanges("var x = 1; // c\n");
    checkTokenRanges("if (x) {\n  y(); // c\n}\n");
    checkTokenRanges("`before${x}middle${y}after`;\n");
  });
});
