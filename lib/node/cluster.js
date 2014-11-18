var path = require('path');

function mixin(a, b) {
    if (a && b) {
        for (var key in b) {
            a[key] = b[key];
        }
    }
    return a;
}

// 由于 windows 系统中 cluster.fork() 会弹出个新窗口，所以先不打算用 cluster 了，也不打算用多线程了，就开一个好了。
// 用 cluster 的好处是，可以让多个 worker 的服务可以监听同一个端口，这样便于挂载用户自己提供 server.js 文件，同时开同一个端口没有限制。
if (process.platform === "win32") {
    module.exports = function(options) {
        options = mixin(mixin({}, defaultOptions), options);

        var respawn = !!options.respawn;
        var args = options.args;
        var logger = require('./logger.js')(path.join(path.dirname(options.exec), 'server.log'));

        var worker;
        var isRuning = false;

        var createProcess = function() {
            var argv = process.argv.slice(1);

            worker = require('child_process').fork(options.exec, argv, {
                silent: true,
                detached: true
            });

            worker.on('exit', function() {
                logger.write('Worker %d died %s.', worker.pid, respawn ? " restarting" : '');
                respawn && createProcess();
            });

            worker.stderr.on('data', function(chunk) {
                if (~chunk.toString().indexOf('Error')) {
                    logger.write('Detected error, set `respawn` to false!');
                    respawn = false;
                }
            });

            logger.write('Create a new worker %s.', worker.pid);
            logger.takecare(worker.stdout);
            logger.takecare(worker.stderr);
            worker.stderr.pipe(process.stderr);

            // 为了让 lib/node.js 能够检测到服务器起来了。
            isRuning || worker.stdout.on('data', function(chunk) {
                if (isRuning) {
                    worker.stdout.removeListener('data', arguments.callee);
                    return;
                }

                var str = chunk.toString();

                if (~str.indexOf(args.port)) {
                    console.log('The server is runing.');
                    isRuning = true;
                    worker.stdout.removeListener('data', arguments.callee);
                }
            });

            return worker;
        }

        var killProcess = function(cb) {
            require('child_process').exec('taskkill /PID ' + worker.pid + ' /T /F', cb);
        }

        createProcess();

        function killSelf() {
            respawn = false;
            killProcess(function() {
                logger.write('The master get killed!');
                process.exit();
            });
        }

        process.on('exit', killSelf);

        // watch server scripts modification, so we can gracefully restarts the server.
        if (options.watchFiles) {
            var FSWatcher = require('chokidar').FSWatcher;
            var watcher = new FSWatcher({
                persistent: true
            }).add(options.watchFiles);

            watcher.on('change', function() {
                logger.write('Server scripts changed, now will restart server.');
                killProcess();
            });
        }

        process.on('uncaughtException', function(error) {
            logger.write('UncaughtException: %s.', error);
        });
    };

} else {
    var cluster = require("cluster");

    module.exports = function(options) {
        options = mixin(mixin({}, defaultOptions), options);

        var workers = [];
        var respawn = !!options.respawn;
        var args = options.args;
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
            worker.process.stderr.pipe(process.stderr);

            // 为了让 lib/node.js 能够检测到服务器起来了。
            isRuning || worker.process.stdout.on('data', function(chunk) {
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
            logger.write('Kill all workers with signal `%s`', signal);

            for (var i = 0, len = workers.length; i < len; i++) {
                var worker = workers[i];

                worker.removeAllListeners();
                worker.process.kill(signal);
            }
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

            process.on('SIGTERM', function() {
                logger.write('QUIT received, will exit once all workers have finished current requests.');
                respawn = false;
                killAllWorkers('SIGTERM');

                // don't need to wait!
                process.exit();
            });

            // watch server scripts modification, so we can gracefully restarts the server.
            if (options.watchFiles) {
                var FSWatcher = require('chokidar').FSWatcher;
                var watcher = new FSWatcher({
                    persistent: true
                }).add(options.watchFiles);

                watcher.on('change', function() {
                    logger.write('Server scripts changed, now will restart server.');
                    killAllWorkers('SIGTERM');
                });
            }

            process.on('uncaughtException', function(error) {
                logger.write('UncaughtException: %s.', error);
            });
        }

        cluster.isMaster && master(options);
    };
}

var defaultOptions = module.exports.options = {
    watchFiles: null,
    workerCount: 0
};
