var readLine        = require("lei-stream").readLine;
var mongoose        = require('mongoose');
var config          = require('../config');

mongoose.connect(config.db.uri, config.db.options, function (err) {
    if (err) {
        console.log('connect to %s error: ', config.db, err.message);
        process.exit(1);
    }
});

require('../models/qrcode');
require('../models/order');

var QRCode = mongoose.model('QRCode');
var Order = mongoose.model('Order');

var categoryId = '57b02b3dba837fc703bd1b4c',
    startTime = Date.now(),
    fileList = [];
fileList.push('Z1A-12159-104020_0444_01-1100901295-20160725-3-New.json');
var fileName = fileList[0],
    strFileName = fileName.split('-'),
    factoryCode = strFileName[0],
    ordreId = strFileName[1],
    designId = strFileName[2],
    startSerial = 1,
    counter = 0,
    errNum = 0,
    insertedIds = [];
console.log('FileName: '+ fileName);
console.log('CategoryId: '+ categoryId);
console.log('FactoryCode: '+ factoryCode);
console.log('OrderId: '+ ordreId);
console.log('DesignId: '+ designId);
// 读取最大序列号
var query = {};
query.categoryId = categoryId;
var options = { limit: 1, sort: '-serialNum'};

QRCode.find(query, '', options, function (err, maxSN) {
    if (err) {
        console.log('Get Max SN is err: '+ err);
    }
    console.log('maxSN: '+ JSON.stringify(maxSN));
    // 获取品类最大序列号，默认0
    if (maxSN != null) {
        if (maxSN.length > 0) {
            for (var k in maxSN) {
                startSerial = maxSN[k].serialNum + 1;
            }
        }
    }
    console.log('SN: '+ startSerial);
    var batch = QRCode.collection.initializeOrderedBulkOp();
    readLine(fileName).go(function (data, next) {
        //batch.insert({
        batch.find({ content: data }).upsert().updateOne({
            categoryId: categoryId,
            content: data,
            serialNum: eval(startSerial++),
            orderId: ordreId,
            state: 1
        });
        counter++;
        if (counter % 50000 === 0) {
            var t = msToS(getSpentTime());
            var s = counter / t;
            if (!isFinite(s)) s = counter;
            console.log('Insert %s lines, speed: %sL/S', counter, s.toFixed(0));
            batch.execute(function(err, result) {
                //insertedIds = getInsertedIds(result);
                batch = QRCode.collection.initializeOrderedBulkOp();
                next();
            });
        } else {
            next();
        }
    }, function (e) {
        if (counter % 50000 != 0) {
            batch.execute(function(err, result) {
                //insertedIds = insertedIds.concat(getInsertedIds(result));
            });
        }
        var t = msToS(getSpentTime());
        var s = counter / t;
        if (!isFinite(s)) s = counter;
        console.log('read %s lines, speed: %sL/S', counter, s.toFixed(0));
        console.log('Counter: '+ counter);
        console.log('importRows: '+ eval(counter - errNum));
        console.log('errNum: '+ errNum);
        console.log('startNum: '+ eval(startSerial - counter));
        console.log('endNum: '+ eval(startSerial-1));
        console.log('----------------['+ msToS(getSpentTime()) +']End Import----------------');
    });
});

function getInsertedIds(result){
    var ids = result.getUpsertedIds();
    //console.log(ids); // an array of upserted ids
    return ids;
}

function msToS (v) {
    return parseInt(v / 1000, 10);
}

function getSpentTime () {
    return Date.now() - startTime;
}

function randomString(len) {
    len = len || 32;
    var $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';    /****默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1****/
    var maxPos = $chars.length;
    var pwd = '';
    for (i = 0; i < len; i++) {
        pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
    }
    return pwd;
}