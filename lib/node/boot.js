var util = require('../util.js');
var args = util.parseArgs(process.argv);
var cluster = require('./cluster.js');
var script = require.resolve(args.script);

cluster({
    watchFiles: [script],
    exec: script,
    args: args,
    respawn: true
});