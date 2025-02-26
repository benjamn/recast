import assert from "assert";
import * as types from "ast-types";
import fs from "fs";
import { EOL as eol } from "os";
import path from "path";
import * as recast from "../main";
import * as parser from "../parsers/typescript";

// Babel 7 no longer supports Node 4 or 5.
const nodeMajorVersion = parseInt(process.versions.node, 10);
(nodeMajorVersion >= 6 ? describe : xdescribe)("TypeScript", function () {
  it("basic printing", function () {
    function check(lines: any) {
      const code = lines.join(eol);
      const ast = recast.parse(code, { parser });
      const output = recast.prettyPrint(ast, { tabWidth: 2 }).code;
      assert.strictEqual(code, output);
    }

    check([
      'let color: string = "blue";',
      "let isDone: boolean = false;",
      "let decimal: number = 6;",
      "let hex: number = 0xf00d;",
      "let binary: number = 0b1010;",
      "let octal: number = 0o744;",
      "let list: number[] = [1, 2, 3];",
      "let list2: Array<number> = list;",
      "let matrix: number[][];",
      "let x: [string, number];",
      "let f: <E>(e: E) => void;",
      'let sn: string | null = "isNull";',
    ]);

    check([
      "type A = number;",
      "type B = string;",
      "type C = never;",
      "type D = any;",
      "type E = [string, number];",
      "type F = void;",
      "type G = undefined;",
      "type H = bigint;",
      "type I = intrinsic;",
      "",
      "type J = {",
      "  a: string;",
      "  b?: number;",
      "};",
    ]);

    check(["type c = T & U & V;"]);

    check(["let list: Array<number> = [1, 2, 3];"]);

    check(["let n = a!.c();"]);
    check(["a!.c();"]);

    check(['type A = "cat" | "dog" | "bird";']);

    check([
      "type A<T, U> = {",
      '  u: "cat";',
      "  x: number;",
      "  y: T;",
      "  z: U;",
      "};",
    ]);

    check([
      "type F = <T, U>(",
      "  a: string,",
      "  b: {",
      "    y: T;",
      "    z: U;",
      "  }",
      ") => void;",
    ]);

    check([
      "type Readonly<T> = {",
      "  readonly [P in keyof T]: T[P];",
      "};",
      "",
      "type Pick<T, K extends keyof T> = {",
      "  [P in K]: T[P];",
      "};",
    ]);

    check([
      "let strLength1: string = (<string> someValue).length;",
      "let strLength2: string = <string> someValue;",
      "let square = <Square> {};",
      "let strLength3: number = (someValue as string).length;",
      "let strLength4: number = someValue as string;",
    ]);

    check([
      "(<string> someValue).length;",
      "<string> someValue;",
      "<Square> {};",
      "(someValue as string).length;",
      "someValue as string;",
    ]);

    // TSSatisfiesExpression
    check([
      // Adapted from https://dev.to/ayc0/typescript-49-satisfies-operator-1e4i
      "const myColor = {",
      '  value: "red"',
      "} satisfies Color;",
      "",
      "const myIncorrectColor = {",
      "  value: 100",
      "} satisfies Color;",
      "",
      "const invalidPalette = {",
      "  red: [255, 0, 0],",
      '  green: "#00ff00",',
      "  blue: [1, 2, 3]",
      "} satisfies Record<string, string | RGB> as const;",
    ]);

    check(["let counter = <Counter> function(start: number) {};"]);
    check(["<Counter> function(start: number) {};"]);

    check(["if ((<F> p).s) {", "  (<F> p).s();", "}"]);

    check([
      "function i(p): p is F {}",
      "function i(p): p is string | number {}",
    ]);

    check(["function f<T, U>(a: T, b: U): void {", "  let c: number;", "}"]);

    check([
      "function pluck<T, K extends keyof T>(o: T, names: K[]): T[K][] {",
      "  console.log(o);",
      "}",
    ]);

    check([
      "let myAdd: <T, U>(x: T, y?: number) => U = function(x: number, y?: number): number {};",
      "function bb(f: string, ...r: string[]): void {}",
      "function f(this: void) {}",
      "function l<T extends L>(arg: T): T {}",
      "function l<T extends A.B.C>(arg: T): T {}",
      "function l<T extends keyof U>(obj: T) {}",
      "",
      "function create<T>(",
      "  c: {",
      "    new<U>(a: U): T;",
      "  }",
      "): void {}",
    ]);

    check(["const a = b as U as V;"]);
    check(["b as U as V;"]);

    check(["const highlight = (n => false) as (a: number) => boolean;"]);
    check(["(n => false) as (a: number) => boolean;"]);

    check([
      "const highlight = (function(n) {",
      "  return false;",
      "}) as (a: number) => boolean;",
    ]);
    check([
      "(function(n) {",
      "  return false;",
      "}) as (a: number) => boolean;",
    ]);

    check([
      "enum Color {",
      "  Red,",
      "  Green,",
      "  Blue",
      "}",
      "",
      "enum Color {",
      "  Red = 1,",
      "  Green = 2,",
      "  Blue = 3",
      "}",
      "",
      "enum Color {",
      "  Red = 1,",
      "  Green",
      "}",
      "",
      "enum Color {",
      '  Red = "RED",',
      '  Green = "GREEN",',
      '  Blue = "BLUE"',
      "}",
      "",
      "enum Color {",
      "  Red = init(),",
      '  Green = "GREEN"',
      "}",
      "",
      "enum E {",
      "  A = 1,",
      "  B,",
      "  C",
      "}",
      "",
      "enum F {",
      "  A = 1 << 1,",
      "  B = C | D.G,",
      '  E = "1".length',
      "}",
      "",
      "const enum G {",
      "  A = 1",
      "}",
      "",
      "declare enum H {",
      "  A = 1",
      "}",
    ]);

    check([
      "class C<T> extends B {",
      "  f(a: T) {",
      "    c(a as D);",
      "  }",
      "}",
    ]);

    check([
      "interface LabelledContainer<T> {",
      "  label: string;",
      "  content: T;",
      "  option?: boolean;",
      "  readonly x: number;",
      "  [index: number]: string;",
      "  [propName: string]: any;",
      "  readonly [index: number]: string;",
      "  (source: string, subString: string): boolean;",
      "  (start: number): string;",
      "  reset(): void;",
      "  a(c: (this: void, e: E) => void): void;",
      "}",
    ]);

    check([
      "interface Square<T, U> extends Shape<T, U>, Visible<T, U> {",
      "  sideLength: number;",
      "}",
    ]);

    check([
      "interface LabelledContainer<T> {",
      "  get label(): string;",
      "  set label(a: string);",
      "}",
    ]);

    check([
      "class Button extends Control<T, U> implements SelectableControl<T, U>, ClickableControl<U> {",
      "  select() {}",
      "}",
    ]);

    check([
      "class Animal {",
      '  static className: string = "Animal";',
      "",
      "  constructor(theName: string) {",
      "    this.name = theName;",
      "  }",
      "",
      "  private name: string;",
      "  public fur: boolean;",
      "  protected sound: string;",
      "  private getName() {}",
      "  public talk() {}",
      "  protected getSound() {}",
      "  static createAnimal() {}",
      "}",
    ]);

    check([
      "class Dog extends Animal {",
      "  protected override getSound() {",
      '    return "bark";',
      "  }",
      "}",
    ]);

    check(["export interface S {", "  i(s: string): boolean;", "}"]);

    check([
      "namespace Validation {",
      "  export interface S {",
      "    i(j: string): boolean;",
      "  }",
      "}",
    ]);

    check(["export interface S {", "  i(j: string): boolean;", "}"]);

    check(["declare namespace D3 {", "  export const f: number;", "}"]);

    check(["declare function foo<K, V>(arg: T = getDefault()): R"]);

    check([
      "class Animal {",
      "  public static async *[name]<T>(arg: U): V;",
      "}",
    ]);

    check(["function myFunction(", "  {", "    param1", "  }: Params", ") {}"]);

    check([
      'const unqualified: import("package") = 1;',
      'const qualified: import("package").ns = 2;',
      'const veryQualified: import("package").ns.foo.bar = 3;',
      'const qualifiedWithParams: import("package").ns.foo<T, U> = 4;',
      'const justParameterized: import("package")<T> = 5;',
    ]);

    check(["const a = function<T>(a: T): void {};"]);

    check(["new A<number>();"]);

    check(["createPlugin<number>();"]);

    check(["type Class<T> = new (...args: any) => T;"]);

    check(["type T1 = [...Array<any>];", "type T2 = [...any[]];"]);
    check([
      "const a = styled.h1<{",
      "  $upsideDown?: boolean;",
      "}>`",
      '  ${props => props.$upsideDown && "transform: rotate(180deg);"}',
      "  text-align: center;",
      "`;",
    ]);

    check([
      "type Color = [r: number, g: number, b: number, a?: number];",
      "type Red = Color.r;",
      "type Green = Color.g;",
      "type Blue = Color.b;",
      "type Alpha = Color.a;",
    ]);

    check([
      "type alias = boolean;",
      "const value = 0;",
      "export { type alias, value };",
    ]);
  });

  it("InterfaceBody: duplicate semicolon", function () {
    const code = [
      "interface Hello {",
      "  'hello': any;",
      "  'hello': string;",
      "}",
    ].join(eol);

    const ast = recast.parse(code, { parser });

    ast.program.body[0].body.body.pop();

    assert.strictEqual(
      recast.print(ast).code,
      ["interface Hello {", "  'hello': any;", "}"].join(eol),
    );
  });

  it("InterfaceBody: duplicate semicolon: a lot of properties", function () {
    const code = [
      "interface LabelledContainer<T> {",
      "  label: string;",
      "  content: T;",
      "  option?: boolean;",
      "  readonly x: number;",
      "  [index: number]: string;",
      "  [propName: string]: any;",
      "  readonly [index: number]: string;",
      "  (source: string, subString: string): boolean;",
      "  (start: number): string;",
      "  reset(): void;",
      "  a(c: (this: void, e: E) => void): void;",
      "}",
    ].join(eol);

    const ast = recast.parse(code, { parser });

    ast.program.body[0].body.body.shift();

    assert.strictEqual(
      recast.print(ast).code,
      [
        "interface LabelledContainer<T> {",
        "  content: T;",
        "  option?: boolean;",
        "  readonly x: number;",
        "  [index: number]: string;",
        "  [propName: string]: any;",
        "  readonly [index: number]: string;",
        "  (source: string, subString: string): boolean;",
        "  (start: number): string;",
        "  reset(): void;",
        "  a(c: (this: void, e: E) => void): void;",
        "}",
      ].join(eol),
    );
  });

  it("TSModuleBlock: removed child", function () {
    const code = [
      "namespace Numbers {",
      "  export const four = 4;",
      "  export const five = 5;",
      "}",
    ].join(eol);

    const ast = recast.parse(code, { parser });

    ast.program.body[0].body.body.shift();

    assert.strictEqual(
      recast.print(ast).code,
      ["namespace Numbers {", "  export const five = 5;", "}"].join(eol),
    );
  });

  it("TypeLiteral: unwanted comma", function () {
    const code = [
      "type A = {",
      "  x: boolean;",
      "  y: number;",
      "  z: string;",
      "}",
    ].join(eol);

    const ast = recast.parse(code, { parser });

    ast.program.body[0].typeAnnotation.members.pop();

    assert.strictEqual(
      recast.print(ast).code,
      ["type A = {", "  x: boolean;", "  y: number;", "}"].join(eol),
    );
  });

  it("TSInstantiationExpression: round trip", function () {
    const code = [
      "const makeHammerBox = makeBox<Hammer>;",
      "const ErrorMap = Map<string, Error>;",
    ].join(eol);

    const ast = recast.parse(code, { parser });

    assert.strictEqual(recast.prettyPrint(ast).code, code);
  });
});

