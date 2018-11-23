
var EventProxy          = require('eventproxy');
var RollDetailInfo      = require('../proxy').RollDetailInfo;
var Roll               = require('../proxy').Roll;
var Category            = require('../proxy').Category;
var Tools               = require('../common/tools');
var FS                  = require('fs');
var logger              = require('../common/logger');


exports.getSendRollInfoByDate = function (req, res, next) {
    //获取时间参数
    var paramsDate = req.body.sendDate || "";
    var deliveryDate = new Date(paramsDate);
    var deliveryDateNext = new Date(paramsDate);
    deliveryDateNext.setDate(deliveryDate.getDate()+1);

    var ep = new EventProxy();
    var responseData = {
        state:0,
        rolls:[]
    };


    RollDetailInfo.getRollNumByGroup({send_state:1,DeliveryDate:{$gte:deliveryDate,$lt:deliveryDateNext}},
        {_id:{rollNum:"$rollNum", deliver_add:"$deliver_add",DeliveryDate:"$DeliveryDate"}},function (err, rs) {
        console.log(rs);
        console.log(rs.length);
        if(err){
            console.log(err);
            return;
        }
        if(rs.length > 0){
            // 返回小卷信息
            // 卷号，时间，发货地址、  码数/活动名称，token
            rs.forEach(function (r, index) {
                ep.after('getToken', index , function () {
                    var rollData = {};
                    rollData.ScrollNo = r._id.rollNum; //小卷号
                    rollData.Place = r._id.deliver_add; // 发货地址
                    rollData.SendDate = Tools.formatDateHHmmss(r._id.DeliveryDate); //发货时间
                    // 从roll表中取出categoryId+码数
                    // 从category表总取出token+活动名称
                    Roll.getRollByQuery({rollNum:r._id.rollNum}, {sort:{_id:1}}, function(err_r, rs_r){
                        if(err_r){
                            logger.error('[Searching rollInfo] searching rollInfo by '+codes+' ERROR:' + err_r);
                            ep.emit('basicInfoError', '查找二维码对应小卷信息错误');
                        }else{
                            if(rs_r.length > 0){
                                var codeCount = 0;
                                rs_r.forEach(function (rr) {
                                    codeCount += rr.actualCode;
                                });
                                rollData.PackNum = codeCount;

                                Category.getCategoryById(rs_r[0].categoryId, function (err_c, rs_c) {
                                    if(err_c){

                                    }
                                    if(rs_c != null){
                                        rollData.Name = rs_c.name;
                                        rollData.Token = rs_c.generalId;
                                        responseData.rolls.push(rollData);
                                        ep.emit('getToken');
                                    }
                                });
                            }
                            if(rs_r.length == 0){
                                logger.error('[Searching rollInfo] cannot find rollInfo by '+r.rollNum);
                                responseData.rolls.push(rollData);
                                ep.emit('getToken');
                            }
                        }
                    });

                });
            });
            ep.after('getToken', rs.length , function () {
                // 查询完成，返回结果
                responseData.state = 1;
                res.status(200).send(responseData);
            });
        }else{
            responseData.state = 2;
            res.status(200).send(responseData);
        }
    });
}