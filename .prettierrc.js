module.exports = {
  printWidth: 100,
  trailingComma: "all",
  singleQuote: false,

  overrides: [
    {
      files: "*.md",
      options: {
        printWidth: 60,
      },
    },
  ],
};
