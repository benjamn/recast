import assert from "assert";
import types from "./types";
var n = types.namedTypes;
import sourceMap from "source-map";
var SourceMapConsumer = sourceMap.SourceMapConsumer;
var SourceMapGenerator = sourceMap.SourceMapGenerator;
var hasOwn = Object.prototype.hasOwnProperty;

export function getOption(options: any, key: any, defaultValue: any) {
  if (options && hasOwn.call(options, key)) {
    return options[key];
  }
  return defaultValue;
}

export function getUnionOfKeys(...args: any[]) {
  var result: any = {};
  var argc = args.length;
  for (var i = 0; i < argc; ++i) {
    var keys = Object.keys(args[i]);
    var keyCount = keys.length;
    for (var j = 0; j < keyCount; ++j) {
      result[keys[j]] = true;
    }
  }
  return result;
}

export function comparePos(pos1: any, pos2: any) {
  return (pos1.line - pos2.line) || (pos1.column - pos2.column);
}

export function copyPos(pos: any) {
  return {
    line: pos.line,
    column: pos.column
  };
}

export function composeSourceMaps(formerMap: any, latterMap: any) {
  if (formerMap) {
    if (!latterMap) {
      return formerMap;
    }
  } else {
    return latterMap || null;
  }

  var smcFormer = new SourceMapConsumer(formerMap);
  var smcLatter = new SourceMapConsumer(latterMap);
  var smg = new SourceMapGenerator({
    file: latterMap.file,
    sourceRoot: latterMap.sourceRoot
  });

  var sourcesToContents: any = {};

  smcLatter.eachMapping(function(mapping) {
    var origPos = smcFormer.originalPositionFor({
      line: mapping.originalLine,
      column: mapping.originalColumn
    });

    var sourceName = origPos.source;
    if (sourceName === null) {
      return;
    }

    smg.addMapping({
      source: sourceName,
      original: copyPos(origPos),
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn
      },
      name: mapping.name
    });

    var sourceContent = smcFormer.sourceContentFor(sourceName);
    if (sourceContent && !hasOwn.call(sourcesToContents, sourceName)) {
      sourcesToContents[sourceName] = sourceContent;
      smg.setSourceContent(sourceName, sourceContent);
    }
  });

  return (smg as any).toJSON();
};

export function getTrueLoc(node: any, lines: any) {
  // It's possible that node is newly-created (not parsed by Esprima),
  // in which case it probably won't have a .loc property (or an
  // .original property for that matter). That's fine; we'll just
  // pretty-print it as usual.
  if (!node.loc) {
    return null;
  }

  var result = {
    start: node.loc.start,
    end: node.loc.end
  };

  function include(node: any) {
    expandLoc(result, node.loc);
  }

  // If the node is an export declaration and its .declaration has any
  // decorators, their locations might contribute to the true start/end
  // positions of the export declaration node.
  if (node.declaration &&
      node.declaration.decorators &&
      isExportDeclaration(node)) {
    node.declaration.decorators.forEach(include);
  }

  if (comparePos(result.start, result.end) < 0) {
    // Trim leading whitespace.
    result.start = copyPos(result.start);
    lines.skipSpaces(result.start, false, true);

    if (comparePos(result.start, result.end) < 0) {
      // Trim trailing whitespace, if the end location is not already the
      // same as the start location.
      result.end = copyPos(result.end);
      lines.skipSpaces(result.end, true, true);
    }
  }

  // If the node has any comments, their locations might contribute to
  // the true start/end positions of the node.
  if (node.comments) {
    node.comments.forEach(include);
  }

  return result;
};

function expandLoc(parentLoc: any, childLoc: any) {
  if (parentLoc && childLoc) {
    if (comparePos(childLoc.start, parentLoc.start) < 0) {
      parentLoc.start = childLoc.start;
    }

    if (comparePos(parentLoc.end, childLoc.end) < 0) {
      parentLoc.end = childLoc.end;
    }
  }
}

export function fixFaultyLocations(node: any, lines: any) {
  var loc = node.loc;
  if (loc) {
    if (loc.start.line < 1) {
      loc.start.line = 1;
    }

    if (loc.end.line < 1) {
      loc.end.line = 1;
    }
  }

  if (node.type === "File") {
    // Babylon returns File nodes whose .loc.{start,end} do not include
    // leading or trailing whitespace.
    loc.start = lines.firstPos();
    loc.end = lines.lastPos();
  }

  fixForLoopHead(node, lines);
  fixTemplateLiteral(node, lines);

  if (loc && node.decorators) {
    // Expand the .loc of the node responsible for printing the decorators
    // (here, the decorated node) so that it includes node.decorators.
    node.decorators.forEach(function (decorator: any) {
      expandLoc(loc, decorator.loc);
    });

  } else if (node.declaration && isExportDeclaration(node)) {
    // Nullify .loc information for the child declaration so that we never
    // try to reprint it without also reprinting the export declaration.
    node.declaration.loc = null;

    // Expand the .loc of the node responsible for printing the decorators
    // (here, the export declaration) so that it includes node.decorators.
    var decorators = node.declaration.decorators;
    if (decorators) {
      decorators.forEach(function (decorator: any) {
        expandLoc(loc, decorator.loc);
      });
    }

  } else if ((n.MethodDefinition && n.MethodDefinition.check(node)) ||
             (n.Property.check(node) && (node.method || node.shorthand))) {
    // If the node is a MethodDefinition or a .method or .shorthand
    // Property, then the location information stored in
    // node.value.loc is very likely untrustworthy (just the {body}
    // part of a method, or nothing in the case of shorthand
    // properties), so we null out that information to prevent
    // accidental reuse of bogus source code during reprinting.
    node.value.loc = null;

    if (n.FunctionExpression.check(node.value)) {
      // FunctionExpression method values should be anonymous,
      // because their .id fields are ignored anyway.
      node.value.id = null;
    }

  } else if (node.type === "ObjectTypeProperty") {
    var loc = node.loc;
    var end = loc && loc.end;
    if (end) {
      end = copyPos(end);
      if (lines.prevPos(end) &&
          lines.charAt(end) === ",") {
        // Some parsers accidentally include trailing commas in the
        // .loc.end information for ObjectTypeProperty nodes.
        if ((end = lines.skipSpaces(end, true, true))) {
          loc.end = end;
        }
      }
    }
  }
};

