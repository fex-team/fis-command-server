var step = require('step');
var _ = require('./util.js');
var exports = module.exports;
var child_process = require('child_process');
var spawn = child_process.spawn;
var path = require('path');
var fs = require('fs');
var tar = require('tar');

function installNpmDependencies(jsonFile, location, registry, callback) {

  console.log(registry);

  if (typeof registry === 'function') {
    callback = registry;
    registry = null;
  }

  var pkg = fis.util.readJSON(jsonFile);
  var dependencies = {};

  // concat pkg dependencies
  if (pkg.dependencies) {
    fis.util.merge(dependencies, pkg.dependencies);
  }

  // concat pkg dev dependencies
  if (pkg.devDependencies) {
    fis.util.merge(dependencies, pkg.devDependencies);
  }

  var args = ['install', '--prefix', location, '--loglevel', 'info'];

  if (registry) {
    args = args.concat(['--registry'], registry);
  }

  fis.util.map(dependencies, function(key, val) {
    args.push(key + '@' + val);
  });

  // 如果有依赖需要安装。
  if (args.length > 3) {
    process.stdout.write('Installing npm dependencies of server script.\n');
    process.stdout.write('npm ' + args.join(' '));

    var npm = process.platform === "win32" ? "npm.cmd" : "npm";
    var install = spawn(npm, args);
    install.stdout.pipe(process.stdout);
    install.stderr.pipe(process.stderr);

    install.on('error', function(reason) {
      callback(reason);
    });

    install.on('close', function() {
      callback();
    });
  }
}

function checkDeps(root) {
  var resolve = require('resolve');
  var pkgPath = path.join(root, 'package.json');

  if (fis.util.exists(pkgPath)) {
    var pkg = require(pkgPath);
    var modules = Object.keys(pkg['dependencies'] || {});
    for (var i = 0, len = modules.length; i < len; i++) {
      var moduleId = modules[i];
      try {
        var main = resolve.sync(moduleId, {
          basedir: root
        });
        require(main); //check
      } catch (e) {
        return false;
      }
    }
  } else {
    return false;
  }
  return true;
}

function extract(src, folder, callback) {
  fs
    .createReadStream(src)
    .pipe(tar.Extract({
      path: folder
    }))
    .on('error', function(err) {
      if (callback) {
        callback(err);
      } else {
        fis.log.error('extract tar file [%s] fail, error [%s]', tmp, err);
      }
    })
    .on('end', function() {
      callback && callback(null, src, folder);
    });
}


exports.run = function(opt) {
  step(
    // 检测 script 脚本
    function checkServerScript() {
      var root = opt.root;

      var script = path.join(root, 'server.js');
      var builtInScript = path.join(__dirname, 'node', 'server.js');

      if (!fis.util.exists(script)) {

        var callback = this;
        extract(path.join(__dirname, 'node', 'server.tar'), root, function() {
          if (!checkDeps(root)) {
            installNpmDependencies(path.join(root, 'package.json'), root, opt.registry, callback);
          } else {
            callback();
          }
        });
      } else if (!checkDeps(root)) {
        installNpmDependencies(path.join(root, 'package.json'), root, opt.registry, this);
      } else {
        this();
      }
    },

    // 开始 script 脚本
    function startServerScript() {
      var script = path.join(opt.root, 'server.js');
      process.stdout.write('starting fis-server .');
      var timeout = Math.max(opt.timeout * 1000, 5000);
      var timeoutTimer;
      delete opt.timeout;

      var args = [
        __dirname + '/node/boot.js'
      ];

      opt.script = script;
      fis.util.map(opt, function(key, value) {
        args.push('--' + key, String(value));
      });

      var server = spawn(process.execPath, args, {
        cwd: __dirname,
        detached: true
      });

      var log = '';
      var started = false;

      var onData = function(chunk) {
        if (started) {
          return;
        }

        chunk = chunk.toString('utf8');
        log += chunk;
        process.stdout.write('.');

        if (~chunk.indexOf('Error')) {

          process.stdout.write(' fail\n');
          try {
            process.kill(server.pid, 'SIGKILL');
          } catch (e) {}

          var match = chunk.match(/Error:?\s+([^\r\n]+)/i);
          var errMsg = 'unknown';

          if (~chunk.indexOf('EADDRINUSE')) {
            log = '';
            errMsg = 'Address already in use:' + opt.port;
          } else if (match) {
            errMsg = match[1];
          }

          log && console.log(log);
          fis.log.error(errMsg);
        } else if (~chunk.indexOf('The server is runing.')) {
          started = true;
          clearTimeout(timeoutTimer);

          server.stderr.removeListener('data', onData);
          server.stdout.removeListener('data', onData);

          process.stdout.write(' at port [' + opt.port + ']\n');

          setTimeout(function() {
            _.open('http://127.0.0.1' + (opt.port == 80 ? '/' : ':' + opt.port + '/'), function() {
              fis.log.notice('Or browse ' + ('http://' + _.hostname + (opt.port == 80 ? '/' : ':' + opt.port + '/')).yellow.bold + '\n');
              process.exit();
            });
          }, 200);
        }
      }

      server.stderr.on('data', onData);
      server.stdout.on('data', onData);

      server.on('error', function(err) {
        try {
          process.kill(server.pid, 'SIGINT');
          process.kill(server.pid, 'SIGKILL');
        } catch (e) {}
        fis.log.error(err);
      });

      // 父进程被杀时，子进程应该也被杀了。
      process.on('SIGINT', function(code) {
        try {
          process.kill(server.pid, 'SIGINT');
          process.kill(server.pid, 'SIGKILL');
        } catch (e) {}

        process.exit(1);
      });

      fis.util.write(_.getPidFile(), server.pid);
      server.unref();

      timeoutTimer = setTimeout(function() {
        process.stdout.write(' fail\n');
        if (log) console.log(log);
        fis.log.error('timeout');
      }, timeout);
    }
  );
};
