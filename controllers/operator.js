/**
 * Created by lxrent on 16/11/24.
 */
var eventproxy      = require('eventproxy');
var formidable      = require('formidable');
var FS              = require('fs');
var readLine        = require('lei-stream').readLine;
var mongoose        = require('mongoose');

var logger          = require('../common/logger');
var tools           = require('../common/tools');
var models          = require('../models');
var Logs            = require('../proxy').Logs;
var Category        = require('../proxy').Category;
var Order           = require('../proxy').Order;
var QRCode          = require('../proxy').QRCode;
var QRCodeApply     = require('../proxy').QRCodeApply;
var QRCodeEntity    = models.QRCode;

var filesList = [];

exports.index = function (req, res, next) {
    res.render('operator/operator',{
        i18n:res,
        Query:{
            category:''
        }
    });
};

// 导入文件
exports.importcode = function (req, res, next) {
    var category = req.body.category || '57c44b3868a639091c5fff01';
    var checked = req.body.optionsRadios || '';
    var orderId = req.body.orderId || 99999;
    var dlCount = 0;
    var ep = new eventproxy();
    ep.fail(next);
    logger.debug('---------------[Task-ImportCode]-------------');
    logger.debug('[Task-ImportCode] start import code to category: '+ category);
    if(category.indexOf('_')){
        category = category.split('_')[0];
    }
    var queryLogs = {
        state: 0,
        categoryId: category
    };
    if(filesList.length>0 && checked != 'option3'){
        // tools.shellgetLine(filesList[0], function (err, lineNum) {
        //     if(lineNum){
        //         dlCount = lineNum;
        //         ep.emit('dlcount_ok');
        //     }else{
        //         logger.error('Import Code fail. File '+ filesList[0] +' is null. Err:'+ err);
        //     }
        // });
    }

    QRCodeApply.getQRCodeApplyByQuery(queryLogs,'', function (err, rs){
        if(err){
            logger.error('Import Code fail.');
        }
        if (rs.length > 0) {
            logger.error('Cannot be processed because the category has work item in progress.');
        } else {
            ep.emit('not_progress');
        }
    });
    //ep.all('dlcount_ok', 'not_progress', function() {
    ep.all('not_progress', function() {
        QRCodeApply.newAndSave(category, '58607054eaf69353e83aed62', '', req.session.user.name, dlCount, function(err, rs) {
            if (err) {
                return next(err);
            }
            Logs.addLogs('users', 'Apply ECODE('+dlCount+') for CategoryID: '+ category, req.session.user.name, '0');
            // 开始后台程序
            ep.emit('startImport', rs._id); //把申请表中该条的_id传走,插入完成后更新状态使用
        });
    });
    Category.getCategoryById(category, ep.done('getCategory_ok'));

    ep.all('startImport', 'getCategory_ok', function (applyId, categoryDoc) {
        if(filesList.length>0 && checked!=''){
            var isUNUsed = false;
            switch (checked){
                case 'option1':isUNUsed=true;
                case 'option2':{
                    importQRCode(filesList[0], category, orderId, isUNUsed, function(err, info) {
                        if(err){
                            logger.error('[Task-ImportCode] import code err. ERR:'+err);
                        }
                        if(info==0){
    
                        }
                        if(info>0){
                            logger.debug('[Task-ImportCode] import code from file. FILE: '+filesList[0]+' count: '+info);
                            Logs.addLogs('users', '[Task-ImportCode] import code for category:'+ category +' from file. FILE: '+filesList[0]+' count: '+info, '0');
                            filesList.shift();
                            updateCategoryCount(applyId, category, info, true, isUNUsed);
                        }
                    });
                }break;
                case 'option3':{
                    updateCodeState(filesList[0], function (err, info) {
                        if(err){
                            logger.error('[Task-ImportCode] import code err. ERR:'+err);
                        }
                    });
                };break;
            }
        }
    });

    ep.on('not_progress', function(){
        res.render('operator/operator',{
            i18n:res,
            Query:{
                category:'',
                orderId:dlCount+' '+filesList[0],
            }
        });
    });
};
// 接收上传文件
exports.getfile = function (req, res, next) {
    //创建表单上传
    var form = new formidable.IncomingForm();
    //设置编辑
    form.encoding = 'utf-8';
    //设置文件存储路径
    form.uploadDir = "middlewares/data/upload";
    //保留后缀
    form.keepExtensions = true;
    //设置单文件大小限制
    form.maxFieldsSize = 2 * 1024 * 1024;
    //form.maxFields = 1000;  设置所以文件的大小总和
    form.multiples=true;//设置为多文件上传
    form.keepExtensions=true;//是否包含文件后缀
    filesList=[];
    //文件都将保存在files数组中

    form.parse(req, function(err, fields, files) {
        console.log(files);
        if (!(files.upload instanceof Array)) {
            files.upload = [files.upload];
        }
        files.upload.forEach(function (f) {
            var newName = 'middlewares/data/upload/' + f.name;
            FS.renameSync(f.path, newName);
            filesList.push(newName);
        });
        console.log(filesList);
    });
}

