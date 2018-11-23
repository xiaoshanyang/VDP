var cache       = require('../common/cache');
var tools       = require('../common/tools');
var fs          = require('fs');
var http        = require('http');
var request     = require('request');

var newtest = function () {
    var filename = 'bin/476';
    fs.stat(filename, function (err, stats) {
        if(err){
            console.log(err);
        }
        console.log(stats);
        if(stats.size){
            tools.unzip(filename, 'bin/', function (err, file) {
                if(err){
                    console.log(err);
                }else{
                    console.log(file);
                }
            });
        }
    });

}

var download = function () {
    var url = 'http://api.openhema.com/code/download/750ae6d751ae2481f5b5ce54536b85d8?file=764';
    var path = 'bin/476';
    var out = fs.createWriteStream(path);

    var req = request({
        method: 'GET',
        uri: url
    });
    req.pipe(out);
    req.on('end', function() {
        newtest();
    });

    req.on('error', function(e) {
        console.log(e);
    });
}


newtest();
//download();