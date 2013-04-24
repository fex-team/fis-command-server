/*
 * fis
 * http://web.baidu.com/
 */

'use strict';

var TIMEOUT = 20000;

exports.name = 'server';
exports.usage = '<command> [options]';
exports.desc = 'launch a php-cgi server';
exports.register = function(commander){
    
    var child_process = require('child_process');
    var spawn = child_process.spawn;
    
    function getConf(){
        return fis.project.getTempPath('server/conf.json');
    }
    
    function stop(callback){
        //del log file
        var log = fis.util(__dirname, 'log.txt');
        if(fis.util.exists(log)){
            fis.util.fs.unlinkSync(log);
        }
        var tmp = fis.util(__dirname, 'pid');
        if(fis.util.exists(tmp)){
            var pid = fis.util.fs.readFileSync(tmp, 'utf8').trim().split(/\s*,\s*/);
            var list, msg = '';
            var isWin = fis.util.isWin();
            if(isWin){
                list = spawn('tasklist');
            } else {
                list = spawn('ps');
            }
            list.stdout.on('data', function(chunk){
                msg += chunk.toString('utf8').toLowerCase();
            });
            list.on('exit', function(){
                var names = {
                    'node' : 0,
                    'java' : 1
                };
                msg.split(/[\r\n]+/).forEach(function(item){
                    var match = item.match(/\b(node|java)\b/i);
                    if(match){
                        var iMatch = item.match(/\d+/);
                        var index = match[1].toLowerCase();
                        if(iMatch && iMatch[0] == pid[names[index]]){
                            process.kill(iMatch[0]);
                        }
                    }
                });
                fis.util.fs.unlinkSync(tmp);
                if(callback){
                    callback();
                }
            });
        } else {
            if(callback){
                callback();
            }
        }
    }
    
    function matchVersion(str){
        var version = false;
        var reg = /\b\d+(\.\d+){2}/;
        var match = str.match(reg);
        if(match){
            version = match[0];
        }
        return version;
    }
    
    function open(path){
        var cmd = fis.util.isWin() ? 'start' : 'open';
        child_process.exec(cmd + ' ' + fis.util.escapeShellArg(path));
    }
    
    function start(opt){
        var tmp = getConf();
        if(opt){
            fis.util.write(tmp, JSON.stringify(opt));
        } else {
            if(fis.util.exists(tmp)){
                opt = fis.util.readJSON(tmp);
            } else {
                opt = {};
            }
        }
        
        if(opt.root){
            if(fis.util.exists(opt.root)){
                if(!fis.util.isDir(opt.root)){
                    fis.log.error('document root [' + opt.root + '] is not a directory');
                }
            } else {
                fis.util.mkdir(opt.root);
            }
        } else {
            fis.log.error('invalid document root');
        }
        
        //check java
        process.stdout.write('checking java support : ');
        var java = spawn('java', ['-version']);
        var javaVersion = false;
        java.stderr.on('data', function(data){
            if(!javaVersion){
                javaVersion = matchVersion(data.toString('utf8'));
                if(javaVersion){
                    process.stdout.write('version ' + javaVersion + '\n');
                }
            }
        });
        java.on('error', function(err){
            fis.log.error(err);
        });
        java.on('exit', function(){
            if(javaVersion){
                //check php-cgi
                process.stdout.write('checking php-cgi support : ');
                var php = spawn(opt['php_exec'] ? opt['php_exec'] : 'php-cgi', ['-v']);
                var phpVersion = false;
                php.stdout.on('data', function(data){
                    if(!phpVersion){
                        phpVersion = matchVersion(data.toString('utf8'));
                        if(phpVersion){
                            process.stdout.write('version ' + phpVersion + '\n');
                        }
                    }
                });
                php.on('error', function(err){
                    fis.log.error(err);
                });
                php.on('exit', function(){
                    if(phpVersion){
                        fis.log.debug('document root [' + opt.root + ']');
                        process.stdout.write('starting fis-server on port : ');
                        var cmd = [
                            fis.util.escapeShellArg(process.execPath),
                            fis.util.escapeShellArg(fis.util(__dirname, 'child.js'))
                        ].join(' ');
                        fis.util.map(opt, function(key, value){
                            if(typeof value === 'string'){
                                value = fis.util.escapeShellArg(value);
                            }
                            cmd += ' --' + key + ' ' + value;
                        });
                        var log = fis.util(__dirname, '/log.txt');
                        fis.util.write(log, '');
                        var lastModified = fis.util.mtime(log).getTime();
                        var startTime = (new Date).getTime();
                        var lastIndex = 0;
                        var errMsg = 'server fails to start at port [' + opt.port + '], error: ';
                        fis.util.nohup(cmd, { cwd : __dirname });
                        var timer = setInterval(function(){
                            if((new Date).getTime() - startTime < TIMEOUT){
                                var mtime = fis.util.mtime(log).getTime();
                                if(lastModified !== mtime){
                                    lastModified = mtime;
                                    var content = fis.util.fs.readFileSync(log).toString('utf8').substring(lastIndex);
                                    lastIndex += content.length;
                                    if(content.indexOf('Started SelectChannelConnector@') > 0){
                                        clearInterval(timer);
                                        process.stdout.write(opt.port + '\n');
                                        open('http://localhost' + (opt.port == 80 ? '/' : ':' + opt.port + '/'));
                                    } else if(content.indexOf('Exception:') > 0) {
                                        clearInterval(timer);
                                        var match = content.match(/exception:\s+([^\r\n:]+)/i);
                                        if(match){
                                            errMsg += match[1];
                                        } else {
                                            errMsg += 'unknown';
                                        }
                                        process.stdout.write('\n');
                                        fis.log.error(errMsg);
                                    }
                                }
                            } else {
                                process.stdout.write('\n');
                                fis.log.error(errMsg + 'timeout');
                            }
                        }, 200);
                    } else {
                        fis.log.error('unsupported php-cgi environment');
                    }
                });
            } else {
                fis.log.error('unsupported java environment');
            }
        });
    }
    
    function getRoot(root){
        if(fis.util.exists(root)){
            if(!fis.util.isDir(root)){
                fis.log.error('invalid document root');
            }
        } else {
            fis.util.mkdir(root);
        }
        return fis.util.realpath(root);
    }
    
    function printObj(obj, prefix){
        prefix = prefix || '';
        for(var key in obj){
            if(obj.hasOwnProperty(key)){
                if(typeof obj[key] === 'object'){
                    printObj(obj[key], prefix + key + '.');
                } else {
                    console.log(prefix + key + '=' + obj[key]);
                }
            }
        }
    }
    
    commander
        .option('-p, --port <int>', 'server listen port', parseInt, 8080)
        .option('--root <path>', 'document root', getRoot, fis.project.getTempPath('www'))
        .option('--script <name>', 'rewrite entry file name', String)
        .option('--php_exec <path>', 'path to php-cgi executable file', String)
        .option('--php_exec_args <args>', 'php-cgi arguments', String)
        .option('--php_fcgi_children <int>', 'the number of php-cgi processes', parseInt)
        .option('--php_fcgi_max_requests <int>', 'the max number of requests', parseInt)
        .option('--no-rewrite', 'disable rewrite feature', Boolean)
        .action(function(cmd, options){
            var conf = getConf();
            switch (cmd){
                case 'start':
                    var opt = {};
                    fis.util.map(options, function(key, value){
                        if(typeof value !== 'object' && key[0] !== '_'){
                            opt[key] = value;
                        }
                    });
                    stop(function(){ start(opt); });
                    break;
                case 'stop':
                    stop();
                    break;
                case 'restart':
                    stop(start);
                    break;
                case 'install':
                    var name = options;
                    options = arguments[2];
                    if(typeof name === 'string'){
                        name = name.split('@');
                        var version = name[1] || 'latest';
                        name = name[0];
                        var remote = fis.config.get(
                            'system.repos', fis.project.DEFAULT_REMOTE_REPOS
                        ).replace(/\/$/, '');
                        var url = remote + '/' + name + '/' + version + '.tar';
                        process.stdout.write('download module [' + name + '@' + version + '] ... ');
                        fis.util.download(url, function(err){
                            if(err){
                                process.stdout.write('fail\n');
                                fis.log.error( 'unable to download module [' +
                                    name + '@' + version + '] from [' + url + '], error [' + err + ']');
                            } else {
                                process.stdout.write('ok\n');
                            }
                        }, options['root']);
                    } else {
                        fis.log.error('invalid framework name');
                    }
                    break;
                case 'info':
                    if(fis.util.isFile(conf)){
                        conf = fis.util.readJSON(conf);
                        printObj(conf);
                    } else {
                        console.log('nothing...');
                    }
                    break;
                case 'open':
                    if(fis.util.isFile(conf)){
                        conf = fis.util.readJSON(conf);
                        if(fis.util.isDir(conf.root)){
                            open(conf.root);
                        }
                    }
                    break;
                default :
                    commander.help();
            }
        });
    
    commander
        .command('start')
        .description('start server');
    
    commander
        .command('stop')
        .description('shutdown server');
    
    commander
        .command('restart')
        .description('restart server');
    
    commander
        .command('info')
        .description('output server info');
    
    commander
        .command('open')
        .description('open document root directory');
    
    commander
        .command('install <name>')
        .description('install server framework');
};