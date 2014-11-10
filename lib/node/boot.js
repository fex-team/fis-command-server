var util = require('../util.js');
var options = util.parseArgs(process.argv);
var cluster = require('./cluster.js');

cluster(function() {
    var script = require.resolve(options.script);

    delete require.cache[script];
    require(script);
});