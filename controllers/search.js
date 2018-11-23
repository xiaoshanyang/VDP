/**
 * Created by youngs1 on 9/4/16.
 */
var config          = require('../config');
var validator       = require('validator');
var eventproxy      = require('eventproxy');
var logger          = require('../common/logger');
var Order           = require('../proxy').Order;
var Qrcode          = require('../proxy').QRCode;
var Roll            = require('../proxy').Roll;
var Categroy        = require('../proxy').Category;
var tools           = require('../common/tools');

exports.Result = function (req, res, next) {

    var query_qrcode = {};
    var qrcode_content = new Array();
    var query_order = {};
    var order_content = new Array();
    var query_roll = {};
    var roll_content = new Array();
    var roll_qrcode = [];      //保存二维码 对应的小卷号

    var reg_N = new RegExp("^[0-9]+$");
    var reg_NS = new RegExp("^[A-Za-z0-9]+$");
    var content = req.body.content || '';
    if (content != '') {
        if (content.indexOf(',') > 0) {
            content = content.replace(',', ' ');
        }
        content = content.split(' ');
        content.forEach(function (e) {
            if (reg_N.test(e) && e.length == 5) {   //工单号
                order_content.push(e);
            } else if (reg_N.test(e) && e.length == 22) {   //小卷号
                roll_content.push(e);
            } else {        //二维码
                qrcode_content.push(e);
            }
        });

    }



    var content = {
        content:{}
    };
    content.content.$in = qrcode_content;
    var content1 = {
        content1:{}
    };
    content1.content1.$in = qrcode_content;

    query_qrcode.$or = [content, content1];

    var ep = new eventproxy();
    ep.fail(next);

    Qrcode.getQRCodeByQuery(query_qrcode, '', function (err, rs) {
        if(err){
            logger.error('[Searching qrcode] searching qrcode in '+qrcode_content+' ERROR:' + err);
        }else{
            rs.forEach(function (q) {
                q.stateBynum = q.state==1?'已入库':(q.state==11?'已分发':(q.state>11&&q.state<1000?'已印刷':
                    (q.state>1000&&q.state<10000?'已分切':(q.state>10000?'已罐装':'空'))));
                if(typeof q.orderId !== 'undefined'){
                    if(order_content.indexOf(q.orderId.toString()) == -1){
                        order_content.push(q.orderId.toString());
                    }
                }
                //
                var issame = false;
                qrcode_content.forEach(function (t, i) {
                    if(q.content1 == t && !issame){
                        q.content = q.content1;
                        issame = true;
                    }
                });
            });
            // 如果扫描的content1 不显示congtent


            rs.forEach(function (q, index) {
                ep.after('get_roll_by_code', index, function () {
                    Categroy.getCategoryById(q.categoryId, function (err_c, rs_c) {
                        if(err_c){
                            logger.error('[Searching category] searching category in '+qrcode_content+' ERROR:' + err_c);
                            ep.emit('get_roll_by_code');
                        }else{
                            q.name = rs_c.name;
                            var query_tmp = {
                                categoryId: q.categoryId,
                                endSerial: {
                                    $gte: q.serialNum
                                },
                                startSerial: {
                                    $lte: q.serialNum
                                }
                                //actualWebNum: q.serialNum%rs_c.webNum?q.serialNum%rs_c.webNum:rs_c.webNum
                            };
                            Roll.getRollByQuery(query_tmp, '', function(err_r, rs_r){
                                if(err_r){
                                    logger.error('[Searching rollInfo] searching rollInfo in '+qrcode_content+' ERROR:' + err_r);
                                }else{
                                    rs_r.forEach(function (r) {
                                        if( (r.endSerial-q.serialNum)%rs_c.webNum == 0 ){
                                            var issame = false;
                                            for(var i=0; i<roll_qrcode.length; i++){
                                                if(roll_qrcode[i] == r.rollNum){
                                                    issame = true;
                                                }
                                            }
                                            if(!issame){
                                                roll_qrcode.push(r.rollNum);
                                            }
                                        }
                                    });
                                }
                                ep.emit('get_roll_by_code');
                                if(index === rs.length-1)
                                    ep.emit('get_newRollNum');
                            });
                        }
                    });
                });
            });
            if(rs.length == 0){
                ep.emit('get_newRollNum');
            }
        }
        ep.emit('get_qrcode', rs);


    });
    ep.all('get_qrcode', function () {      //包含了二维码所属的工单信息
        query_order.orderId = {};
        query_order.orderId.$in = order_content;
        query_order.state = 1;
        Order.getOrderByQuery(query_order, '', function (err, rs) {
            if(err){
                logger.error('[Searching order] searching order in '+order_content+' ERROR:' + err);
                ep.emit('get_order', rs);
            }else{
                rs.forEach(function (r, index) {
                    ep.after('get_category', index, function () {
                        Categroy.getCategoryById(r.categoryId, function(err_c, rs_c){
                            if(err_c){
                                logger.error('[Searching category] searching category in '+qrcode_content+' ERROR:' + err_c);
                            }else{
                                r.name = rs_c.name;
                            }
                            ep.emit('get_category');
                            if(index == rs.length -1){
                                ep.emit('get_order', rs);
                            }
                        });
                    });
                });
                if(rs.length==0){
                    ep.emit('get_order', rs);
                }
            }

        });
    });
    ep.all('get_newRollNum', function () {
        //把二维码所在的卷号添加进来
        if(roll_qrcode.length > 0){
            roll_content = roll_content.concat(roll_qrcode);
            roll_content.sort();
            var ret = [],
                end;
            end = roll_content[0];
            ret.push(roll_content[0]);
            for (var i=0; i < roll_content.length; i++){
                if (roll_content[i] != end) {
                    ret.push(roll_content[i]);
                    end = roll_content[i];
                }
            }
            roll_content = ret;
        }
        query_roll.rollNum = {};
        query_roll.rollNum.$in = roll_content;

        Roll.getRollByQuery(query_roll, '', ep.done('get_roll'));

    });
    ep.all('get_qrcode', 'get_order', 'get_roll', function (qrcodeList, orderList, rollList) {
        //把相同rollId的数据放在一块
        var showRoll = [];
        rollList.forEach(function (a) {
            var ismatch = false;
            showRoll.forEach(function (s) {
                if(s.rollNum == a.rollNum && !ismatch){
                    s.codeRange = s.codeRange + '<br>' + a.startSerial+'-->'+a.endSerial + ' ';
                    s.actualCode += a.actualCode;
                    ismatch = true;
                }
            });
            if(!ismatch){
                var j = showRoll.length;
                showRoll[j] = a;
                showRoll[j].codeRange = ''+a.startSerial+'-->'+a.endSerial+' ';
                showRoll[j].sortBy = a.bladeNumIn*10 + a.actualWebNum;
            }
        });

        res.render('search/search', {
            i18n: res,
            qrcodeList: qrcodeList,
            orderList: orderList,
            rollList: showRoll,
            rollByContent: roll_qrcode
        });
    });

};
