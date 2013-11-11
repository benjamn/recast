var defaults = {
    tabWidth: 4,
    useTabs: false,
    reuseWhitespace: true,
    wrapColumn: 74, // Aspirational for now.
    sourceFileName: null,
    esprima: require("esprima"),
    range: false,
    tolerant: true
}, hasOwn = defaults.hasOwnProperty;

// Copy options and fill in default values.
exports.normalize = function(options) {
    options = options || defaults;

    function get(key) {
        return hasOwn.call(options, key)
            ? options[key]
            : defaults[key];
    }

    return {
        tabWidth: +get("tabWidth"),
        useTabs: !!get("useTabs"),
        reuseWhitespace: !!get("reuseWhitespace"),
        wrapColumn: Math.max(get("wrapColumn"), 0),
        sourceFileName: get("sourceFileName"),
        esprima: get("esprima"),
        range: get("range"),
        tolerant: get("tolerant")
    };
};
