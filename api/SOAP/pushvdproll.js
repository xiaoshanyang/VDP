/**
 * Created by taozhou on 2017/4/7.
 * 2017/05/02
 * 1、 传送数码通的小卷 记录结果，失败的话，记录下来，此次所有小卷发送完毕以后，重新上传小卷
 *
 *
 */
/**
 * Created by youngs1 on 7/27/16.
 */
var mongoose            = require('mongoose');
var EventProxy          = require('eventproxy');
var _                   = require('lodash');
var soap                = require('soap');
var logger              = require('../../common/logger');
var config              = require('../../config');
var FS                  = require('fs');
var path                = require('path');
var Logs                = require('../../proxy').Logs;
var QRCode              = require('../../proxy').QRCode;
var Order               = require('../../proxy').Order;
var Category            = require('../../proxy').Category;
var Roll                = require('../../proxy').Roll;
var readLine            = require('lei-stream').readLine;
var writeLine           = require('lei-stream').writeLine;
var models              = require('../../models');
var QRCodeEntity        = models.QRCode;
var RollDetailInfo      = require('../../proxy').RollDetailInfo;
var Tools               = require('../../common/tools');
var sendRollRecord      = require('../../proxy').sendRollRecord;

// 成品小卷号
exports.PushVDPRoll = function (args) {
    // 获取参数
    var outDlCode = args.outDlCode;

    var rollNums = [],
        orderId = [],
        token = {};

    var ep = new EventProxy();

    // 暂时保存记录，数码通上线成功之后，重新传送
    // sendRollRecord.newAndSave(rollNums, [], rollNums, rollNums.length, rollNums.length, SentTime, outDlCode, function(err, rs) {
    //     if(err)
    //     {
    //         logger.error(err);
    //     }else{
    //         logger.debug('[SOAP-PushVDPRoll '+ outDlCode +'] insert into tables');
    //     }
    // });

    logger.debug('------------Start send roll file to GDT-------------');
    var openPath='middlewares/data/roll';

    ep.fail(function(err) {
        logger.error('[SOAP-PushVDPRoll '+ outDlCode +'] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-PushVDPRoll '+ outDlCode +'] Unexpected ERROR: '+ err, 'system', '2');
    });

    //获取需要传送的小卷号
    RollDetailInfo.getRollByQuery({outdlcode:outDlCode, send_state:0}, '', function (err, rs) {
        if(err){
            logger.error('[SOAP-PushVDPRoll '+ outDlCode +'] find roll file ERROR: '+ err);
            return Logs.addLogs('system', '[SOAP-PushVDPRoll '+ outDlCode +'] find roll file ERROR: '+ err, 'system', '2');
        }
        if(rs != null){
            if(rs.length > 0){
                // 去除重复的rollnumber
                rs.forEach(function (r, index) {
                   if(rollNums.indexOf(r.rollNum) < 0){
                       rollNums.push(r.rollNum);
                   }
                   if(orderId.indexOf(r.OrderNo) < 0){
                       orderId.push(r.OrderNo);
                   }
                });
                ep.emit('get_rollNum_ok');
            }else{
                logger.error('[SOAP-PushVDPRoll '+ outDlCode +'] cannot find roll file in database.');
                return Logs.addLogs('system', '[SOAP-PushVDPRoll '+ outDlCode +'] cannot find roll file in database.', 'system', '2');
            }
        }else{
            logger.error('[SOAP-PushVDPRoll '+ outDlCode +'] cannot find roll file in database.');
            return Logs.addLogs('system', '[SOAP-PushVDPRoll '+ outDlCode +'] cannot find roll file in database.', 'system', '2');
        }

    });

    // 根据工单查找对应token
    ep.all('get_rollNum_ok', function () {
        logger.debug('[SOAP-PushVDPRoll '+ outDlCode +'] OrderList: '+ orderId);
        orderId.forEach(function (orderNum) {
            Order.getOrderByQuery({orderId:orderNum, vdpType:{$in:[0,2,3,4]}},'',function (err, rs) {
                if(err){
                    return console.log('未查询到工单对应品类名');
                }
                if(rs.length == 0){ // 该工单不属于二维码工单，无需传送小卷信息，需要去除该小卷信息
                    ep.emit('TokenOk');
                    //去除不符合条件的工单（非二维码工单小卷）
                    for (var i = 0; i < rollNums.length;) {
                        if (rollNums[i].indexOf(orderNum) > 0) {
                            // 更新发送状态，send_state设置为-1
                            updateRollDetailInfo(outDlCode, rollNums[i], -1);
                            logger.error('[SOAP-PushVDPRoll ' + rollNums[i] + '] donot belong to qrcode roll.' + ':==:' + i + '/' + rollNums.length);
                            rollNums.splice(i, 1);
                        } else {
                            i++;
                        }
                    }
                }else{
                    Category.getCategoryByQuery({_id:rs[0].categoryId},'',function (error, rec) {
                        if(error){
                            return logger.error('未查询到品类Token ID');
                        }
                        if(rec.length>0){
                            //token.push(rec[0].generalId);
                            token['t'+rs[0].orderId]=rec[0].generalId;
                            ep.emit('TokenOk');
                        }
                    });
                }
            });
        });
        ep.after('TokenOk', orderId.length, function () {
            logger.debug('[SOAP-PushVDPRoll '+ outDlCode +'] tokenList: '+JSON.stringify(token));
            var tokencount = 0;
            for(var key in token){
                tokencount++;
            }
            if(tokencount > 0){
                ep.emit('get_order_token_ok');
            }

        });
    });

    ep.all('get_order_token_ok', function () {
        rollNums.forEach(function (file, index) {
            ep.after('send_one_roll', index, function () {
                var VDPRoll = file + '.txt';

                var orderIdIn = VDPRoll.substr(6, 5);
                if (FS.existsSync(openPath + '/' + VDPRoll)) {
                    // 判断一下 小卷文件 的条数， 如果超过小卷标准量500 则不再发送这个卷
                    Tools.shellgetLine(openPath + '/' + VDPRoll, function (err, lineNum) {
                        if(err){
                            logger.error(err);
                            return ep.emit('send_one_roll');
                        }
                        var num = VDPRoll.substr(17, 5);
                        //如果差值超过2个小卷标准差值，则这个小卷不再发送，标记为小卷计算失败， 放入 createfail数组中记录下来
                        if(Math.abs(lineNum - num) > 2*config.Dvalue_Roll){
                            logger.error('[SOAP-PushVDPRoll ' + VDPRoll + '] Exceeds the number of rows. LineNum: '+lineNum);
                            updateRollDetailInfo(outDlCode, file, 3);
                            return ep.emit('send_one_roll');
                        }
                        var codePost = '';
                        readLine(openPath + '/' + VDPRoll).go(function (data, next) {
                            if (data.split(',').length > 0) {
                                codePost += data.split(',')[0] + '\n';
                            } else {
                                logger.error('[SOAP-PushVDPRoll ' + data + '] Unexpected ERROR.');
                            }
                            // 如果是以i开头的二维码，暂时不上传小卷文件 https://q.openhema.com/i7df69g4a4bdg4i3hc01j2eh

                            next();
                        }, function () {
                            if(codePost == ''){
                                updateRollDetailInfo(outDlCode, file, 2);
                                ep.emit('send_one_roll');
                            }else{
                                Tools.SendRollToGD(VDPRoll.replace('.txt', ''), token['t'+orderIdIn], codePost, function (error, rec) {
                                    ////0:未发送、1:发送完成、2:发送失败、3:小卷文件错误、
                                    var status = 1;
                                    if(error){
                                        logger.error(index + '/'+ rollNums.length + ':==:' + rec);
                                        status = 2;
                                    }else{
                                        logger.debug(index + '/'+ rollNums.length + ':==:' + rec);
                                    }
                                    updateRollDetailInfo(outDlCode, file, status);
                                    ep.emit('send_one_roll');
                                });
                            }

                        });
                    });
                } else {
                    //记录没有找到的卷码文件 存放mongo数据库
                    logger.error('[SOAP-PushVDPRoll ' + VDPRoll + '] cannot find roll file.' + ':==:' +  index + '/' + rollNums.length );
                    updateRollDetailInfo(outDlCode, file, 3);
                    setTimeout(function () {
                        ep.emit('send_one_roll');
                    }, 1000);
                }
            });
        });
    });
};

