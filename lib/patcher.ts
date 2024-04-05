import invariant from "tiny-invariant";
import * as linesModule from "./lines";
import * as types from "ast-types";
const Printable = types.namedTypes.Printable;
const Expression = types.namedTypes.Expression;
const ReturnStatement = types.namedTypes.ReturnStatement;
const SourceLocation = types.namedTypes.SourceLocation;
import { comparePos, copyPos, getUnionOfKeys } from "./util";
import FastPath from "./fast-path";
const isObject = types.builtInTypes.object;
const isArray = types.builtInTypes.array;
const isString = types.builtInTypes.string;
const riskyAdjoiningCharExp = /[0-9a-z_$]/i;

interface PatcherType {
  replace(loc: any, lines: any): any;
  get(loc?: any): any;
  tryToReprintComments(newNode: any, oldNode: any, print: any): any;
  deleteComments(node: any): any;
}

interface PatcherConstructor {
  new (lines: any): PatcherType;
}

const Patcher = function Patcher(this: PatcherType, lines: any) {
  invariant(this instanceof Patcher);
  invariant(lines instanceof linesModule.Lines);

  const self = this,
    replacements: any[] = [];

  self.replace = function (loc, lines) {
    if (isString.check(lines)) lines = linesModule.fromString(lines);

    replacements.push({
      lines: lines,
      start: loc.start,
      end: loc.end,
    });
  };

  self.get = function (loc) {
    // If no location is provided, return the complete Lines object.
    loc = loc || {
      start: { line: 1, column: 0 },
      end: { line: lines.length, column: lines.getLineLength(lines.length) },
    };

    let sliceFrom = loc.start,
      toConcat: any[] = [];

    function pushSlice(from: any, to: any) {
      invariant(comparePos(from, to) <= 0);
      toConcat.push(lines.slice(from, to));
    }

    replacements
      .sort((a, b) => comparePos(a.start, b.start))
      .forEach(function (rep) {
        if (comparePos(sliceFrom, rep.start) > 0) {
          // Ignore nested replacement ranges.
        } else {
          pushSlice(sliceFrom, rep.start);
          toConcat.push(rep.lines);
          sliceFrom = rep.end;
        }
      });

    pushSlice(sliceFrom, loc.end);

    return linesModule.concat(toConcat);
  };
} as any as PatcherConstructor;
export { Patcher };

const Pp: PatcherType = Patcher.prototype;

Pp.tryToReprintComments = function (newNode, oldNode, print) {
  const patcher = this;

  if (!newNode.comments && !oldNode.comments) {
    // We were (vacuously) able to reprint all the comments!
    return true;
  }

  const newPath = FastPath.from(newNode);
  const oldPath = FastPath.from(oldNode);

  newPath.stack.push("comments", getSurroundingComments(newNode));
  oldPath.stack.push("comments", getSurroundingComments(oldNode));

  const reprints: any[] = [];
  const ableToReprintComments = findArrayReprints(newPath, oldPath, reprints);

  // No need to pop anything from newPath.stack or oldPath.stack, since
  // newPath and oldPath are fresh local variables.

  if (ableToReprintComments && reprints.length > 0) {
    reprints.forEach(function (reprint) {
      const oldComment = reprint.oldPath.getValue();
      invariant(oldComment.leading || oldComment.trailing);
      patcher.replace(
        oldComment.loc,
        // Comments can't have .comments, so it doesn't matter whether we
        // print with comments or without.
        print(reprint.newPath).indentTail(oldComment.loc.indent),
      );
    });
  }

  return ableToReprintComments;
};

// Get all comments that are either leading or trailing, ignoring any
// comments that occur inside node.loc. Returns an empty array for nodes
// with no leading or trailing comments.
function getSurroundingComments(node: any) {
  const result: any[] = [];
  if (node.comments && node.comments.length > 0) {
    node.comments.forEach(function (comment: any) {
      if (comment.leading || comment.trailing) {
        result.push(comment);
      }
    });
  }
  return result;
}

Pp.deleteComments = function (node) {
  if (!node.comments) {
    return;
  }

  const patcher = this;

  node.comments.forEach(function (comment: any) {
    if (comment.leading) {
      // Delete leading comments along with any trailing whitespace they
      // might have.
      patcher.replace(
        {
          start: comment.loc.start,
          end: node.loc.lines.skipSpaces(comment.loc.end, false, false),
        },
        "",
      );
    } else if (comment.trailing) {
      // Delete trailing comments along with any leading whitespace they
      // might have.
      patcher.replace(
        {
          start: node.loc.lines.skipSpaces(comment.loc.start, true, false),
          end: comment.loc.end,
        },
        "",
      );
    }
  });
};

