var cluster = require("cluster");

function mixin(a, b) {
    if (a && b) {
        for (var key in b) {
            a[key] = b[key];
        }
    }
    return a;
}

module.exports = function(fn, options) {
    options = mixin(mixin({}, defaultOptions), options);

    var workers = [];
    var respawn = !!options.respawn;

    function master(options) {

        // 开启进程数。
        var workerCount = require('os').cpus().length;

        if (options.verbose) {
            console.log("Master started on pid " + process.pid + ", forking " + workerCount + " processes");
        }

        for (var i = 0; i < workerCount; i++) {
            worker = cluster.fork();
            worker.on("message", options.workerListener);
            workers.push(worker);
        }

        cluster.on('exit', function(worker, code, signal) {
            console.log('Worker ' + worker.id + ' died :(');

            var idx = workers.indexOf(worker);

            if (options.verbose) {
                console.log("" + worker.process.pid + " died with code " + code, respawn ? "restarting" : "");
            }

            if (!~idx) {
                workers.splice(idx, 1);
            }

            // 是否重新启动。
            if (respawn) {
                cluster.fork();
                worker.on("message", options.workerListener);
                workers.push(worker);
            }
        });

        process.on('SIGQUIT', function() {
            respawn = false;

            if (options.verbose) {
                console.log("QUIT received, will exit once all workers have finished current requests");
            }

            for (var i = 0, len = workers.length; i < len; i++) {
                var worker = workers[i];

                worker.send('quit');
            }
        });
    }

    function worker(fn) {
        var server = fn();

        if (!server) {
            return;
        }

        server.on('close', function() {
            process.exit();
        });

        // watch quit message.
        process.on('message', function(msg) {
            if (msg === 'quit') {
                server.close();
            }
        });
    }

    if (cluster.isMaster) {
        master(options);
    } else {
        worker(fn);
    }
};

var defaultOptions = module.exports.options = {
    verbose: true,
    workerListener: function noop() {
        // noop function
    }
};
