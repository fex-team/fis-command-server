/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

var fs = require('fs');
var tmp_dir = (function(){
    var list = ['LOCALAPPDATA', 'APPDATA', 'HOME'], tmp;
    for(var i = 0, len = list.length; i < len; i++){
        if(tmp = process.env[list[i]]){
            break;
        }
    }
    if(tmp){
        tmp += '/.fis-tmp';
        if(!fs.existsSync(tmp)){
            fs.mkdirSync(tmp);
        }
        tmp += '/server';
        if(!fs.existsSync(tmp)){
            fs.mkdirSync(tmp);
        }
    } else {
        tmp = __dirname;
    }
    if(fs.statSync(tmp).isDirectory()){
        return tmp;
    }
})();

function log(buffer){
    var log = fs.openSync(tmp_dir + '/log.txt', 'a+');
    fs.writeSync(log, buffer, 0, buffer.length);
    fs.closeSync(log);
}

if(tmp_dir){
    var args = ['-jar', 'client/client.jar'].concat(process.argv.splice(2));
    var spawn = require('child_process').spawn;
    var server = spawn('java', args, { cwd : __dirname });
    
    server.stderr.on('data', function(chunk){
        log(chunk);
    });
    
    server.stdout.on('data', function(chunk){
        log(chunk);
    });
    
    server.on('error', function(err){
        log(err.message);
    });
    
    
    fs.writeFileSync(tmp_dir + '/pid', process.pid + ',' + server.pid);
}
