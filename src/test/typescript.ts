import assert from "assert";
import path from "path";
import fs from "fs";
import recast from "../main";
import types from "../lib/types";
import {EOL as eol} from "os";
import * as parser from "../parsers/typescript";

// Babel 7 no longer supports Node 4 or 5.
var nodeMajorVersion = parseInt(process.versions.node, 10);
(nodeMajorVersion >= 6 ? describe : xdescribe)
("TypeScript", function() {
  it('basic printing', function() {
    function check(lines: any) {
      const code = lines.join(eol);
      const ast = recast.parse(code, { parser });
      const output = recast.prettyPrint(ast, { tabWidth: 2 }).code;
      assert.strictEqual(code, output);
    }

    check([
      'let color: string = "blue";',
      'let isDone: boolean = false;',
      'let decimal: number = 6;',
      'let hex: number = 0xf00d;',
      'let binary: number = 0b1010;',
      'let octal: number = 0o744;',
      'let list: number[] = [1, 2, 3];',
      'let matrix: number[][];',
      'let x: [string, number];',
      'let f: <E>(e: E) => void;',
      'let sn: string | null = "isNull";'
    ]);

    check([
      'type A = number;',
      'type B = string;',
      'type C = never;',
      'type D = any;',
      'type E = [string, number];',
      'type F = void;',
      'type G = undefined;',
      'type H = bigint;',
      '',
      'type C = {',
      '  a: string,',
      '  b?: number',
      '};'
    ]);

    check([
      'type c = T & U & V;'
    ]);

    check([
      'let list: Array<number> = [1, 2, 3];'
    ]);

    check([
      'let n = a!.c();'
    ]);

    check([
      'type A = "cat" | "dog" | "bird";'
    ]);

    check([
      'type A<T, U> = {',
      '  u: "cat",',
      '  x: number,',
      '  y: T,',
      '  z: U',
      '};'
    ]);

    check([
      'type F = <T, U>(',
      '  a: string,',
      '  b: {',
      '    y: T,',
      '    z: U',
      '  }',
      ') => void;'
    ]);

    check([
      'type Readonly<T> = {',
      '  readonly [P in keyof T]: T[P];',
      '};',
      '',
      'type Pick<T, K extends keyof T> = {',
      '  [P in K]: T[P];',
      '};'
    ]);

    check([
      'let strLength1: string = (<string> someValue).length;',
      'let strLength2: string = <string> someValue;',
      'let square = <Square> {};',
      'let strLength3: number = (someValue as string).length;',
      'let strLength4: number = someValue as string;'
    ]);

    check([
      'let counter = <Counter> function(start: number) {};'
    ]);

    check([
      'if ((<F> p).s) {',
      '  (<F> p).s();',
      '}'
    ]);

    check([
      'function i(p): p is F {}',
      'function i(p): p is string | number {}'
    ]);

    check([
      'function f<T, U>(a: T, b: U): void {',
      '  let c: number;',
      '}'
    ]);

    check([
      'function pluck<T, K extends keyof T>(o: T, names: K[]): T[K][] {',
      '  console.log(o);',
      '}'
    ]);

    check([
      'let myAdd: <T, U>(x: T, y?: number) => U = function(x: number, y?: number): number {};',
      'function bb(f: string, ...r: string[]): void {}',
      'function f(this: void) {}',
      'function l<T extends L>(arg: T): T {}',
      'function l<T extends A.B.C>(arg: T): T {}',
      'function l<T extends keyof U>(obj: T) {}',
      '',
      'function create<T>(',
      '  c: {',
      '    new<U>(a: U): T',
      '  }',
      '): void {}'
    ]);

    check([
      'const a = b as U as V;'
    ]);

    check([
      'enum Color {',
      '  Red,',
      '  Green,',
      '  Blue',
      '}',
      '',
      'enum Color {',
      '  Red = 1,',
      '  Green = 2,',
      '  Blue = 3',
      '}',
      '',
      'enum Color {',
      '  Red = 1,',
      '  Green',
      '}',
      '',
      'enum Color {',
      '  Red = "RED",',
      '  Green = "GREEN",',
      '  Blue = "BLUE"',
      '}',
      '',
      'enum Color {',
      '  Red = init(),',
      '  Green = "GREEN"',
      '}',
      '',
      'enum E {',
      '  A = 1,',
      '  B,',
      '  C',
      '}',
      '',
      'enum F {',
      '  A = 1 << 1,',
      '  B = C | D.G,',
      '  E = "1".length',
      '}',
      '',
      'const enum G {',
      '  A = 1',
      '}',
      '',
      'declare enum H {',
      '  A = 1',
      '}'
    ]);

    check([
      'class C<T> extends B {',
      '  f(a: T) {',
      '    c(a as D);',
      '  }',
      '}'
    ]);

    check([
      'interface LabelledContainer<T> {',
      '  label: string;',
      '  content: T;',
      '  option?: boolean;',
      '  readonly x: number;',
      '  [index: number]: string;',
      '  [propName: string]: any;',
      '  readonly [index: number]: string;',
      '  (source: string, subString: string): boolean;',
      '  (start: number): string;',
      '  reset(): void;',
      '  a(c: (this: void, e: E) => void): void;',
      '}'
    ]);

    check([
      'interface Square<T, U> extends Shape<T, U>, Visible<T, U> {',
      '  sideLength: number;',
      '}'
    ]);

    check([
      'class Button extends Control<T, U> implements SelectableControl<T, U>, ClickableControl<U> {',
      '  select() {}',
      '}'
    ]);

    check([
      'class Animal {',
      '  static className: string = "Animal";',
      '',
      '  constructor(theName: string) {',
      '    this.name = theName;',
      '  }',
      '',
      '  private name: string;',
      '  public fur: boolean;',
      '  protected sound: string;',
      '  private getName() {}',
      '  public talk() {}',
      '  protected getSound() {}',
      '  static createAnimal() {}',
      '}'
    ]);

    check([
      'export interface S {',
      '  i(s: string): boolean;',
      '}',
    ]);

    check([
      'namespace Validation {',
      '  export interface S {',
      '    i(j: string): boolean;',
      '  }',
      '}'
    ]);

    check([
      'export interface S {',
      '  i(j: string): boolean;',
      '}'
    ]);

    check([
      'declare namespace D3 {',
      '  export const f: number = 2;',
      '}'
    ]);

    check([
      'declare function foo<K, V>(arg: T = getDefault()): R'
    ]);

    check([
      'class Animal {',
      '  public static async *[name]<T>(arg: U): V;',
      '}'
    ]);

    check([
      'function myFunction(',
      '  {',
      '    param1',
      '  }: Params',
      ') {}'
    ]);

    check([
      'const unqualified: import("package") = 1;',
      'const qualified: import("package").ns = 2;',
      'const veryQualified: import("package").ns.foo.bar = 3;',
      'const qualifiedWithParams: import("package").ns.foo<T, U> = 4;',
      'const justParameterized: import("package")<T> = 5;',
    ]);
  });
});

