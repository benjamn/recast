import { readFileSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import * as glob from "glob";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// @ts-expect-error
const files = glob.default.sync(`esm/**/*.js`);

files.forEach((file) => {
  const filePath = resolve(__dirname, file);

  const content = readFileSync(filePath).toString();

  // replace `import` and `export` statements with `.mjs` file ending
  const newContent = content.replace(
    /port .* from ['"]\.(.*)['"]/g,
    (requireStatement, path) =>
      requireStatement.replace(path, path.replace(/\.js$/, `.mjs`)),
  );

  const newFilePath = filePath.replace(/\.js$/, ".mjs");
  // write new file to disk
  writeFileSync(newFilePath, newContent, { encoding: "utf8" });
  // delete old file
  rmSync(filePath);
});
