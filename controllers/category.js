/**
 * Created by youngs1 on 6/25/16.
 */
var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var fs              = require('fs');
var Category        = require('../proxy').Category;
var Logs            = require('../proxy').Logs;
var Materiel        = require('../proxy').Materiel;
var FTPInfo         = require('../proxy').FTPInfo;
var QRCode          = require('../proxy').QRCode;
var QRCodeApply     = require('../proxy').QRCodeApply;
var Order           = require('../proxy').Order;
var logger          = require('../common/logger');
var tools           = require('../common/tools');

exports.index = function (req, res, next) {
    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_category', function (rs) {
        if (!rs) {
            return next();
        }
        res.render('category/category',{
            i18n: res,
            rsList: rs,
            query_r:{
                categoryname: '',
                designId: '',
                generalId: ''
            }
        });
    });

    Category.getCategoryByQuery('', {sort: "-_id"}, ep.done('get_category'));
};

exports.downloadFile = function(req, res, next){
    // var dlfile = "middlewares/data/upload/";
    // var tmpDate = new Date();
    // dlfile = dlfile+tools.formatDateTimeforFile(tmpDate);
    // QRCode.Download("http://111.202.239.139:10088/attachment/1", dlfile, function(err){
    //     if(err){
    //         res.send("Download error. startTime:" + tools.formatDateTimeforFile(tmpDate) + " endTime:"+tools.formatDateTimeforFile(new Date()));
    //     }else{
    //         res.send("Download success. startTime:" + tools.formatDateTimeforFile(tmpDate) + " endTime:"+tools.formatDateTimeforFile(new Date()));
    //         fs.unlink(dlfile, function(err) {});
    //     }
    // });
};

