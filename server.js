/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

var server = require('./lib/server.js');

exports.name = 'server';
exports.usage = '<command> [options]';
exports.desc = 'launch a php-cgi server';
exports.register = function(commander) {
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
    
    var serverRoot = (function(){
        var key = 'FIS_SERVER_DOCUMENT_ROOT';
        if(process.env && process.env[key]){
            var path = process.env[key];
            if(fis.util.exists(path) && !fis.util.isDir(path)){
                fis.log.error('invalid environment variable [' + key + '] of document root [' + path + ']');
            }
            return path;
        } else {
            return fis.project.getTempPath('www');
        }
    })();
    
    commander
        .option('-p, --port <int>', 'server listen port', parseInt, 8080)
        .option('--root <path>', 'document root', getRoot, serverRoot)
        .option('--no-rewrite', 'disable rewrite feature', Boolean, !fis.config.get('server.rewrite'))
        .option('--script <name>', 'rewrite entry file name', String)
        .option('--repos <url>', 'install repository', String)
        .option('--timeout <seconds>', 'start timeout', parseInt, 15)
        .option('--php_exec <path>', 'path to php-cgi executable file', String, 'php-cgi')
        .option('--php_exec_args <args>', 'php-cgi arguments', String)
        .option('--php_fcgi_children <int>', 'the number of php-cgi processes', parseInt)
        .option('--php_fcgi_max_requests <int>', 'the max number of requests', parseInt)
        .option('--type <type>', '', String)
        .option('--include <glob>', 'clean include filter', String, fis.config.get('server.clean.include'))
        .option('--exclude <glob>', 'clean exclude filter', String, fis.config.get('server.clean.exclude'))
        .action(function(){
            var args = Array.prototype.slice.call(arguments);
            var options = args.pop();
            var cmd = args.shift();
            var root = options.root;

            if(root){
                if(fis.util.exists(root) && !fis.util.isDir(root)){
                    fis.log.error('invalid document root [' + root + ']');
                } else {
                    fis.util.mkdir(root);
                }
            } else {
                fis.log.error('missing document root');
            }
            
            switch (cmd){
                case 'start':
                    var opt = {};
                    fis.util.map(options, function(key, value){
                        if(typeof value !== 'object' && key[0] !== '_'){
                            opt[key] = value;
                        }
                    });
                    server.stop(function() {
                        server.start(opt);
                    });
                    break;
                case 'stop':
                    server.stop(function() {

                    });
                    break;
                case 'restart':
                    server.stop(server.start);
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
                    server.info();
                    break;
                case 'open':
                    server.open();
                    break;
                case 'clean':
                    process.stdout.write(' δ '.bold.yellow);
                    var now = Date.now();
                    var include = options.include ? fis.util.glob(root + '/' + options.include) : null;
                    var exclude = options.exclude ? fis.util.glob(root + '/' + options.exclude) : /\/WEB-INF\//;
                    fis.util.del(root, include, exclude);
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