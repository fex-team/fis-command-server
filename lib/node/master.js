var child_process = require('child_process');
var TCP = process.binding('tcp_wrap').TCP;
var _ = require('../util.js');

var MAX_WORKERS = 10;
var WORKER_PATH = __dirname + '/worker.js';
var GRACE_EXIT_TIME = 2000;//2s

var server;

var timer;
function destroy(){
    if(timer) return;
    server.close();
    workers.forEach(function(worker){
        worker.kill();
    });
    timer = setTimeout(function(){
        process.exit(0);
    }, GRACE_EXIT_TIME);
}

var handles = [];
function send(handle){
    if(workers.length){
        var worker = workers.shift();
        worker.send({'handle' : true}, handle);
        //handle.close();
    } else {
        handles.push(handle);
    }
}

var workers = [];

function create(opt){
    if(timer) return;
    var worker = child_process.fork(WORKER_PATH, opt, {cwd : __dirname, detached: true});
    worker.on('exit', function() {
        create(opt);
    });
    workers.push(worker);
    if(handles.length){
        send(handles.shift());
    }
}

function createWorker(script) {
    for(var i = 0; i < MAX_WORKERS; i++){
        create(script);
    }
}

function createServer() {
    var argv = _.parseArgs(process.argv);
    var host = argv['host'] || '0.0.0.0';
    var port = argv['port'] || '8080';
    var BACK_LOG = 128;
    //create worker
    createWorker(process.argv.slice(2));
    server = new TCP;
    server.bind(host, port);
    server.onconnection = send;
    server.listen(BACK_LOG);
    process.stderr.write('[oo] master is running...\n');
    process.on('SIGINT' , destroy);
    process.on('SIGTERM' , destroy);
}

try {
    //main
    createServer();
} catch (e) {
    process.stderr.write('[oo] Exception\n' + e.toString());
}
