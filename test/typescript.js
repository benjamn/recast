var assert = require("assert");
var recast = require("../main.js");
var parse = require("../lib/parser").parse;
var Printer = require("../lib/printer").Printer;
var types = require("../lib/types");
var eol = require("os").EOL;

var babylon = require("babylon");

describe("TypeScript", function() {
  var babylonOptions = {
    plugins: ['classProperties', 'typescript']
  }

  var parser = {
    parse(source) {
      return babylon.parse(source, babylonOptions);
    }
  }

  var parseOptions = { parser };

  it('basic printing', function() {
    function check(lines) {
      var code = lines.join(eol);
      var ast = recast.parse(code, parseOptions);
      var output = recast.prettyPrint(ast, { tabWidth: 2 }).code;
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
      'type C = {a: string, b?: number};'
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
      'type A<T, U> = {u: "cat", x: number, y: T, z: U};'
    ]);

    check([
      'type F = <T, U>(a: string, b: {y: T, z: U}) => void;'
    ]);

    check([
      'type Readonly<T> = {',
      '  readonly [P in keyof T]: T[P];',
      '};'
    ]);

    check([
      'let strLength: string = (<string>someValue).length;',
      'let strLength: string = <string>someValue;',
      'let square = <Square>{};',
      'let strLength: number = (someValue as string).length;',
      'let strLength: number = someValue as string;'
    ]);

    check([
      'let counter = <Counter>function(start: number) {};'
    ]);

    check([
      'if ((<F>p).s) {',
      '  (<F>p).s();',
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
      'function create<T>(c: {new<U>(a: U): T;}): void {}'
    ]);

    check([
      'const a = b as U as V;'
    ]);

    check([
      'enum Color {Red, Green, Blue}',
      'enum Color {Red = 1, Green = 2, Blue = 3}',
      'enum Color {Red = 1, Green}',
      'enum Color {Red = "RED", Green = "GREEN", Blue = "BLUE"}',
      'enum Color {Red = init(), Green = "GREEN"}',
      'enum E {A = 1, B, C}',
      'enum F {A = 1 << 1, B = C | D.G, E = "1".length}',
      'const enum G {A = 1}',
      'declare enum H {A = 1}'
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
      '  public furr: boolean;',
      '  protected sound: string;',
      '  private getName() {}',
      '  public talk() {}',
      '  protected getSound() {}',
      '  static createAnimal() {}',
      '}'
    ])
  });
});
