var mongoose            = require('mongoose');
var EventProxy          = require('eventproxy');
var RollDetailInfo      = require('../proxy').RollDetailInfo;
var Order               = require('../proxy').Order;
var Category            = require('../proxy').Category;
var Tools               = require('../common/tools');
var config              = require('../config');
var FS                  = require('fs');
var readLine            = require('lei-stream').readLine;
var logger              = require('../common/logger');


exports.sendRollstoGdt = function () {

    var ep = new EventProxy();
    ep.fail(function(err) {
        logger.error('[SOAP-PushVDPRoll] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-PushVDPRoll] Unexpected ERROR: '+ err, 'system', '2');
    });
    //存放 orderId 与 token 对应关系
    var tokenList = {};

    // 查找rollDetail表中 发送状态为0(未处理)，2(发送失败) 的小卷，发送数码通
    RollDetailInfo.getRollNumByGroup({send_state:{$in:[0,2]}}, {_id:{rollNum:"$rollNum", orderId:"$OrderNo"}}, function (err, rs) {
       console.log(rs);
       console.log(rs.length);
       if(err){
           return;
       }
       if(rs.length > 0){
           // 首先判断工单号是否存在
           rs.forEach(function (r, index) {
               ep.after('deal', index, function () {

                   if( typeof tokenList['t'+ r._id.orderId] != 'undefined'){
                       if(tokenList['t'+ r._id.orderId] == -1){
                           setTimeout(function () {
                               ep.emit('deal');
                           }, 1000);
                       }else{
                           // 上传文件
                           uploadRollFile(r._id.rollNum + '.txt', r._id.orderId, index, rs.length, function (err, rss) {
                               setTimeout(function () {
                                   ep.emit('deal');
                               }, 1000);
                           });
                       }
                   }else{
                       // 未处理过当前工单，首先查找是否存在
                       tokenList['t'+ r._id.orderId] = -1;
                       Order.getOrderByQuery({orderId:r._id.orderId, vdpType:{$in:[0,2,3,4]}}, {}, function (err, rs_o) {
                          if(err){
                              return ep.emit('deal');
                          }
                          if(rs_o.length > 0){
                              // 查找token
                              Category.getCategoryByQuery({_id:rs_o[0].categoryId},'',function (error, rec) {
                                  if(error){
                                      ep.emit('deal');
                                      return logger.error('未查询到品类Token ID');
                                  }
                                  if(rec.length>0){
                                      tokenList['t'+rs_o[0].orderId]=rec[0].generalId;
                                      // 上传文件
                                      uploadRollFile(r._id.rollNum + '.txt', rs_o[0].orderId, index, rs.length, function (err, rss) {
                                          ep.emit('deal');
                                      });
                                  }
                              });
                          }else{
                              // 没有找到对应工单，更新所有此工单小卷状态
                              RollDetailInfo.updateRollDetailInfoByQuery({OrderNo:r._id.orderId}, {send_state:-1}, function (err, rs) {
                                  if(err){
                                      console.log(err);
                                  }
                                  console.log(JSON.stringify(rs));
                                  ep.emit('deal');
                              });

                          }
                       });
                   }
               });
           });
       }
    });

    function uploadRollFile(VDPRoll, orderIdIn, rollIndex, rollCount, callback) {
        var openPath = 'middlewares/data/roll';
        if (FS.existsSync(openPath + '/' + VDPRoll)) {
            // 判断一下 小卷文件 的条数， 如果超过小卷标准量500 则不再发送这个卷
            Tools.shellgetLine(openPath + '/' + VDPRoll, function (err, lineNum) {
                if(err){
                    logger.error(err);
                    return callback(err, null);
                }
                var num = VDPRoll.substr(17, 5);
                //如果差值超过2个小卷标准差值，则这个小卷不再发送，标记为小卷计算失败， 放入 createfail数组中记录下来
                if(Math.abs(lineNum - num) > 2*config.Dvalue_Roll){
                    logger.error('[SOAP-PushVDPRoll ' + VDPRoll + '] Exceeds the number of rows. LineNum: '+lineNum);
                    updateRollDetailInfo(VDPRoll, 3);
                    return callback('lineNum error', null);
                }
                var codePost = '';
                readLine(openPath + '/' + VDPRoll).go(function (data, next) {
                    if (data.split(',').length > 0) {
                        codePost += data.split(',')[0] + '\n';
                    } else {
                        logger.error('[SOAP-PushVDPRoll ' + data + '] Unexpected ERROR.');
                    }
                    next();
                }, function () {
                    if(codePost == ''){
                        updateRollDetailInfo(VDPRoll, 2);
                        ep.emit('send_one_roll');
                    }else {
                        Tools.SendRollToGD(VDPRoll.replace('.txt', ''), tokenList['t' + orderIdIn], codePost, function (error, rec) {
                            ////0:未发送、1:发送完成、2:发送失败、3:小卷文件错误、
                            var status = 1;
                            if (error) {
                                logger.error(rollIndex + '/' + rollCount + ':==:' + rec);
                                status = 2;
                            } else {
                                logger.debug(rollIndex + '/' + rollCount + ':==:' + rec);
                            }
                            updateRollDetailInfo(VDPRoll, status);
                            callback(null, 'success');
                        });
                    }
                });
            });
        } else {
            //记录没有找到的卷码文件 存放mongo数据库
            logger.error('[SOAP-PushVDPRoll ' + VDPRoll + '] cannot find roll file.' + ':==:' +  rollIndex + '/' + rollCount );
            updateRollDetailInfo(VDPRoll, 3);
            return callback('cannot find roll file', null);
        }
    }

    var updateRollDetailInfo = function (rollNum, status) {
        rollNum = rollNum.replace('.txt','');
        RollDetailInfo.updateRollDetailInfoByQuery({rollNum:rollNum}, {send_state:status}, function (err, rs) {
            if(err){
                console.log(err);
            }
            console.log(JSON.stringify(rs));
        });
    };

}

