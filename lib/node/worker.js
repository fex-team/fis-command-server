var Socket = require('net').Socket;
var http = require('http');
var _ = require('../util.js');

var www_root;
var server = http.createServer(function(req, res){
    res.setHeader('connection', 'close');
    res.setHeader('Server', '[oo] fis.baidu.com');
    //run default script
    var argv = _.parseArgs(process.argv);
    www_root = argv['root'] + '/';
    if (argv['rewrite'] != 'true') {
        var app = require('./app.js');
        //static
        app.statics(req, res, argv);
    } else {
        var index = www_root + '/' + (argv['script'] || 'index.js');
        require(index)(req, res);
    }
});

process.on('message', function(message, handle){
    if(handle){
        var socket = new Socket({
            handle : handle,
            allowHalfOpen : server.allowHalfOpen
        });
        socket.readable = socket.writable = true;
        socket.resume();
        socket.server = server;
        socket.on('close', function() {
            process.disconnect();
            process.exit();
        });
        server.emit('connection', socket);
        socket.emit('connect');
    }
});
