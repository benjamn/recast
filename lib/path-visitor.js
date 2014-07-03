var assert = require("assert");
var types = require("./types");
var Node = types.namedTypes.Node;
var NodePath = types.NodePath;
var isArray = types.builtInTypes.array;
var isObject = types.builtInTypes.object;
var isFunction = types.builtInTypes.function;
var hasOwn = Object.prototype.hasOwnProperty;
var undefined;

function PathVisitor() {
    assert.ok(this instanceof PathVisitor);
    this._reusableContextStack = [];
    this._methodNameTable = computeMethodNameTable(this);
}

function computeMethodNameTable(visitor) {
    var typeNames = Object.create(null);

    for (var methodName in visitor) {
        if (/^visit[A-Z]/.test(methodName)) {
            typeNames[methodName.slice("visit".length)] = true;
        }
    }

    var supertypeTable = types.computeSupertypeLookupTable(typeNames);
    var methodNameTable = Object.create(null);

    for (var typeName in supertypeTable) {
        if (hasOwn.call(supertypeTable, typeName)) {
            methodName = "visit" + supertypeTable[typeName];
            if (isFunction.check(visitor[methodName])) {
                methodNameTable[typeName] = methodName;
            }
        }
    }

    return methodNameTable;
}

PathVisitor.fromMethodsObject = function(methods) {
    if (methods instanceof PathVisitor) {
        return methods;
    }

    if (!isObject.check(methods)) {
        // An empty visitor?
        return new PathVisitor;
    }

    function Visitor() {
        PathVisitor.call(this);
    }

    var Vp = Visitor.prototype = Object.create(PVp);
    Vp.constructor = Visitor;

    for (var property in methods) {
        if (hasOwn.call(methods, property)) {
            Vp[property] = methods[property];
        }
    }

    return new Visitor;
};

PathVisitor.visit = function(node, methods) {
    var path = node instanceof NodePath ? node : new NodePath(node);
    var visitor = PathVisitor.fromMethodsObject(methods);
    var resultPaths = visitor.visit(path);

    assert.strictEqual(
        resultPaths.length, 1,
        "Cannot replace root node with more than one node"
    );

    return resultPaths[0].value;
};

var PVp = PathVisitor.prototype;

PVp.visit = function(path) {
    assert.ok(path instanceof NodePath);
    var value = path.value;

    var methodName = Node.check(value) && this._methodNameTable[value.type];
    if (methodName) {
        var context = this.acquireContext(path);
        var result = this[methodName].call(context, path);

        if (result === false) {
            // Visitor methods return false to indicate that they have
            // handled their own traversal needs, and we should not
            // complain if context._needToCallTraverse is still true.
            context._needToCallTraverse = false;

        } else if (result !== undefined) {
            // Any other non-undefined value returned from the visitor
            // method is interpreted as a replacement value.
            var resultPath = context.replace(result)[0];

            if (context._needToCallTraverse) {
                // If context.traverse still hasn't been called, visit the
                // children of the replacement node.
                context.traverseChildren(resultPath);
            }
        }

        assert.strictEqual(
            context._needToCallTraverse, false,
            "Must either call this.traverse or return false in " + methodName
        );

        var resultPaths = context._currentPaths;
        this.releaseContext(context);
        return resultPaths;
    }

    // If there was no visitor method to call, visit the children of this
    // node generically.
    return visitChildren(path, this);
};

function visitChildren(path, visitor) {
    assert.ok(path instanceof NodePath);
    assert.ok(visitor instanceof PathVisitor);

    var value = path.value;

    if (isArray.check(value)) {
        path.each(visitor.visit, visitor);
    } else if (!isObject.check(value)) {
        // No children to visit.
    } else {
        types.eachField(value, function(name, child) {
            value[name] = child;
            visitor.visit(path.get(name));
        });
    }

    return [path];
}

PVp.acquireContext = function(path) {
    if (this._reusableContextStack.length === 0) {
        return new PathVisitor.Context(this).reset(path);
    }
    return this._reusableContextStack.pop().reset(path);
};

PVp.releaseContext = function(context) {
    this._reusableContextStack.push(context);
    context._currentPaths = null;
};

PathVisitor.Context = function Context(visitor) {
    assert.ok(this instanceof Context);
    assert.ok(visitor instanceof PathVisitor);
    Object.defineProperty(this, "visitor", { value: visitor });
    this._currentPaths = null;
    this._needToCallTraverse = true;
};

var Cp = PathVisitor.Context.prototype;

Cp.reset = function(path) {
    assert.ok(path instanceof NodePath);
    this._currentPaths = [path];
    this._needToCallTraverse = true;
    return this;
};

function pickVisitor(currentVisitor, newVisitor) {
    return newVisitor ? PathVisitor.fromMethodsObject(newVisitor) : currentVisitor;
};

Cp.traverse = function(path, newVisitor) {
    isArray.assert(this._currentPaths);
    assert.ok(path instanceof NodePath);
    assert.strictEqual(
        this._currentPaths.indexOf(path), -1,
        "Calling this.traverse on the same path; " +
            "try this.traverseChildren instead"
    );
    this._needToCallTraverse = false;
    return pickVisitor(this.visitor, newVisitor).visit(path);
};

Cp.traverseChildren = function(path, newVisitor) {
    isArray.assert(this._currentPaths);
    this._needToCallTraverse = false;
    return visitChildren(path, pickVisitor(this.visitor, newVisitor));
};

Cp.replace = function(newValue) {
    isArray.assert(this._currentPaths);

    var argc = arguments.length;
    if (argc === 0) {
        // REMOVE ALL THE THINGS!
        while (this._currentPaths.length > 0) {
            this._currentPaths.pop().replace();
        }

        // Once everything is removed, nothing needs to be traversed.
        this._needToCallTraverse = false;

    } else if (argc === 1 && this._currentPaths.length === 1) {
        // Common case: one current path, one replacement.
        this._currentPaths = this._currentPaths[0].replace(newValue);

    } else {
        // If we previously removed all paths, we're out of luck.
        assert.notStrictEqual(
            this._currentPaths.length, 0,
            "Cannot call this.replace after calling this.remove"
        );

        // Remove all but one node...
        while (this._currentPaths.length > 1) {
            this._currentPaths.pop().replace();
        }

        // ... and then replace that node.
        var pathToReplace = this._currentPaths[0];
        this._currentPaths = pathToReplace.replace.apply(
            pathToReplace,
            arguments
        );
    }

    return this._currentPaths;
};

Cp.remove = function() {
    return this.replace();
};

module.exports = PathVisitor;