var updateRollDetailInfo = function (outDlCode, rollNum, status) {
    RollDetailInfo.updateRollDetailInfoByQuery({outdlcode:outDlCode, rollNum:rollNum}, {send_state:status}, function (err, rs) {
        if(err){
            console.log(err);
        }
        console.log(JSON.stringify(rs));
    });
};

var sendAgian = function (sendId, sendRoll, outDlCode, tokenId, times) {   // 通过回调来完成，所有上传失败的工单完成上传
    var sendFail = [];
    var ep = new EventProxy();
    var openPath = 'middlewares/data/roll';
    if(times == 3){
        logger.error('[SOAP-PushVDPRoll ' + outDlCode + '] upload fail rollNums: '+ sendRoll);
        return;
    }
    sendRoll.forEach(function (file, index) {
        ep.after('send_one_roll', index, function () {
            var VDPRoll = file;
            var flag = false;
            if (index == sendRoll.length - 1) {
                flag = true;
            }
            var orderIdIn = VDPRoll.substr(6, 5);
            if (FS.existsSync(openPath + '/' + VDPRoll)) {
                var codePost = '';
                readLine(openPath + '/' + VDPRoll).go(function (data, next) {
                    if (data.split(',').length > 0) {
                        codePost += data.split(',')[0] + '\n';
                    } else {
                        logger.error('[SOAP-PushVDPRoll ' + data + '] Unexpected ERROR.');
                    }
                    next();
                }, function () {
                    Tools.SendRollToGD(VDPRoll.replace('.txt', ''), tokenId['t'+orderIdIn], codePost, function (error, rec) {
                        if(error){
                            logger.error(index + '/'+ sendRoll.length + ':==:' + rec);

                        }else{
                            logger.debug(index + '/'+ sendRoll.length + ':==:' + rec);
                        }
                        if (flag) { //当推送的数组是最后一个时，才统一调用写数据库
                            logger.debug('[SOAP-PushVDPRoll ' + outDlCode + '] files send complete. counts: ' + sendRoll.length + ' fails: '+sendFail.length );
                            // 不新建一条记录，更新之前的记录，通过_id搜索

                        }
                        ep.emit('send_one_roll');
                    });
                });
            }
        });
    });
};

