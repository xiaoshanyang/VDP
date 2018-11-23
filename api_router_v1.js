/**
 * Created by youngs1 on 6/15/16.
 */
var EventProxy = require('eventproxy');

var config = require('./config');
var logger = require('./common/logger');
// 不再引入pushOrder， 可能会出错
var pushOrder = require('./api/SOAP/pushorder');
var updateOrderState = require('./api/SOAP/pushOrderUpdate');
var pushSplit = require('./api/SOAP/pushsplit');
var pushDefect = require('./api/SOAP/pushdefect');
var pushRoll = require('./api/SOAP/pushroll');
var qrcodeTrace = require('./api/SOAP/qrcodeQualityTraceability');
var pushVdpRoll = require('./api/SOAP/pushvdproll');
var updateOrder = require('./api/SOAP/updateOrder');
var Order = require('./proxy').Order;
var RollDetailInfo = require('./proxy').RollDetailInfo;
var http = require('http');
var tools = require('./common/tools');
//因为使用 express 需要设置一些中间件，直接创建web服务
//开发这个服务，给61调用，然后，回调pushorder函数
//参数：工单号、或者 是 62 临时表中的id号

var express = require('express');
var router = express.Router();
router.post('/startOrder', function (req, res, next) {
    var orderId = req.body.orderId || 0;
    var state = req.body.state || 2;    // 1成功 、2失败
    var message = req.body.message || '';
    if(orderId != 0 && state == 1){
        // 执行工单, 返回给61 返回值
        res.send('[SOAP-PushOrder '+ orderId +'] apply code success. order continue executing');
    }else{
        res.send('[SOAP-PushOrder '+ orderId +'] apply code fail. order fail.ERR:' + message);
    }
    // 开始调用， 工单生成 的接口， 完成工单, 在调用pushorder 接口，重新来一次
    Order.getOrderByQuery({orderId: orderId.split('-')[0], orderNum: orderId.split('-')[1]}, '', function (err, rs) {
        if(err){

        }
        console.log(JSON.stringify(rs[0]));
        rs[0].state = state==1?4:2;

        console.log(rs[0].planCount);
        rs[0].save(function () {
            // 直接 插入到 redis中 等待执行
            if(state==2){
                tools.returnMesOrderInfo(rs[0].orderId, rs[0].orderNum, rs[0].factoryCode+'_'+rs[0].lineCode)
            }else{
                rs[0].planCount = rs[0].planCount / 1000;
                console.log(rs[0].planCount);
                pushOrder.pushOrder(rs[0]);
            }


        });
    });
});

router.post('/pushSplit', function (req, res, next) {
    logger.debug('Received a SOAP request from MES. Call: PushSplit Args:'+ JSON.stringify(req.body));
    pushSplit.pushSplit({
        ID: req.body.ID,
        orderId: req.body.processOrder,
        rollNum: req.body.reelnums,
        rollCode: req.body.qrList,
        webNum: req.body.num
        }, function (err, rs) {
           if(err){
               res.status(200).json(err);
           }else{
               console.log(rs);
               res.status(200).json(rs);
           }
    });
});
// arrScan = args.scanSequences
router.post('/pushSequences', function (req, res, next) {
    logger.debug('Received a SOAP request from MES. Call: pushSequences Args:'+ JSON.stringify(req.body));
    var mm = {ID:"23021",Status:null,ErrMessage:null,
        scanSequences:"https://ga.openhema.com/H0001b0000W0hXTQMM65EyY2,https://ga.openhema.com/H0001b0000W000xY5RgdcNPs"};
    pushDefect.pushDefect({
        ID: mm.ID,
        // PuID: req.body.PuID,
        PuID: mm.PuID,
        scanSequences: mm.scanSequences
    }, function (err, rs) {
        if(err){
            res.status(200).json(err);
        }else{
            console.log(rs);
            res.status(200).json(rs);
        }
    });
});
//     orderId = args.orderId,
//     rollNum = args.rollNum,
//     startCode = args.startCode,
//     endCode = args.endCode;
router.post('/pushRoll', function (req, res, next) {
    logger.debug('Received a SOAP request from MES. Call: pushRoll Args:'+ JSON.stringify(req.body));
    pushRoll.pushRoll({
        ID: req.body.ID,
        PuID: req.body.PuID,
        orderId: req.body.processOrder,
        rollNum: req.body.reelnums,
        startCode: req.body.startCode,
        endCode: req.body.endCode
    }, function (err, rs) {
        if(err){
            res.status(200).json(err);
        }else{
            console.log(rs);
            res.status(200).json(rs);
        }
    });
});

