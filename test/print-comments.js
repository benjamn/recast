var assert = require("assert");
var recast = require("..");
var fs = require("fs");


// set `devTestDebug` to 1/truthy when you want an OUT file produced:
// that file can be used to quickly update the reference file while
// you develop/update this test set.
//
// CODING CONVENTION: `devTestDebug` can turn OFF tests, it can 
// tweak values to make a test pass, but it CANNOT replace a test.
// (Reason: this prevents subtler mistakes with negative if(..) logic
// in the test code re `devTestDebug`.) Therefor `devTestDebug`-specific
// tests MUST pass muster in regular tests too. See for example the
// `refs.length <= tests.length` test in `chopIntoTestChunks()` below.
//  
// WARNING: normal use should have `devTestDebug` set to 0/falsey. 
var devTestDebug = 0; 


function chopIntoTestChunks(ist, soll) {
  function stripSpecComment(src) {
    return src.split('\n').filter(function (line) {
        return line.trim()[0] !== '#';
    }).join('\n');
  }

  function trimSurroundingNL(src) {
    if (src[0] === '\n') {
      src = src.substr(1);
    }
    var last = Math.max(0, src.length - 1);
    if (src[last] === '\n') {
      src = src.substr(0, last);
    } 
    return src;
  }

  function isNotEmpty(spec) {
    return spec && spec.description;
  }

  var arr = ist.replace(/\r\n|\n\r/g, '\n').split(/^===$/m).map(function (chunk) {
    var l = chunk.split(/^---$/m);
    return {
      description: stripSpecComment(l[0]).trim(),
      content: trimSurroundingNL(l[1] || "")
    };
  }).filter(isNotEmpty);
  var refs = soll.replace(/\r\n|\n\r/g, '\n').split(/^===$/m).map(function (chunk) {
    var l = chunk.split(/^---$/m);
    return {
      description: stripSpecComment(l[0]).trim(),
      content: trimSurroundingNL(l[1] || "")
    };
  }).filter(isNotEmpty);

  if (!devTestDebug) {
    assert.ok(arr.length > 0, "we expect the test files to contain 1 or more tests");
    assert.strictEqual(arr.length, refs.length, "the number of tests must be equal to the number of reference entries to check against");
  }
  assert.ok(refs.length <= arr.length, "(during test development) the reference set MAY be smaller than the test set. Make sure you update the reference set while you work on the test set!");

  // combine test set and reference set into a single test spec set.
  // Perform sanity checks along the way.
  arr = arr.map(function (spec, index) {
    var ref = refs[index] || {};

    if (devTestDebug && !ref.description) {
      ref.description = spec.description;
    }
    assert.strictEqual(spec.description, ref.description, "test description and reference description must be identical (so humans can also easily check reference vs. test input).\nCompare:\n  " + (spec.description || "???") + "\nvs.:\n  " + (ref.description || "???"));

    spec.expected = ref.content;
    return spec;
  });
  return arr;
}


describe("print comments", function() {
  
  // load ISTWERT and SOLLWERT test files and cut them up into chunks to test:
  var testSet = chopIntoTestChunks(
    fs.readFileSync(__filename.replace(/\.js$/, '') + ".tests.txt", "utf8"), 
    fs.readFileSync(__filename.replace(/\.js$/, '') + ".refs.txt", "utf8")
  );

  var outputs = [];
  if (devTestDebug) {
    fs.writeFileSync(__filename.replace(/\.js$/, '') + ".out.txt", "\n===\n", "utf8");
  }

  // create a test for every spec:
  testSet.forEach(function (spec, idx) {
    it(spec.description, function test_one_example() {
      var ast = recast.parse(spec.content);
      var new_src = recast.prettyPrint(ast, { 
        tabWidth: 2,
        quote: 'auto',
        arrowParensAlways: true,

        // Do not reuse whitespace (or anything else, for that matter)
        // when printing generically.
        reuseWhitespace: false
      }).code.replace(/\r\n|\n\r/g, '\n');

      if (devTestDebug) {
        outputs.push("===", spec.description, "---", new_src);
        fs.writeFileSync(__filename.replace(/\.js$/, '') + ".out.txt", outputs.join("\n") + "\n===\n", "utf8");
      }

      assert.strictEqual(new_src, spec.expected, "prettyPrint output must exactly match the reference sample");
    });
  });
});
