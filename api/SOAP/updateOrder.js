var EventProxy = require('eventproxy');
var readLine   = require('lei-stream').readLine;
var FS         = require('fs');
var logger     = require('../../common/logger');
var QRCode     = require('../../proxy').QRCode;
var Order      = require('../../proxy').Order;
var Category   = require('../../proxy').Category;
var models     = require('../../models');
var QRCodeEntity = models.QRCode;


exports.updateOrder = function (req, res, next) {


    var saleNum = req.body.saleNum || '';
    var orderId = req.body.orderId || '';
    var customerCode = req.body.customerCode || '';
    var productCode = req.body.productCode || '';
    var vdpType = req.body.vdpType || 0;
    var codeURL = req.body.codeURL || '';
    var planCount = parseFloat(req.body.planCount || 0)*1000;
    var multipleNum = req.body.multipleNum || 0;
    var splitSpec =  req.body.splitSpec || 0;
    var designId = req.body.designId || '';
    var vdpVersion = req.body.vdpVersion || '';
    var customerOrderNum = req.body.customerOrderNum || '';
    var orderNum = req.body.orderNum || 0;
    var factoryCode = req.body.factoryCode || '';
    var lineCode = req.body.lineCode || '';
    var webNum = req.body.webNum || 0;
    var pushMESDate = req.body.pushMESDate || '';
    var smtDesginID = req.body.gd_number || 0;
    var smtVersionID = req.body.gd_Ver || 0;

    var minPID = parseInt(req.body.minPID || "0");
    var maxPID = parseInt(req.body.maxPID || "0");

    var startContent = '';
    var endContent = '';
    // 二维码序列号
    var serialNum = 0;
    var startSerialNum = 0;

    console.log(req.body);

    // 返回值，state:5 成功创建工单、 state:-1 创建工单失败
    var returnData = {
        state : 5,
        message:''
    }

    var ep = new EventProxy();
    ep.fail(next);


    ep.all('responseData', function () {
        // 工单保存完成，返回GMS
        res.status(200).json(returnData);
        console.log(returnData);
    });

    //根据设计好、版本号获取, 更新category 中PID的值
    Category.getCategoryByQuery({designId: designId, vdpVersion: vdpVersion}, '', function (err, rs) {
        if(err){
            logger.error('query category info error. designId:'+designId+' ERR:'+err);
            returnData.state = -1;
            returnData.message = 'query category info error. designId:'+designId+' ERR:'+err;
            return ep.emit('responseData');
        }
        if(rs.length == 1){
            ep.emit('getCategoryOk', rs[0]);
        }


    });

    //首先保存工单信息入库
    var query = {orderId: orderId, orderNum: req.body.orderNum};
    Order.getOrderByQuery(query, '', function (err, rs) {
        if(err){
            logger.error('query order info error. orderId:'+orderId+' ERR:'+err);
            returnData.state = -1;
            returnData.message = 'query order info error. orderId:'+orderId+' ERR:'+err;
            return ep.emit('responseData');
        }

        if(rs.length > 0){
            logger.error('query order info error. orderId:'+orderId+' ERR:'+err);
            returnData.state = -1;
            returnData.message = 'query order info error. orderId:'+orderId+' ERR:'+err;
            return ep.emit('responseData');
        }
        ep.emit('checkOrderOk')
    });

    // 获取当前品类，历史工单中最大的serialNum值
    query = {designId: designId, vdpVersion:vdpVersion, state:1, orderId:{$lt:100000}};
    Order.getOrderByQuery(query, {sort: '-_id', limit: 1}, function (err, rs) {
        if(err){
            logger.error('query serialNum info error. ERR:'+err);
            returnData.state = -1;
            returnData.message = 'query serialNum info error. ERR:'+err;
            return ep.emit('responseData');
        }
        if(rs.length > 0){
            serialNum = rs[0].endSerialNum;
        }
        startSerialNum = serialNum;
        //ep.emit('getSerialNum');
        ep.emit('responseData');
    });

    ep.all('getCategoryOk', 'checkOrderOk', 'getSerialNum', function (categoryRs) {
        Order.newAndSave(saleNum, orderId, customerCode, productCode, vdpType, codeURL, planCount, multipleNum,
            splitSpec, designId, customerOrderNum, vdpVersion, orderNum, factoryCode, lineCode,
            webNum, pushMESDate, categoryRs._id, smtDesginID, smtVersionID, function (err, rs) {
                if(err){
                    logger.error('order info insert to DB fail. orderId:'+orderId+' ERR:'+err);
                    returnData.state = -1;
                    returnData.message = 'order info insert to DB fail. orderId:'+orderId+' ERR:'+err;
                    return ep.emit('responseData');
                }
                logger.debug('order info insert to DB success. orderId:'+orderId);
                ep.emit('responseData');
                ep.emit('insertOrderOk', categoryRs);
            });
    });



    // 工单插入完成，开始更新数据
    ep.all('insertOrderOk', function (categoryRs) {
        var tmpFileCount = 1000000;
        //组合txt文件路径
        var filPath = 'middlewares/data/preprint/AQRCVariable/' + designId+'-'+vdpVersion;

        var loopUpdateNum = 0;
        // 获取minPID 与 maxPID 之间的文件
        for(var i=0; i<=maxPID-minPID; i++){
            ep.after('updateone', i, function () {
                var pidFilePath = filPath + '-' + eval(tmpFileCount+minPID)+'.txt';
                // 文件不存在，跳出当前循环
                if(!FS.existsSync(pidFilePath)){
                    return;
                }
                var batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
                readLine(pidFilePath).go(function (data, next) {
                    loopUpdateNum++;
                    data = data.replace('\r','');
                    data = data.split(',')[0];

                    if(loopUpdateNum == 1){
                        startContent = data;
                    }

                    batch.find({content: data}).update({
                        $set: {
                            orderId: parseInt(orderId),
                            state: 11,
                            serialNum: ++serialNum
                        }
                    });
                    if(loopUpdateNum%webNum == 0){
                        endContent = data;
                    }

                    if (loopUpdateNum % 5000 === 0) {
                        batch.execute(function(err) {
                            if (err) {
                                Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Update Code State Error OrderID: '+ orderId +' ERR: '+ err, 'system', '2');
                                return logger.error('[SOAP-PushOrder '+ orderId +'] Update Code State Error OrderID: '+ orderId +' ERR: '+ err);
                            } else {
                                logger.debug('[SOAP-PushOrder '+ orderId +'] Update 5000 code.');
                                batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
                                next();
                            }
                        });
                    } else {
                        next();
                    }
                }, function() {
                    if (loopUpdateNum % 5000 != 0) {
                        batch.execute(function(err) {
                            if (err) {
                                Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Update Code State Error OrderID: '+ orderId +' ERR: '+ err, 'system', '2');
                                return logger.error('[SOAP-PushOrder '+ orderId +'] Update Code State Error OrderID: '+ orderId +' ERR: '+ err);
                            }
                            logger.debug('[SOAP-PushOrder '+ orderId +'] Last 5000 code.');
                            batch = null;
                        });
                    } else {
                        logger.debug('[SOAP-PushOrder '+ orderId +'] Update code is ok.');
                        batch = null;
                    }

                    minPID++;

                    ep.emit('updateone');
                    //删除ALL文件
                    FS.unlink(pidFilePath, function(err) {
                        if (err) {
                            Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Delete ALL File Error. File:'+ pidFilePath +' OrderId: '+ orderId +' Err:'+ err, 'system', '2');
                            return logger.error('[SOAP-PushOrder '+ orderId +'] Delete ALL File Error. File:'+ pidFilePath +' OrderId: '+ orderId +' Err:'+ err);
                        }
                        logger.debug('[SOAP-PushOrder '+ orderId +'] Delete temp file is ok.');
                    });

                    if(minPID > maxPID){
                        // 更新工单状态
                        ep.all('startQRCode', 'endQRCode', function (startQRCode, endQRCode) {
                            Order.updateOrder({orderId:orderId, orderNum:orderNum},
                                    {state:1,actCount:planCount,startCodeId:startQRCode._id,endCodeId:endQRCode._id, fileName:pidFilePath, startSerialNum:startSerialNum, endSerialNum: serialNum, actCount:loopUpdateNum}, function (err, rs) {
                                if(err){
                                    return logger.debug('[SOAP-PushOrder '+ orderId +'] order state update fail. Error:' + err);
                                }

                                // 工单状态更新完成，需要更新 品类中 码池的量，以及可用码量
                                Category.updateCategory({_id:categoryRs._id},{codePool:categoryRs.codePool - loopUpdateNum}, function (err, rs) {
                                    if(err){
                                        return logger.debug('[SOAP-PushOrder '+ orderId +'] category info update fail. Error:' + err);
                                    }
                                    logger.debug('[SOAP-PushOrder '+ orderId +'] codePool:'+ categoryRs.codePool - loopUpdateNum);
                                    logger.debug('[SOAP-PushOrder '+ orderId +'] order state update success.');
                                });
                            });
                        });


                        QRCode.getQRCodeByCode(startContent, ep.done('startQRCode'));
                        QRCode.getQRCodeByCode(endContent, ep.done('endQRCode'));
                    }

                });

            });
        }
    });

}

