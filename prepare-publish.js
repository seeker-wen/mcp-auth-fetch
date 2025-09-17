const fs = require("fs");
const path = require("path");

// Define the dist directory path
const distDir = path.join(__dirname, "dist");

// Clean up the dist directory before proceeding
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

// Read root package.json
const packageJson = require("./package.json");

// Remove unnecessary fields for the published package
delete packageJson.scripts;
delete packageJson.devDependencies;

// Update paths to be relative to the dist folder
packageJson.main = "index.js";
packageJson.types = "index.d.ts";
packageJson.bin = {
  "mcp-auth-fetch": "index.js",
};

// Update the files array to include only the necessary files
packageJson.files = [
  "index.js",
  "index.d.ts",
  "README.md",
  "README-CN.md",
  "LICENSE",
];

// Ensure the dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Write the modified package.json to the dist folder
fs.writeFileSync(
  path.join(distDir, "package.json"),
  JSON.stringify(packageJson, null, 2)
);

// Copy license and readme files to the dist folder
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

console.log("dist/ folder is ready for publishing.");
