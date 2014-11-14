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
// 用 cluster 的好处是，可以让多个 worker 的服务可以监听同一个端口，这样便于挂在用户自己提供 server.js 文件，开端口没有限制。
if (process.platform === "win32") {

    var spawn = require('child_process').spawn;

    module.exports = function(options) {
        options = mixin(mixin({}, defaultOptions), options);

        var respawn = !!options.respawn;
        var args = options.args;
        var logger = require('./logger.js')(path.join(path.dirname(options.exec), 'server.log'));

        var worker;
        var isRuning = false;

        var createProcess = function() {
            var argsRaw = process.argv.concat();

            argsRaw.shift();
            argsRaw.unshift(options.exec);

            worker = spawn(process.execPath, argsRaw, {
                detached: true
            });

            logger.write('Create a new worker %s.', worker.pid);

            logger.takecare(worker.stdout);
            logger.takecare(worker.stderr);
            worker.stderr.pipe(process.stderr);

            // 为了让 lib/node.js 能够检测到服务器起来了。
            worker.stdout.on('data', function(chunk) {
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

            worker.on('exit', function() {
                logger.write('The worker %s get killed.', worker.pid);
                respawn && createProcess();
            });

            return worker;
        }

        var killProcess = function(signal) {
            respawn = false;
            worker.kill('SIGTERM');
            respawn = !!options.respawn;
        }

        createProcess();

        process.on('exit', function() {
            logger.write('The main process get killed.');
            killProcess('SIGTERM');
        });


        // watch server scripts modification, so we can gracefully restarts the server.
        if (options.watchFiles) {
            var FSWatcher = require('chokidar').FSWatcher;
            var watcher = new FSWatcher({
                persistent: true
            }).add(options.watchFiles);

            watcher.on('change', function() {
                logger.write('Server scripts changed, now will restart server.');
                killProcess('SIGTERM');
                createProcess();
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

            process.on('SIGINT', function() {
                logger.write('QUIT received, will exit once all workers have finished current requests.');
                killAllWorkers('SIGTERM');
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
                    logger.write('Server scripts changed, now will restart server.');
                    killAllWorkers('SIGTERM');
                    createWorkers(workerCount);
                });
            }

            process.on('uncaughtException', function(error) {
                logger.write('UncaughtException: %s.', error);
            });
        }

        cluster.isMaster && master(options);
    };

    var defaultOptions = module.exports.options = {
        watchFiles: null,
        workerCount: 0
    };
}