exports.createCategory = function (req, res, next) {
    var CategoryName = validator.trim(req.body.categoryname);
    var webNum = validator.trim(req.body.webnum);
    var designId = validator.trim(req.body.designId);
    var splitSpec = validator.trim(req.body.splitSpec);
    var sendURL = false;
    var sendXML = false;
    var isGDT = false;
    var materiel = req.body.materiel || '';
    if (materiel instanceof Array) {
        materiel = materiel;
    } else {
        materiel = [materiel];
    }

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('create_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    // 验证信息的正确性
    // if ([CategoryName, materiel].some(function (item) { return item === ''; })) {
    //     return ep.emit('create_err', res.__('missing data'));
    // }
    // 不在判断物料号， 改为判断设计号加可变版本号是否为空
    if ([CategoryName, designId].some(function (item) { return item === ''; })) {
        return ep.emit('create_err', res.__('missing data'));
    }
    var query_c = {
        $or: [{name: CategoryName}, {designId: designId}]
    };
    Category.getCategoryByQuery(query_c, {}, function (err, rs) {
        if (err) {
            return next(err);
        }
        if (rs.length > 0) {
            return ep.emit('create_err', res.__('Please fix this field'));
        }
        //(name, materiel_number, webNum, splitSpec, isGDT, designId, sendURL, sendXML
        Category.newAndSave(CategoryName, materiel, webNum, splitSpec, isGDT, designId, '', sendURL, sendXML, function (err, newrs) {
            if (err) {
                return next(err);
            }
            var filter = {};
            var update = {};
            filter.materiel_number = {};
            filter.materiel_number.$in = materiel;
            update.state = 1;

            Materiel.updateMateriel(filter, update, function(err){
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Create new Category: '+ CategoryName, req.session.user.name, '0');
                FTPInfo.newAndSave('category', '127.0.0.1', 21, 'admin', 'admin', newrs._id, ep.done(function() {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Create FTPInfo for CategoryID: '+ newrs._id, req.session.user.name, '0');
                    return res.send({success: true, reload: true});
                }));
            });
        });
    });
};

exports.searchCategory = function (req, res, next) {
    var name = req.body.categoryname || '';
    var designId = req.body.designId || '';
    var generalId = req.body.generalId || '';

    var query = {};
    if( name != '' ){
        query.name = { $regex: new RegExp(name, 'i') };
    }
    if( designId != '' ){
        // 如果 包含'-' 可以被拆分 则：
        if(designId.split('-').length == 2){
            query.designId = designId.split('-')[0];
            query.vdpVersion = designId.split('-')[1];
        }else{
            query.designId = designId;
        }
    }
    if( generalId != '' ){
        query.generalId = { $regex: new RegExp(generalId, 'i') };
    }
    Category.getCategoryByQuery(query, {sort:"-_id"}, function (err, rs) {
        if(err){
            rs = [];
        }
        res.render('category/category',{
            i18n: res,
            rsList: rs,
            query_r:{
                categoryname: name,
                designId: designId,
                generalId: generalId
            }
        });
    });

};

exports.updateCategory = function (req, res, next) {
    var categoryId = validator.trim(req.body.pk);
    var reqName = validator.trim(req.body.name);
    var sendURL = false;
    var sendXML = false;
    if (reqName == 'name' || reqName == 'webNum' || reqName == 'generalId'){
        var reqValue = validator.trim(req.body.value);
    } else {
        var reqValue = req.body.value;
    }

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('update_err', function (msg) {
        res.status(422);
        res.send(msg);
    });

    // 修改品类名称
    if (reqName === 'name') {
        Category.getCategoryByQuery({'name': reqValue}, {}, function (err, rs) {
            if (err) {
                return next(err);
            }
            if (rs.length > 0) {
                return ep.emit('update_err', res.__('Please fix this field'));
            }
            // 更新数据
            Category.getCategoryById(categoryId, ep.done(function (categoryRs) {
                var oldName = categoryRs.name;
                categoryRs.name = reqValue;
                categoryRs.save(function (err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Update category name: '+ oldName +' to '+ reqValue, req.session.user.name, '0');
                    return res.send({success: true, reload: true});
                });
            }));
        });
    }

    // 修改品类所含物料
    if (reqName === 'selMateriel') {
        if (reqValue instanceof Array) {
            reqValue = reqValue;
        } else {
            reqValue = [reqValue];
        }
        Category.getCategoryById(categoryId, ep.done(function (categoryRs) {
            if (reqValue.toString() === categoryRs.materiel_number.toString()) {
                return res.send({success: true,reload:false});
            } else {
                // 更新数据
                // 将原品类物料还原
                var filter = {};
                var update = {};
                filter.materiel_number = {};
                filter.materiel_number.$in = categoryRs.materiel_number;
                update.state = 0;
                Materiel.updateMateriel(filter, update, function(err){
                    if (err) {
                        return next(err);
                    }
                    // 更新品类物料
                    categoryRs.materiel_number = reqValue;
                    categoryRs.save(function (err) {
                        if (err) {
                            return next(err);
                        }
                        // 更新物料状态
                        filter.materiel_number = {};
                        filter.materiel_number.$in = reqValue;
                        update.state = 1;
                        Materiel.updateMateriel(filter, update, function(err){
                            if (err) {
                                return next(err);
                            }
                            Logs.addLogs('users', 'Update Materiel for Category: '+ categoryRs.name, req.session.user.name, '0');
                            return res.send({success: true, reload: true});
                        });
                    });
                });
            }
        }));
    }

    // 修改拆分规格
    if (reqName == 'splitSpec') {
        if (!validator.isNumeric(reqValue)) {
            return ep.emit('update_err', res.__('Please enter a valid number'));
        }
        // 更新数据
        Category.getCategoryById(categoryId, ep.done(function (categoryRs) {
            var oldVal = categoryRs.splitSpec;
            categoryRs.splitSpec = reqValue;
            categoryRs.save(function (err) {
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Update splitSpec: '+ oldVal +' to '+ reqValue +' at category: '+ categoryRs.name, req.session.user.name, '0');
                return res.send({success: true, reload: true});
            });
        }));
    }

    // 修改通用ID
    if (reqName == 'generalId') {
        // 更新数据
        Category.getCategoryById(categoryId, ep.done(function (categoryRs) {
            var oldVal = categoryRs.generalId;
            categoryRs.generalId = reqValue;
            categoryRs.save(function (err) {
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Update generalId: '+ oldVal +' to '+ reqValue +' in category: '+ categoryRs.name, req.session.user.name, '0');
                return res.send({success: true, reload: true});
            });
        }));
    }

    // 修改发送格式
    if (reqName == 'sendFormat') {
        if (reqValue != null) {
            if (reqValue.indexOf("1") >=0) {
                sendURL = true;
            }
            if (reqValue.indexOf("2") >=0) {
                sendXML = true;
            }
        }
        // 更新数据
        Category.getCategoryById(categoryId, ep.done(function (categoryRs) {
            var oldVal1 = categoryRs.sendURL;
            var oldVal2 = categoryRs.sendXML;
            categoryRs.sendURL = sendURL;
            categoryRs.sendXML = sendXML;
            categoryRs.save(function (err) {
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Update sendURL: '+ oldVal1 +' to '+ sendURL +' and sendXML: '+ oldVal2 +' to '+ sendXML +' in category: '+ categoryRs.name, req.session.user.name, '0');
                return res.send({success: true, reload: true});
            });
        }));
    }

    // 修改品类类型
    if (reqName == 'isGDT') {
        // 更新数据
        reqValue = reqValue === 'true'? true:false;
        Category.getCategoryById(categoryId, ep.done(function (categoryRs) {

            categoryRs.isGDT = reqValue;
            categoryRs.save(function (err) {
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Update ' +categoryRs.name+ ' is a GDT category.', req.session.user.name, '0');
                return res.send({success: true, reload: true});
            });
        }));
    }

    // 修改FTP信息
    if (reqName == 'ftp') {
        var ftphost = validator.trim(req.body.ftphost);
        var ftpuser = validator.trim(req.body.ftpuser);
        var ftppass = validator.trim(req.body.ftppass);
        var ftpid   = req.body.ftpid;

        tools.testftpconn(ftphost, 21, ftpuser, ftppass, function(err, ftpRs) {
            if (err) {
                return ep.emit('update_err', err.message);
            }
            if (ftpid !== '0') {
                FTPInfo.getFTPInfoById(ftpid, ep.done(function (ftpRs) {
                    ftpRs.host = ftphost;
                    ftpRs.user = ftpuser;
                    ftpRs.pass = ftppass;
                    ftpRs.save(function (err) {
                        if (err) {
                            return next(err);
                        }
                        Logs.addLogs('users', 'Update FTPInfo for CategoryID: '+ categoryId, req.session.user.name, '0');
                        return res.send({success: true, reload: true});
                    });
                }));
            } else {
                FTPInfo.newAndSave('category', ftphost, ftpuser, ftppass, categoryId, ep.done(function(err) {
                    if (err) {
                        return next(err);
                    }
                    Logs.addLogs('users', 'Create FTPInfo for CategoryID: '+ categoryId, req.session.user.name, '0');
                    return res.send({success: true, reload: true});
                }));
            }
        });
    }

    // 修改品类状态
    if (reqName == 'changeState') {
        Category.getCategoryById(categoryId, function (err, rs) {
            if(err){
                return next(err);
            }
            rs.disable = eval(reqValue);
            rs.save(function (err) {
                if (err) {
                    return next(err);
                }
                Logs.addLogs('users', 'Update category state for CategoryID: '+ categoryId +' to ' + !eval(reqValue), req.session.user.name, '0');
                return res.send({success: true, reload: true});
            });
        });
    }
};


exports.addCode = function (req, res, next) {
    var applyId = 0;
    var categoryId = '',
        dlCount = 0,
        generalId = '',
        orderId = req.body.orderId || '',
        username = '';

    if(typeof req.body.orderId != 'undefined'){
        categoryId = req.body.categoryId;
        dlCount = req.body.dlCount;
        generalId = req.body.generalId;
        username = 'vdp-api';
    }else{
        categoryId = req.body.pk;
        dlCount = validator.trim(req.body.dlcount) || 1000000;
        generalId = validator.trim(req.body.generalid);
        username = req.session.user.name;
    }

    var qrcodeCount = req.body.QRCodeCount || 1;
    logger.debug('--------------------qrcodeCount:'+qrcodeCount+'------------------');

    var ep = new eventproxy();
    ep.fail(next);

    ep.on('update_err', function (msg) {
        res.status(422);
        return res.send(msg);
    });

    // 查询相同品类下是否有正在处理的入库操作，如果有提示用户稍后进行。
    var queryLogs = {};
    queryLogs.$and = [];
    queryLogs.$and[0] = {
        state: 0
    };
    queryLogs.$and[1] = {
        categoryId: categoryId
    };

    QRCodeApply.getQRCodeApplyByQuery(queryLogs,'', function (err, rs){
        if (rs.length > 0) {
            ep.emit('update_err', res.__('Cannot be processed because the category has work item in progress.'));
        } else {
            ep.emit('not_progress');
        }
    });
    ep.all('getCategory_ok', 'not_progress', function(categoryRs) {
        if(!categoryRs){
            return ep.emit('update_err', res.__('Cannot find category info by id: '+ categoryId + '.'));
        }

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
        var tmp = 0;
        if(orderId == ''){
            orderId == '00000';
            tmp = Math.floor(Math.random()*shardsRange.length);
        }else{
            tmp = parseInt(orderId.split('-')[0]);
            tmp = tmp%shardsRange.length;
        }
        var shardkey = Math.floor((parseInt(shardsRange[tmp][1])-parseInt(shardsRange[tmp][0]) + 1)*Math.random()) + parseInt(shardsRange[tmp][0]);
        logger.debug('orderId:'+ orderId +' shardkey:' + shardkey);
        //------

        // 一百万 一百万完成下载
        importCodeByStep(categoryId, generalId, categoryRs.QRCodeCount, orderId, shardkey, username, dlCount, categoryRs.isGDT);
        return res.send({success: true, reload: true});

    });
    Category.getCategoryById(categoryId, ep.done('getCategory_ok'));
};
var importCodeByStep = function (categoryId, generalId, qrcodeCount, orderId, shardkey, username, dlCount, isGDT) {
    importcode(categoryId, generalId, isGDT, qrcodeCount, orderId, shardkey, username, dlCount, function (iscon, residueCount) {
        if(iscon){
            importCodeByStep(categoryId, generalId, qrcodeCount, orderId, shardkey, username, residueCount, isGDT);
        }

    });
};

// 后台执行：下载二维码、解压缩、导入数据库、写日志、更新日志表、品类表、申请表
var importcode = function(categoryId, generalId, isGDT, qrcodeCount, orderId, shardkey, username, dlCount, callback) {
    var localPath = 'middlewares/data/ecode/',
        fileId = '',
        dlURL = config.interface_opts.apiDLCode,
        dlfile = localPath,
        filePath = localPath,
        returnExit = false,
        oneMillion = 1000000,
        applyId = 0;
    var downloadTimes = 0;
    var tmpCount = dlCount;
    var applyURL = config.interface_opts.apiApplyCode + dlCount+'/generalId='+generalId;
    if(isGDT){
        if(dlCount > oneMillion){
            tmpCount = oneMillion;
            //dlCount = dlCount - oneMillion;
        }
        dlURL = config.interface_opts.apiDLGDTCode + generalId + '?file=';
        applyURL = config.interface_opts.apiApplyGDTCode + generalId + '?number=' + tmpCount;
    }

    var proxy = new eventproxy();
    proxy.fail(function (err) {
        // 将二维码申请状态更新为失败
        QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
            rs.state = 2;
            rs.save();
        });
        Logs.addLogs('system', '[ImportCode]'+orderId+'Import ECODE Error ApplyID: '+ applyId +' ERR: '+ err, 'system', '2');
        return logger.error('[ImportCode]'+orderId+'Import ECODE Error ApplyID: '+ applyId +' ERR: '+ err);
    });

    //
    QRCodeApply.newAndSave(categoryId, generalId, orderId, username, tmpCount, function(err, appRS) {
        if (err) {
            Logs.addLogs('system', '[ImportCode]'+orderId+'Apply Code From ECODE Err: '+ err, 'system', '2');
            return logger.error('[ImportCode]'+orderId+'Apply Code From ECODE Err: '+ err);
        }
        applyId = appRS._id;
        Logs.addLogs('users', 'Apply ECODE('+tmpCount+') for CategoryID: '+ categoryId, username, '0');
        proxy.emit('start_apply');
    });

    // 申请二维码
    proxy.all('start_apply', function () {
        logger.info(orderId+' start apply code from ' + applyURL);
        QRCode.Apply(applyURL, isGDT, function(err, dlinfo) {
            if (err) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                proxy.emit('get_applyinfo', {
                    orderId: orderId,
                    state: 2,
                    message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Apply Code From ECODE Err: '+ err
                });
                Logs.addLogs('system', '[ImportCode]'+orderId+'Apply Code From ECODE Err: '+ err, 'system', '2');
                return logger.error('[ImportCode]'+orderId+'Apply Code From ECODE Err: '+ err);
            }
            if (dlinfo.indexOf('error occurred') >= 0 || dlinfo.indexOf('Could not connect to HTTP') >= 0) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                proxy.emit('get_applyinfo', {
                    orderId: orderId,
                    state: 2,
                    message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Apply Code From ECODE An error occurred.'
                });
                Logs.addLogs('system', '[ImportCode]'+orderId+'Apply Code From ECODE An error occurred. Error:'+dlinfo, 'system', '2');
                return logger.error('[ImportCode]'+orderId+'Apply Code From ECODE An error occurred. Error:'+dlinfo);
            } else {
                dlinfo = JSON.parse(dlinfo);
                if (dlinfo.status !== 200) {
                    // 将二维码申请状态更新为失败
                    QRCodeApply.getQRCodeApplyById(applyId, function (err, rs) {
                        rs.state = 2;
                        rs.save();
                    });
                    proxy.emit('get_applyinfo', {
                        orderId: orderId,
                        state: 2,
                        message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Apply Code From ECODE Err: ' + dlinfo.message
                    });
                    Logs.addLogs('system', '[ImportCode]'+orderId+'Apply Code From ECODE Err: ' + dlinfo.message, 'system', '2');
                    return logger.error('[ImportCode]'+orderId+'Apply Code From ECODE Err: ' + dlinfo.message);
                } else {
                    fileId = dlinfo.fileId;
                    dlURL = dlURL + fileId;
                    dlfile = dlfile +''+ fileId;
                    //因为国家二维码平台,生成新码的时候,如果数量大的话会有延时 5百万2-3分钟,
                    // 如果平台不设置延时就会导致文件下载不完整,无法完成解压导入
                    // setTimeout(function () {
                    //     proxy.emit('apply_ok');
                    // },30000);  //设置10分钟的延时 600 000/1000 = 600s = 10min
                    proxy.emit('apply_ok');
                }
            }
        });
    });


    // 开始下载二维码
    proxy.on('apply_ok', function () {
        // 如果一个文件下载次数超过3次，则申请失败，停止操作
        if(downloadTimes > 3){
            // 将二维码申请状态更新为失败
            QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                rs.state = 2;
                rs.save();
            });
            return proxy.emit('get_applyinfo', {
                orderId: orderId,
                state: 2,
                message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Download File: '+ dlURL +' ERR: file download or unzip error.' 
            });
        }
        logger.info(orderId+' start download code from  '+dlURL + ' . download times:' + downloadTimes);
        
        QRCode.Download(dlURL, dlfile, function(err){
            downloadTimes++;
            if (err) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                proxy.emit('get_applyinfo', {
                    orderId: orderId,
                    state: 2,
                    message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Download File: '+ dlURL +' ERR: '+ err
                });
                Logs.addLogs('system', '[ImportCode]'+orderId+'Download File: '+ dlURL +' ERR: '+ err, 'system', '2');
                return logger.error('[ImportCode]'+orderId+'Download File: '+ dlURL +' ERR: '+ err);
            } else {
                logger.debug('----------------start import----------------');
                logger.debug('[ImportCode]'+orderId+'Download: '+ dlURL);
                Logs.addLogs('system', '[ImportCode]'+orderId+'Download ECODE('+fileId+') from iotroot.com', 'system', '0');
                // 由于下载文件可能出现大小为空的情况，导致解压失败，而且不报错，所以添加一个文件大小为空的判断
                // 如果文件为空，则跳出当前循环
                fs.stat(dlfile, function (err_f, stats) {
                    if(err_f){
                        logger.error('[ImportCode]'+orderId+'Download ECODE('+fileId+') from iotroot.com error.Error: '+err_f);
                    }
                    //排除文件不为空的情况
                    if(stats.size){
                        logger.debug('[ImportCode]'+orderId+'Download file('+dlfile+') from iotroot.com success.');
                        return proxy.emit('download_ok');
                    }
                    // 将二维码申请状态更新为失败
                    QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                        rs.state = 2;
                        rs.save();
                    });
                    proxy.emit('get_applyinfo', {
                        orderId: orderId,
                        state: 2,
                        message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. UNZip File: '+ dlfile +' ERR: '+ err
                    });
                    Logs.addLogs('system', '[ImportCode]'+orderId+'UNZip File: '+ dlfile +' ERR: '+ err, 'system', '2');
                    return logger.error('[ImportCode]'+orderId+'UNZip File: '+ dlfile +' ERR: '+ err);
                });
                //
            }
        });
    });

    // 开始解压缩
    //proxy.all('apply_ok', 'download_ok', function() {
    proxy.on('download_ok', function() {
        tools.unzip(dlfile, localPath, function(err, filename) {
            if (err) {
                
                // 重新下载一次当前文件
                Logs.addLogs('system', '[ImportCode]'+orderId+'UNZip File: '+ dlfile +' ERR: '+ err, 'system', '2');
                logger.error('[ImportCode]'+orderId+'UNZip File: '+ dlfile +' ERR: '+ err);
                logger.error('[ImportCode]'+orderId+'Reload File: '+ dlfile +' downloadTimes:' + downloadTimes);
                //logger.error('[ImportCode]'+orderId+'Download file Fail: '+ filename + 'ERROR: the line number of the qrcode file is not same to apply number. ');
                return proxy.emit('apply_ok');
                
                // // 将二维码申请状态更新为失败
                // QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                //     rs.state = 2;
                //     rs.save();
                // });
                // returnExit = true;
                // proxy.emit('get_applyinfo', {
                //     orderId: orderId,
                //     state: 2,
                //     message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. UNZip File: '+ dlfile +' ERR: '+ err
                // });
                // Logs.addLogs('system', '[ImportCode]'+orderId+'UNZip File: '+ dlfile +' ERR: '+ err, 'system', '2');
                // return logger.error('[ImportCode]'+orderId+'UNZip File: '+ dlfile +' ERR: '+ err);
            } else {
                logger.debug('[ImportCode]'+orderId+'Unzip: '+ filename);
                filePath = filePath +''+ filename;
                Logs.addLogs('system', '[ImportCode]'+orderId+'Unzip '+ dlfile +' to '+ filename, 'system', '0');
                //解压完成，查看当前文件行数是否正确，如果行数有误，需要重新下载
                tools.shellgetLine(filePath, function (err, lineNum) {
                    //判断行数是否与申请量一致
                    if(lineNum == tmpCount){
                        logger.debug('[SOAP-PushOrder ' + filePath + '] download qrcode file completed.');
                        //return proxy.emit('unzip_ok');
                    }else{
                        // 重新下载一次当前文件
                        //downloadTimes++;
                        logger.error('[ImportCode]'+orderId+'Download file Fail: '+ filename + 'ERROR: the line number of the qrcode file is not same to apply number. ');
                        return proxy.emit('apply_ok');
                    }
                });
            }
        });
    });

    // 开始导入数据库
    proxy.on('unzip_ok', function () {
        if ( returnExit ) {
            return logger.error('----------------[ImportCode]end import----------------');
        };

        QRCode.Import(filePath, categoryId, isGDT, qrcodeCount, orderId, shardkey, function(err, info) {
            if (err) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                proxy.emit('get_applyinfo', {
                    orderId: orderId,
                    state: 2,
                    message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Insert DB ERR from File: '+ dlfile +' ERR: '+ err
                });
                Logs.addLogs('system', '[ImportCode]'+orderId+'Insert DB ERR from File: '+ dlfile +' ERR: '+ err, 'system', '2');
                return logger.error('[ImportCode]'+orderId+'Insert DB ERR from File: '+ dlfile +' ERR: '+ err);
            }
            if (info === 0) {
                // 将二维码申请状态更新为失败
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    rs.state = 2;
                    rs.save();
                });
                proxy.emit('get_applyinfo', {
                    orderId: orderId,
                    state: 2,
                    message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. duplicate key error index. RollBACK is OK. File: '+ filePath +', Import Count: ' + info
                });
                Logs.addLogs('system', '[ImportCode]'+orderId+'Insert Code complete. But duplicate key error index. RollBACK is OK. File: '+ filePath +', Import Count: ' + info, 'system', '2');
            } else {
                Logs.addLogs('system', '[ImportCode]'+orderId+'Insert Code complete. File: '+ filePath +', Import Count: ' + info, 'system', '0');
                // 更新申请表
                QRCodeApply.getQRCodeApplyById(applyId, function(err, rs) {
                    var orderId = rs.orderId;
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
                            proxy.emit('get_applyinfo', {
                                orderId: orderId,
                                state: 2,
                                message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Update apply info Err: ' + err + '. ImportCount: ' + info
                            });
                            return next(err);
                        } else {
                            // 更新品类表
                            Category.getCategoryById(categoryId, function(err, rs){
                                rs.codeCount = rs.codeCount + info;
                                rs.codeAvailable = rs.codeAvailable + info;
                                rs.codePool = rs.codePool + info;
                                rs.save(function(err) {
                                    if (err) {
                                        proxy.emit('get_applyinfo', {
                                            orderId: orderId,
                                            state: 2,
                                            message: '[SOAP-PushOrder '+ orderId +'] ApplyCode fail. Update category info Err: ' + err + '. ImportCount: ' + info,
                                            category: rs
                                        });
                                        return;
                                    }
                                    // 成功导入 100万， 查看是否导入完成， 完成以后， 触发事件， 62开始执行
                                    if(dlCount == info){
                                        proxy.emit('get_applyinfo', {
                                            orderId: orderId,
                                            state: 1,
                                            message: '[SOAP-PushOrder '+ orderId +'] ApplyCode success. ImportCount: ' + info,
                                            category: rs
                                        });
                                    }else{  //如果没导入完，继续写入
                                        logger.debug('[SOAP-PushOrder '+ orderId +'] ApplyCode count is not enough, countine to apply qrcode. Download count:'+dlCount-info);
                                        return callback(true, dlCount-info);
                                    }

                                });
                            });
                            logger.debug('----------------[ImportCode]end import----------------');
                        }
                    });
                });
            }
        });
    });

    // 如果是 62 调用自动下码，下码完成以后， 需要回调 62 开始执行工单
    // 下码成功失败，都执行这个来 给 62 返回值
    proxy.on('get_applyinfo', function (info) {
        // var cate_id = info.category._id;
        // console.log(cate_id);

        // 如果 orderId 不等于 空的情况下在执行 才调用62
        if(info.orderId !== '' && info.orderId !== '00000'){
            // 表示工单号不是5位的情况
            if(info.orderId.length > 7){
                // 首先创建新工单，然后调用工单开始接口
                // 创建工单信息，工单号 年月日 20180109+申请次数 取 80109 然后 1标识山东工厂 2标识内蒙工厂 工单号 1 80109 01
                // { "_id" : ObjectId("5a544d648d01a183637fe5ab"), "JobType" : "GAB250", "PicDpi" : "", "PicModel" : "", "PicFormat" : "",
                //     "QRCodeVersion" : "QR4|QR4|QR4", "createUser" : "bingjie.zhai", "designIdVersion" : "728110_0183_01-001", "vdpVersion" : "001",
                //     "designId" : "728110_0183_01", "name" : "成都冠宇_滋升中老年高钙低糖核桃花生奶_角标码",
                //     "RotAngle" : 0, "QRCodeSize" : "8.4", "pen_offset" : "0||", "ErrorLevel" : "1|1|1", "modulePoints" : "0",
                //     "QRCodeCount" : 1, "createDate" : ISODate("2018-01-09T05:04:36.536Z"), "state" : 0,
                //     "categoryImg" : "/public/images/product/default.png", "disable" : false, "codeAvailable" : 0, "codeCount" : 0,
                //     "isGDT" : true, "sendXML" : false, "sendURL" : false, "webNum" : 6, "splitSpec" : 18, "materiel_number" : [ 1100901768 ],
                //     "generalId" : "d7dde4056b90cac9ca5616cbd0aea885", "__v" : 1 }
                // 工单默认执行山东、内蒙各一次，暂时仅限山东 "F1C", 2,

                tools.ExecuteOrder(info, function (err, order_rs) {
                    if(err){    //工单开始失败
                        return logger.error('[SOAP-PushOrder '+ orderId +'] ApplyCode. OrderId: '+ orderId +'execute fail. ERR: '+err);
                    }
                    //工单开始执行
                    logger.debug(order_rs);
                });
                // saleNum, orderId, customerCode, productCode, vdpType, codeURL, planCount, multipleNum,
                //     splitSpec, designId, customerOrderNum, vdpVersion, orderNum, factoryCode, lineCode,
                //     webNum, pushMESDate, categoryId, smtDesginID, smtVersionID, callback
            }else{
                tools.ExecuteOrder(info, function (err, order_rs) {
                    if(err){    //工单开始失败
                        return logger.error('[SOAP-PushOrder '+ orderId +'] ApplyCode. OrderId: '+ orderId +'execute fail. ERR: '+err);
                    }
                    //工单开始执行
                    logger.debug(order_rs);
                });
            }



        }
    });


};

