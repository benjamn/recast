module.exports = {
  printWidth: 100,
  trailingComma: 'all',
  singleQuote: true,

  overrides: [
    {
      files: '*.md',
      options: {
        printWidth: 60,
      },
    },
  ],
};
