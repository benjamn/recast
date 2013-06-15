var defaults = {
    tabWidth: 4,
    useTabs: false,
    reuseWhitespace: true,
    wrapColumn: 74, // Aspirational for now.
    esprima: require("esprima")
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
        esprima: get("esprima")
    };
};
