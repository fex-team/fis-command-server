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
    var args = options.args;
    var path = require('path');
    var logger = require('./logger.js')(path.join(path.dirname(options.exec), 'server.log'));

    // 开启进程数。
    var workerCount = options.workerCount ? options.workerCount : require('os').cpus().length;

    function createWorkers(n) {
        for (var i = 0; i < n; i++) {
            createWorker();
        }
    }

    var isRuning = false;
    function createWorker() {
        var worker = cluster.fork();

        workers.push(worker);

        logger.takecare(worker.process.stdout);
        logger.takecare(worker.process.stderr);

        // 为了让 lib/node.js 能够检测到服务器起来了。
        worker.process.stdout.on('data', function(chunk) {
            if (isRuning) {
                worker.process.stdout.removeListener('data', arguments.callee);
                return;
            }

            var str = chunk.toString();

            if (~str.indexOf(args.port)) {
                console.log('The server is runing.');
                isRuning = true;
                worker.process.stdout.removeListener('data', arguments.callee);
            }
        });
    }

    function killAllWorkers(signal) {
        // 避免自动重启。
        respawn = false;

        logger.write('Kill all workers with signal `%s`', signal);

        for (var i = 0, len = workers.length; i < len; i++) {
            var worker = workers[i];

            worker.removeAllListeners();
            worker.process.kill(signal);
        }

        // 还原自动重启配置。
        respawn = !!options.respawn;
    }

    function master(options) {
        cluster.setupMaster({
            exec: options.exec,
            silent : true
        });

        logger.write('Master started on pid %s, forking %d processes', process.pid, workerCount);

        createWorkers(workerCount);

        cluster.on('exit', function(worker, code, signal) {
            var idx = workers.indexOf(worker);

            logger.write('Worker %d died (%s)%s.', worker.process.pid, signal || code || '', respawn ? " restarting" : '');

            if (!~idx) {
                workers.splice(idx, 1);
            }

            // 是否重新启动。
            if (respawn) {
                createWorker();
            }
        });

        process.on('SIGQUIT', function() {
            logger.write('QUIT received, will exit once all workers have finished current requests.');
            killAllWorkers('SIGTERM');
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
        if (options.watchFiles) {
            var FSWatcher = require('chokidar').FSWatcher;
            var watcher = new FSWatcher({
                persistent: true
            }).add(options.watchFiles);

            watcher.on('change', function() {
                options.verbose = false;
                logger.write('Server scripts changed, now will restart server.');
                killAllWorkers('SIGTERM');
                createWorkers(workerCount);
            });
        }

        process.on('uncaughtException', function(error) {
            logger.write('UncaughtException: %s.', error);
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
    workerCount: 0
};