export function getReprinter(path: any) {
  invariant(path instanceof FastPath);

  // Make sure that this path refers specifically to a Node, rather than
  // some non-Node subproperty of a Node.
  const node = path.getValue();
  if (!Printable.check(node)) return;

  const orig = (node as any).original;
  const origLoc = orig && orig.loc;
  const lines = origLoc && origLoc.lines;
  const reprints: any[] = [];

  if (!lines || !findReprints(path, reprints)) return;

  return function (print: any) {
    const patcher = new Patcher(lines);

    reprints.forEach(function (reprint) {
      const newNode = reprint.newPath.getValue();
      const oldNode = reprint.oldPath.getValue();

      SourceLocation.assert(oldNode.loc, true);

      const needToPrintNewPathWithComments = !patcher.tryToReprintComments(
        newNode,
        oldNode,
        print,
      );

      if (needToPrintNewPathWithComments) {
        // Since we were not able to preserve all leading/trailing
        // comments, we delete oldNode's comments, print newPath with
        // comments, and then patch the resulting lines where oldNode used
        // to be.
        patcher.deleteComments(oldNode);
      }

      let newLines = print(reprint.newPath, {
        includeComments: needToPrintNewPathWithComments,
        // If the oldNode we're replacing already had parentheses, we may
        // not need to print the new node with any extra parentheses,
        // because the existing parentheses will suffice. However, if the
        // newNode has a different type than the oldNode, let the printer
        // decide if reprint.newPath needs parentheses, as usual.
        avoidRootParens:
          oldNode.type === newNode.type && reprint.oldPath.hasParens(),
      }).indentTail(oldNode.loc.indent);

      const nls = needsLeadingSpace(lines, oldNode.loc, newLines);
      const nts = needsTrailingSpace(lines, oldNode.loc, newLines);

      // If we try to replace the argument of a ReturnStatement like
      // return"asdf" with e.g. a literal null expression, we run the risk
      // of ending up with returnnull, so we need to add an extra leading
      // space in situations where that might happen. Likewise for
      // "asdf"in obj. See #170.
      if (nls || nts) {
        const newParts = [];
        nls && newParts.push(" ");
        newParts.push(newLines);
        nts && newParts.push(" ");
        newLines = linesModule.concat(newParts);
      }

      patcher.replace(oldNode.loc, newLines);
    });

    // Recall that origLoc is the .loc of an ancestor node that is
    // guaranteed to contain all the reprinted nodes and comments.
    const patchedLines = patcher.get(origLoc).indentTail(-orig.loc.indent);

    if (path.needsParens()) {
      return linesModule.concat(["(", patchedLines, ")"]);
    }

    return patchedLines;
  };
}

// If the last character before oldLoc and the first character of newLines
// are both identifier characters, they must be separated by a space,
// otherwise they will most likely get fused together into a single token.
function needsLeadingSpace(oldLines: any, oldLoc: any, newLines: any) {
  const posBeforeOldLoc = copyPos(oldLoc.start);

  // The character just before the location occupied by oldNode.
  const charBeforeOldLoc =
    oldLines.prevPos(posBeforeOldLoc) && oldLines.charAt(posBeforeOldLoc);

  // First character of the reprinted node.
  const newFirstChar = newLines.charAt(newLines.firstPos());

  return (
    charBeforeOldLoc &&
    riskyAdjoiningCharExp.test(charBeforeOldLoc) &&
    newFirstChar &&
    riskyAdjoiningCharExp.test(newFirstChar)
  );
}

// If the last character of newLines and the first character after oldLoc
// are both identifier characters, they must be separated by a space,
// otherwise they will most likely get fused together into a single token.
function needsTrailingSpace(oldLines: any, oldLoc: any, newLines: any) {
  // The character just after the location occupied by oldNode.
  const charAfterOldLoc = oldLines.charAt(oldLoc.end);

  const newLastPos = newLines.lastPos();

  // Last character of the reprinted node.
  const newLastChar =
    newLines.prevPos(newLastPos) && newLines.charAt(newLastPos);

  return (
    newLastChar &&
    riskyAdjoiningCharExp.test(newLastChar) &&
    charAfterOldLoc &&
    riskyAdjoiningCharExp.test(charAfterOldLoc)
  );
}

function findReprints(newPath: any, reprints: any) {
  const newNode = newPath.getValue();
  Printable.assert(newNode);

  const oldNode = newNode.original;
  Printable.assert(oldNode);

  invariant(reprints.length === 0);

  if (newNode.type !== oldNode.type) {
    return false;
  }

  const oldPath = new FastPath(oldNode);
  const canReprint = findChildReprints(newPath, oldPath, reprints);

  if (!canReprint) {
    // Make absolutely sure the calling code does not attempt to reprint
    // any nodes.
    reprints.length = 0;
  }

  return canReprint;
}

function findAnyReprints(newPath: any, oldPath: any, reprints: any) {
  const newNode = newPath.getValue();
  const oldNode = oldPath.getValue();

  if (newNode === oldNode) return true;

  if (isArray.check(newNode))
    return findArrayReprints(newPath, oldPath, reprints);

  if (isObject.check(newNode))
    return findObjectReprints(newPath, oldPath, reprints);

  return false;
}

