module.exports = function (api) {
  api.cache(true);
  return {
    // zustand's ESM build reads `import.meta.env`; the web bundle is a classic
    // script, so it has to be rewritten. Native bundles are unaffected.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]]
  };
};
