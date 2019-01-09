import path from "path";
import fs from "fs";
import recast from "../main";

var source = fs.readFileSync(
    path.join(__dirname, "data", "backbone.js"),
    "utf8"
);

var start = +new Date;
var ast = recast.parse(source);
var types = Object.create(null);

var parseTime = +new Date - start;
console.log("parse", parseTime, "ms");

recast.visit(ast, {
    visitNode: function(path) {
        types[path.value.type] = true;
        this.traverse(path);
    }
});

var visitTime = +new Date - start - parseTime;
console.log("visit", visitTime, "ms");

recast.prettyPrint(ast).code;

var printTime = +new Date - start - visitTime - parseTime;
console.log("print", printTime, "ms");

console.log("total", +new Date - start, "ms");
