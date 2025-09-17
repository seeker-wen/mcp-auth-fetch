const fs = require("fs");
const path = require("path");

// Define paths
const distDir = path.join(__dirname, "dist");
const cjsDir = path.join(distDir, "cjs");
const esmDir = path.join(distDir, "esm");

// 1. Move and rename files from cjs and esm directories
console.log("Organizing build artifacts...");
fs.renameSync(path.join(cjsDir, "index.js"), path.join(distDir, "index.js"));
fs.renameSync(path.join(esmDir, "index.js"), path.join(distDir, "index.mjs"));
fs.renameSync(path.join(cjsDir, "index.d.ts"), path.join(distDir, "index.d.ts"));
console.log("Artifacts moved to dist/ root.");

// 2. Read root package.json and modify it for publishing
console.log("Creating production package.json...");
const packageJson = require("./package.json");

// Remove unnecessary fields
delete packageJson.scripts;
delete packageJson.devDependencies;

// Update fields for dual-module support
packageJson.main = "index.js"; // CJS entry
packageJson.module = "index.mjs"; // ESM entry
packageJson.types = "index.d.ts";
packageJson.exports = {
  ".": {
    import: "./index.mjs",
    require: "./index.js",
  },
};
packageJson.bin = {
  "mcp-auth-fetch": "index.js",
};

// Update the files array to include all necessary artifacts
packageJson.files = [
  "index.js",
  "index.mjs",
  "index.d.ts",
  "README.md",
  "README-CN.md",
  "LICENSE",
];

// 3. Write the modified package.json to the dist folder
fs.writeFileSync(
  path.join(distDir, "package.json"),
  JSON.stringify(packageJson, null, 2)
);
console.log("Production package.json created in dist/.");

// 4. Copy license and readme files to the dist folder
console.log("Copying documentation and license...");
fs.copyFileSync(path.join(__dirname, "LICENSE"), path.join(distDir, "LICENSE"));
fs.copyFileSync(
  path.join(__dirname, "README.md"),
  path.join(distDir, "README.md")
);
fs.copyFileSync(
  path.join(__dirname, "README-CN.md"),
  path.join(distDir, "README-CN.md")
);
fs.copyFileSync(path.join(__dirname, ".npmrc"), path.join(distDir, ".npmrc"));
console.log("Documentation and license copied.");

// 5. Clean up temporary build directories
console.log("Cleaning up temporary directories...");
fs.rmSync(cjsDir, { recursive: true, force: true });
fs.rmSync(esmDir, { recursive: true, force: true });
console.log("Temporary directories removed.");

console.log("\n✅ dist/ folder is ready for publishing.");