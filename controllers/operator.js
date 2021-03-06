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
            category:'',
            orderId:'',
            fileName:''
        }
    });
};

// 导入文件
exports.importcode = function (req, res, next) {
    var category = req.body.category || '57c44b3868a639091c5fff01';
    var checked = req.body.optionsRadios || '';
    var orderId = req.body.orderId || 99999;
    var fileName = req.body.fileName || '';
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
    if(filesList.length>0 && fileName == ''){
        fileName = filesList[0];
        // tools.shellgetLine(filesList[0], function (err, lineNum) {
        //     if(lineNum){
        //         dlCount = lineNum;
        //         ep.emit('dlcount_ok');
        //     }else{
        //         logger.error('Import Code fail. File '+ filesList[0] +' is null. Err:'+ err);
        //     }
        // });
    }else{
        fileName = 'middlewares/data/upload/'+fileName;
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
            //Logs.addLogs('users', 'Apply ECODE('+dlCount+') for CategoryID: '+ category, req.session.user.name, '0');
            // 开始后台程序
            ep.emit('startImport', rs._id); //把申请表中该条的_id传走,插入完成后更新状态使用
        });
    });
    //Category.getCategoryById(category, ep.done('getCategory_ok'));

    ep.on('startImport', function (applyId) {
        if(fileName!='' && checked!=''){
            var isUNUsed = false;
            switch (checked){
                case 'option1':isUNUsed=true;
                case 'option2':{
                    importQRCode(fileName, category, orderId, isUNUsed, function(err, info) {
                        if(err){
                            logger.error('[Task-ImportCode] import code err. ERR:'+err);
                        }
                        if(info==0){
    
                        }
                        if(info>0){
                            logger.debug('[Task-ImportCode] import code from file. FILE: '+fileName+' count: '+info);
                            //Logs.addLogs('users', '[Task-ImportCode] import code for category:'+ category +' from file. FILE: '+fileName+' count: '+info, '0');
                            filesList.shift();
                            updateCategoryCount(applyId, category, info, true, isUNUsed);
                        }
                    });
                }break;
                case 'option3':{
                    updateCodeState(fileName, function (err, info) {
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
                orderId:orderId,
                fileName:fileName
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
        logger.debug(files);
        if (!(files.upload instanceof Array)) {
            files.upload = [files.upload];
        }
        files.upload.forEach(function (f) {
            var newName = 'middlewares/data/upload/' + f.name;
            FS.renameSync(f.path, newName);
            filesList.push(newName);
        });
        logger.debug(filesList);
    });
}

function importQRCode(fileName, categoryId, orderId, isUNUsed, callback){
    //------取得shard分配范围
    // 一个工单对应一个片键，Azure上不能按范围划分区间，自动处理分片，直接生成随机数
    //var shardkey = parseInt(6000*Math.random());
    //------
    //logger.debug('[Task-ImportCode] orderId: '+orderId+' shardkey: '+shardkey );
    // var ep = new eventproxy();
    // ep.fail();

    // 如果已经导入了当前工单，按照已经存在的distribution
    // QRCode.getOneQRCodeByQuery({orderId:''+orderId}, function (err,rs) {
    //     if(err){

    //     }else{
    //         if(rs.length > 0){
    //             if(typeof rs[0].distribution != 'undefined'){
    //                 if(rs[0].distribution != ''){
    //                     shardkey = rs[0].distribution;
    //                 }
    //             }
    //         }
    //         ep.emit('getDistribution');
    //     }
    // });

    // ep.on('getDistribution', function () {
    //     logger.debug('[Task-ImportCode] orderId: '+orderId+' shardkey: '+shardkey );
        wirtetoDB(fileName, categoryId, isUNUsed, orderId, function(err, importCount){
            return callback(err, importCount);
        });
    // });
}

function wirtetoDB(fileName, categoryId, isUNUsed, orderId, callback) {
    var counter = 0,
        importCount = 0;
    var startTime = Date.now();
    var batch = [{},{},{}];
    batch[0].flag = true;//可用
    batch[0].qrcode = QRCodeEntity.collection.initializeUnorderedBulkOp();
    batch[1].flag = true;//可用
    batch[1].qrcode = QRCodeEntity.collection.initializeUnorderedBulkOp();
    batch[2].flag = true;//可用
    batch[2].qrcode = QRCodeEntity.collection.initializeUnorderedBulkOp();
    var curTimes = 2;
    var docData = {};
    var isInBatch = false;
    var times = 0;
    var isover = false;
    readLine(fileName).go(function (data, next) {
        isInBatch = true;
        // 在读到内容太短时，认为该条信息错误
        if (data.length < 20) {
            next();
        }
        data = data.replace('\r','');
        data = data.split(',');

        docData = {
            categoryId: mongoose.Types.ObjectId(categoryId),
            content: data[0],
            code:data[0].substring(data[0].lastIndexOf('/')+1, data[0].length),
            state: isUNUsed?1:11,
            url: "",
            orderId: orderId
        };

        if(data.length > 1){
            docData.content1 = data[1];
        }
        batch[curTimes].qrcode.insert(docData);

        counter++;

        if (counter % 10000 === 0) {
            console.log(times++,curTimes);
            var stopTime = curTimes;
            batch[stopTime].flag = false;
            isInBatch = false;

            //查看当前哪个batch可用
            for(var i=0; i<batch.length; i++){
                if(batch[i].flag){
                    curTimes = i;
                    isInBatch = true;
                    break;
                }
            }

            batchtoDB(batch[stopTime].qrcode, stopTime, counter, orderId, startTime, function(index){
                batch[index].qrcode = QRCodeEntity.collection.initializeUnorderedBulkOp();
                batch[index].flag = true;
                if(!isInBatch && !isover){
                    curTimes = index;
                    return next();
                }
            });
            if(isInBatch && batch[curTimes].flag){
                next();
            }


        } else {
            next();
        }
    }, function () {
        isover = true;
        var t = msToS(getSpentTime(startTime));
        var s = counter / t;
        if (!isFinite(s)) s = counter;
        if (counter % 10000 != 0) {
            batch[curTimes].qrcode.execute(function(err, rs) {
                if (err) {
                    logger.debug('[Task-ImportCode] Insert to DB is err: '+ err);
                    //Logs.addLogs('system', '[Task-ImportCode] Insert to DB is err: '+ err, 'system', 2);
                }
                importCount = importCount + rs.nInserted;
                logger.debug('[Task-ImportCode] Complete Insert. Count is '+ importCount);
                logger.debug('----------------['+ msToS(getSpentTime(startTime)) +']End Import----------------');
                batch = null;
                return callback(null, importCount);
            });
        }else{
            logger.debug('[Task-ImportCode] Complete Insert. Count is '+ importCount);
            logger.debug('----------------['+ msToS(getSpentTime(startTime)) +']End Import----------------');
            return callback(null, importCount);
        }
    });
}

function batchtoDB(batch, batchIndex, counter, orderId, startTime, callback){
    var t = msToS(getSpentTime(startTime));
    var s = counter / t;
    if (!isFinite(s)) s = counter;
    logger.debug('[Task-ImportCode] orderId: '+orderId+' count: '+counter );
    batch.execute(function (err, rs) {
        if (err) {
            //Logs.addLogs('system', 'Import Code is err: ' + err, 'system', 2);
            logger.debug('[Task-ImportCode] Insert to DB is err: ' + err);
            //Logs.addLogs('system', '[Task-ImportCode] Insert to DB is err: '+ err, 'system', 2);
        }
        logger.debug('Insert %s lines, speed: %sL/S', counter, s.toFixed(0));
        callback(batchIndex);
        //next();
    });
}

function msToS (v) {
    return parseInt(v / 1000, 10);
}

function getSpentTime (startTime) {
    return Date.now() - startTime;
}

//---------申请表ID、品类ID(更新该品类可用码量使用)、插入数量、标明是插入新码、插入已下发码
function updateCategoryCount(applyId, categoryId, insertCount, isInsert, isUsed) {
    QRCodeApply.getQRCodeApplyById(applyId, function(qa_err, qa_rs) {
        qa_rs.dbCount = insertCount;
        qa_rs.fileName = filesList[0];
        qa_rs.insert_at = Date.now();
        if (insertCount === 0) {
            qa_rs.state = 2;
        } else {
            qa_rs.state = 1;
        }
        qa_rs.save(function(err) {
            if (err) {
                return logger.error(err);
            } else {
                Category.getCategoryById(mongoose.Types.ObjectId(categoryId), function (err, rs) {
                    if (err) {
                        logger.error('category ' + categoryId + ' import code err. Error:' + err);
                        return Logs.addLogs('users', 'category ' + categoryId + ' import code err. Error:' + err, '2');
                    }
                    if (rs) {
                        if (isInsert) {
                            if (!isUsed) {        //这些码是否被使用
                                rs.codeAvailable = rs.codeAvailable + insertCount;
                            }
                            rs.codeCount = rs.codeCount + insertCount;
                        } else {
                            rs.codeAvailable = rs.codeAvailable - insertCount;
                            rs.codeCount = rs.codeCount;
                        }
                        rs.save(function (err) {
                            if (err) {
                                return logger.error(err);
                            }
                        });
                    }

                });
            }
        });
    });
}

//读取二维码
function readQRCodeFromDB(categoryId, orderId, count, callback){
    //1.验证可用码量是否充足

    //2.开始导出

    //3.更新可用码量

    //4.更新qrcode状态 为11

};

function updateQRCodeState(fileName){
    // 更新数据库

}