exports.getCategory = function (req, res, next) {
    var query = {};
    Category.getCategoryForSelect(query,'_id name designIdVersion state', function(err, data) {
        if (err) {
            return next(err);
        }
        res.send(data);
    });
};

// 补充码池
exports.addCodePool = function (req, res, next) {
    // 码池大小设为5000万
    var categoryId = req.body.pk;
    var dlcount = req.body.dlcount || 100000;
    // 更新品类表
    Category.updateCategory({_id:categoryId}, {needCodePool: true,totalcodePool:dlcount}, function (err, rs) {
       if(err){
           logger.error('Add category to CodePool fail. categoryId:' + categoryId + ' ERROR:' +err);
           Logs.addLogs('system', 'Add category to CodePool fail. categoryId:' + categoryId + ' ERROR:' +err, 'system', 2);
           res.status(422);
           return res.send('Add category to CodePool fail. categoryId:' + categoryId + ' ERROR:' +err);
       }

        // 开始申请二维码
        // 首先码池总量与可用量之间的差值
        return res.send({success: true, reload: true});

    });
};


// 停止补充码池任务
exports.stopCodePool = function (req, res, next) {
    // 码池大小设为5000万
    var categoryId = req.body.pk;
    // 更新品类表
    Category.updateCategory({_id:categoryId}, {needCodePool: false}, function (err, rs) {
        if(err){
            logger.error('Add category to CodePool fail. categoryId:' + categoryId + ' ERROR:' +err);
            Logs.addLogs('system', 'Add category to CodePool fail. categoryId:' + categoryId + ' ERROR:' +err, 'system', 2);
            res.status(422);
            return res.send('Add category to CodePool fail. categoryId:' + categoryId + ' ERROR:' +err);
        }

        // 开始申请二维码
        // 首先码池总量与可用量之间的差值
        return res.send({success: true, reload: true});

    });
};