function findArrayReprints(newPath: any, oldPath: any, reprints: any) {
  const newNode = newPath.getValue();
  const oldNode = oldPath.getValue();

  if (
    newNode === oldNode ||
    newPath.valueIsDuplicate() ||
    oldPath.valueIsDuplicate()
  ) {
    return true;
  }

  isArray.assert(newNode);
  const len = newNode.length;

  if (!(isArray.check(oldNode) && oldNode.length === len)) return false;

  for (let i = 0; i < len; ++i) {
    newPath.stack.push(i, newNode[i]);
    oldPath.stack.push(i, oldNode[i]);
    const canReprint = findAnyReprints(newPath, oldPath, reprints);
    newPath.stack.length -= 2;
    oldPath.stack.length -= 2;
    if (!canReprint) {
      return false;
    }
  }

  return true;
}

function findObjectReprints(newPath: any, oldPath: any, reprints: any) {
  const newNode = newPath.getValue();
  isObject.assert(newNode);

  if (newNode.original === null) {
    // If newNode.original node was set to null, reprint the node.
    return false;
  }

  const oldNode = oldPath.getValue();
  if (!isObject.check(oldNode)) return false;

  if (
    newNode === oldNode ||
    newPath.valueIsDuplicate() ||
    oldPath.valueIsDuplicate()
  ) {
    return true;
  }

  if (Printable.check(newNode)) {
    if (!Printable.check(oldNode)) {
      return false;
    }

    const newParentNode = newPath.getParentNode();
    const oldParentNode = oldPath.getParentNode();
    if (
      oldParentNode !== null &&
      oldParentNode.type === "FunctionTypeAnnotation" &&
      newParentNode !== null &&
      newParentNode.type === "FunctionTypeAnnotation"
    ) {
      const oldNeedsParens =
        oldParentNode.params.length !== 1 || !!oldParentNode.params[0].name;
      const newNeedParens =
        newParentNode.params.length !== 1 || !!newParentNode.params[0].name;
      if (!oldNeedsParens && newNeedParens) {
        return false;
      }
    }

    // Here we need to decide whether the reprinted code for newNode is
    // appropriate for patching into the location of oldNode.

    if ((newNode as any).type === (oldNode as any).type) {
      const childReprints: any[] = [];

      if (findChildReprints(newPath, oldPath, childReprints)) {
        reprints.push.apply(reprints, childReprints);
      } else if (oldNode.loc) {
        // If we have no .loc information for oldNode, then we won't be
        // able to reprint it.
        reprints.push({
          oldPath: oldPath.copy(),
          newPath: newPath.copy(),
        });
      } else {
        return false;
      }

      return true;
    }

    if (
      Expression.check(newNode) &&
      Expression.check(oldNode) &&
      // If we have no .loc information for oldNode, then we won't be
      // able to reprint it.
      oldNode.loc
    ) {
      // If both nodes are subtypes of Expression, then we should be able
      // to fill the location occupied by the old node with code printed
      // for the new node with no ill consequences.
      reprints.push({
        oldPath: oldPath.copy(),
        newPath: newPath.copy(),
      });

      return true;
    }

    // The nodes have different types, and at least one of the types is
    // not a subtype of the Expression type, so we cannot safely assume
    // the nodes are syntactically interchangeable.
    return false;
  }

  return findChildReprints(newPath, oldPath, reprints);
}

function findChildReprints(newPath: any, oldPath: any, reprints: any) {
  const newNode = newPath.getValue();
  const oldNode = oldPath.getValue();

  isObject.assert(newNode);
  isObject.assert(oldNode);

  if (newNode.original === null) {
    // If newNode.original node was set to null, reprint the node.
    return false;
  }

  // If this node needs parentheses and will not be wrapped with
  // parentheses when reprinted, then return false to skip reprinting and
  // let it be printed generically.
  if (newPath.needsParens() && !oldPath.hasParens()) {
    return false;
  }

  const keys = getUnionOfKeys(oldNode, newNode);

  if (oldNode.type === "File" || newNode.type === "File") {
    // Don't bother traversing file.tokens, an often very large array
    // returned by Babylon, and useless for our purposes.
    delete keys.tokens;
  }

  // Don't bother traversing .loc objects looking for reprintable nodes.
  delete keys.loc;

  const originalReprintCount = reprints.length;

  for (let k in keys) {
    if (k.charAt(0) === "_") {
      // Ignore "private" AST properties added by e.g. Babel plugins and
      // parsers like Babylon.
      continue;
    }

    newPath.stack.push(k, types.getFieldValue(newNode, k));
    oldPath.stack.push(k, types.getFieldValue(oldNode, k));
    const canReprint = findAnyReprints(newPath, oldPath, reprints);
    newPath.stack.length -= 2;
    oldPath.stack.length -= 2;

    if (!canReprint) {
      return false;
    }
  }

  // Return statements might end up running into ASI issues due to
  // comments inserted deep within the tree, so reprint them if anything
  // changed within them.
  if (
    ReturnStatement.check(newPath.getNode()) &&
    reprints.length > originalReprintCount
  ) {
    return false;
  }

  return true;
}
