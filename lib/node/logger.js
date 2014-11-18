var fs = require('fs');
var util = require('util');

function Logger(filename) {
    this.writter = fs.createWriteStream(filename, {flags: 'a'});
}

Logger.prototype.write = function() {
    var str = util.format.apply(util, arguments);

    str = new Date() + ': ' + str + '\n';
    try {
        this.writter.write(str);
    } catch (e) {
        //
    }
};

Logger.prototype.takecare = function(inStream) {
    var self = this;

    inStream.on('data', function(chunk) {
        self.write(chunk.toString().trim());
    });
};

module.exports = function(filename) {
    return new Logger(filename);
};