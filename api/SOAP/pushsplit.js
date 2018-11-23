/**
 * Created by youngs1 on 7/25/16.
 */

/**
 * 2017-04-21: 做一个与mes通信的接口，返回小卷文件计算成功、失败的信息
 * 1、创建一个restful接口， mes调用， 返回小卷信息
 * 2、在计算出正确的小卷区间以后，返回mes信息
 * 3、返回信息：
 *          {
 *              状态：0失败，1成功，
 *              卷号：分切，返回一幅还是多幅
 *              实际码量：根据区间算出的实际量
 *              错误信息: 1、接受参数为空
 *                       2、扫的码不成对，奇数
 *                       3、工单号与小卷号中包含的工单号不一致
 *                       4、幅数 没有找打最后一幅的小卷
 *                       5、卷号数组长度与幅数不相等
 *                       6、有二维码没有找到
 *                       7、库中查到的二维码 与 扫描的二维码 不一致
 *                       8、没有找到 对应品类 的幅数
 *                       9、二维码是不属于同一副
 *                       10、没有找到对应工单
 *                       11、起始、结束码之间， 范围过大，超过 18100*webNum
 *                       12、查找其他幅对应的 二维码失败
 *                       13、做成各卷的虚拟接头失败
 *                       14、把webNum幅的小卷插入数据表 失败
 *          }
 *2017-04-27: 返回信息确认
 * 分切下卷调用VDP的Restfull接口返回信息：
     返回信息：状态Status、         ID（ID）、实际码量（ActualCodeNum）、容错差值（FaultTolerantValue）、错误信息（ErrMessage）
                 0：失败，原因
                     2：超过容错包数
                     3：卷码关系计算失败；需要去纸病（详细错误信息返回）
                 1：成功。继续不提示。

                 
 */
var mongoose            = require('mongoose');
var EventProxy          = require('eventproxy');
var logger              = require('../../common/logger');
var _                   = require('lodash');
var config              = require('../../config');
var writeLine           = require('lei-stream').writeLine;

var Logs                = require('../../proxy').Logs;
var QRCode              = require('../../proxy').QRCode;
var Category            = require('../../proxy').Category;
var Roll                = require('../../proxy').Roll;
var Order               = require('../../proxy').Order;
var Scan                = require('../../proxy').ScanSerial;
var models              = require('../../models');
var QRCodeEntity        = models.QRCode;

