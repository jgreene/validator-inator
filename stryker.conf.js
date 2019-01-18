module.exports = function(config) {
  config.set({
    mutator: "typescript",
    packageManager: "yarn",
    reporters: ["html", "baseline", "clear-text", "progress", "dashboard"],
    testRunner: "mocha",
    transpilers: ["typescript"],
    testFramework: "mocha",
    coverageAnalysis: "perTest",
    tsconfigFile: "tsconfig.json",
    mutate: ["./src/**/*.ts", "!./src/**/*.spec.ts"],
    mochaOptions: {
      files: "./lib/**/*.spec.js",
      timeout: 5000
    }
  });
};
