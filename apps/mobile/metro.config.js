const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The bundled datasets (assets/data/*.skydata) are JSON shipped as files and
// parsed on first use. Compiled into the bundle they made it 27 MB of Hermes
// bytecode — and every over-the-air update would have carried all of it.
config.resolver.assetExts.push('skydata');

module.exports = config;
