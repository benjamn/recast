var mocha = require('mocha'),
    assert = require('assert'),
    testRegEx = /^test(.*)$/;

function submodule(id) {
    describe(id, function () {
        var module = require("./" + id);

        Object.keys(module).forEach(function (name) {
            var value = this[name], match;

            if ((match = name.match(testRegEx)) && value instanceof Function) {
                it(match[1], function (done) {
                    value({finish: done}, assert);
                });
            }
        }, module);
    });   
}

submodule("lines");
submodule("patcher");
submodule("visitor");
submodule("comments");
submodule("parser");
submodule("printer");
submodule("syntax");
submodule("identity");
submodule("parens");
submodule("mapping");
