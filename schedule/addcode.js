/**
 * Created by youngs1 on 8/8/16.
 */

var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');

var Logs            = require('../proxy').Logs;
var Category        = require('../proxy').Category;
var QRCodeApply     = require('../proxy').QRCodeApply;
var QRCode          = require('../proxy').QRCode;
var tools           = require('../common/tools');
var logger          = require('../common/logger');

exports.addCode = function (oneDLCount) {
    logger.debug('-----------------Start Task: ImportCode-----------------');
    var minStock = config.interface_opts.minStock || 0 ;
    var category = [],
        applyId = '',
        appURL = '';

    var ep = new eventproxy();
    ep.fail(function(err) {
        Logs.addLogs('system', '[Task-ImportCode] Failed on ERROR: '+ err, 'system', '2');
        return logger.error('[Task-ImportCode] ERROR: '+ err);
    });

    ep.on('_err', function (msg) {
        Logs.addLogs('system', '[Task-ImportCode] Failed on ERROR: '+ msg, 'system', '2');
        return logger.error('[Task-ImportCode] ERROR: '+ msg);
    });

    // 查找符合条件的品类ID及通用申请ID
    var query = {
        codeAvailable: {
            '$lt': minStock
        },
        _id:"57c44b3868a639091c5fff01"
    };
    Category.getCategoryByQuery(query, '', ep.done(function(rs) {
        if (rs.length > 0) {
            category = rs;
            logger.debug('[Task-ImportCode] Category count is '+ category.length);
            ep.emit('get_category');
        } else {
            return ep.emit('_err', 'all category available code > '+ minStock);
        }
    }));

    ep.all('get_category', function() {

        category.forEach(function(docs) {
            // 查询相同品类下是否有正在处理的入库操作，如果有将不处理该品类补码。
            var qrcodeCount = docs.QRCodeCount || 1;

            var queryLogs = {};
            queryLogs.$and = [];
            queryLogs.$and[0] = {
                state: 0
            };
            queryLogs.$and[1] = {
                categoryId: docs._id
            };
            queryLogs.$and[2] = {
                generalId: docs.generalId
            };
            QRCodeApply.getQRCodeApplyByQuery(queryLogs,'', function (err, rs){
                if (rs.length > 0) {
                    logger.debug('Cannot be processed because the category('+docs.name+') has work item in progress.');
                } else {
                    QRCodeApply.newAndSave(queryLogs.$and[1].categoryId, queryLogs.$and[2].generalId, '', 'system', oneDLCount, function(err, appRS) {
                        if (err) {
                            logger.error('[Task-ImportCode] ERROR: '+ err);
                            return next(err);
                        }
                        appURL = config.interface_opts.apiApplyCode + oneDLCount+'/generalId='+queryLogs.$and[2].generalId;
                        applyId = appRS._id;
                        logger.debug('Apply ECODE('+oneDLCount+') for CategoryID: '+ queryLogs.$and[1].categoryId);
                        Logs.addLogs('system', 'Apply ECODE('+oneDLCount+') for CategoryID: '+ queryLogs.$and[1].categoryId, 'system', '0');
                        // 开始后台程序

                        //------取得shard分配范围
                        var shardsRange = [];
                        for(var i=0; ;i++){
                            var shard = eval('config.shard_ranges.shard' + i);
                            if(typeof shard === 'undefined'){
                                break;
                            }else if(shard.range.length == 0){
                                continue;
                            }else{
                                if(shard.active){
                                    shard.range.forEach(function (r) {
                                        shardsRange.push(r);
                                    });
                                }
                            }
                        }
                        // 一个工单对应一个片键
                        var orderId = parseInt(Math.random()*1000);
                        var tmp = orderId%shardsRange.length;
                        var shardkey = parseInt((parseInt(shardsRange[tmp][1])-parseInt(shardsRange[tmp][0]) + 1)*Math.random()) + parseInt(shardsRange[tmp][1]);
                        //------

                        importcode(appURL, applyId, queryLogs.$and[1].categoryId, docs.generalId, docs.isGDT, qrcodeCount, orderId, shardkey);
                    });
                }
            });
        });
    });
};

