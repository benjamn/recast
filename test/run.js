function submodule(id) {
    var module = require("./" + id),
        name, value;
    for (var name in module) {
        value = module[name];
        if (/^test/.test(name) &&
            typeof value === "function")
            exports["test/" + id + "." + name] = value;
    }
}

submodule("lines");
submodule("patcher");
submodule("Class");
submodule("visitor");
submodule("comments");
submodule("parser");
submodule("printer");
submodule("syntax");
submodule("identity");
submodule("parens");
