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

    // 开启进程数。
    var workerCount = options.workerCount ? options.workerCount : require('os').cpus().length;

    function createWorkers(n) {
        for (var i = 0; i < n; i++) {
            createWorker();
        }
    }

    function createWorker() {
        var worker = cluster.fork();
        worker.on("message", options.workerListener);
        workers.push(worker);
    }

    function killAllWorkers(signal) {
        // 避免自动重启。
        respawn = false;

        for (var i = 0, len = workers.length; i < len; i++) {
            var worker = workers[i];

            worker.removeAllListeners();
            worker.process.kill(signal);
        }

        // 还原自动重启配置。
        respawn = !!options.respawn;
    }

    function watchFiles(files, cb) {
        var fs = require('fs');
        var timer;

        files.forEach(function(file) {
            fs.watchFile(file, function() {
                timer && clearTimeout(timer)
                timer = setTimeout(function() {
                    timer = null;
                    cb();
                }, 20);
            });
        });
    }

    function master(options) {

        if (options.verbose) {
            console.log("Master started on pid " + process.pid + ", forking " + workerCount + " processes");
        }

        createWorkers(workerCount);

        cluster.on('exit', function(worker, code, signal) {
            options.verbose && console.log('Worker ' + worker.id + ' died :(');

            var idx = workers.indexOf(worker);

            if (options.verbose) {
                console.log("" + worker.process.pid + " died with code " + code, respawn ? "restarting" : "");
            }

            if (!~idx) {
                workers.splice(idx, 1);
            }

            // 是否重新启动。
            if (respawn) {
                createWorker();
            }
        });

        process.on('SIGQUIT', function() {
            if (options.verbose) {
                console.log("QUIT received, will exit once all workers have finished current requests");
            }
            killAllWorkers('SIGQUIT');
        });

        /**
         * Gracefully restarts the workers.
         */
        process.on('SIGHUP', function () {
            killAllWorkers('SIGTERM');
            createWorkers(workerCount);
        });

        /**
         * Gracefully Shuts down the workers.
         */
        process.on('SIGTERM', function () {
            killAllWorkers('SIGTERM');
        });

        // watch server scripts modification, so we can gracefully restarts the server.
        options.watchFiles && watchFiles(options.watchFiles, function() {
            if (options.verbose) {
                console.log("Server scripts changed, now will restart server.");
            }

            killAllWorkers('SIGTERM');
            createWorkers(workerCount);
        });
    }

    if (cluster.isMaster) {
        master(options);
    } else {
        fn();
    }
};

var defaultOptions = module.exports.options = {
    watchFiles: null,
    verbose: true,
    workerCount: 0,
    workerListener: function noop() {
        // noop function
    }
};
