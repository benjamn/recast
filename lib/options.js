var defaults = {
    tabWidth: 4,
    useTabs: false,
    reuseWhitespace: true,
    writeback: function(output) {
        process.stdout.write(output);
    }
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
        writeback: get("writeback")
    };
};