testReprinting(
  "data/babel-parser/test/fixtures/typescript/**/input.js",
  "Reprinting @babel/parser TypeScript test fixtures",
);

testReprinting(
  "data/graphql-tools-src/**/*.ts",
  "Reprinting GraphQL-Tools TypeScript files",
);

function testReprinting(pattern: any, description: any) {
  // Babel no longer supports Node 4 or 5.
  if (nodeMajorVersion < 6) {
    return;
  }

  describe(description, function () {
    require("glob")
      .sync(pattern, {
        cwd: __dirname,
      })
      .filter(
        (file: string) =>
          !(
            // Skip the following files, because they have problems that are not due
            // to any problems in Recast. TODO Revisit this list periodically.
            (
              file.indexOf("/tsx/") >= 0 ||
              file.endsWith("stitching/errors.ts") ||
              file.endsWith("decorators/type-arguments-invalid/input.js") ||
              // Throws an error with a slightly different message than expected:
              file.endsWith("types/tuple-rest-invalid/input.js") || // @babel/parser can't handle naked arrow function expression statements:
              file.endsWith("/optional-parameter/input.js")
            )
          ),
      )
      .forEach((file: string) =>
        it(file, function () {
          const absPath = path.join(__dirname, file);
          const source = fs.readFileSync(absPath, "utf8");
          const ast = tryToParseFile(source, absPath);

          if (ast === null) {
            return;
          }

          this.timeout(20000);

          assert.strictEqual(recast.print(ast).code, source);
          const reprintedCode = recast.prettyPrint(ast).code;
          const reparsedAST = recast.parse(reprintedCode, { parser });
          types.astNodesAreEquivalent(ast, reparsedAST);
        }),
      );
  });
}

function tryToParseFile(source: any, absPath: any) {
  try {
    return recast.parse(source, { parser });
  } catch (e1: any) {
    let options;
    try {
      options = JSON.parse(
        fs
          .readFileSync(path.join(path.dirname(absPath), "options.json"))
          .toString(),
      );
    } catch (e2: any) {
      if (e2.code !== "ENOENT") {
        console.error(e2);
      }
      throw e1;
    }

    if (options.throws === e1.message) {
      return null;
    }

    throw e1;
  }
}
