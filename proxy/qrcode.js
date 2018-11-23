/**
 * Created by youngs1 on 7/21/16.
 */
var http            = require('http');
var fs              = require("fs");
var request         = require('request');
var readLine        = require("lei-stream").readLine;
var mongoose        = require('mongoose');

var config          = require('../config');
var Logs            = require('./logs');
var Apply           = require('./qrcode_apply');
var Category        = require('./category');
var models          = require('../models');
var logger          = require('../common/logger');
var QRCode          = models.QRCode;


exports.Apply = function (url, isGDT, callback) {
    if(isGDT){
        ApplyByGDT(url, function (err , dlinfo) {
            if(err){
                return callback(err, dlinfo);
            }
            logger.debug(dlinfo);
            if(dlinfo.indexOf('html')>=0){
                return callback(err, JSON.stringify({
                    message: 'Could not connect to HTTP'
                }));
            }else{
                dlinfo = JSON.parse(dlinfo);
                if(dlinfo.status == 0){
                    dlinfo.status = 200;
                    dlinfo.fileId = dlinfo.file ;
                }
                return callback(err, JSON.stringify(dlinfo));
            }
        });
    }else {
        ApplyNormal(url, callback);
    }
};

function ApplyNormal(url, callback) {
    //http://www.iotroot.com/general/Ecode/usr=hxrd/pwd=ecode8570/numb=?/generalId=?
    //0.http: 1.  2.www.iotroot.com  3.general  4.Ecode  5.usr=hxrd  6.pwd=ecode8570  7.numb= 8.generalId=
    var dlcount = url.split('/')[7];
    dlcount = dlcount.substring(5, dlcount.length);
    dlcount = parseInt(dlcount);
    var maxWaitTime = config.interface_opts.Download_WaitingTime;   //分钟
    maxWaitTime = maxWaitTime * 60000;                              //转换为秒
    var timeout = dlcount>5000000?maxWaitTime:maxWaitTime/2;    //大于5百万的下载量,等待10分钟,小于5百万的量时等待5分钟
    if(dlcount <= 1000000){     //测试发现准备1百万的码只需要6s 现在设置30s的延时,主要应对批量导码的情况
        timeout = 30000;
    }
    var req = http.get(url, function (res) {
        setTimeout(function () {
            var size = 0;
            var chunks = [];
            res.on('data', function(chunk) {
                size += chunk.length;
                chunks.push(chunk);
            });
            res.on('end', function() {
                var data = Buffer.concat(chunks, size);
                return callback(null, data.toString());
            });
        }, timeout);

    }).on('error', function(e) {
        return callback(e);
    });
};

var ApplyByGDT = function (url, callback) {
    //http://api.openhema.ex:81/code/generate/ token?number=10000000
    //0.http: 1.  2.api.openhema.ex:81  3.code  4.generate  5.bc9121e1535a9d1706a51c1e32d49efa?number=1000000
    //http://api.openhema.ex/code/generate/ token?number=10000000
    //0.http: 1.  2.api.openhema.ex  3.code  4.generate  5.bc9121e1535a9d1706a51c1e32d49efa?number=1000000
    //默认下载100万码，需要等待2分钟，现在设置等待4分钟
    //100万码以下等待2分钟
    //设置一个限定值，在申请数码通类型的码时，单次最大申请量为100万，超出100万，先跳出，不然等待时间不好计算
    var hostname = url.split('/')[2];
    hostname = hostname.split(':')[0];
    var dlcount = url.split('/')[5];
    dlcount = dlcount.split('=')[1];
    var timeout = 2*60*1000;
    //var timeout = 4*60*1000;

    var options = {
        hostname: hostname,
        path: url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',

        }
    };

    var req = http.request(options, function (res) {
        setTimeout(function () {
            var size = 0;
            var chunks = [];
            res.on('data', function(chunk) {
                size += chunk.length;
                chunks.push(chunk);
            });
            res.on('end', function() {
                var data = Buffer.concat(chunks, size);
                return callback(null, data.toString());
            });
        }, timeout);
    }).on('error', function(e) {
        return callback(e.message);
    });

   // req.write(data);
    req.end();
}

exports.Download = function (url, path, callback) {
    logger.debug('================start Download==============');
    var out = fs.createWriteStream(path);
    var req = request({
        method: 'GET',
        uri: url
    });
    req.pipe(out);
    req.on('end', function() {
        logger.debug('=====================end==================');
        return callback(null);
    });

    req.on('error', function(e) {
        return callback(e);
    });
};

