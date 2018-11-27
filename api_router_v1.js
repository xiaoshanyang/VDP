/**
 * Created by youngs1 on 6/15/16.
 */
var EventProxy = require('eventproxy');

var logger = require('./common/logger');
var pushOrder = require('./api/SOAP/pushorder');
var updateOrderState = require('./api/SOAP/pushOrderUpdate');
var pushSplit = require('./api/SOAP/pushsplit');
var pushDefect = require('./api/SOAP/pushdefect');
var pushRoll = require('./api/SOAP/pushroll');
var pushVdpRoll = require('./api/SOAP/pushvdproll');
var Order = require('./proxy').Order;
var RollDetailInfo = require('./proxy').RollDetailInfo;
var tools = require('./common/tools');


exports.startOrder = function (req, res, next) {
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
}


//接收工单
exports.pushOrder = function(req, res, next){
    logger.debug('Received a SOAP request from MES. Call: PushOrder Args:'+ JSON.stringify(req.body));
    var state = 1;
    var message = '';
    //判断参数是否正确
    var args = req.body;
    if ([args.saleNum, args.orderId, args.customerCode,
        args.vdpType, args.productCode,
        args.planCount, args.multipleNum,
        args.designId, args.vdpVersion, args.orderNum, args.factoryCode, args.lineCode,
        args.pushMESDate].some(function (item) { return item === ''; })) {
        state = 2; 
        message = '某些参数为空';
        logger.error('[SOAP-PushOrder '+ args.orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null');
        Logs.addLogs('system', '[SOAP-PushOrder '+ args.orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null. Args:' + JSON.stringify(args), 'system', '2');
    }
    //pushOrder.pushOrder(args);
    res.status(200).json({state:state, message:message});
};

exports.pushSplit = function (req, res, next) {
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
};

exports.pushSequences = function (req, res, next) {
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
};

exports.pushRoll = function (req, res, next) {
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
};

exports.pushRolls = function (req, res, next) {
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
};

exports.updateOrderState = function (req, res, next) {
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
};