testReprinting(
  "data/babel-parser/test/fixtures/typescript/**/input.js",
  "Reprinting @babel/parser TypeScript test fixtures"
);

testReprinting(
  "data/graphql-tools-src/**/*.ts",
  "Reprinting GraphQL-Tools TypeScript files"
);

function testReprinting(pattern: any, description: any) {
  // Babel no longer supports Node 4 or 5.
  if (nodeMajorVersion < 6) {
    return;
  }

  describe(description, function () {
    require("glob").sync(pattern, {
      cwd: __dirname
    }).filter((file: string) => !(
      // Skip the following files, because they have problems that are not due
      // to any problems in Recast. TODO Revisit this list periodically.
      file.indexOf("/tsx/") >= 0 ||
      file.endsWith("stitching/errors.ts") ||
      file.endsWith("decorators/type-arguments-invalid/input.js") ||
      // Throws an error with a slightly different message than expected:
      file.endsWith("types/tuple-rest-invalid/input.js") ||
      // @babel/parser can't handle naked arrow function expression statements:
      file.endsWith("/optional-parameter/input.js")
    )).forEach((file: string) => it(file, function () {
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
    }));
  });
}

function tryToParseFile(source: any, absPath: any) {
  try {
    return recast.parse(source, { parser });
  } catch (e1) {
    try {
      var options = JSON.parse(fs.readFileSync(
        path.join(path.dirname(absPath), "options.json")).toString());
    } catch (e2) {
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
