// This module was originally created so that Recast could add its own
// custom types to the AST type system (in particular, the File type), but
// those types are now incorporated into ast-types, so this module doesn't
// have much to do anymore. Still, it might prove useful in the future.
import astTypes from "ast-types";
export default astTypes;
export * from "ast-types";

// TODO Get these types from ast-types.

export type Position = {
  line: number;
  column: number;
};

export type SourceLocation = {
  source?: string | null;
  start: Position;
  end: Position;
};