exports.pushSplit = function (args, callback) {
    // 获取参数
    var orderId = parseInt(args.orderId),
        rollNum = args.rollNum,
        rollCode = args.rollCode,
        webNum = args.webNum;

    var err_message = '';
    // 验证参数
    if ([orderId, rollNum, rollCode, webNum].some(function (item) { return item === ''; })) {
        err_message = '[SOAP-PushSplit] Received a SOAP request from MES. Call: PushSplit Args has Null';
        Logs.addLogs('system', err_message, 'system', '2');
        logger.error(err_message);
        err_message = '参数为空';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
    }
    rollCode = rollCode.split(',');
    rollNum = rollNum.split(',');
    if (rollCode.length % 2 !== 0) {
        err_message = '[SOAP-PushSplit] Received a SOAP request from MES. Call: PushSplit rollCode not Even numbers.';
        Logs.addLogs('system', err_message, 'system', '2');
        logger.error(err_message);
        err_message = '二维码不成对存在';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
    }

    var rollId = '',
        doctorId = '',
        orderIdIn = '',
        webNumIn = '',
        bladeNumIn = '',
        ActualCountIn = '',
        MAXROLLNUM = config.roll_maxCount || 18100,
        msgContent = '',
        strRollNum = '';

    rollNum.forEach(function(e){
        if (parseInt(e.substr(11, 2)) == webNum) {
            strRollNum = e;
            rollId = e.substr(0, 6);
            doctorId = e.substr(1, 1);
            orderIdIn = e.substr(6, 5);
            webNumIn = parseInt(e.substr(11, 2));
            bladeNumIn = e.substr(13, 4);
            ActualCountIn = e.substr(17, 5);
        }
    });

    var CodeSerial = [],
        oldRollCodeSerial = [],
        vsRollCode = [],
        newRollCodeSerial = [],
        categoryId = '',
        needCreatescanSerial = false,   //需要生产接头信息，不直接退回
        scanSerialFlag = false, //用来标识是否有接头
        scanSerial = [];    //用来存接头信息
    var Qrcodes = [];       //记录二维码对应的id

    logger.debug('[SOAP-PushSplit]------------Received PushSplit-------------');
    logger.debug('[SOAP-PushSplit] orderId: '+ orderId);
    logger.debug('[SOAP-PushSplit] rollNum: '+ JSON.stringify(rollNum));
    logger.debug('[SOAP-PushSplit] rollCode: '+ rollCode);
    logger.debug('[SOAP-PushSplit] webNum: '+ webNum);
    logger.debug('[SOAP-PushSplit] rollId: '+ rollId);
    logger.debug('[SOAP-PushSplit] orderIdIn: '+ orderIdIn);
    logger.debug('[SOAP-PushSplit] webNumIn: '+ webNumIn);
    logger.debug('[SOAP-PushSplit] bladeNumIn: '+ bladeNumIn);
    logger.debug('[SOAP-PushSplit] ActualCountIn: '+ ActualCountIn);


    var ep = new EventProxy();
    ep.fail(function(err) {
        err_message = '[SOAP-PushSplit '+ strRollNum +'] Unexpected ERROR: '+ err;
        Logs.addLogs('system', err_message, 'system', '2');
        logger.error(err_message);
        err_message = '发生异常';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
    });

    // ---------------开始第一次参数判断---------------
    // 合印工单----两个工单号处理
    // 判断工单号相等；
    if (orderId != orderIdIn) {
        err_message = '[SOAP-PushSplit '+ strRollNum +'] Verify args ERROR: orderId != orderId in rollNum';
        Logs.addLogs('system', err_message, 'system', '2');
        logger.error(err_message);
        err_message = '工单号与小卷号对应工单号不一致';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
    }
    // 判断幅数相等；
    if (webNum != webNumIn) {
        err_message = '[SOAP-PushSplit '+ strRollNum +'] Verify args ERROR: webNum != webNum in rollNum';
        Logs.addLogs('system', err_message, 'system', '2');
        logger.error(err_message);
        err_message = '幅数与小卷号对应幅数不一致';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
    }
    // 卷号数组长度与幅数必须相等
    if (rollNum.length != webNumIn) {
        err_message = '[SOAP-PushSplit '+ strRollNum +'] Verify args ERROR: rollNum.length != webNumIn in rollNum';
        Logs.addLogs('system', err_message, 'system', '2');
        logger.error(err_message);
        err_message = '小卷号数量与幅数不一致';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
    }
    // ---------------结束第一次参数判断---------------

    // 只处理?E=的情况， 非数码通的二维码， 不自带url， 还是需要拆分
    // 通过工单号、取得品类， 再通过品类来确认是否属于数码通类型二维码

    // ---------------开始初始化信息---------------
    // 查询二维码
    rollCode.forEach(function (e) {
        //由于数码通url包含没有?E=的情况,所以要把这个?E=先去掉
        // e = e.replace('?E=', '');
        // // e = e.split('=');
        // e = e.split('/');
        // e = e[e.length-1];
        // 只处理?E=的情况， 非数码通的二维码， 不自带url， 还是需要拆分
        if(e.indexOf('?E=') >= 0){
            e = e.replace('?E=', '');
            e = e.substring(e.lastIndexOf('/')+1, e.length);
        }
        oldRollCodeSerial.push(e);
        QRCode.getQRCodeByCode(e, ep.done('getQRCode_ok'));

        //QRCode.getQRCodeByCodeArray([e, e1], ep.done('getQRCode_ok'));
    });
    // 由于Sharding机制导致返回次序为乱序，需要将序列数组排序为参数传递过来的次序
    ep.after('getQRCode_ok', rollCode.length, function(docs) {
        if (docs != null) {
            logger.debug('oldRollCodeSerial: '+ JSON.stringify(oldRollCodeSerial));
            // 循环传递过来的二维码数组
            oldRollCodeSerial.forEach(function (f) {
                docs.forEach(function (e) {
                    if (e) {
                        categoryId = e.categoryId;
                        // 应对多码情况下，随机扫码, 查看属于哪个码
                        if (e.content == f || f.indexOf(e.content)>=0) {
                            CodeSerial.push(e.serialNum);
                            vsRollCode.push(e.content);
                        }
                        if (e.content1 == f || f.indexOf(e.content1)>=0) {
                            CodeSerial.push(e.serialNum);
                            vsRollCode.push(e.content1);
                        }
                    }
                });
                ep.emit('ReQRCode_ok');
            });
        } else {
            err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find all qrcode';
            Logs.addLogs('system', err_message, 'system', '2');
            logger.error(err_message);
            err_message = '无法找到扫描二维码';
            return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
        }
    });
    // 输出没有找到的二维码
    ep.after('ReQRCode_ok', rollCode.length, function() {
        var nofindCode = _.difference(oldRollCodeSerial, vsRollCode);
        if (nofindCode.length > 0) {
            // 如果发现不同，处理带url的二维码后，在进行比较
            vsRollCode.forEach(function (vc, index) {
                if(vc.indexOf('/')<0){
                    oldRollCodeSerial[index] = oldRollCodeSerial[index].replace('?E=', '');
                    oldRollCodeSerial[index] = oldRollCodeSerial[index].slice(oldRollCodeSerial[index].lastIndexOf('/')+1, oldRollCodeSerial[index].length);
                }
            });
            nofindCode = _.difference(oldRollCodeSerial, vsRollCode);
            if(nofindCode.length > 0){
                err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find qrcode: '+ JSON.stringify(nofindCode);
                Logs.addLogs('system', err_message, 'system', '2');
                logger.error(err_message);
                err_message = '无法找到扫描二维码';
                return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
            } else {
                logger.debug('Old Arr: '+JSON.stringify(oldRollCodeSerial));
                logger.debug('New Arr: '+JSON.stringify(CodeSerial));
                logger.debug('New Code:'+JSON.stringify(vsRollCode));
                ep.emit('FindCode_ok');
            }
        } else {
            logger.debug('Old Arr: '+JSON.stringify(oldRollCodeSerial));
            logger.debug('New Arr: '+JSON.stringify(CodeSerial));
            logger.debug('New Code:'+JSON.stringify(vsRollCode));
            ep.emit('FindCode_ok');
        }
    });
    // 获取品类幅数
    ep.all('FindCode_ok', function () {
        Category.getCategoryById(mongoose.Types.ObjectId(categoryId), function (err, rs) {
            if (err) {
                err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find Category: ' + categoryId;
                Logs.addLogs('system', err_message, 'system', '2');
                logger.error(err_message);
                err_message = '查找品类错误';
                return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
            } else {
                if (rs != null) {
                    webNum = rs.webNum;
                    ep.emit('getCategory_ok');
                } else {
                    err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find Category: ' + categoryId;
                    Logs.addLogs('system', err_message, 'system', '2');
                    logger.error(err_message);
                    err_message = '无法找到二维码对应品类';
                    return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
                }
            }
        });
    });

    // 验证二维码序列
    ep.all('getCategory_ok', function() {
        //将默认数组顺序从表到底（大,小）调整为从底到表（小,大）
        //CodeSerial = CodeSerial.reverse();

        //循环数组并校验数组
        logger.debug('Old Serial: '+ JSON.stringify(CodeSerial));
        for (var i = 0; i < CodeSerial.length; i++) {
            var Serial = CodeSerial[i];
            // 判断二维码是否属于同一副
            if (Serial % webNum != 0) {
                msgContent = 'Code not the same webnum.';
                InsertRoll(categoryId, Serial, CodeSerial[i+1], vsRollCode[i], vsRollCode[i+1], orderId, strRollNum, webNum, webNumIn, ActualCountIn,
                    0, msgContent, doctorId, bladeNumIn, function () {});
                err_message = '[SOAP-PushSplit '+ strRollNum +'] Code not the same webnum.';
                Logs.addLogs('system', err_message, 'system', '2');
                logger.error(err_message);
                err_message = '扫描二维码不属于最后一幅';
                return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);


            } else {
                // 偶数位切非最后一位时，计算当前位与数组其它位差值最小的值***此处通过i变量判断，i变量初始为0，即i的奇数实际是数组的偶数
                if (i % 2 != 0 && i != (CodeSerial.length - 1) && i != 0) {
                    var val1 = Serial - CodeSerial[i - 1];
                    var val2 = CodeSerial[i+1] - CodeSerial[i - 1];
                    if (val2 > 0 && val2 < Math.abs(val1)) {
                        CodeSerial[i] = CodeSerial[i + 1];
                        CodeSerial[i + 1] = Serial;
                        //-------------
                        //把serial对应的二维码顺序修改
                        var tmpcode = vsRollCode[i];
                        vsRollCode[i] = vsRollCode[i+1];
                        vsRollCode[i+1] = tmpcode;
                        //-------------
                    }
                }
            }
        }
        logger.debug('New Serial: '+ JSON.stringify(CodeSerial));
        //---------------输出二维码序列
        logger.debug('New Code: '+ JSON.stringify(vsRollCode));

        //----------得到这一刀的区间------------------
        // 判断是否有跨单的情况出现，即起始、结束码不属于同一个工单区间
        var startNum = [];
        var endNum = [];
        var startId = ''; //记录这个工单的起始码
        var endId = '';   //记录上个工单的结束码
        var newCodeSerial = [];
        var newvsRollCode = [];
        CodeSerial.forEach(function (cs, index) {
            ep.after('getSerialNum_ok', index, function () {
                var query = {
                    categoryId: categoryId,
                    endSerialNum: {$gte: cs},
                    state: 1,
                    orderId: {$lte:100000}
                };

                Order.getOrderByQuery(query, {sort: 'endSerialNum', limit: 1}, function (err, rs) {
                    if(err){
                        err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find scanSerialNum belong to which order:' + cs;
                        Logs.addLogs('system', err_message, 'system', '2');
                        logger.error(err_message);
                        err_message = '查找扫描二维码对应工单失败';
                        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
                    }
                    if(rs.length>0){
                        //找到所属区间，记录，当判断一对是否属于同一个区间
                        if(index % 2 == 0){
                            startNum = [];
                            endNum = [];
                            startNum.push(rs[0].startSerialNum);
                            endNum.push(rs[0].endSerialNum);
                            endId = rs[0].endCodeId;
                            ep.emit('getSerialNum_ok');
                        }
                        if(index % 2 != 0){
                            startNum.push(rs[0].startSerialNum);
                            endNum.push(rs[0].endSerialNum);
                            startId = rs[0].startCodeId;
                            if(startNum[0] != startNum[1] && endNum[0] != endNum[1]){
                                newCodeSerial.push(CodeSerial[index-1]); //原始起始码
                                newCodeSerial.push(endNum[0]);       //新加接头
                                newCodeSerial.push(startNum[1]+webNum-1);     //新加接头
                                newCodeSerial.push(cs);              //原始结束码
                                //表示起始、结束码属于两个工单，需要生成一个虚拟接头
                                ep.all('getStart', 'getEnd', function (startcode, endcode) {
                                    if(startcode && endcode){
                                        newvsRollCode.push(vsRollCode[index-1]);
                                        newvsRollCode.push(endcode.content);
                                        newvsRollCode.push(startcode[webNum-1].content);
                                        newvsRollCode.push(vsRollCode[index]);
                                        //得到新接头，需要保存，提示一个flag，然后，在下边生成该小卷所有幅数的区间时，
                                        // 再生成新的接头
                                        scanSerialFlag = true;
                                        scanSerial.push(newvsRollCode.length-3);
                                        ep.emit('getSerialNum_ok');
                                    }else{
                                        err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find scanSerialNum dui ying code:' + cs;
                                        Logs.addLogs('system', err_message, 'system', '2');
                                        logger.error(err_message);
                                        err_message = '跨单情况计算序列号所对应二维码错误';
                                        return callback(err_message, null);
                                    }
                                });
                                var query_s = {
                                    _id: {$gte: startId},
                                    categoryId: categoryId
                                };
                                QRCode.getQRCodeByQuery(query_s, {sort: '_id', limit: webNum}, ep.done('getStart'));    //这个需要取得最后一幅上的二维码信息，而不是所属区间的第一个码
                                QRCode.getQRCodeById(endId, ep.done('getEnd'));
                            }else{
                                newCodeSerial.push(CodeSerial[index-1]);
                                newCodeSerial.push(cs);
                                newvsRollCode.push(vsRollCode[index-1]);
                                newvsRollCode.push(vsRollCode[index]);
                                ep.emit('getSerialNum_ok');
                            }
                        }
                    }
                });
            });
            if(index==0) {
                ep.after('getSerialNum_ok', CodeSerial.length, function () {
                    if (newCodeSerial.length > 0) {
                        CodeSerial = newCodeSerial;
                        vsRollCode = newvsRollCode;
                    }
                    logger.debug('By check cross order:');
                    logger.debug('New Serial: ' + JSON.stringify(CodeSerial));
                    //---------------输出二维码序列
                    logger.debug('New Code: ' + JSON.stringify(vsRollCode));

                    ep.emit('checkCrossOrder_ok');
                });
            }
        });
        //------------------------------------------


        //---------------开始第二次参数判断---------------
        ep.all('checkCrossOrder_ok', function () {
            var maxallcount = MAXROLLNUM * (webNum+2);
            for (var j = 0; j < CodeSerial.length; j++) {
                if (j % 2 != 0) {
                    // 判断新的序列码中是否存在大于 最大小卷数量（最大小卷数*(6+2)） 多给几幅的容错空间
                    var maxavtcount = Math.abs(CodeSerial[j]-CodeSerial[j-1]);
                    if (maxavtcount > maxallcount) {
                        msgContent = 'MaxCodeCount is '+ maxavtcount +' > '+ maxallcount;
                        InsertRoll(categoryId, CodeSerial[j-1], CodeSerial[j], vsRollCode[j-1], vsRollCode[j], orderId, rollNum, webNum, webNumIn, ActualCountIn, 0, msgContent, doctorId, bladeNumIn, function(){
                            
                        });
                        err_message = '[SOAP-PushSplit '+ strRollNum +'] MaxCodeCount is '+ maxavtcount +' > '+ maxallcount + '('+MAXROLLNUM+'*'+'('+webNum+'+2))';
                        Logs.addLogs('system', err_message, 'system', '2');
                        logger.error(err_message);
                        err_message = '扫描二维码间隔过大，无法计算正确小卷区间';
                        callback({Status:3, ID:args.ID,
                            ActualCodeNum:maxavtcount/webNum,
                            FaultTolerantValue:Math.abs(maxavtcount/webNum-ActualCountIn),
                            ErrMessage:err_message}, null);
                        if(scanSerialFlag){
                            needCreatescanSerial = true;
                        }else{
                            return;
                        }

                    };
                    // 判断上下码是否连续
                    if (maxavtcount == webNum) {
                        msgContent = 'Code is continuity(y - x = webNum).';
                        InsertRoll(categoryId, CodeSerial[j-1], CodeSerial[j], vsRollCode[j-1], vsRollCode[j], orderId, rollNum, webNum, webNumIn, ActualCountIn, 0, msgContent, doctorId, bladeNumIn, function () {
                            
                        });
                        err_message = '[SOAP-PushSplit '+ strRollNum +'] Code is continuity(y - x = webNum).';
                        Logs.addLogs('system', err_message, 'system', '2');
                        logger.error(err_message);
                        err_message = '扫描二维码是连续的';
                        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
                    };
                }
            }
            //---------------结束第二次参数判断---------------
            //已经计算完毕，无需等待所有小卷计算完毕，那样耗时6S 调用callback， 给mes返回值
            var ActualCodeNum = 0;
            CodeSerial.forEach(function (s, index) {
                if(index%2){
                    ActualCodeNum += Math.abs(s-CodeSerial[index-1]);
                }
            });
            if(!needCreatescanSerial){
                callback(null, {
                    Status: 1,  //成功
                    ID: args.ID,
                    ActualCodeNum: ActualCodeNum / webNum,
                    FaultTolerantValue: Math.abs(ActualCodeNum/webNum-parseInt(ActualCountIn)),
                    ErrMessage: ''
                });
            }

            //取得各幅数对应的二维码
            vsRollCode.forEach(function(code, index){
                Qrcodes.push([]);
                ep.after('getContent_ok', index, function () {
                    QRCode.getQRCodeByCode(code, function (err, rs) {
                        if(err){
                            err_message = '[SOAP-PushSplit '+ strRollNum +'] find qrcode._id error. code:'+ code +'. ERR: '+ err;
                            Logs.addLogs('system', err_message, 'system', '2');
                            logger.error(err_message);
                            err_message = '各幅数对应的二维码失败';
                            return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
                        }
                        if(rs){
                            var query_qrcode = {
                            };
                            query_qrcode._id={};
                            query_qrcode._id.$lte=rs._id;
                            if(typeof rs.distribution != 'undefined' && rs.distribution != null){
                                query_qrcode.distribution = rs.distribution;
                            }

                            query_qrcode.categoryId=categoryId;
                            var options = { limit: webNum, sort: '-_id'};
                            QRCode.getQRCodeByQuery(query_qrcode, options, function (err, rs) {
                                if(err){
                                    err_message = '[SOAP-PushSplit '+ strRollNum +'] find qrcode._ids by _id error. _id:'+ rs._id +'. ERR: '+ err;
                                    Logs.addLogs('system', err_message, 'system', '2');
                                    logger.error(err_message);
                                    err_message = '各幅数对应的二维码失败';
                                    return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
                                }
                                rs.forEach(function (r) {
                                    Qrcodes[index].push(r);
                                });
                                ep.emit('getContent_ok');
                                if(index == vsRollCode.length-1){
                                    ep.emit('getAllContent_ok');
                                }
                            });
                        }else{
                            ep.emit('getContent_ok');
                            if(index == vsRollCode.length-1){
                                ep.emit('getAllContent_ok');
                            }
                        }
                    });
                });
            });
        });
        //
        // 计算其它小卷
        //ep.after('getContent_ok', vsRollCode.length, function () {
        ep.all('getAllContent_ok', function () {
            //生成接头信息
            scanSerial.forEach(function (sc, index) {
                var webNumCount = [];
                for(var i=webNum; i>0; i--){
                    webNumCount.push(i);
                }
                webNumCount.forEach(function(web, c){        //每幅一个接头
                    var scanQuery = {
                        $or:[{codeSerial:CodeSerial[sc]-(webNum-web)},{groupCode:CodeSerial[sc]-(webNum-web)}],
                        categoryId:mongoose.Types.ObjectId(categoryId)
                    };
                    Scan.getScanByQuery(scanQuery, '', function (err, rs) {
                        if(err){
                            err_message = '[SOAP-PushSplit '+ strRollNum +'] Cant find scanSerialNum: ' + CodeSerial[sc];
                            Logs.addLogs('system', err_message, 'system', '2');
                            logger.error(err_message);
                            err_message = '计算其它小卷区间失败';
                            return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:ActualCountIn, ErrMessage:err_message}, null);
                        }
                        if(rs.length == 0){
                            var tmp = sc + 1;
                            // true: 标识虚拟接头
                            Scan.newAndSave(categoryId, CodeSerial[sc]-(webNum-web), Qrcodes[sc][webNum-web].content, web, CodeSerial[tmp]-(webNum-web), Qrcodes[tmp][webNum-web].content, true, function () {
                                logger.debug('[SOAP-PushSplit '+ strRollNum +'] create serialNum:'+ CodeSerial[sc]-(webNum-i));
                            });
                            Scan.newAndSave(categoryId, CodeSerial[tmp]-(webNum-web), Qrcodes[sc+1][webNum-web].content, web, CodeSerial[sc]-(webNum-web), Qrcodes[sc][webNum-web].content, true, function () {
                                logger.debug('[SOAP-PushSplit '+ strRollNum +'] create serialNum:' + CodeSerial[tmp]-(webNum-web));
                            });
                        }
                    });
                });

            });

            // 如果是出现了错误，但是还需要生产接头的情况，但是无需继续执行，生产小卷
            if(needCreatescanSerial){
               return;
            }

            for (var j = webNum; j > 0; j--){
                var arrCode = [];
                var rollWebNum = '';
                var codes = [];
                CodeSerial.forEach(function(x){
                    arrCode.push(x-(webNum-j));
                });
                rollNum.forEach(function(e){
                    if (parseInt(e.substr(11, 2)) === j) {
                        rollWebNum = e;
                    }
                });
                Qrcodes.forEach(function (c) {
                    if(typeof c !== 'undefined'){
                        codes.push(c[webNum-j]._id);
                    }else{
                        codes.push('');
                    }
                });
                newRollCodeSerial.push({
                    rollId: rollWebNum,
                    webNum: j,
                    Serial: arrCode,
                    Content: codes
                });
            }
            logger.debug('[SOAP-PushSplit '+ strRollNum +'] Complete all rolls bulid. Rolls: '+ JSON.stringify(newRollCodeSerial));

            //先查看小卷表中是否已包含这些小卷信息,如果包括,需要先删除,再导入
            Roll.removeRollByRollNum(rollNum, function (err, result) {
                if(err){
                    logger.error(err);
                }else{
                    console.log("has same date: "+rollNum+". delete it and insert new scanserials");
                    ep.emit('getAllRoll_ok');
                }
            });

        });

    });
    // ---------------结束初始化信息---------------

    // ---------------开始更新数据库---------------// ---------------forEach不对数据操作---------------// ---------------forEach不对数据操作---------------// ---------------forEach不对数据操作---------------// ---------------forEach不对数据操作---------------
    ep.all('getAllRoll_ok', function() {

        // 插入小卷表
        newRollCodeSerial.forEach(function(r, index) {
            //logger.debug('rollId: '+ r.rollId);
            //logger.debug('Serial.length: '+ r.Serial.length);
            ep.after('getnewRoll', index, function () {
                r.Serial = r.Serial.reverse();
                r.Content = r.Content.reverse();
                r.Serial.forEach(function (s, g) {
                    ep.after('insertOk', g, function () {
                        if (g % 2 == 0) {
                            var sSer = r.Serial[g+1];
                            var eSer = r.Serial[g];
                            var sCode = r.Content[g+1];
                            var eCode = r.Content[g];
                            var codeCount = eval(((eSer - sSer) / webNum) + 1);
                            logger.debug('[SOAP-PushSplit '+ strRollNum +'] Start InsertRoll '+ r.rollId);
                            //InsertRoll(categoryId, sSer, eSer, orderId, r.rollId, webNum, r.webNum, ActualCountIn, codeCount, msgContent, doctorId, bladeNumIn);
                            //通过_id确定范围
                            InsertRoll(categoryId, sSer, eSer, sCode, eCode, orderId, r.rollId, webNum, r.webNum, ActualCountIn, codeCount,
                                msgContent, doctorId, bladeNumIn, function () {
                                    if(g == r.Serial.length-2){
                                        ep.emit('getnewRoll');
                                    }
                                    ep.emit('insertOk');
                            });
                        }else{
                            setTimeout(function () {
                                ep.emit('insertOk');
                            }, 2000);
                        }
                    });
                });
                exportRoll(categoryId, r.rollId, r.Serial, r.Content, webNum);
            });


        });
        //------------
        //导出小卷、现在导出的小卷文件未上纸病机，没有剔除纸病二维码
        //vsRollCode/保存有二维码

        //------------
    });
};

