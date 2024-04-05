import invariant from "tiny-invariant";
import * as types from "ast-types";
const n = types.namedTypes;
const isArray = types.builtInTypes.array;
const isObject = types.builtInTypes.object;
import { Lines, concat } from "./lines";
import { comparePos, fixFaultyLocations } from "./util";

type Node = types.namedTypes.Node;
type Comment = types.namedTypes.Comment;

const childNodesCache = new WeakMap<Node, Node[]>();

// TODO Move a non-caching implementation of this function into ast-types,
// and implement a caching wrapper function here.
function getSortedChildNodes(node: Node, lines: Lines, resultArray?: Node[]) {
  if (!node) {
    return resultArray;
  }

  // The .loc checks below are sensitive to some of the problems that
  // are fixed by this utility function. Specifically, if it decides to
  // set node.loc to null, indicating that the node's .loc information
  // is unreliable, then we don't want to add node to the resultArray.
  fixFaultyLocations(node, lines);

  if (resultArray) {
    if (n.Node.check(node) && n.SourceLocation.check(node.loc)) {
      // This reverse insertion sort almost always takes constant
      // time because we almost always (maybe always?) append the
      // nodes in order anyway.
      let i = resultArray.length - 1;
      for (; i >= 0; --i) {
        const child = resultArray[i];
        if (
          child &&
          child.loc &&
          comparePos(child.loc.end, node.loc.start) <= 0
        ) {
          break;
        }
      }
      resultArray.splice(i + 1, 0, node);
      return resultArray;
    }
  } else {
    const childNodes = childNodesCache.get(node);
    if (childNodes) {
      return childNodes;
    }
  }

  let names: string[];
  if (isArray.check(node)) {
    names = Object.keys(node);
  } else if (isObject.check(node)) {
    names = types.getFieldNames(node);
  } else {
    return resultArray;
  }

  if (!resultArray) {
    childNodesCache.set(node, (resultArray = []));
  }

  for (let i = 0, nameCount = names.length; i < nameCount; ++i) {
    getSortedChildNodes((node as any)[names[i]], lines, resultArray);
  }

  return resultArray;
}

// As efficiently as possible, decorate the comment object with
// .precedingNode, .enclosingNode, and/or .followingNode properties, at
// least one of which is guaranteed to be defined.
function decorateComment(node: Node, comment: Comment, lines: Lines) {
  const childNodes = getSortedChildNodes(node, lines);

  // Time to dust off the old binary search robes and wizard hat.
  let left = 0;
  let right = childNodes && childNodes.length;
  let precedingNode: Node | undefined;
  let followingNode: Node | undefined;

  while (typeof right === "number" && left < right) {
    const middle = (left + right) >> 1;
    const child = childNodes![middle];

    if (
      comparePos(child.loc!.start, comment.loc!.start) <= 0 &&
      comparePos(comment.loc!.end, child.loc!.end) <= 0
    ) {
      // The comment is completely contained by this child node.
      decorateComment(((comment as any).enclosingNode = child), comment, lines);
      return; // Abandon the binary search at this level.
    }

    if (comparePos(child.loc!.end, comment.loc!.start) <= 0) {
      // This child node falls completely before the comment.
      // Because we will never consider this node or any nodes
      // before it again, this node must be the closest preceding
      // node we have encountered so far.
      precedingNode = child;
      left = middle + 1;
      continue;
    }

    if (comparePos(comment.loc!.end, child.loc!.start) <= 0) {
      // This child node falls completely after the comment.
      // Because we will never consider this node or any nodes after
      // it again, this node must be the closest following node we
      // have encountered so far.
      followingNode = child;
      right = middle;
      continue;
    }

    throw new Error("Comment location overlaps with node location");
  }

  if (precedingNode) {
    (comment as any).precedingNode = precedingNode;
  }

  if (followingNode) {
    (comment as any).followingNode = followingNode;
  }
}

export function attach(comments: any[], ast: any, lines: any) {
  if (!isArray.check(comments)) {
    return;
  }

  const tiesToBreak: any[] = [];

  comments.forEach(function (comment) {
    comment.loc.lines = lines;
    decorateComment(ast, comment, lines);

    const pn = comment.precedingNode;
    const en = comment.enclosingNode;
    const fn = comment.followingNode;

    if (pn && fn) {
      const tieCount = tiesToBreak.length;
      if (tieCount > 0) {
        const lastTie = tiesToBreak[tieCount - 1];

        invariant(
          (lastTie.precedingNode === comment.precedingNode) ===
            (lastTie.followingNode === comment.followingNode),
        );

        if (lastTie.followingNode !== comment.followingNode) {
          breakTies(tiesToBreak, lines);
        }
      }

      tiesToBreak.push(comment);
    } else if (pn) {
      // No contest: we have a trailing comment.
      breakTies(tiesToBreak, lines);
      addTrailingComment(pn, comment);
    } else if (fn) {
      // No contest: we have a leading comment.
      breakTies(tiesToBreak, lines);
      addLeadingComment(fn, comment);
    } else if (en) {
      // The enclosing node has no child nodes at all, so what we
      // have here is a dangling comment, e.g. [/* crickets */].
      breakTies(tiesToBreak, lines);
      addDanglingComment(en, comment);
    } else {
      throw new Error("AST contains no nodes at all?");
    }
  });

  breakTies(tiesToBreak, lines);

  comments.forEach(function (comment) {
    // These node references were useful for breaking ties, but we
    // don't need them anymore, and they create cycles in the AST that
    // may lead to infinite recursion if we don't delete them here.
    delete comment.precedingNode;
    delete comment.enclosingNode;
    delete comment.followingNode;
  });
}

