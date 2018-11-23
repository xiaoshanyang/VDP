/**
 * Created by lxrent on 16/10/20.
 */

var FS          = require('fs');
var logger      = require('../common/logger');
var Logs        = require('../proxy').Logs;
var EventProxy  = require('eventproxy');
var QRcode      = require('../proxy').QRCode;

exports.getReport = function () {
    logger.debug('-----------------Start Task: [Task-GetReportData] -----------------');
    var reportfilePath = 'public/report/data.json';
    var data=FS.readFileSync(reportfilePath,"utf-8");
    data = JSON.parse(data);

    var ep = new EventProxy();
    ep.fail(function(err) {
        Logs.addLogs('system', '[Task-GetReportData] fail.  ERROR: '+ err, 'system', '2');
        return logger.error('[Task-GetReportData] fail.  ERROR: '+ err);
    });
    var allcount=0,
        activecount=0,
        printingcount=0,
        printedcount=0,
        cannedcount=0;
    var counts = [allcount, activecount, printingcount, printedcount, cannedcount];
    var QueryAll = [];
    var state = ['', 1, 11, 111, 11111];
    state.forEach(function (s) {
        QueryAll.push({state:s});
    });
    var index = 0;
    QueryAll.forEach(function (q) {
        QRcode.getCount(q ,index, function (err, count) {
            if(err){

            }else {
                counts[index] = count;
                ep.emit('getCount');
            }
        });
        index++;
    });
    ep.after('getCount', 5, function () {
        data.Summary.allCount = counts[0];
        data.Summary.avlQRCode = counts[1];
        data.Summary.Printing = counts[2];
        data.Summary.Printed = counts[3];
        data.Summary.Canned = counts[4];
    });


};