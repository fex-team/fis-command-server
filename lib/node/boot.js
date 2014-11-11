var util = require('../util.js');
var options = util.parseArgs(process.argv);
var cluster = require('./cluster.js');
var script = require.resolve(options.script);

cluster(function() {
    delete require.cache[script];
    require(script);
}, {
    watchFiles: [script]
});