//添加二维码信息,方便小卷文件导出
var InsertRoll = function (categoryId, startSerial, endSerial, startCode, endCode, orderId, rollId, webNum, actWebNum, ActualCountIn,
                           codeCount, msgContent, doctorId, bladeNumIn, callback) {
//var InsertRoll = function (categoryId, startSerial, endSerial, orderId, rollId, webNum, actWebNum, ActualCountIn, codeCount, msgContent, doctorId, bladeNumIn) {
        //logger.debug('rollId: '+ rollId);
        //logger.debug('startSerial: '+ startSerial);
        //logger.debug('endSerial: '+ endSerial);
        // 插入小卷，相同更新，不同新增
        Roll.getRollByNum(rollId, function(err, roll) {
            if (err) {
                logger.error(err);
                return callback();
            } else {
                //由于写入数据库时分多条写入,这几条数据rollId一致,此时更新可能导致
                //把之前的数据覆盖
                if (roll !== null && roll.startSerial == startSerial) {
                    roll.orderId = orderId;
                    roll.rollNum = rollId;
                    roll.webNum = webNum;
                    roll.actualWebNum = actWebNum;
                    roll.startSerial = startSerial;
                    roll.endSerial = endSerial;
                    roll.startCode = startCode;
                    roll.endCode = endCode;
                    roll.actualCount = ActualCountIn;
                    roll.actualCode = codeCount;
                    roll.categoryId = categoryId;
                    roll.msgContent = msgContent;
                    roll.doctorId = doctorId;
                    roll.bladeNumIn = bladeNumIn;
                    roll.save(function (err) {
                        if (err) {
                            logger.error(err);
                        } else {
                            logger.debug('[SOAP-PushSplit ' + rollId + '] Update roll to DB is ok. orderID: '+ orderId +', rollID: ' + rollId);
                            // 如果小卷序列合法, 更新二维码库
                            if (msgContent === '' && webNum === actWebNum) {
                                UpdateCode(categoryId, startSerial, endSerial, startCode, endCode, rollId, orderId);
                            };

                        }
                        return callback();
                    });
                } else {
                    Roll.newAndSave(orderId, rollId, webNum, actWebNum, startSerial, endSerial, startCode, endCode, ActualCountIn, codeCount, categoryId,
                        msgContent, doctorId, bladeNumIn, function (err) {
                        if (err) {
                            logger.error(err);
                        } else {
                            logger.debug('[SOAP-PushSplit ' + rollId + '] Save roll to DB is ok. orderID: '+ orderId +', rollID: ' + rollId);
                            // 如果小卷序列合法, 更新二维码库
                            if (msgContent === '' && webNum === actWebNum) {
                                UpdateCode(categoryId, startSerial, endSerial, startCode, endCode, rollId, orderId);
                            };
                            //exportRoll(categoryId, rollId, startSerial, endSerial, startCode, endCode, webNum);
                        }
                        return callback();
                    });
                }
            };
        });
}
//添加二维码信息,通过索引,加快更新速度
var UpdateCode = function (categoryId, startSerial, endSerial, startCode, endCode, rollId, orderId) {
//var UpdateCode = function (categoryId, startSerial, endSerial, rollId, orderId) {
    // 生成文件

    // 批量更新

    // 更新二维码状态+1000
    logger.debug('[Task-PushSplit ' + rollId + '] Start update DB from '+ startSerial +' to '+ endSerial);
    var query = {};
    query.categoryId = categoryId;
    //-----换成通过_id来确定更新范围
    query._id = {};
    query._id.$gte = startCode;
    query._id.$lte = endCode;
    //------
    //query.serialNum = {};
    // query.serialNum.$gte = startSerial;
    // query.serialNum.$lte = endSerial;
    query.state = {};
    query.state.$lt = 1000;

    var bulk = QRCodeEntity.collection.initializeOrderedBulkOp();
    //bulk.find( query ).update({$set: {"orderId": parseInt(orderId)}, $inc: { state: 1000 } });
    // 不在更改工单号，会导致本来不属于本工单的二维码 工单号被更新为 当前下卷的工单
    bulk.find( query ).update({ $inc: { state: 1000 } });
    bulk.execute(function (err, upRs) {
        if (err) {
            return logger.error(err);
        } else {
            Logs.addLogs('system', '[SOAP-PushSplit '+ rollId +'] Complete update. rollId: '+ rollId +', Code Count is '+ upRs.nUpserted, 'system', '0');
            logger.debug('------------End Update Split('+ upRs.nUpserted +') in RollNum is '+ rollId +'-------------');
        }
    });

    //QRCodeEntity.update(query, {"orderId": orderId, $inc: { state: 1000 } }, true, function(err, upRs) {
    //    if (err) {
    //        return logger.error(err);
    //    } else {
    //        Logs.addLogs('system', '[SOAP-PushSplit '+ rollId +'] Complete update. rollId: '+ rollId +', Code Count is '+ upRs.nUpserted, 'system', '1');
    //        logger.debug('------------End Update Split('+ upRs.nUpserted +') in RollNum is '+ rollId +'-------------');
    //    }
    //});
}
//添加二维码信息,通过索引,加快更新速度
var exportRoll = function (categoryId, rollId, serialNum, codeContent, webNum) {
//var exportRoll = function (categoryId, rollId, startSerial, endSerial, webNum) {
    // 生成小卷文件
    var rollFile = 'middlewares/data/roll/'+ rollId +'.txt';
    var input = writeLine(rollFile, {
        cacheLines: 10000
    });
    var CodeCount = 0;
    var ep = new EventProxy();
    ep.fail(function(err) {
        Logs.addLogs('system', '[SOAP-PushSplit '+ rollId +'] Unexpected ERROR: '+ err, 'system', '2');
        return logger.error('[SOAP-PushSplit '+ rollId +'] '+ err);
    });
    // 循环开始码到结束码，每次按幅数步进；
    logger.debug('[SOAP-PushSplit '+ rollId +'] Start export file for rollid is '+ rollId);
    // serialNum.reverse();
    // codeContent.reverse();
    serialNum.forEach(function (s, index) {
        if(index % 2 != 0){
            return;
        }
        ep.all('write_ok'+index, function () {
            writetofile(serialNum[index+1], serialNum[index], codeContent[index+1], codeContent[index], index)
        });
    });
    ep.emit('write_ok0');
    ep.all('write_ok'+serialNum.length, function () {
        input.end(function () {
            logger.debug('[SOAP-PushSplit '+ rollId +'] Complete roll file for rollid is '+ rollId +' count is '+ CodeCount);
        });
    });
    //写入文件
    function writetofile (startSerial, endSerial, startCode, endCode, index) {
        // 读取数据库写入文件
        var query = {
            categoryId: categoryId
        };
        query._id = {};
        query._id.$gte = startCode;
        query._id.$lte = endCode;
        var fields = 'content content1 serialNum';
        var totalCount = endSerial - startSerial + 1;
        var options = {limit: totalCount, sort: '-_id'};
        var stream = QRCodeEntity.find(query, fields, options).lean().batchSize(10000).stream();
        stream.on('data', function (doc) {
            CodeCount++;
            stream.pause();
            if (doc.serialNum >= startSerial && doc.serialNum <= endSerial && (doc.serialNum - startSerial) % webNum == 0) {
                // 如果content1有值
                if(doc.content1 != null){
                    input.write(doc.content + ', ' + doc.content1 + ', ' +doc.serialNum, stream.resume());
                }else{
                    input.write(doc.content + ', ' + doc.serialNum, stream.resume());
                }
                //

            } else {
                stream.resume();
            }
        }).on('err', function (err) {
            logger.error('[SOAP-PushSplit ' + rollId + '] Err: ' + err);
            return ep.emit('write_ok'+(index+2));
        }).on('close', function () {
            ep.emit('write_ok'+(index+2));
        });
    }
}