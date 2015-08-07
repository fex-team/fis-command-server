/**
 * server:
 *  include `jetty` and `node`
 * fis.baidu.com
 */
var _ = require('./util.js');
var exports = module.exports;
var child_process = require('child_process');
var spawn = child_process.spawn;

var java_handle = require('./java.js');

//server start
exports.start = function(opt) {
    var type = opt['type'];
    switch (type) {
        case 'php':
            startPHP(opt);
            break;
        case 'java':
            startJava(opt);
            break;
        case 'node':
            startNode(opt);
            break;
        default:
            startNode(opt);
            // checkStart(opt);
            break;
    }
};

function checkPid(pid, opt, callback) {
    var list, msg = '';
    var isWin = fis.util.isWin();

    if (isWin) {
        list = spawn('tasklist');
    } else {
        list = spawn('ps', ['-A']);
    }

    list.stdout.on('data', function (chunk) {
        msg += chunk.toString('utf-8').toLowerCase();
    });

    list.on('exit', function() {
        var found = false;
        msg.split(/[\r\n]+/).forEach(function(item){
            var reg = new RegExp('\\b'+opt['process']+'(?:js)?\\b', 'i');
            if (reg.test(item)) {
                var iMatch = item.match(/\d+/);
                if (iMatch && iMatch[0] == pid) {
                    found = true;

                }
            }
        });

        callback(found);
    });

    list.on('error', function (e) {
        if (isWin) {
            fis.log.error('fail to execute `tasklist` command, please add your system path (eg: C:\\Windows\\system32, you should replace `C` with your system disk) in %PATH%');
        } else {
            fis.log.error('fail to execute `ps` command.');
        }
    });
}

//server stop
exports.stop = function(callback) {
    var tmp = _.getPidFile();
    var isWin = fis.util.isWin();

    //read option
    var opt = option();
    if (fis.util.exists(tmp)) {
        var pid = fis.util.fs.readFileSync(tmp, 'utf8').trim();

        checkPid(pid, opt, function(exists) {
            if (exists) {

                if (isWin) {
                    // windows 貌似没有 gracefully 关闭。
                    // 用 process.kill 会遇到进程关不了的情况，没有 exit 事件响应，原因不明！
                    require('child_process').exec('taskkill /PID ' + pid + ' /T /F');
                } else {
                    // try to gracefully kill it.
                    process.kill(pid, 'SIGTERM');
                }

                // checkout it every half second.
                (function(done) {
                    var start = Date.now();
                    var timer = setTimeout(function() {
                        var fn = arguments.callee;

                        checkPid(pid, opt, function(exists) {
                            if (exists) {
                                // 实在关不了，那就野蛮的关了它。
                                if (Date.now() - start > 5000) {
                                    try {
                                        isWin ?
                                            require('child_process').exec('taskkill /PID ' + pid + ' /T /F') :
                                            process.kill(pid, 'SIGKILL');
                                    } catch(e) {

                                    }
                                    clearTimeout(timer);
                                    done();
                                    return;
                                }
                                timer = setTimeout(fn, 500);
                            } else {
                                done();
                            }
                        });
                    }, 20);
                })(function() {
                    process.stdout.write('shutdown '+opt['process']+' process [' + pid + ']\n');
                    fis.util.fs.unlinkSync(tmp);
                    callback && callback(opt);
                })
            } else {
                callback && callback(opt);
            }
        });


    } else {
        if (callback) {
            callback(opt);
        }
    }
};

//server info
exports.info = function() {
    var conf = _.getRCFile();
    if(fis.util.isFile(conf)){
        conf = fis.util.readJSON(conf);
        _.printObject(conf);
    } else {
        console.log('nothing...');
    }
};

//server open document directory
exports.open = function(root) {
    var conf = _.getRCFile();
    if(fis.util.isFile(conf)){
        conf = fis.util.readJSON(conf);
        if(fis.util.isDir(conf.root)){
            _.open(conf.root);
        }
    } else {
        _.open(root);
    }
};

function option(opt) {
    var tmp = _.getRCFile();
    if(opt){
        fis.util.write(tmp, JSON.stringify(opt));
    } else {
        if(fis.util.exists(tmp)){
            opt = fis.util.readJSON(tmp);
        } else {
            opt = {};
        }
    }
    return opt;
}

function checkStart(opt) {
    checkJavaEnable(opt, function(java, opt) {
        if (!java) {
            //node
            if (!opt['type']) {
                process.stdout.write('To start the node server will');
                startNode(opt);
            }

        } else {
            checkPHPEnable(opt, function(php, opt) {
                if (php) {
                    //php
                    java_handle.run(opt);
                } else {
                    //java
                    delete opt.php_exec;
                    java_handle.run(opt);
                }
            });
        }
    })
}

function startPHP(opt) {
    checkJavaEnable(opt, function(java, opt) {
        if (java) {
            checkPHPEnable(opt, function(php, opt) {
                if (php) {
                    java_handle.run(opt);
                }
            });
        }
    })
}

function startJava(opt) {
    checkJavaEnable(opt, function(java, opt) {
        if (java) {
            //java
            delete opt.php_exec;
            java_handle.run(opt);
        }
    })
}

function startNode(opt) {
    opt['process'] = 'node';
    delete opt['php_exec'];
    opt = option(opt);
    require('./node.js').run(opt);
}

function checkJavaEnable(opt, callback) {
    var javaVersion = false;
    //check java
    process.stdout.write('checking java support : ');
    var java = spawn('java', ['-version']);

    java.stderr.on('data', function(data){
        if(!javaVersion){
            javaVersion = _.matchVersion(data.toString('utf8'));
            if(javaVersion) {
                process.stdout.write('v' + javaVersion + '\n');
            }
        }
    });

    java.on('error', function(err){
        process.stdout.write('java not support!');
        fis.log.warning(err);
        callback(javaVersion, opt);
    });

    java.on('exit', function() {
        if (!javaVersion) {
            process.stdout.write('java not support!');
        } else {
            opt['process'] = 'java';
            opt = option(opt); // rewrite opt
        }
        callback(javaVersion, opt);
    });
}

function checkPHPEnable(opt, callback) {
    var check = function(data){
        if(!phpVersion){
            phpVersion = _.matchVersion(data.toString('utf8'));
            if(phpVersion){
                process.stdout.write('v' + phpVersion + '\n');
            }
        }
    };
    //check php-cgi
    process.stdout.write('checking php-cgi support : ');
    var php = spawn(opt.php_exec, ['--version']);
    var phpVersion = false;
    php.stdout.on('data', check);
    php.stderr.on('data', check);
    php.on('error', function(){
        process.stdout.write('unsupported php-cgi environment\n');
        // fis.log.notice('launching java server.');
        delete opt.php_exec;
        callback(phpVersion, opt);
    });
    php.on('exit', function() {
        callback(phpVersion, opt);
    })
}
