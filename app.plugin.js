// The published package loads the minified build; a repo checkout without a
// build (e.g. the example app during development) loads the source.
const path = require('path');
const fs = require('fs');

const built = path.join(__dirname, 'dist', 'plugin', 'withOtaClient.js');

module.exports = fs.existsSync(built) ? require(built) : require('./plugin/withOtaClient');
