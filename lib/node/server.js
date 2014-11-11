var express = require('express');
var args = process.argv.join(' ');
var port = /\s\-\-port\s*(\d+)(?:\s|$)/.test(args) ? ~~RegExp.$1 : 8080;
var path = require('path');
var DOCUMENT_ROOT = path.resolve(/\s\-\-root\s*(\S*)(?:\s|$)/.test(args) ? RegExp.$1 : process.cwd());
var app = express();

// server.conf 功能
// 支持 test/ 目录下面 .js js 脚本功能和 json 预览功能。
// 注意这里面的.js，不是一般的.js 文件，而是相当于 express 的 route.
app.use(require('yog-devtools')({
    view_path: '',    // 避免报错。
    rewrite_file: path.join(DOCUMENT_ROOT, 'config', 'server.conf'),
    data_path: path.join(DOCUMENT_ROOT, 'test')
}));

// 静态文件列表。
app.use(require('serve-index')(DOCUMENT_ROOT, {

    // 不需要显示 /server.js
    // 不现实 node_modules 目录
    filter: function(filename, index, files, dir) {
        dir = dir.substr(DOCUMENT_ROOT.length);

        if (filename === 'server.js' && dir === '/') {
            return false;
        } else if (filename === 'node_modules') {
            return false;
        }

        return true;
    }
}));

// 静态文件输出
app.use(express.static(DOCUMENT_ROOT, {
    index: ['index.html', 'index.htm', 'default.html', 'default.htm'],
    extensions: ['html', 'htm']
}));

// 错误处理。
app.use(function(err, req, res, next) {
    console.log(err);
});

// Bind to a port
var server = app.listen(port, function() {
    console.log('Listening on http://localhost:%d', port);
});

(function() {
    var sockets = [];

    server.on('connection', function (socket) {
        sockets.push(socket);

        socket.on('close', function() {
            var idx = sockets.indexOf(socket);
            ~idx && sockets.splice(idx, 1);
        });
    });

    var finalize = function() {
        // Disconnect from cluster master
        process.disconnect && process.disconnect();
    }

    // 关掉服务。
    process.on('SIGTERM', function() {
        sockets.length ? sockets.forEach(function(socket) {
            socket.destroy();
            finalize();
        }): server.close(finalize);
    });
})(server);