function breakTies(tiesToBreak: any[], lines: any) {
  const tieCount = tiesToBreak.length;
  if (tieCount === 0) {
    return;
  }

  const pn = tiesToBreak[0].precedingNode;
  const fn = tiesToBreak[0].followingNode;
  let gapEndPos = fn.loc.start;

  // Iterate backwards through tiesToBreak, examining the gaps
  // between the tied comments. In order to qualify as leading, a
  // comment must be separated from fn by an unbroken series of
  // whitespace-only gaps (or other comments).
  let indexOfFirstLeadingComment = tieCount;
  let comment;
  for (; indexOfFirstLeadingComment > 0; --indexOfFirstLeadingComment) {
    comment = tiesToBreak[indexOfFirstLeadingComment - 1];
    invariant(comment.precedingNode === pn);
    invariant(comment.followingNode === fn);

    const gap = lines.sliceString(comment.loc.end, gapEndPos);
    if (/\S/.test(gap)) {
      // The gap string contained something other than whitespace.
      break;
    }

    gapEndPos = comment.loc.start;
  }

  while (
    indexOfFirstLeadingComment <= tieCount &&
    (comment = tiesToBreak[indexOfFirstLeadingComment]) &&
    // If the comment is a //-style comment and indented more
    // deeply than the node itself, reconsider it as trailing.
    (comment.type === "Line" || comment.type === "CommentLine") &&
    comment.loc.start.column > fn.loc.start.column
  ) {
    ++indexOfFirstLeadingComment;
  }

  if (indexOfFirstLeadingComment) {
    const { enclosingNode } = tiesToBreak[indexOfFirstLeadingComment - 1];

    if (enclosingNode?.type === "CallExpression") {
      --indexOfFirstLeadingComment;
    }
  }

  tiesToBreak.forEach(function (comment, i) {
    if (i < indexOfFirstLeadingComment) {
      addTrailingComment(pn, comment);
    } else {
      addLeadingComment(fn, comment);
    }
  });

  tiesToBreak.length = 0;
}

function addCommentHelper(node: any, comment: any) {
  const comments = node.comments || (node.comments = []);
  comments.push(comment);
}

function addLeadingComment(node: any, comment: any) {
  comment.leading = true;
  comment.trailing = false;
  addCommentHelper(node, comment);
}

function addDanglingComment(node: any, comment: any) {
  comment.leading = false;
  comment.trailing = false;
  addCommentHelper(node, comment);
}

function addTrailingComment(node: any, comment: any) {
  comment.leading = false;
  comment.trailing = true;
  addCommentHelper(node, comment);
}

function printLeadingComment(commentPath: any, print: any) {
  const comment = commentPath.getValue();
  n.Comment.assert(comment);

  const loc = comment.loc;
  const lines = loc && loc.lines;
  const parts = [print(commentPath)];

  if (comment.trailing) {
    // When we print trailing comments as leading comments, we don't
    // want to bring any trailing spaces along.
    parts.push("\n");
  } else if (lines instanceof Lines) {
    const trailingSpace = lines.slice(
      loc.end,
      lines.skipSpaces(loc.end) || lines.lastPos(),
    );

    if (trailingSpace.length === 1) {
      // If the trailing space contains no newlines, then we want to
      // preserve it exactly as we found it.
      parts.push(trailingSpace);
    } else {
      // If the trailing space contains newlines, then replace it
      // with just that many newlines, with all other spaces removed.
      parts.push(new Array(trailingSpace.length).join("\n"));
    }
  } else {
    parts.push("\n");
  }

  return concat(parts);
}

function printTrailingComment(commentPath: any, print: any) {
  const comment = commentPath.getValue(commentPath);
  n.Comment.assert(comment);

  const loc = comment.loc;
  const lines = loc && loc.lines;
  const parts = [];

  if (lines instanceof Lines) {
    const fromPos = lines.skipSpaces(loc.start, true) || lines.firstPos();
    const leadingSpace = lines.slice(fromPos, loc.start);

    if (leadingSpace.length === 1) {
      // If the leading space contains no newlines, then we want to
      // preserve it exactly as we found it.
      parts.push(leadingSpace);
    } else {
      // If the leading space contains newlines, then replace it
      // with just that many newlines, sans all other spaces.
      parts.push(new Array(leadingSpace.length).join("\n"));
    }
  }

  parts.push(print(commentPath));

  return concat(parts);
}

export function printComments(path: any, print: any) {
  const value = path.getValue();
  const innerLines = print(path);
  const comments =
    n.Node.check(value) && types.getFieldValue(value, "comments");

  if (!comments || comments.length === 0) {
    return innerLines;
  }

  const leadingParts: any[] = [];
  const trailingParts = [innerLines];

  path.each(function (commentPath: any) {
    const comment = commentPath.getValue();
    const leading = types.getFieldValue(comment, "leading");
    const trailing = types.getFieldValue(comment, "trailing");

    if (
      leading ||
      (trailing &&
        !(
          n.Statement.check(value) ||
          comment.type === "Block" ||
          comment.type === "CommentBlock"
        ))
    ) {
      leadingParts.push(printLeadingComment(commentPath, print));
    } else if (trailing) {
      trailingParts.push(printTrailingComment(commentPath, print));
    }
  }, "comments");

  leadingParts.push.apply(leadingParts, trailingParts);
  return concat(leadingParts);
}
