/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

exports.name = 'server';
exports.usage = '<command> [options]';
exports.desc = 'launch a php-cgi server';
exports.register = function(commander){
    
    var child_process = require('child_process');
    var spawn = child_process.spawn;
    var tmp_dir = (function(){
        var list = ['LOCALAPPDATA', 'APPDATA', 'HOME'], tmp;
        for(var i = 0, len = list.length; i < len; i++){
            if(tmp = process.env[list[i]]){
                break;
            }
        }
        if(tmp){
            tmp += '/.fis-tmp/server';
            if(!fis.util.exists(tmp)){
                fis.util.mkdir(tmp);
            }
        } else {
            tmp = __dirname;
        }
        if(fis.util.isDir(tmp)){
            return fis.util.realpath(tmp);
        } else {
            fis.log.error('invalid temp directory [' + tmp + ']');
        }
    })();
    
    function getConf(){
        return fis.project.getTempPath('server/conf.json');
    }
    
    function stop(callback){
        var tmp = tmp_dir + '/pid';
        if(fis.util.exists(tmp)){
            var pid = fis.util.fs.readFileSync(tmp, 'utf8').trim();
            var list, msg = '';
            var isWin = fis.util.isWin();
            if(isWin){
                list = spawn('tasklist');
            } else {
                list = spawn('ps', [ '-A' ]);
            }
            list.stdout.on('data', function(chunk){
                msg += chunk.toString('utf8').toLowerCase();
            });
            list.on('exit', function(){
                msg.split(/[\r\n]+/).forEach(function(item){
                    if(/\bjava\b/i.test(item)){
                        var iMatch = item.match(/\d+/);
                        if(iMatch && iMatch[0] == pid){
                            process.kill(pid, 'SIGKILL');
                            process.stdout.write('shutdown java process [' + iMatch[0] + ']\n');
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
    
    function open(path, callback){
        var cmd = fis.util.escapeShellArg(path);
        if(fis.util.isWin()){
            cmd = 'start "" ' + cmd;
        } else {
            if(process.env['XDG_SESSION_COOKIE']){
                cmd = 'xdg-open ' + cmd;
            } else if(process.env['GNOME_DESKTOP_SESSION_ID']){
                cmd = 'gnome-open ' + cmd;
            } else {
                cmd = 'open ' + cmd;
            }
        }
        child_process.exec(cmd, function(err){
            if(err){
                fis.log.notice('see [' + path + ']');
            } else if(typeof err === 'function') {
                callback();
            }
            process.exit();
        });
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
                    process.stdout.write('v' + javaVersion + '\n');
                }
            }
        });
        java.on('error', function(err){
            fis.log.error(err);
        });
        java.on('exit', function(){
            if(javaVersion){
                var check = function(data){
                    if(!phpVersion){
                        phpVersion = matchVersion(data.toString('utf8'));
                        if(phpVersion){
                            process.stdout.write('v' + phpVersion + '\n');
                        }
                    }
                };
                //check php-cgi
                process.stdout.write('checking php-cgi support : ');
                var php = spawn(opt['php_exec'] ? opt['php_exec'] : 'php-cgi', ['--version']);
                var phpVersion = false;
                php.stdout.on('data', check);
                php.stderr.on('data', check);
                php.on('error', function(err){
                    fis.log.error(err);
                });
                php.on('exit', function(){
                    if(phpVersion){
                        process.stdout.write('starting fis-server .');
                        var timeout = Math.max(opt.timeout * 1000, 5000); delete opt.timeout;
                        var errMsg = 'fis-server fails to start at port [' + opt.port + '], error: ';
                        var args = ['-jar', 'client/client.jar'];
                        var ready = false;
                        fis.util.map(opt, function(key, value){
                            args.push('--' + key, String(value));
                        });
                        var server = spawn('java', args, { cwd : __dirname, detached: true });
                        server.stderr.on('data', function(chunk){
                            if(ready) return;
                            chunk = chunk.toString('utf8');
                            process.stdout.write('.');
                            if(chunk.indexOf('Started SelectChannelConnector@') > 0){
                                ready = true;
                                process.stdout.write(' at port [' + opt.port + ']\n');
                                if(opt.rewrite){
                                    var script = fis.util(opt.root, opt.script || 'index.php');
                                    if(!fis.util.exists(script)){
                                        fis.util.copy(__dirname + '/index.php', script);
                                    }
                                }
                                setTimeout(function(){
                                    open('http://127.0.0.1' + (opt.port == 80 ? '/' : ':' + opt.port + '/'));
                                }, 200);
                            } else if(chunk.indexOf('Exception:') > 0) {
                                process.stdout.write(' fail\n');
                                try { process.kill(server.pid, 'SIGKILL'); } catch(e){}
                                var match = chunk.match(/exception:\s+([^\r\n:]+)/i);
                                if(match){
                                    errMsg += match[1];
                                } else {
                                    errMsg += 'unknown';
                                }
                                fis.log.error(errMsg);
                            }
                        });
                        server.on('error', function(err){
                            try { process.kill(server.pid, 'SIGKILL'); } catch(e){}
                            fis.log.error(err);
                        });
                        server.unref();
                        fis.util.write(tmp_dir + '/pid', server.pid);
                        setTimeout(function(){
                            process.stdout.write(' fail\n');
                            fis.log.error(errMsg + 'timeout');
                        }, timeout);
                    } else {
                        fis.log.error('unsupported php-cgi environment, using "--php_exec path/to/php-cgi" option to fix it.');
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
    
    function install(name, version, extract, remote){
        version = version === '*' ? 'latest' : ( version || 'latest' );
        var url = remote + '/server/' + name + '/' + version + '.tar';
        process.stdout.write('download module [' + name + '@' + version + '] ... ');
        fis.util.download(url, function(err){
            if(err){
                process.stdout.write('fail\n');
                fis.log.error( 'unable to download module [' +
                    name + '@' + version + '] from [' + url + '], error [' + err + ']');
            } else {
                process.stdout.write('ok\n');
                var pkg = fis.util(extract, 'package.json');
                if(fis.util.isFile(pkg)){
                    var info = fis.util.readJSON(pkg);
                    fis.util.fs.unlinkSync(pkg);
                    fis.util.map(info.dependencies || {}, function(name, version){
                        install(name, version, extract, remote);
                    });
                }
            }
        }, extract);
    }
    
    commander
        .option('-p, --port <int>', 'server listen port', parseInt, 8080)
        .option('--root <path>', 'document root', getRoot, fis.project.getTempPath('www'))
        .option('--script <name>', 'rewrite entry file name', String)
        .option('--timeout <seconds>', 'start timeout', parseInt, 15)
        .option('--php_exec <path>', 'path to php-cgi executable file', String)
        .option('--php_exec_args <args>', 'php-cgi arguments', String)
        .option('--php_fcgi_children <int>', 'the number of php-cgi processes', parseInt)
        .option('--php_fcgi_max_requests <int>', 'the max number of requests', parseInt)
        .option('--no-rewrite', 'disable rewrite feature', Boolean)
        .option('--repos <url>', 'install repository', String)
        .action(function(){
            var args = Array.prototype.slice.call(arguments);
            var options = args.pop();
            var cmd = args.shift();
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
                    var names = args.shift();
                    if(typeof names === 'string'){
                        var remote = options.repos || fis.config.get(
                            'system.repos', fis.project.DEFAULT_REMOTE_REPOS
                        ).replace(/\/$/, '') + '/server';
                        var option = {
                            extract : options['root'],
                            remote : remote
                        };
                        names.split(',').forEach(function(name){
                            name = name.split('@');
                            fis.util.install(name[0], name[1], option);
                        });
                    } else {
                        fis.log.error('invalid server component name');
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
                case 'clean':
                    process.stdout.write(' δ '.bold.yellow);
                    var now = Date.now();
                    fis.util.del(options['root'], null, /\/WEB-INF\//);
                    process.stdout.write((Date.now() - now + 'ms').green.bold);
                    process.stdout.write('\n');
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
        .command('clean')
        .description('clean files in document root');
    
    commander
        .command('install <name>')
        .description('install server framework');
};