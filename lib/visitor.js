var assert = require("assert");
var Class = require("cls");
var types = require("./types");
var Node = types.namedTypes.Node;
var NodePath = types.NodePath;
var isArray = types.builtInTypes.array;
var isObject = types.builtInTypes.object;
var isFunction = types.builtInTypes.function;
var slice = Array.prototype.slice;
var removeRequests = [];

var Visitor = exports.Visitor = Class.extend({
    visit: function(node) {
        var self = this;

        if (!node) {
            // pass

        } else if (node instanceof Array) {
            node = self.visitArray(node);

        } else if (Node.check(node)) {
            var methodName = "visit" + node.type,
                method = self[methodName] || self.genericVisit;
            node = method.call(this, node);

        } else if (typeof node === "object") {
            // Some AST node types contain ad-hoc (non-AST) objects that
            // may contain nested AST nodes.
            self.genericVisit(node);
        }

        return node;
    },

    visitArray: function(arr, noUpdate) {
        for (var elem, result, undef,
                 i = 0, len = arr.length;
             i < len;
             i += 1)
        {
            if (i in arr)
                elem = arr[i];
            else
                continue;

            var requesters = [];
            removeRequests.push(requesters);

            // Make sure we don't accidentally reuse a previous result
            // when this.visit throws an exception.
            result = undef;

            try {
                result = this.visit(elem);

            } finally {
                assert.strictEqual(
                    removeRequests.pop(),
                    requesters);
            }

            if (requesters.length > 0 || result === null) {
                // This hole will be elided by the compaction loop below.
                delete arr[i];
            } else if (result !== undef) {
                arr[i] = result;
            }
        }

        // Compact the array to eliminate holes.
        for (var dst = 0,
                 src = dst,
                 // The length of the array might have changed during the
                 // iteration performed above.
                 len = arr.length;
             src < len;
             src += 1)
            if (src in arr)
                arr[dst++] = arr[src];
        arr.length = dst;

        return arr;
    },

    remove: function() {
        var len = removeRequests.length,
            requesters = removeRequests[len - 1];
        if (requesters)
            requesters.push(this);
    },

    genericVisit: function(node) {
        var field,
            oldValue,
            newValue;

        for (field in node) {
            if (!node.hasOwnProperty(field))
                continue;

            oldValue = node[field];

            if (oldValue instanceof Array) {
                this.visitArray(oldValue);

            } else if (Node.check(oldValue)) {
                newValue = this.visit(oldValue);

                if (typeof newValue === "undefined") {
                    // Keep oldValue.
                } else {
                    node[field] = newValue;
                }

            } else if (typeof oldValue === "object") {
                this.genericVisit(oldValue);
            }
        }

        return node;
    }
});



var visit = exports.visit = function(node, visitors) {
  // Determine what kind of visitors we have:
  var genVisitors;
  if (isFunction.check(visitors)) {
    // 1) A function means that we need to execute the function with the current
    // nodePath, and the result should be treated as the `visitors` object
    genVisitors = visitors;
  } else if (isArray.check(visitors)) {
    // 2) An array means that we're dealing with chained visitors, so we need
    // to pass a traverse function that will go through the next visitor if
    // available before going down the tree
    genVisitors = function(nodePath) {
      return visitors;
    }
  } else if (isObject.check(visitors)) {
    genVisitors = function(nodePath) {
      return [visitors];
    }
  } else {
    // give an error saying that the visitors passed into the function is not
    // handleed
    assert.fail(
      "typeof visitors",
      "'object, function, array'",
      "unhandled visitors parameter for recast.visit()",
      "must be any of:"
    );
  }
  var traversalState = {
    visited: [],
    toVisit: []
  };
  function getVisitorFuncName(path) {
    // TODO: Check to see which visitor is needed, and use that instead of visitNode
    //console.log('---161\n', 'visit' + path.value.type);
    return 'visit' + path.value.type;
  }
  function getNextVisitor(path) {
    var visitor = traversalState.toVisit.shift();
    if (visitor) {
      traversalState.visited.push(visitor);
    }
    var visitFuncName = getVisitorFuncName(path);
    if (visitor && visitor.hasOwnProperty(visitFuncName)) {
      return visitor[visitFuncName];
    } else if (visitor && visitor.hasOwnProperty('visitors') &&
               visitor.visitors.hasOwnProperty(visitFuncName)) {
      return visitor.visitors[visitFuncName];
    } else if (traversalState.toVisit.length !== 0) {
      return getNextVisitor(path);
    } else {
      return false;
    }
  }
  /**
   * this function is called once we know the specific visitNode function
   * that needs to be called on our nodePath. This function is responsible for
   * creating a path.traverse() function that could be called from the visitor
   * in order to continue traversal, and then making sure that the visitor is
   * called.
   */
  function visitNode(path, visitor, done) {
    if (!visitor) {
      return done();
    }
    assert.ok(
      isFunction.check(visitor),
      "A visitor passed to `visit` was not a function."
    )
    var traverseFunc;
    var nextVisitor = getNextVisitor(path);
    if (nextVisitor) {
      path.traverse = function() {
        return visitNode(path, nextVisitor, done);
      }
    } else if (traversalState.toVisit.length === 0) {
      path.traverse = function(){
        done();
      };
    }
    return visitor(path);
  }
  function traverseNode(path) {
    var doneFunc = function() {
      types.eachField(value, function(name, child) {
        var childPath = path.get(name);
        if (childPath.value !== child) {
          childPath.replace(child);
        }
        traverseNode(childPath)
    });


    }
    var value = path.value;
    if (isArray.check(value)) {
      path.each(traverseNode);
      return;
    }
    if (Node.check(value)) {
      traversalState.visited = [];
      traversalState.toVisit = genVisitors(path)
      visitNode(path, getNextVisitor(path), doneFunc);
    }
    if (!isObject.check(value)) {
      return;
    }
  }
  if (node instanceof NodePath) {
    traverseNode(node);
    return node.value;
  }
  var rootPath = new NodePath({ root: node });
  traverseNode(rootPath.get("root"));
  return rootPath.value.root;
};

