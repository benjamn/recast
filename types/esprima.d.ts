import * as ESTree from "estree";

/**
 * "esprima" module augmentations.
 */
declare module "esprima" {
  export function parse(input: string, config?: ParseOptions, delegate?: (node: ESTree.Node, meta: any) => void): Program;
}