exports.Import = function (file, categoryId, isGDT, QRCodeCount, orderId, shardkey, callback) {
    //var file = 'middlewares/data/ecode/81984635c5174ced83923b880643f47e';
    var counter = 0,
        importCount = 0;
    var startTime = Date.now();
    var batch = QRCode.collection.initializeUnorderedBulkOp();
    var url = '';
    var firstContent = '';
    logger.debug('---------------qrcodecount:'+QRCodeCount+'-----------------')

    readLine(file).go(function (data, next) {
        // 不在关心 url问题， 直接将整行信息 插入数据库中
        // 判断一下，如果是数码通类型的，就必须包含url，如果不包含，跳过， 读取下一行
        if(isGDT && data.indexOf('/')<0){
            next();
        }

        if (data.length < 24) {     //太短，不符合二维码格式要求
            next();
        }
        data = data.replace('\r','');
        counter++;

        data = data.split(',');

        if(QRCodeCount == 1){
            batch.insert({
                //batch.find({ content: data }).upsert().updateOne({
                categoryId: mongoose.Types.ObjectId(categoryId),
                content: data[0],
                url: url,
                state: 1,
                orderId: parseInt(orderId.split('-')[0]),
                distribution: shardkey
            });
        }else{
            if(data.length == 2 && data.length == 2){
                batch.insert({
                    //batch.find({ content: data }).upsert().updateOne({
                    categoryId: mongoose.Types.ObjectId(categoryId),
                    content: data[0],
                    content1: data[1],
                    url: url,
                    state: 1,
                    orderId: parseInt(orderId.split('-')[0]),
                    distribution: shardkey
                });
            }else{
                return callback('Incorrect number of qrcode in the download file', 0);
            }


        }


        if (counter % 5000 === 0) {
            var t = msToS(getSpentTime());
            var s = counter / t;
            if (!isFinite(s)) s = counter;
            batch.execute(function (err, rs) {
                if (err) {
                    //Logs.addLogs('system', 'Import Code is err: ' + err, 'system', 2);
                    logger.debug('Insert to DB is err: ' + err);
                    Logs.addLogs('system', 'Insert to DB is err: '+ err, 'system', 2);
                }
                importCount = importCount + rs.nInserted;
                logger.debug('Insert %s lines, speed: %sL/S', counter, s.toFixed(0));
                batch = QRCode.collection.initializeUnorderedBulkOp();
                next();
            });
        } else {
            next();
        }
    }, function () {
        var t = msToS(getSpentTime());
        var s = counter / t;
        if (!isFinite(s)) s = counter;
        if (counter % 5000 != 0) {
            batch.execute(function(err, rs) {
                if (err) {
                    logger.debug('Insert to DB is err: '+ err);
                    Logs.addLogs('system', 'Insert to DB is err: '+ err, 'system', 2);
                }
                importCount = importCount + rs.nInserted;
                logger.debug('Complete Insert. Count is '+ importCount);
                logger.debug('----------------['+ msToS(getSpentTime()) +']End Import----------------');
                batch = null;
                return callback(null, importCount);
            });
        }else{
            logger.debug('Complete Insert. Count is '+ importCount);
            logger.debug('----------------['+ msToS(getSpentTime()) +']End Import----------------');
            return callback(null, importCount);
        }

    });
    function msToS (v) {
        return parseInt(v / 1000, 10);
    }

    function getSpentTime () {
        return Date.now() - startTime;
    }
};

exports.getQRCodeByQuery = function (query, opt, callback) {
    QRCode.find(query, '', opt, callback);
};

exports.getQRCodeById = function (id, callback) {
    if (!id) {
        return callback();
    }
    QRCode.findOne({_id: id}, callback);
};

exports.getQRCodeByCode = function (code, callback) {
    if (!code) {
        return callback();
    }
    if(code.indexOf('/')>=0){
        var tmpcode = code.slice(code.lastIndexOf('/')+1, code.length);
        tmpcode = tmpcode.replace('?E=', '');
        QRCode.findOne({$or:[{content: {$in:[code, tmpcode]}}, {content1: {$in:[code, tmpcode]}}]}, callback);
    }else{
        QRCode.findOne({$or:[{content: code},{content1: code}]}, callback);
    }

};
exports.getQRCodeByCodeArray = function (codes, callback) {
    QRCode.findOne({$or: [{content: {$in: codes}}, {content1: {$in: codes}}]}, callback);
    //QRCode.findOne({content: {$in: codes}}, callback);
};

exports.getQRCodeBySerial = function (serNum, callback) {
    if (!serNum) {
        return callback();
    }
    QRCode.findOne({serialNum: serNum}, callback);
};

exports.getCountByQuery = function (query, callback) {
    QRCode.count(query, callback);
};

exports.getCount = function (query, index, callback) {
    QRCode.count(query, callback);
};