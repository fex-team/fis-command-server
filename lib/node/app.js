
var exports = module.exports;
var send = require('send');
var url = require('url');
var fs = require('fs');


exports.statics = function (req, res, opt) {
    // your custom error-handling logic:
    function error(err) {
        res.statusCode = err.status || 500;
        res.end(err.message);
    }

    //show file list
    function listFiles() {
        var  subpath = url.parse(req.url).pathname;
        var  dir = opt['root'] + '/';
        if (subpath != '/' && subpath != '') {
            if (!/\/$/.test(subpath)) {
                subpath += '/';
            }
            dir = dir + subpath;
        }
        var files = fs.readdirSync(dir);
        var html = '<!doctype html>';
        html += '<head></head>';
        html += '<body>';
        html += '<div id="file-list">';
        html += '<ul>';
        files.forEach(function(item) {
            var s_url = subpath + item;
            html += '<li><a href="' + s_url + '">'+ s_url + '</a></li>';
        });
        html += '</ul>';
        html += '</div>';
        html += '</body>';
        html += '</html>';
        res.end(html);
    }

    send(req, url.parse(req.url).pathname)
        .root(opt['root'] + '/')
        .index(false)
        .on('error', error)
        .on('directory', listFiles)
        .pipe(res);
};