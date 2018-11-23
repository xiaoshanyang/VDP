/**
 * Created by lxrent on 2016/11/29.
 */
/**
 * Created by youngs1 on 7/2/16.
 */
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

var QRCode          = mongoose.model('QRCode');
var Order           = mongoose.model('Order');

var sum = 0;
var fileList = [];
//fileList.push('F2A-12159-104020_0444_01-1100901295-20160725-1-New.txt');
//fileList.push('F2A-12160-104020_0441_03-1100901284-20160725-1-New.txt');
//fileList.push('F2A-12161-104020_0448_01-1100901289-20160725-1-New.txt');
//fileList.push('F2A-12162-104020_0447_01-1100901288-20160725-1-New.txt');
//fileList.push('F2A-12162-104020_0447_01-1100901288-20160725-2-New.txt');

//fileList.push('F1C-50303-104020_0440_01-1100901236-20160721-1-New.txt');
//fileList.push('F1C-50303-104020_0440_01-1100901236-20160721-2-New.txt');
//fileList.push('F1C-50303-104020_0440_01-1100901236-20160721-3-New.txt');
//fileList.push('F1C-50307-104020_0463_02-1100901208-20160723-1-New.txt');
//fileList.push('F1C-50307-104020_0463_02-1100901208-20160723-2-New.txt');
//fileList.push('F1C-50307-104020_0463_02-1100901208-20160723-3-New.txt');
//fileList.push('F1C-50308-104020_0464_02-1100901209-20160723-1-New.txt');
//fileList.push('F1C-50308-104020_0464_02-1100901209-20160723-2-New.txt');
//fileList.push('F1C-50309-104020_0441_03-1100901284-20160723-1-New.txt');
//fileList.push('F1C-50310-104020_0443_03-1100901270-20160723-1-New.txt');
//fileList.push('F1C-50311-104020_0438_01-1100901235-20160723-1-New.txt');
//fileList.push('F1C-50311-104020_0438_01-1100901235-20160723-2-New.txt');
//fileList.push('F1C-50311-104020_0438_01-1100901235-20160723-3-New.txt');
//fileList.push('F1C-50312-104020_0438_01-1100901235-20160723-1-New.txt');
//fileList.push('F1C-50312-104020_0438_01-1100901235-20160723-2-New.txt');
//fileList.push('F1C-50312-104020_0438_01-1100901235-20160723-3-New.txt');
//fileList.push('F1C-50313-104020_0440_01-1100901236-20160723-1-New.txt');
//fileList.push('F1C-50313-104020_0440_01-1100901236-20160723-2-New.txt');
//fileList.push('F1C-50313-104020_0440_01-1100901236-20160723-3-New.txt');
//fileList.push('F1C-50314-104020_0440_01-1100901236-20160723-1-New.txt');
//fileList.push('F1C-50314-104020_0440_01-1100901236-20160723-2-New.txt');
//fileList.push('F1C-50314-104020_0440_01-1100901236-20160723-3-New.txt');
//
//fileList.push('F1C-50365-104020_0463_02-1100901208-20160805-1.txt');
//fileList.push('F1C-50365-104020_0463_02-1100901208-20160805-2.txt');

//var order = new Order();
//order.saleNum = "123456";
//order.orderId = 50256;
//order.customerCode = "104020";
//order.productCode = "1100901180";
//order.vdpType = 0;
//order.codeURL = "http://ssr-cp.mengniu.com.cn";
//order.planCount = 3600000;
//order.multipleNum = "1";
//order.splitSpec = 18;
//order.designId = "104020_0450_02";
//order.customerOrderNum = "654321";
//order.vdpVersion = "001";
//order.orderNum = "1";
//order.factoryCode = "F1C";
//order.lineCode = "2";
//order.webNum = 6;
//order.categoryId = "57ad725f873b867e06bd7d9a";
//order.actCount = 3600000;
//order.state = 11;
//order.fileList = [{
//    "fileName": "F1C-50365-104020_0463_02-1100901208-20160805-1",
//    "fileRows": 180000 }, {
//    "fileName": "F1C-50365-104020_0463_02-1100901208-20160805-2",
//    "fileRows": 180000 }];
//order.save();
//console.log('inserted order to mongodb');
//return false;

// 源清历史品类：57ad725f873b867e06bd7d9a
// 源清历史准生产：57b02b3dba837fc703bd1b4c
var categoryId = '57b02b3dba837fc703bd1b4c';
var startTime = Date.now();
function msToS (v) {
    return parseInt(v / 1000, 10);
}

function getSpentTime () {
    return Date.now() - startTime;
}

console.log('----------------Start Import: '+ fileList.length +' files----------------');

fileList.forEach(function (e) {
    sum++;
    var fileName = e;
    fileName = fileName.split('/');
    fileName = fileName[fileName.length - 1];
    var strFileName = fileName.split('-');
    var factoryCode = strFileName[0];
    var ordreId = strFileName[1];
    var designId = strFileName[2];
    var Docs = [];
    var docNum = 0;
    var startSerial = 1;
    var counter = 0;
    var errNum = 0;
    console.log('--------File is '+ sum +'--------');
    console.log('FileName: '+ fileName);
    console.log('CategoryId: '+ categoryId);
    console.log('FactoryCode: '+ factoryCode);
    console.log('OrderId: '+ ordreId);
    console.log('DesignId: '+ designId);
    // 读取最大序列号
    var query = {};
    query.categoryId = categoryId;
    var options = { limit: 1, sort: '-serialNum'};


        readLine(e).go(function (data, next) {
            counter++;
            var arrData = data.split('=');
            var strData = arrData[1];
            if (strData.indexOf('\r') > 0) {
                strData = strData.replace('\r','');
            }
            Docs[docNum] = {
                categoryId: categoryId,
                content: strData,
                //serialNum: eval(startSerial++),
                //orderId: ordreId,
                //state: 11
                state:1
            };

            if (counter % 100000 === 0) {
                var t = msToS(getSpentTime());
                var s = counter / t;
                if (!isFinite(s)) s = counter;
                console.log('Insert %s lines, speed: %sL/S', counter, s.toFixed(0));
            }

            // 每读取500行记录写入数据库一次
            if (counter % 500 == 0) {
                QRCode.insertMany(Docs, function (err) {
                    if (err) {
                        console.log('Insert Code Error. File: '+ fileName +', Rows: '+ counter +', ERR: ' + err);
                        errNum++;
                    }
                });
                Docs.length = 0;
                docNum = 0;
                next();
            } else {
                docNum++;
                next();
            }

        }, function (e) {

            // 文件读取结束。将继续写完。
            if (Docs.length > 0 ) {
                QRCode.insertMany(Docs, function (err) {
                    if (err) {
                        console.log('Insert Code Error. File: '+ fileName +', Rows: '+ counter +', ERR: ' + err);
                        errNum++;
                    }
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
            console.log('----------------['+ msToS(getSpentTime()) +']End Import: '+ sum +' files----------------');
        });

});


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
