const path = require('path');
const { merge: webpackMerge } = require('webpack-merge');
const baseConfig = require('@splunk/webpack-configs/base.config').default;

// Builds one bundle per page into dist/; splunk/build.py copies it to the app's
// appserver/static/pages/ directory, where the page's HTML template loads it.
module.exports = webpackMerge(baseConfig, {
    entry: { explorer: path.join(__dirname, 'src/pages/explorer/index.jsx') },
    output: { path: path.join(__dirname, 'dist'), filename: '[name].js' },
    resolve: { extensions: ['.js', '.jsx'] },
    devtool: false,
    performance: { hints: false },
});
