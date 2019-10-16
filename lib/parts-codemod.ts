import * as t from "@babel/types";
import { PluginItem } from "@babel/core";
import { NodePath } from "@babel/traverse";

export default function(): PluginItem {
  return {
    visitor: {
      SwitchCase(path: NodePath<t.SwitchCase>): void {
        if (
          path.node.consequent.length > 0 &&
          !t.isBlockStatement(path.node.consequent[0])
        ) {
          path.node.consequent = [t.blockStatement(path.node.consequent)];
        }
      }
    }
  };
}
