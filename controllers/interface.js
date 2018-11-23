/**
 * Created by youngs1 on 8/4/16.
 */
var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var fs              = require('fs');
var schedule        = require("node-schedule");
var soap            = require('soap');

var Logs            = require('../proxy').Logs;
var taskAddCode     = require('../schedule').AddCode;
var taskCheckCode   = require('../schedule').CheckPrint;
var getCons         = require('../schedule').GetCons;
var getConsReport   = require('../schedule').GetConsReport;
var putCons         = require('../schedule').PutCons;
var ReportCount     = require('../schedule').ReportCount;
//var sendmail        = require('../controllers/sendEmail');

var logger          = require('../common/logger');
var configFile      = 'config.json';

exports.index = function (req, res, next) {
    //查库,把category表的 categoryID, name返回 , 在现实页面关联上FTP文件名

    //把回传webservice接口url组成一个数组,返回到页面上去
    //apiReturnCode:F1C_2   //工厂名
    //apiPushOrderReturn:   //工单回传
    //apiPushSplitReturn:   //分切回传
    //apiPushRollReturn:    //下卷回传

    var URLlist = [];
    for(var i=0;;i++){
        var tmp = {};
        var c = i==0?'':i;
        var fac = eval('config.interface_opts.apiReturnCode'+c);
        if(typeof fac == 'undefined' || fac == null){
            break;
        }else{
            tmp.apiReturnCode       = eval('config.interface_opts.apiReturnCode'+c);
            tmp.apiPushOrderReturn  = eval('config.interface_opts.apiPushOrderReturn'+c) || '';
            tmp.apiPushSplitReturn  = eval('config.interface_opts.apiPushSplitReturn'+c) || '';
            tmp.apiPushRollReturn   = eval('config.interface_opts.apiPushRollReturn'+c) || '';
            URLlist.push(tmp);
        }
    }

    res.render('interface/interface',{
        i18n: res,
        urlList: URLlist
    });
}

