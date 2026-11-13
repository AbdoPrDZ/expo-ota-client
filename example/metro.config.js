// The example uses expo-ota-client from the parent folder (`file:..`, linked
// into node_modules). Metro has to watch that folder, and the library's own
// `react`, `react-native` and `expo-*` imports must resolve to this app's
// copies: the parent's node_modules holds other versions (dev dependencies),
// and two copies of React or React Native crash the app.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const libraryRoot = path.resolve(projectRoot, '..');
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\/g, '[\\\\/]');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [libraryRoot];

// Hide the parent's node_modules, so lookups from ../src fall through to ours.
// Case-insensitive: on Windows Metro may report the drive as `e:` or `E:`.
config.resolver.blockList = [new RegExp(`^${escape(path.join(libraryRoot, 'node_modules'))}[\\\\/].*`, 'i')];
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

// Resolve the library directly instead of through the node_modules link. On
// Windows npm links with a junction whose target may differ in drive-letter
// case (`e:` vs `E:`) from the watched folder, and Metro then treats the
// target as outside the project ("Unable to resolve expo-ota-client").
//
// `OTA_USE_DIST=1` uses the built, minified package (`npm run build` in the
// parent) instead of the source, to check what npm publishes.
const libraryEntry = process.env.OTA_USE_DIST
  ? path.join(libraryRoot, 'dist', 'index.js')
  : path.join(libraryRoot, 'src', 'index.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-ota-client') return { type: 'sourceFile', filePath: libraryEntry };

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
