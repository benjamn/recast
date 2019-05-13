import fs from "fs";
import * as types from "ast-types";
import { parse } from "./lib/parser";
import { Printer } from "./lib/printer";
import { Options } from "./lib/options";

export {
  /**
   * Parse a string of code into an augmented syntax tree suitable for
   * arbitrary modification and reprinting.
   */
  parse,

  /**
   * Convenient shorthand for the ast-types package.
   */
  types,
};

/**
 * Traverse and potentially modify an abstract syntax tree using a
 * convenient visitor syntax:
 *
 *   recast.visit(ast, {
 *     names: [],
 *     visitIdentifier: function(path) {
 *       var node = path.value;
 *       this.visitor.names.push(node.name);
 *       this.traverse(path);
 *     }
 *   });
 */
export { visit } from "ast-types";

/**
 * Options shared between parsing and printing.
 */
export { Options } from "./lib/options";

/**
 * Reprint a modified syntax tree using as much of the original source
 * code as possible.
 */
export function print(node: types.ASTNode, options?: Options) {
  return new Printer(options).print(node);
}

/**
 * Print without attempting to reuse any original source code.
 */
export function prettyPrint(node: types.ASTNode, options?: Options) {
  return new Printer(options).printGenerically(node);
}

/**
 * Convenient command-line interface (see e.g. example/add-braces).
 */
export function run(transformer: Transformer, options?: RunOptions) {
  return runFile(process.argv[2], transformer, options);
}

export interface Transformer {
  (ast: types.ASTNode, callback: (ast: types.ASTNode) => void): void;
}

export interface RunOptions extends Options {
  writeback?(code: string): void;
}

function runFile(path: any, transformer: Transformer, options?: RunOptions) {
  fs.readFile(path, "utf-8", function(err, code) {
    if (err) {
      console.error(err);
      return;
    }

    runString(code, transformer, options);
  });
}

function defaultWriteback(output: string) {
  process.stdout.write(output);
}

function runString(code: string, transformer: Transformer, options?: RunOptions) {
  const writeback = options && options.writeback || defaultWriteback;
  transformer(parse(code, options), function(node: any) {
    writeback(print(node, options).code);
  });
}
