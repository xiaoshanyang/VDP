/*
* 1. 根据GMS完成情况，调用VDP接口，按照其返回值，更新vdp 工单状态，成功、失败
* 2. 根据返回值 complete ：true？false 来实现二维码状态更新
* */
var EventProxy          = require('eventproxy');
var logger              = require('../../common/logger');
var readLine            = require('lei-stream').readLine;
var FS                  = require('fs');
var mongoose            = require('mongoose');
var Logs                = require('../../proxy').Logs;
var Category            = require('../../proxy').Category;
var Order               = require('../../proxy').Order;
var models              = require('../../models');
var QRCodeEntity        = models.QRCode;

exports.updateOrderState = function (orderId, orderNum, state, fileName) {


    // 没有明确是第几次的申请记录，按照实际情况
    var query = {
        orderId: orderId,
        state: 0
    }
    if(orderNum != 0){
        query.orderNum = orderNum;
    }
    Order.getOrderByQuery(query, '', function (err, rs) {
       if(err){
           logger.error('[SOAP-PushOrder '+ orderId +'] update order info fail. Error:' + err);
           return Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Update order info fail. ERR: '+ err, 'system', '2');
       }
       if(rs.length > 0){
           //修正品类表中的可用码量
           rs.state = state?1:2;
           rs.save(function () {
               Category.getCategoryById(rs.categoryId, function(err, cate){
                   if(err){
                       logger.error('[SOAP-PushOrder '+ orderId +'] update order info fail. Error:' + err);
                       return Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Update order info fail. ERR: '+ err, 'system', '2');
                   }
                   if(cate != null){
                       cate.codeAvailable -= rs.actCount;
                       cate.save(function () {
                           updateQRCode(rs.startSerialNum-1);
                       });
                   }

               });
           });
       }
    });

    var updateQRCode= function(maxSerial){
        // 更新二维码状态
        var filePath = 'middlewares/data/preprint/ALL_' + fileName;
        filePath = filePath.replace('zip', 'txt');
        logger.debug('[SOAP-PushOrder '+ orderId +'] Start update code. fileName: '+ filePath);
        var loopUpdateNum = 0;
        var batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
        readLine(filePath).go(function (data, next) {
            loopUpdateNum++;
            var tmpdata = '';
            if(data.indexOf('/')>=0){
                tmpdata = data.slice(data.lastIndexOf('/')+1, data.length);
            }
            batch.find({content: {$in: [data, tmpdata]}}).update({
                $set: {
                    orderId: parseInt(orderId),
                    state: 11,
                    printNum: 0,
                    cansNum: 0,
                    serialNum: eval(maxSerial + loopUpdateNum)
                }
            });
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
            //删除ALL文件
            FS.unlink(filePath, function(err) {
                if (err) {
                    Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Delete ALL File Error. File:'+ filePath +' OrderId: '+ orderId +' Err:'+ err, 'system', '2');
                    return logger.error('[SOAP-PushOrder '+ orderId +'] Delete ALL File Error. File:'+ filePath +' OrderId: '+ orderId +' Err:'+ err);
                }
                logger.debug('[SOAP-PushOrder '+ orderId +'] Delete temp file is ok.');
            });
        });
    }



}