exports.updateAPI = function(req, res, next) {
    var updatename = validator.trim(req.body.name) || '';
    var factoryname = '';
    if(updatename == 'updateReturn'){
        factoryname = validator.trim(req.body.pk) || '';
        var index = factoryname.substring(factoryname.lastIndexOf('_')+1, factoryname.length);
        factoryname = factoryname.substring(0, factoryname.lastIndexOf('_'));
        updatename = index=='0'?'updatePushOrderReturn':(index=='1'?'updatePushSplitReturn':
            (index=='2'?'updatePushRollReturn':''))
    }

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('create_err', function (msg) {
        res.status(422);
        res.send(msg);
    });
    switch (updatename) {
        // 更新申请二维码URL
        case 'updateApplyURL':
            var value = validator.trim(req.body.value);
            if ([value].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }
            config.interface_opts.apiApplyCode = value;
            // 更新配置文件，nodemon自动重启。
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for ECODE', req.session.user.name, '0');
            return res.send({success: true, reload: true});
            break;
        // 更新下载二维码URL
        case 'updateDLURL':
            var value = validator.trim(req.body.value);
            if ([value].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }
            config.interface_opts.apiDLCode = value;
            // 更新配置文件，nodemon自动重启。
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for ECODE', req.session.user.name, '0');
            return res.send({success: true, reload: true});
            break;
        // 更新回传二维码URL
        case 'updateReturnURL':
            var value = validator.trim(req.body.value);
            if ([value].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }
            config.interface_opts.apiReturnQRCode = value;
            // 更新配置文件，nodemon自动重启。
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for ECODE', req.session.user.name, '0');
            return res.send({success: true, reload: true});
            break;
        // 开关自动补码
        case 'updateEcodeTask':
            var offon = validator.trim(req.body.offon);
            var condition = validator.trim(req.body.condition);
            var time = validator.trim(req.body.time);
            if (offon == 'true') {
                config.interface_opts.minStock = condition;
                config.interface_opts.apiQRTime = parseInt(time);
                config.interface_opts.AddCodeTaskState = "checked";
                Logs.addLogs('users', 'Enable task for Addcode minCode: '+ condition +', at'+ time +':00.', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success open job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            } else {
                config.interface_opts.AddCodeTaskState = "";
                Logs.addLogs('users', 'Disable task for Addcode', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success off job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            }
            break;
        // 开关打印文件检测
        case 'updateCheckPrintTask':
            var offon = validator.trim(req.body.offon);
            var time = validator.trim(req.body.time);
            if (offon == 'true') {
                config.interface_opts.apiCheckPrintTime = parseInt(time);
                config.interface_opts.CheckPrintTaskState = "checked";
                Logs.addLogs('users', 'Enable task for Check Print at '+ time +' minute.', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success open job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            } else {
                config.interface_opts.CheckPrintTaskState = "";
                Logs.addLogs('users', 'Disable task for Check Print.', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success off job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            }
            break;
        // 给新工厂创建回传url
        case 'createFactoryReturnURL':
            var factoryname = req.body.factoryname || '';
            var webtype = req.body.webtype || '';
            var webUrl = req.body.webUrl || '';

            var c=0;
            for(var i=0;;i++){
                c = i==0?'':i;
                var fac = eval('config.interface_opts.apiReturnCode'+c);
                if(typeof fac == 'undefined' || fac == ''){
                    break;
                }else{
                    if(factoryname == fac){
                        return ep.emit('create_err', res.__('has same factory data. Please update.'));
                    }
                }
            }
            eval('config.interface_opts.apiReturnCode'+ c +'= factoryname');
            eval('config.interface_opts.apiPushOrderReturn'+ c +'= webtype==1?webUrl:""');
            eval('config.interface_opts.apiPushSplitReturn'+ c +'= webtype==2?webUrl:""');
            eval('config.interface_opts.apiPushRollReturn'+ c +'= webtype==3?webUrl:""');
            // 更新配置文件，nodemon自动重启。
            updateConfigFile();//传送到62上去
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for MES(PushOrderReturn)', req.session.user.name, '0');
            return res.send({success: true, reload: true});
        // 更新工单回传
        case 'updatePushOrderReturn':
            var value = validator.trim(req.body.value);
            if ([value].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }

            for(var i=0;;i++){
                var c = i==0?'':i;
                var fac = eval('config.interface_opts.apiReturnCode'+c);
                if(typeof fac == 'undefined' || fac == ''){
                    break;
                }else{
                    if(factoryname == fac){
                        eval('config.interface_opts.apiPushOrderReturn'+ c +'= value');
                        //config.interface_opts.apiPushOrderReturn = value;
                        updateConfigFile();//传送到62上去
                        fs.writeFile(configFile, JSON.stringify(config, null, 4));
                        Logs.addLogs('users', 'Update API for MES(PushOrderReturn)', req.session.user.name, '0');
                        return res.send({success: true, reload: true});
                    }
                }
            }
            //config.interface_opts.apiPushOrderReturn = value;
            // 更新配置文件，nodemon自动重启。

            break;
        // 更新分切回传
        case 'updatePushSplitReturn':
            var value = validator.trim(req.body.value);
            if ([value].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }
            for(var i=0;;i++){
                var c = i==0?'':i;
                var fac = eval('config.interface_opts.apiReturnCode'+c);
                if(typeof fac == 'undefined' || fac == ''){
                    break;
                }else{
                    if(factoryname == fac){
                        eval('config.interface_opts.apiPushSplitReturn'+ c +'= value');
                        //config.interface_opts.apiPushOrderReturn = value;
                        updateConfigFile();//传送到62上去
                        fs.writeFile(configFile, JSON.stringify(config, null, 4));
                        Logs.addLogs('users', 'Update API for MES(PushSplitReturn)', req.session.user.name, '0');
                        return res.send({success: true, reload: true});
                    }
                }
            }
            // config.interface_opts.apiPushSplitReturn = value;
            // // 更新配置文件，nodemon自动重启。
            // fs.writeFile(configFile, JSON.stringify(config, null, 4));
            // Logs.addLogs('users', 'Update API for MES(PushSplitReturn)', req.session.user.name, '0');
            // return res.send({success: true, reload: true});
            break;
        // 更新下卷回传
        case 'updatePushRollReturn':
            var value = validator.trim(req.body.value);
            if ([value].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }
            for(var i=0;;i++){
                var c = i==0?'':i;
                var fac = eval('config.interface_opts.apiReturnCode'+c);
                if(typeof fac == 'undefined' || fac == ''){
                    break;
                }else{
                    if(factoryname == fac){
                        eval('config.interface_opts.apiPushRollReturn'+ c +'= value');
                        //config.interface_opts.apiPushOrderReturn = value;
                        updateConfigFile();//传送到62上去
                        fs.writeFile(configFile, JSON.stringify(config, null, 4));
                        Logs.addLogs('users', 'Update API for MES(PushRollReturn)', req.session.user.name, '0');
                        return res.send({success: true, reload: true});
                    }
                }
            }
            // config.interface_opts.apiPushRollReturn = value;
            // // 更新配置文件，nodemon自动重启。
            // fs.writeFile(configFile, JSON.stringify(config, null, 4));
            // Logs.addLogs('users', 'Update API for MES(PushSplitReturn)', req.session.user.name, '0');
            // return res.send({success: true, reload: true});
            break;
        // 更新最大文件数及最大小卷码数
        case 'updateMaxCount':
            var maxrows = validator.trim(req.body.maxrows);
            var maxcount = validator.trim(req.body.maxcount);

            if ([maxrows, maxcount].some(function (item) { return item === ''; })) {
                return ep.emit('create_err', res.__('missing data'));
            }
            config.interface_opts.MaxPrintRows = maxrows;
            config.interface_opts.MaxRollCount = maxcount;
            // 更新配置文件，nodemon自动重启。
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for MaxCount', req.session.user.name, '0');
            return res.send({success: true, reload: true});
            break;
        // 更新罐装采集及发送时间
        case 'updateConsTask':
            var offon = validator.trim(req.body.offon);
            var gettime = validator.trim(req.body.gettime);
            var puttime = validator.trim(req.body.puttime);
            if (offon == 'true') {
                config.interface_opts.apiGetConsTime = parseInt(gettime);
                config.interface_opts.apiSendConsTime = parseInt(puttime);
                config.interface_opts.ConsTaskState = "checked";
                Logs.addLogs('users', 'Enable task for Cons. GetTime is '+ gettime +', PutTime is '+ puttime +':00.', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success open job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            } else {
                config.interface_opts.ConsTaskState = "";
                Logs.addLogs('users', 'Disable task for Cons', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success off job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            }
            break;
        // 更新报表统计时间
        case 'updateReportTask':
            var offon = validator.trim(req.body.offon);
            var reporttime = validator.trim(req.body.reporttime);
            if (offon == 'true') {
                config.interface_opts.apiReportTime = parseInt(reporttime);
                config.interface_opts.ReportTaskState = "checked";
                Logs.addLogs('users', 'Enable task for Report. Task Time is '+ reporttime +':00.', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success open job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            } else {
                config.interface_opts.ReportTaskState = "";
                Logs.addLogs('users', 'Disable task for Report', req.session.user.name, '0');
                res.send({success: true, msg: res.__('success off job')});
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
            }
            break;
        //更新小卷差值
        case 'updateRollDifferentValue':
            var value = validator.trim(req.body.differentValue);
            if (value === '') {
                return ep.emit('create_err', res.__('missing data'));
            }
            config.interface_opts.Dvalue_Roll = value;
            // 更新配置文件，nodemon自动重启。
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for RollDifferentValue', req.session.user.name, '0');
            return res.send({success: true, reload: true});
            break;
        //更新二维码下载等待时间
        case 'updateEcodeDownloadTime':
            var waitTime = validator.trim(req.body.waitTime);
            if (waitTime === '') {
                return ep.emit('create_err', res.__('missing data'));
            }
            config.interface_opts.Download_WaitingTime = waitTime;
            // 更新配置文件，nodemon自动重启。
            fs.writeFile(configFile, JSON.stringify(config, null, 4));
            Logs.addLogs('users', 'Update API for EcodeDownloadWaitTime', req.session.user.name, '0');
            return res.send({success: true, reload: true});
            break;
    }
}

function updateConfigFile() {
    //var url = config.interface_opts.apiPushOrder;
    var url = 'http://localhost:8080/v1/soap?wsdl';
    var args = {
        config: config
    };
    soap.createClient(url, function(err, client) {
        client.ReceiveConfigInfo(args, function(err, result) {
            if (err) {
                logger.warn(err);
            } else {
                logger.debug(result);
            }
        });
    });
}

var jobs = {};
var createJob = function(jobid, rule, opt) {
    var opt = opt || 0;
    logger.info('Create a Job for '+ jobid +', Will start at '+ JSON.stringify(rule));
    jobs[jobid] = schedule.scheduleJob(rule, function(){
        switch (jobid) {
            case 'addcode':
                taskAddCode.addCode(opt);
                break;
            case 'checkprint':
                taskCheckCode.checkPrint();
                break;
            case 'getcons':
                getCons.getCons();
                break;
            case 'getconsReport':
                getConsReport.getConsReport();
                break;
            case 'putcons':
                putCons.putCons();
                break;
            case 'report':
                var savefile = 'public/report/data.json';
                ReportCount.Reports(savefile);
                break;
            case 'sendmail':
                sendmail.alertMail();
                break;
        }
    });
};
var deleteJob = function (jobid) {
    if (jobs[jobid] != undefined) {
        jobs[jobid].cancel();
    }
};

// 系统重启或意外退出后自动启动计划任务
// 自动补码
if (config.interface_opts.AddCodeTaskState == "checked") {
    var minStock = config.interface_opts.minStock || 0,
        loopHour = config.interface_opts.apiQRTime || 7,
        loopMinute = [],
        oneDLCount = 500000;
    // oneDLCount 为每分钟导入数量，需要在实际集群中进行测试调整此值为最佳值
    if (minStock > oneDLCount) {
        var dlNum = Math.ceil(minStock / oneDLCount);
        // 当前系统设计峰值为每小时6000万入库，如需调整此值需要对MONGO分片扩容
        if (dlNum > 60) { dlNum = 60 };
        for (var i = 0; i < 51; i++) {
            loopMinute.push(i);
        }
    } else {
        loopMinute.push(0);
    }
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [0, new schedule.Range(1, 6)];
    //rule.hour = [11,12,13,14,15,16,17,18];
    rule.hour = [loopHour, loopHour + 1, loopHour + 2];
    rule.minute = loopMinute;
    createJob('addcode', rule, oneDLCount);
}
// 打印检测
if (config.interface_opts.CheckPrintTaskState == "checked") {
    var loopMinute = config.interface_opts.apiCheckPrintTime || 10;
    var minutes = [];
    minutes.push(0);
    for (var i = loopMinute; i < 60; i++) {
        minutes.push(i);
        i+=loopMinute-1;
    }
    var rule = new schedule.RecurrenceRule();
    rule.minute = minutes;
    //rule.minute = 55;
    createJob('checkprint', rule);
}

// 罐装采集及发送
if (config.interface_opts.ConsTaskState == "checked") {
    // 罐装采集
    var loopMinute = config.interface_opts.apiGetConsTime || 5;
    var minutes = [];
    minutes.push(0);
    for (var i = loopMinute; i < 60; i++) {
        minutes.push(i);
        i+=loopMinute-1;
    }
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [0, new schedule.Range(1, 6)];
    //rule.hour = parseInt(config.interface_opts.apiSendConsTime);
    rule.hour = 13;
    rule.minute = 20;
    createJob('getcons', rule);
}

// 罐装报表数据采集 、 与灌装码采集使用通一个开关
if (config.interface_opts.ConsTaskState == "checked") {
    // 罐装采集
    var loopMinute = config.interface_opts.apiGetConsTime || 5;
    var minutes = [];
    minutes.push(0);
    for (var i = loopMinute; i < 60; i++) {
        minutes.push(i);
        i+=loopMinute-1;
    }
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [0, new schedule.Range(1, 6)];
    //rule.hour = parseInt(config.interface_opts.apiSendConsTime);
    rule.hour = 3;
    rule.minute = 20;
    createJob('getconsReport', rule);
}

// 统计分析报表
if (config.interface_opts.ReportTaskState == "checked") {
    var rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = [0, new schedule.Range(1, 6)];
    rule.hour = parseInt(config.interface_opts.apiReportTime);
    rule.minute = 0;
    createJob('report', rule);
}





