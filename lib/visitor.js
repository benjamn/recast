var assert = require("assert");
var Class = require("cls");
var types = require("./types");
var Node = types.namedTypes.Node;
var NodePath = types.NodePath;
var isArray = types.builtInTypes.array;
var isObject = types.builtInTypes.object;
var isFunction = types.builtInTypes.function;
var hasOwn = Object.prototype.hasOwnProperty;
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
            if (!hasOwn.call(node, field))
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

function parseVisitorsObj(visitorsObj) {
    if (isFunction.check(visitorsObj)) {
        // 1) A function means that we need to execute the function with the
        // current nodePath, and the result should be treated as the `visitors`
        // object
        return visitorsObj;
    } else if (isArray.check(visitorsObj)) {
        // 2) An array means that we're dealing with chained visitors, so we
        // need to pass a traverse function that will go through the next
        // visitor if available before going down the tree
        return function(nodePath) {
            return visitorsObj.slice(0);
        }
    } else if (isObject.check(visitorsObj)) {
        return function(nodePath) {
            return [visitorsObj];
        }
    } else {
        // give an error saying that the visitors passed into the function is
        // not handleed
        assert.fail(
            typeof visitors,
            "'object || function || array'",
            "unhandled visitors parameter for recast.visit()",
            "must be any of:"
        );
    }
}

function visit(node, visitors) {
    // Determine what kind of visitors we have:
    var genVisitors;
    genVisitors = parseVisitorsObj(visitors);
    var traversalState = {
        toVisit: [],
        replaced: null
    };
    // this function is very simple, but I'm gonna keep it in function form in
    // case the logic to produce the expected visitor function name gets more
    // complicated in the future
    function getVisitorFuncName(path) {
        return 'visit' + path.value.type;
    }
    // This function gets called at least once per visit for each node. It uses
    // whatever visitors are defined for the current tree/node to decide which
    // visitor and which specific visit function from that visitor needs to
    // be called next. This function also handles the case that instead of
    // a transformer or visitors object we have a function that's expected to
    // generate an array of visitors.
    //
    // This function is especially important once we support chaining multiple
    // visitors on the same node since we internally keep track of a `visitors`
    // queue.
    function getNextVisitor(path) {
        var visitor = traversalState.toVisit.shift();
        if (!visitor) {
            return false;
        }
        // if the latest popped visitor is a function, we need to call it and
        // add the result to the 'toVisit' queue
        if (isFunction.check(visitor)) {
            var generatedVisitorsArr = visitor(path);
            assert(
                isArray.check(generatedVisitorsArr),
                "A function that should resolve to an array of " +
                    "transformers, failed to do so."
            );
            travelStaet.toVisit.unshift.apply(
                travelState.toVisit,
                generatedVisitorsArr
            );
            return getNextVisitor(path);
        }
        return visitor;
    }
    function getVisitorFunction(path, visitor) {
        var visitFuncName = getVisitorFuncName(path);
        if (visitor && hasOwn.call(visitor, visitFuncName)) {
            return visitor[visitFuncName];
        } else if (visitor && hasOwn.call(visitor, 'visitors') &&
                   hasOwn.call(visitor.visitors, visitFuncName)) {
            return visitor.visitors[visitFuncName];
        } else if (traversalState.toVisit.length !== 0) {
            return getVisitorFunction(path, getNextVisitor(path));
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
    function visitNode(path, visitorObj, done, currVisitors) {
        var path = traversalState.replaced ? traversalState.replaced[0] : path;
        assert.ok(path instanceof NodePath);
        var visitor = getVisitorFunction(path, visitorObj);
        var thisObj = {};
        if (!visitor) {
            return done();
        }
        assert.ok(
            isFunction.check(visitor),
            "A visitor passed to `visit` was not a function."
        )
        var nextVisitor = getNextVisitor(path);
        if (nextVisitor) {
            thisObj.traverse = function(newVisitors) {
                return visitNode(
                    path,
                    nextVisitor,
                    (newVisitors ? done.bind(this, newVisitors): done),
                    currVisitors
                );
            }
        } else if (traversalState.toVisit.length === 0) {
            thisObj.traverse = function(newVisitors){
                done(newVisitors);
            };
        }
        thisObj.visitors = currVisitors;
        thisObj.replace = function() {
            var replacedPath = path.replace.apply(path, arguments);
            traversalState.replaced = replacedPath;
            return replacedPath;
        }
        return visitor.call(thisObj, path);
    }
    // This is the main traversal function that gets called recursively to
    // traverse the entire AST, all the nodes and their childrens.
    function traverseNode(path) {
        var nodeTraversed = false;
        // We introduce a done-function that's produced for each node as it gets
        // traversed. Each traversal should end with the done function being
        // called implicitly in one way or another, which will move on to the
        // current node's children. This can be done BEFORE the node is
        // replaced/modified which results in post-order-traversal.
        var doneFunc = function(newVisitors) {
            if (newVisitors) {
                genVisitors = parseVisitorsObj(newVisitors);
            }
            nodeTraversed = true;
            types.eachField(value, function(name, child) {
                var childPath = path.get(name);
                if (childPath.value !== child) {
                    childPath.replace(child);
                }
                traverseNode(childPath)
            });
        };
        var value = path.value;
        // traverse arrays of nodes
        if (isArray.check(value)) {
            path.each(traverseNode);
            return;
        }
        if (Node.check(value)) {
            // generate the corresponding visitors for the current node and 
            // visit it
            traversalState.replaced = null;
            traversalState.toVisit = genVisitors(path)
            var returnedValue = visitNode(
                path,
                getNextVisitor(path),
                doneFunc,
                genVisitors(path)
            );
            if (!nodeTraversed && returnedValue != false) {
                assert(false, "Each visitor should either return `false` to " +
                       "stop further traversal, or call `this.traverse()`");
            }
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

exports.visit = visit;