var lt = require('long-timeout');
var indexfirst = 1;

// 一小时，循环执行
var interval = lt.setInterval(function() {
    //查询品类表，那些品类被标记为折角码码池状态
    Category.getCategoryByQuery({needCodePool: true}, '', function (err, rs) {
        if(err){
            logger.error('Query CodePool category fail. ERROR:' +err);
            return Logs.addLogs('system', 'Query CodePool category fail. ERROR:' +err, 'system', 2);

        }
        rs.forEach(function (category) {
            console.log(indexfirst);
            if(category.codePool < category.totalcodePool){
                startAddCodePool(category, indexfirst++);
            }

        });
    });
// }, 1000 * 60 * 1 );
}, 1000 * 60 * 60 );

var startAddCodePool = function(categoryRs, index){
    // 根据categoryIds中 品类的id，开始申请二维码，码池量为5000万
    // 不同品类之间可以同时申请

    var ep = new eventproxy();
    ep.fail();


    // 查询相同品类下是否有正在处理的入库操作，如果有提示用户稍后进行。
    var queryLogs = {};
    queryLogs.state = 0;
    queryLogs.categoryId = categoryRs._id;

    QRCodeApply.getQRCodeApplyByQuery(queryLogs,'', function (err, rs){
        // 如果查询错误，或者存在正在申请二维码的记录，等待下次执行
        if (err) {
            logger.error('[Task-ApplyCodePool] ApplyCode fail. Error:'+err+' categoryId:' + categoryRs._id);
            Logs.addLogs('system', '[Task-ApplyCodePool] ApplyCode fail. Error:'+err+' categoryId:' + categoryRs._id, 'system', '2');
            return;
        }
        if(rs.length > 0){
            logger.error('[Task-ApplyCodePool] ApplyCode is in progress. categoryId:' + categoryRs._id);
            Logs.addLogs('system', '[Task-ApplyCodePool] ApplyCode is in progress. categoryId:' + categoryRs._id, 'system', '2');
            return;
        } else {
            // 开始申请二维码
            ep.emit('not_progress'+index);
        }
    });

    ep.all('not_progress'+index, function() {

        var cate_id = categoryRs._id;
        console.log(cate_id);
        console.log(cate_id.toString());

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

        //查看申请次数 01-99 的循环
        var SaveFile = 'middlewares/data/applycode.json';
        var applystate = fs.readFileSync(SaveFile,"utf-8");
        applystate = JSON.parse(applystate);
        var applyTimes = parseInt(applystate.applyTimes);

        //一次申请3百万
        var qrcodeCount = 1; //二维码数量
        var oneFileLines = parseInt(config.interface_opts.GMSMaxPrintRows);
        //var dlCount = (oneFileLines - oneFileLines % categoryRs.splitSpec + categoryRs.splitSpec) * 300;  //申请量
        var dlCount = (oneFileLines - oneFileLines % categoryRs.splitSpec + categoryRs.splitSpec);  //申请量 * 300

        // 如果一次申请量超过码池量，以码池量作为申请量
        var actualCount = Math.abs(categoryRs.totalcodePool - categoryRs.codePool);
        if(dlCount*300 > actualCount){
            //dlCount = categoryRs.totalcodePool - categoryRs.totalcodePool % categoryRs.splitSpec + categoryRs.splitSpec;
            dlCount = (parseInt(actualCount/dlCount) + 1) * dlCount;
        }else{
            dlCount = dlCount*300;
        }

        var orderId = tools.formatDateforFile(Date.now()).replace(/-/g,'').substring(2,8); //20180109
        console.log(orderId);
        orderId = '1' + orderId;
        console.log(orderId);
        orderId += applyTimes > 9 ? applyTimes++ :('0'+ applyTimes++);
        console.log(orderId);
        var username = 'system';

        var tmp = Math.floor(Math.random()*shardsRange.length);
        var shardkey = Math.floor((parseInt(shardsRange[tmp][1])-parseInt(shardsRange[tmp][0]) + 1)*Math.random()) + parseInt(shardsRange[tmp][0]);
        logger.debug('orderId:'+ orderId +' shardkey:' + shardkey);
        //新建工单
        Order.newAndSave(orderId, orderId, categoryRs.designId.split('_')[0], orderId+"00", "3", "", dlCount, 1.2, 0, categoryRs.designId,
            "", categoryRs.vdpVersion, applystate.applyTimes, "F1C", 2, categoryRs.webNum, tools.formatDate(new Date()),
            categoryRs._id, "", "", function (err, rs) {
                if(err){
                    logger.error('[Task-ApplyCodePool] Failure to create ApplyCodePool order. orderId:'+orderId+' ERROR:' + err);
                    Logs.addLogs('system', '[Task-ApplyCodePool] Failure to create ApplyCodePool order. orderId:'+orderId+' ERROR:' + err, 'system', '2');
                    return;
                }
                console.log(rs);
                // 一百万 一百万完成下载
                importCodeByStep(categoryRs._id, categoryRs.generalId, categoryRs.QRCodeCount, orderId+"-"+applystate.applyTimes, shardkey, username, dlCount, categoryRs.isGDT);
                // 更新
                applystate.applyTimes = applystate.applyTimes+1;
                fs.writeFile(SaveFile, JSON.stringify(applystate), function(err, filedata) {
                    if (err) {
                        logger.error('Save order applyTimes fail. ERR: '+ err);
                    } else {
                        logger.debug('ReportData: '+ JSON.stringify(applystate));
                    }
                });
        });

    });

}