function importQRCode(fileName, categoryId, orderId, isUNUsed, callback){
    //------取得shard分配范围
    // 一个工单对应一个片键，Azure上不能按范围划分区间，自动处理分片，直接生成随机数
    var shardkey = parseInt(6000*Math.random());
    //------

    var ep = new eventproxy();
    ep.fail();

    // 如果已经导入了当前工单，按照已经存在的distribution
    QRCode.getQRCodeByQuery({orderId:orderId}, {limit:1}, function (err,rs) {
        if(err){

        }else{
            if(rs.length > 0){
                if(typeof rs[0].distribution != 'undefined'){
                    if(rs[0].distribution != ''){
                        shardkey = rs[0].distribution;
                    }
                }
            }
            ep.emit('getDistribution');
        }
    });

    ep.on('getDistribution', function () {
        wirtetoDB(fileName, categoryId, shardkey, isUNUsed, orderId, function(err, importCount){
            return callback(err, importCount);
        });
    });
}

function wirtetoDB(fileName, categoryId, shardkey, isUNUsed, orderId, callback) {
    var counter = 0,
        importCount = 0;
    var startTime = Date.now();
    var batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
    readLine(fileName).go(function (data, next) {

        // 在读到内容太短时，认为该条信息错误
        if (data.length < 20) {
            next();
        }
        data = data.replace('\r','');
        data = data.split(',');

        if(data.length > 1){
            batch.insert({
                categoryId: mongoose.Types.ObjectId(categoryId),
                content: data[0],
                content1: data[1],
                state: isUNUsed?1:11,
                url: "",
                orderId: orderId,
                distribution: shardkey
            });
        }else{
            batch.insert({
                categoryId: mongoose.Types.ObjectId(categoryId),
                content: data[0],
                state: isUNUsed?1:11,
                url: "",
                orderId: orderId,
                distribution: shardkey
            });
        }

        counter++;

        if (counter % 500 === 0) {
            var t = msToS(getSpentTime(startTime));
            var s = counter / t;
            if (!isFinite(s)) s = counter;
            batch.execute(function (err, rs) {
                if (err) {
                    //Logs.addLogs('system', 'Import Code is err: ' + err, 'system', 2);
                    console.log('[Task-ImportCode] Insert to DB is err: ' + err);
                    Logs.addLogs('system', '[Task-ImportCode] Insert to DB is err: '+ err, 'system', 2);
                }
                importCount = importCount + rs.nInserted;
                console.log('Insert %s lines, speed: %sL/S', counter, s.toFixed(0));
                batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
                next();
            });
        } else {
            next();
        }
    }, function () {
        var t = msToS(getSpentTime(startTime));
        var s = counter / t;
        if (!isFinite(s)) s = counter;
        if (counter % 500 != 0) {
            batch.execute(function(err, rs) {
                if (err) {
                    console.log('[Task-ImportCode] Insert to DB is err: '+ err);
                    Logs.addLogs('system', '[Task-ImportCode] Insert to DB is err: '+ err, 'system', 2);
                }
                importCount = importCount + rs.nInserted;
                console.log('[Task-ImportCode] Complete Insert. Count is '+ importCount);
                console.log('----------------['+ msToS(getSpentTime(startTime)) +']End Import----------------');
                batch = null;
                return callback(null, importCount);
            });
        }else{
            console.log('[Task-ImportCode] Complete Insert. Count is '+ importCount);
            console.log('----------------['+ msToS(getSpentTime(startTime)) +']End Import----------------');
            return callback(null, importCount);
        }
    });
}

function msToS (v) {
    return parseInt(v / 1000, 10);
}

function getSpentTime (startTime) {
    return Date.now() - startTime;
}