// 后台执行：下载二维码、解压缩、导入数据库、写日志、更新日志表、品类表、申请表
var importcode = function(applyURL, applyId, categoryId, generalId, isGDT, qrcodeCount, orderId, shardkey) {
    var localPath = 'middlewares/data/ecode/',
        fileId = '',
        dlURL = config.interface_opts.apiDLCode,
        dlfile = localPath,
        filePath = localPath,
        returnExit = false;

    if(isGDT){
        dlURL = config.interface_opts.apiDLGDTCode + generalId + '?file=';
    }

    var proxy = new eventproxy();
    proxy.fail(function (err) {
        // 将二维码申请状态更新为失败
        QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
            rs.state = 2;
            rs.save();
        });
        Logs.addLogs('system', '[Task-ImportCode]Import ECODE Error ApplyID: '+ applyId +' ERR: '+ err, 'system', '2');
        return console.log('[Task-ImportCode]Import ECODE Error ApplyID: '+ applyId +' ERR: '+ err);
    });

    // 申请二维码
    logger.info('start apply code from ' + applyURL);
    QRCode.Apply(applyURL, isGDT, function(err, dlinfo) {
        if (err) {
            // 将二维码申请状态更新为失败
            QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                rs.state = 2;
                rs.save();
            });
            Logs.addLogs('system', '[Task-ImportCode]Apply Code From ECODE Err: '+ err, 'system', '2');
            return console.log('[Task-ImportCode]Apply Code From ECODE Err: '+ err);
        }
        if (dlinfo.indexOf('error occurred') >= 0 || dlinfo.indexOf('Could not connect to HTTP') >= 0) {
            // 将二维码申请状态更新为失败
            QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                rs.state = 2;
                rs.save();
            });
            Logs.addLogs('system', '[Task-ImportCode]Apply Code From ECODE An error occurred.', 'system', '2');
            return console.log('[Task-ImportCode]Apply Code From ECODE An error occurred.');
        } else {
            dlinfo = JSON.parse(dlinfo);
            if (dlinfo.status !== 200) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function (err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                Logs.addLogs('system', '[Task-ImportCode]Apply Code From ECODE Err: ' + dlinfo.message, 'system', '2');
                return console.log('[Task-ImportCode]Apply Code From ECODE Err: ' + dlinfo.message);
            } else {
                fileId = dlinfo.fileId;
                dlURL = dlURL + fileId;
                dlfile = dlfile +''+ fileId;
                //因为国家二维码平台,生成新码的时候,如果数量大的话会有延时 5百万2-3分钟,
                // 如果平台不设置延时就会导致文件下载不完整,无法完成解压导入
                setTimeout(function () {
                    proxy.emit('apply_ok');
                },30000);  //设置10分钟的延时 600 000/1000 = 600s = 10min
                //proxy.emit('apply_ok');
            }
        }
    });

    // 开始下载二维码
    proxy.all('apply_ok', function () {
        logger.info('start download code from  '+dlURL);
        QRCode.Download(dlURL, dlfile, function(err){
            if (err) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                Logs.addLogs('system', '[Task-ImportCode]Download File: '+ dlURL +' ERR: '+ err, 'system', '2');
                return console.log('[Task-ImportCode]Download File: '+ dlURL +' ERR: '+ err);
            } else {
                console.log('----------------start import----------------');
                console.log('[Task-ImportCode]Download: '+ dlURL);
                Logs.addLogs('system', '[Task-ImportCode]Download ECODE('+fileId+') from iotroot.com', 'system', '0');
                proxy.emit('download_ok');
            }
        });
    });

    // 开始解压缩
    proxy.all('apply_ok', 'download_ok', function() {
        tools.unzip(dlfile, localPath, function(err, filename) {
            if (err) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                returnExit = true;
                Logs.addLogs('system', '[Task-ImportCode]UNZip File: '+ dlfile +' ERR: '+ err, 'system', '2');
                return console.log('[Task-ImportCode]UNZip File: '+ dlfile +' ERR: '+ err);
            } else {
                console.log('[Task-ImportCode]Unzip: '+ filename);
                filePath = filePath +''+ filename;
                Logs.addLogs('system', '[Task-ImportCode]Unzip '+ dlfile +' to '+ filename, 'system', '0');
                proxy.emit('unzip_ok');
            }
        });
    });

    // 开始导入数据库
    proxy.all('unzip_ok', function () {
        if ( returnExit ) {
            return console.log('----------------[ImportCode]end import----------------');
        };
        QRCode.Import(filePath, categoryId, isGDT, qrcodeCount, orderId, shardkey, function(err, info) {
            if (err) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                console.log('[Task-ImportCode]Insert DB ERR from File: '+ dlfile +' ERR: '+ err);
                return Logs.addLogs('system', '[Task-ImportCode]Insert DB ERR from File: '+ dlfile +' ERR: '+ err, 'system', '2');
            }
            if (info === 0) {
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                Logs.addLogs('system', '[Task-ImportCode]Insert Code complete. But duplicate key error index. RollBACK is OK. File: '+ filePath +', importRows: ' + info, 'system', '2');
            } else {
                Logs.addLogs('system', '[Task-ImportCode]Insert Code complete. File: '+ filePath +', Import Count: ' + info, 'system', '0');
                // 更新申请表
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.dbCount = info;
                    rs.fileName = filePath;
                    rs.insert_at = Date.now();
                    if (info === 0) {
                        rs.state = 2;
                    } else {
                        rs.state = 1;
                    }
                    rs.save(function(err) {
                        if (err) {
                            return next(err);
                        } else {
                            // 更新品类表
                            Category.getCategoryById(categoryId, function(err, rs){
                                rs.codeCount = rs.codeCount + info;
                                rs.codeAvailable = rs.codeAvailable + info;
                                rs.save(function(err) {
                                    if (err) {
                                        return next(err);
                                    }
                                });
                            });
                            console.log('----------------[Task-ImportCode]end import----------------');
                        }
                    });
                });
            }
        });
    });
};