//把生成失败的小卷文件， 记录下来， 等待以后查询
var saveCannotFindRoll = function (createFailRoll) {
    // 把没有文件的记录，插入到一个固定的文件中
    sendRollRecord.getSendRollRecordByoutDlCode('CannotFindRollList', function (err, rs) {
        if(err){
            return logger.error('[SOAP-PushVDPRoll] cannot CannotFindRollList. Error:'+err);
        }
        if(rs){
            createFailRoll.forEach(function (failRoll) {
                if(rs.failrollNum.indexOf(failRoll) == -1){
                    rs.failrollNum.push(failRoll);
                }
            });
            rs.failCount = rs.failrollNum.length;
            // 保存记录
            rs.save(function (err, rs_r) {
                if(err){
                    return logger.error('[SOAP-PushVDPRoll] add createFailRoll to CannotFindRollList fail. Error:'+err);
                }
                logger.debug('[SOAP-PushVDPRoll] add createFailRoll to CannotFindRollList success.');
            });
        }else{  //新建一个，专门存放无法生成的小卷文件的记录
            sendRollRecord.newAndSave([], createFailRoll, [], 0, createFailRoll.length,
                new Date(), 'CannotFindRollList', function (err, rs_n) {
                if(err){
                    return logger.error('[SOAP-PushVDPRoll] add createFailRoll to CannotFindRollList fail. Error:'+err);
                }
                logger.debug('[SOAP-PushVDPRoll] add createFailRoll to CannotFindRollList success.');
            });
        }
    });
};

var returnFeedbackInfo = function (outDlCode, rollType, FactoryId, sendState) {

    var factory='F2A';
    if(FactoryId.indexOf('F1')>=0){

        factory='F1C';
    }

    for(var i=0;;i++){
        var c = i==0?'':i;
        var fac = eval('config.interface_opts.apiReturnCode'+c);
        if(typeof fac == 'undefined' || fac == ''){
            url = config.interface_opts.apiPushOrderReturn;
            break;
        }else{
            if(fac.indexOf(factory) >=0){
                url = eval('config.interface_opts.apiPushOrderReturn'+c);
                break;
            }
        }
    }

    var args = {
        OutDLCode: outDlCode,
        type: rollType,
        returnFlag: '1'
    };

    soap.createClient(url, function(err, client) {
        client.get_QRCode_Feedback_PushVDPRool_Info(args, function(err, result) {
            if(result.get_QRCode_Feedback_PushVDPRool_InfoResult){
                console.log('返回成功');
            }else{
                console.log('fail conntected to MES');
            }
        });
    });
};