function fixForLoopHead(node: any, lines: any) {
  if (node.type !== "ForStatement") {
    return;
  }

  function fix(child: any) {
    var loc = child && child.loc;
    var start = loc && loc.start;
    var end = loc && copyPos(loc.end);

    while (start && end && comparePos(start, end) < 0) {
      lines.prevPos(end);
      if (lines.charAt(end) === ";") {
        // Update child.loc.end to *exclude* the ';' character.
        loc.end.line = end.line;
        loc.end.column = end.column;
      } else {
        break;
      }
    }
  }

  fix(node.init);
  fix(node.test);
  fix(node.update);
}

function fixTemplateLiteral(node: any, lines: any) {
  if (node.type !== "TemplateLiteral") {
    return;
  }

  if (node.quasis.length === 0) {
    // If there are no quasi elements, then there is nothing to fix.
    return;
  }
  
  // node.loc is not present when using export default with a template literal
  if (node.loc) {
    // First we need to exclude the opening ` from the .loc of the first
    // quasi element, in case the parser accidentally decided to include it.
    var afterLeftBackTickPos = copyPos(node.loc.start);
    assert.strictEqual(lines.charAt(afterLeftBackTickPos), "`");
    assert.ok(lines.nextPos(afterLeftBackTickPos));
    var firstQuasi = node.quasis[0];
    if (comparePos(firstQuasi.loc.start, afterLeftBackTickPos) < 0) {
      firstQuasi.loc.start = afterLeftBackTickPos;
    }

    // Next we need to exclude the closing ` from the .loc of the last quasi
    // element, in case the parser accidentally decided to include it.
    var rightBackTickPos = copyPos(node.loc.end);
    assert.ok(lines.prevPos(rightBackTickPos));
    assert.strictEqual(lines.charAt(rightBackTickPos), "`");
    var lastQuasi = node.quasis[node.quasis.length - 1];
    if (comparePos(rightBackTickPos, lastQuasi.loc.end) < 0) {
      lastQuasi.loc.end = rightBackTickPos;
    }
  }

  // Now we need to exclude ${ and } characters from the .loc's of all
  // quasi elements, since some parsers accidentally include them.
  node.expressions.forEach(function (expr: any, i: any) {
    // Rewind from expr.loc.start over any whitespace and the ${ that
    // precedes the expression. The position of the $ should be the same
    // as the .loc.end of the preceding quasi element, but some parsers
    // accidentally include the ${ in the .loc of the quasi element.
    var dollarCurlyPos = lines.skipSpaces(expr.loc.start, true, false);
    if (lines.prevPos(dollarCurlyPos) &&
        lines.charAt(dollarCurlyPos) === "{" &&
        lines.prevPos(dollarCurlyPos) &&
        lines.charAt(dollarCurlyPos) === "$") {
      var quasiBefore = node.quasis[i];
      if (comparePos(dollarCurlyPos, quasiBefore.loc.end) < 0) {
        quasiBefore.loc.end = dollarCurlyPos;
      }
    }

    // Likewise, some parsers accidentally include the } that follows
    // the expression in the .loc of the following quasi element.
    var rightCurlyPos = lines.skipSpaces(expr.loc.end, false, false);
    if (lines.charAt(rightCurlyPos) === "}") {
      assert.ok(lines.nextPos(rightCurlyPos));
      // Now rightCurlyPos is technically the position just after the }.
      var quasiAfter = node.quasis[i + 1];
      if (comparePos(quasiAfter.loc.start, rightCurlyPos) < 0) {
        quasiAfter.loc.start = rightCurlyPos;
      }
    }
  });
}

export function isExportDeclaration(node: any) {
  if (node) switch (node.type) {
  case "ExportDeclaration":
  case "ExportDefaultDeclaration":
  case "ExportDefaultSpecifier":
  case "DeclareExportDeclaration":
  case "ExportNamedDeclaration":
  case "ExportAllDeclaration":
    return true;
  }

  return false;
};

export function getParentExportDeclaration(path: any) {
  var parentNode = path.getParentNode();
  if (path.getName() === "declaration" &&
      isExportDeclaration(parentNode)) {
    return parentNode;
  }

  return null;
};

export function isTrailingCommaEnabled(options: any, context: any) {
  var trailingComma = options.trailingComma;
  if (typeof trailingComma === "object") {
    return !!trailingComma[context];
  }
  return !!trailingComma;
};