router.post('/pushRolls', function (req, res, next) {
    logger.debug(JSON.stringify(req.body));
    var ep = new EventProxy();
    ep.fail(function(err) {
        logger.error('[SOAP-Receive '+ outDlCode +'] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-Receive '+ outDlCode +'] Unexpected ERROR: '+ err, 'system', '2');
    });

    var rollArr = req.body || '';
    if(rollArr instanceof Array){
        // 将收到的信息，入库
        if(rollArr.length > 0){
            logger.debug('[SOAP-PushVDPRoll '+ rollArr[0].outdlcode + '] roll counts: '+ rollArr.length);
            RollDetailInfo.deleteRollNumByOutCode(rollArr[0].outdlcode, function (err, rs) {
                if(err){
                    logger.error('[save rollDetailInfo] find outdlcode error. Err:'+err);
                    return res.status(200).json({state:2,message:'数据库查询错误'});
                }else{
                    rollArr.forEach(function (r, index) {
                        // 如果已经存在则删除之前的数据？
                        RollDetailInfo.newAndSave(r, function (err) {
                            if(err){
                                logger.error('[save rollDetailInfo] rollNum:'+ r.G_Reels +' err: '+err);
                            }
                            ep.emit('rollDetailInfo_save');
                        });
                    });
                    ep.after('rollDetailInfo_save', rollArr.length, function () {
                        // 开始按照rollNums中的小卷，上传文件    发货批次、小卷、时间
                        pushVdpRoll.PushVDPRoll({outDlCode:rollArr[0].outdlcode, SentTime:rollArr[0].DeliveryDate});
                    });

                    res.status(200).json({state:1,message:'接收成功，共'+rollArr.length+'条数据'});
                }
            });

        } else {
            res.status(200).json({state:0,message:'没有接收到小卷信息'});
        }
    }
    else{
        console.log('接收参数错误');
        res.status(200).json({state:2,message:'参数类型错误，不是数组'});

    }
});

// router.get('/pushSplit', function (req, res, next) {
//     var mm = {orderId:"14961",rollNum:"0000001496101000200000,0000001496102000200000,0000001496103000200000,0000001496104000200000,0000001496105000200000,0000001496106000200000",
//         rollCode:"https://ga.openhema.com/H0000-000034zHZofGvZcXFf,https://ga.openhema.com/H0000-000030PNs2cqNuzzgq,https://ga.openhema.com/H0000-000030OzzPYqxEA4Bu,https://ga.openhema.com/H0000-00003036lvI-lSpml0",
//         webNum:"6",ID:"002"};
//     pushSplit.pushSplit(mm, function (err, rs) {
//         if(err){
//             res.status(200).json(err);
//         }else{
//             console.log(rs);
//             res.status(200).json(rs);
//         }
//     });
// });

router.get('/updateOrderState', function (req, res, next) {
    var orderId = req.query.orderId || '';
    var isSuccess = req.query.complete || '';
    var fileName = req.query.fileName || '';

    //如果数据没有问题 直接返回值
    orderId = orderId.split('-');
    if(orderId.length != 2 || fileName == ''){
        res.status(200).send('False');
    }else{
        res.status(200).send('Yes');
    }

    updateOrderState.updateOrderState(orderId[0], orderId[1], isSuccess, fileName);
});

router.get('/qrcodeQualityTraceability/:content', qrcodeTrace.qrcodeTrace);
router.post('/updateOrder', updateOrder.updateOrder);



module.exports = router;