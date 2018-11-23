/**
 * Created by youngs1 on 7/27/16.
 */
/**
 * 2017-04-21: 做一个与mes通信的接口，返回小卷文件计算成功、失败的信息
 * 1、创建一个restful接口， mes调用， 返回小卷信息
 * 2、在计算出正确的小卷区间以后，返回mes信息
 * 3、返回信息：
 *          {
 *              状态：0失败，1成功，
 *              卷号：纸病，返回一幅
 *              实际码量：根据区间算出的实际量
 *              错误信息: 1、起始、结束码 查找失败
 *                       2、获取品类幅数失败
 *                       3、获取接头信息失败
 *                       4、计算小卷区间错误（单个区间码量超出范围， 没有区间， 查找6次过后，仍未找到正确区间）
 *                       5、将小卷插入数据库 失败
 *
 *          }
 * 2017-05-03:
 *  在计算接头时，添加一个接头间的间隔判断，防止出现以下错误：
 *  在扫描接头时，一个接头实际有3个码组成，比如 3.4.5 一般扫接头是扫描 3-5， 如果在第二次扫描时扫成了 4-6， 这样在第二次计算时，会出现如下情况：
 *  3-5 6-4 5-3 4-6 这种操作会影响小卷生成， 现在设置 相邻接头之间 跳过5*webNum个码， 相当于扫到3-5就跳过4-6，只能搜到一个接头，不在影响小卷文件生成
 *
 */
var mongoose            = require('mongoose');
var EventProxy          = require('eventproxy');
var _                   = require('lodash');
var logger              = require('../../common/logger');
var config              = require('../../config');
var writeLine           = require('lei-stream').writeLine;
var FS                  = require('fs');

var Logs                = require('../../proxy').Logs;
var QRCode              = require('../../proxy').QRCode;
var Scan                = require('../../proxy').ScanSerial;
var Category            = require('../../proxy').Category;
var Roll                = require('../../proxy').Roll;
var models              = require('../../models');
var QRCodeEntity        = models.QRCode;
var ScanSerial          = models.ScanSerial;

// 纸病小卷
exports.pushRoll = function (args, callback) {
    // 获取参数
    var orderId = args.orderId,
        rollNum = args.rollNum,
        startCode = args.startCode,
        endCode = args.endCode;

    // content中有url，不用再拆分，直接查找
    // startCode = startCode.replace('?E=', '');
    // //startCode = startCode.split('=');
    // startCode = startCode.split('/');
    // startCode = startCode[startCode.length-1];
    // //endCode = endCode.split('=');
    // endCode = endCode.replace('?E=', '');
    // endCode = endCode.split('/');
    // endCode = endCode[endCode.length-1];
    // 只处理?E=的情况， 非数码通的二维码， 不自带url， 还是需要拆分
    if(startCode.indexOf('?E=') >= 0){
        startCode = startCode.replace('?E=', '');
        startCode = startCode.substring(startCode.lastIndexOf('/')+1, startCode.length);
    }
    if(endCode.indexOf('?E=') >= 0){
        endCode = endCode.replace('?E=', '');
        endCode = endCode.substring(endCode.lastIndexOf('/')+1, endCode.length);
    }
    var rollId = rollNum.substr(0, 6),
        doctorId = rollNum.substr(1,1),
        orderIdIn = rollNum.substr(6, 5),
        webNumIn = parseInt(rollNum.substr(11, 2)),
        bladeNumIn = rollNum.substr(13, 4),
        ActualCountIn = rollNum.substr(17, 5);

    // 不同：工单、幅数、刀数；
    var categoryId = '',
        webNum = 0,
        startWeb = 0,
        endWeb = 0,
        startSerial = 0,
        endSerial = 0,
        arrStart = [],
        arrEnd = [],
        arrSerial = [],
        arrContent = [],
        msgContent = '',
        isError = false;    //错误标识
    var MAXSPLICE = 7,  // 出现了查询接头次数不够的现象，再加一（存在虚拟接头在作怪）
        MAXROLLNUM = config.roll_maxCount || 18100;

    logger.debug('------------Received PushRoll-------------');

    var err_message = '';
    var ep = new EventProxy();
    ep.fail(function(err) {
        logger.error('[SOAP-PushRoll'+ rollNum +'] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] Unexpected ERROR: '+ err, 'system', '2');
        err_message = '小卷计算异常，发生错误';
        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
    });

    // 获取开始及结束码序列号
    QRCode.getQRCodeByCode(startCode, ep.done('getSCode_ok'));
    QRCode.getQRCodeByCode(endCode, ep.done('getECode_ok'));

    ep.all('getSCode_ok','getECode_ok', function(sdocs, edocs) {
        if (sdocs && edocs) {
            categoryId = sdocs.categoryId;
            startSerial = sdocs.serialNum;
            endSerial = edocs.serialNum;
            startCode = sdocs.content;
            endCode = edocs.content;
            ep.emit('getSerial_ok');
        } else {
            logger.error('[SOAP-PushRoll'+ rollNum +'] Cant find qrcode: '+ startCode +' and '+ endCode);
            Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] Cant find qrcode: '+ startCode +' and '+ endCode, 'system', '2');
            err_message = '获取起始结束码序列号失败';
            return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
        }
    });

    // 获取品类幅数
    ep.all('getSerial_ok', function () {
        Category.getCategoryById(mongoose.Types.ObjectId(categoryId), function (err, rs) {
            if (err) {
                Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] Cant find Category: ' + categoryId, 'system', '2');
                logger.error('[SOAP-PushRoll'+ rollNum +'] Cant find Category: ' + categoryId);
                err_message = '获取品类幅数失败';
                return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
            } else {
                if (rs != null) {
                    webNum = rs.webNum;
                    ep.emit('getCategory_ok');
                } else {
                    Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] Cant find Category: ' + categoryId, 'system', '2');
                    logger.error('[SOAP-PushRoll'+ rollNum +'] Cant find Category: ' + categoryId);
                    err_message = '获取品类幅数失败';
                    return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
                }
            }
        });
    });
    // 获取扫描序列
    ep.all('getCategory_ok', function() {

        logger.debug('[SOAP-PushRoll'+ rollNum +'] startSerial: ' + startSerial);
        logger.debug('[SOAP-PushRoll'+ rollNum +'] endSerial: ' + endSerial);

        // 判断幅数为0，即为webNum，如webNum=6，余数为0时幅数6
        if (endSerial % webNum == 0) {
            endWeb = webNum;
        } else {
            endWeb = endSerial % webNum;
        }
        // 计算小卷前，将结束码插入至扫描序列表
        Scan.getScanByQuery({'codeSerial': endSerial, 'groupCode': 0, 'categoryId': mongoose.Types.ObjectId(categoryId)}, '', ep.done(function(docs) {

            if (docs.length > 0) {
                // 存在相同数据
                logger.error('[SOAP-PushRoll'+ rollNum +'] Have the same data: '+ JSON.stringify(docs) +' in Category: '+ categoryId);
                Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] Have the same data: '+ JSON.stringify(docs) +' in Category: '+ categoryId, 'system', '2');
                ep.emit('InsertEnd_ok');
            } else {
                // 不存在相同数据
                Scan.newAndSave(categoryId, endSerial, endCode, endWeb, 0, '', false, ep.done('InsertEnd_ok'));
                //ep.emit('InsertEnd_ok');
            }

        }));
    });

    ep.all('InsertEnd_ok', function () {
        var query = {};
        var loopend = 0;
        var index = 0;
        // 循环5次获取接头数据
        for (var i = 0; i < MAXSPLICE; i++) {

            if (startSerial % webNum == 0) {
                startWeb = webNum;
            }
            else {
                startWeb = startSerial % webNum;
            }

            query = {
                categoryId: mongoose.Types.ObjectId(categoryId),
                actWeb: startWeb,
                state: 0
            };
            query.codeSerial = {};
            // 判断接头，防止出现4-7、3-6这种接头信息，如果不设置5*webNum，会出现3-6 7-4 6-3 4-7
            // 这样多做了几次循环，占用接头个数（每个卷最多不能超过5个接头），导致在规定接头数内，无法计算出正确的小卷区间
            query.codeSerial.$gt = startSerial+5*webNum;
            ep.after('getscan_ok', i ,function(){
                getScan(query, ep.done(function(docss) {

                    if (docss.length > 0) {
                        arrStart = [];
                        docss.forEach(function (a) {
                            arrStart.push({
                                codeSerial: a.codeSerial,
                                groupCode: a.groupCode,
                                codeContent: a.codeContent,
                                groupCodeContent: a.groupCodeContent
                            });
                        });
                        var tmp = _.minBy(arrStart, 'codeSerial');
                        // 如果tmp.codeSerial !== endSerial且tmp.endSerial==0, 则删掉该接头，不然可能造成错误
                        console.log(tmp);
                        while(tmp.codeSerial !== endSerial && tmp.groupCode == 0)
                        {
                            var arrIndex = arrStart.indexOf(tmp);
                            arrStart.splice(arrIndex,1);
                            if(arrStart.length == 0){
                                logger.error('[SOAP-PushRoll'+ rollNum +'] dont find  correct scanserials. cont creat roll files.');
                                Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] dont find  correct scanserials. cont creat roll files.', '2');
                                err_message = '小卷寻找正确的接头信息失败';
                                return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
                            }
                            tmp = _.minBy(arrStart, 'codeSerial');
                            console.log(tmp);
                        }
                        logger.debug('[SOAP-PushRoll'+ rollNum +'] Loop Num: '+ index);
                        logger.debug('[SOAP-PushRoll'+ rollNum +'] Loop Code: '+ JSON.stringify(tmp));
                        // 最后节点判断
                        if (tmp.codeSerial !== endSerial && loopend == 0 && tmp.groupCode !== 0) {
                            //如果起始码到结束码之间码量大于最大量则 认为扫码错误
                            //因为纸病后的小卷码量不会是标准的18000 会有上下的起伏,所以  MAXROLLNUM * webNum * 2 多增加一下他的范围
                            var maxallcount = MAXROLLNUM * webNum * 2;
                            var maxavtcount = Math.abs(tmp.codeSerial - startSerial);
                            if(maxavtcount > maxallcount){
                                msgContent = 'MaxCodeCount is '+ maxavtcount +' > '+ maxallcount;
                                isError = true; //该小卷数据有误,不再执行导出
                            }
                            //如果不是结束码,且groupcode=0,即遇到了别的结束码,则应该跳过这个码???
                            //
                            arrSerial.push([startSerial, tmp.codeSerial]);
                            if(typeof tmp.codeContent === 'undefined'){
                                tmp.codeContent = endCode;
                            }
                            //多加一个isError 来确认是否是有效数据,因为想把二维码一起写入二维码表中
                            //所以添加一个isError来表明错误
                            arrContent.push([startCode, tmp.codeContent, isError]);


                            startSerial = tmp.groupCode;
                            if(typeof tmp.groupCodeContent === 'undefined'){
                                tmp.groupCodeContent = startCode;
                            }
                            startCode = tmp.groupCodeContent;

                            if (startSerial % webNum == 0) {
                                startWeb = webNum;
                            }
                            else {
                                startWeb = startSerial % webNum;
                            }
                            query = {
                                categoryId: mongoose.Types.ObjectId(categoryId),
                                actWeb: startWeb,
                                state: 0
                            };
                            query.codeSerial = {};
                            query.codeSerial.$gt = startSerial+5*webNum;
                        }
                        else
                        {
                            if(loopend == 0)
                            {
                                arrSerial.push([startSerial,endSerial]);
                                arrContent.push([startCode, endCode]);

                                //此时 接头已经查询完毕， 调用callback返回信息
                                var ActualCodeNum = 0;

                                arrSerial.forEach(function (s) {
                                    ActualCodeNum += parseInt((s[1]-s[0])/webNum);
                                });
                                //insertRoll(arrSerial, webNum, MAXROLLNUM, categoryId, orderId, rollNum, webNumIn, ActualCountIn, msgContent, doctorId, bladeNumIn);
                                insertRoll(arrSerial, arrContent, webNum, MAXROLLNUM, categoryId, orderId, rollNum, webNumIn,
                                    ActualCountIn, msgContent, doctorId, bladeNumIn, isError);//Math.abs(ActualCodeNum)

                                //如果差值大于500，把接头重置
                                if(ActualCountIn != 99999){
                                    if(Math.abs(ActualCodeNum-parseInt(ActualCountIn)) > 500){
                                        arrSerial.forEach(function (sc) {
                                            // 删除接头
                                            ScanSerial.where()
                                                .update({ categoryId:mongoose.Types.ObjectId(categoryId), $or:[{codeSerial:sc[0]}, {groupCode:sc[0]}], isVirtual:{$ne:true} },
                                                    { $set: { state: 2 }}, { multi: true },
                                                    function (err, result) {
                                                        console.log(err);
                                                        console.log(result);
                                                    });
                                        });
                                    }
                                }

                                return callback(null, {Status:1, ID:args.ID,  ActualCodeNum:ActualCodeNum, FaultTolerantValue:Math.abs(parseInt(ActualCountIn)-ActualCodeNum), ErrMessage:''});
                            }
                            loopend = 1;
                        }
                        logger.debug('[SOAP-PushRoll'+ rollNum +'] startSerial: '+ startSerial);
                        logger.debug('[SOAP-PushRoll'+ rollNum +'] endSerial: '+ endSerial);
                        logger.debug('[SOAP-PushRoll'+ rollNum +'] AllSerial: '+ JSON.stringify(arrSerial));
                    }
                    ep.emit('getscan_ok');
                    index++;
                    if(index == MAXSPLICE && loopend == 0){   //说明查找MAXSPLICE次数以后还没有找到正常的接头数据
                        //记入小卷,该小卷有问题、或者说没有找到小卷信息
                        //现在只记录小卷的轴表轴底,中间接头由于有错误不在记录
                        // 将之前找到的接头状态置为2，不再使用
                        arrSerial.forEach(function (sc) {
                            // 删除接头
                            ScanSerial.where()
                                .update({ categoryId:mongoose.Types.ObjectId(categoryId), $or:[{codeSerial:sc[0]}, {groupCode:sc[0]}] },
                                    { $set: { state: 2 }}, { multi: true },
                                    function (err, result) {
                                    console.log(err);
                                    console.log(result);
                                });
                        });
                        if(arrSerial.length > 0 && arrContent.length > 0){
                            InsertRoll (categoryId, arrSerial[0][0], endSerial, arrContent[0][0], endCode, orderId, rollNum, webNum, webNumIn,
                                ActualCountIn, 0, 'dont find  correct scanserials', doctorId, bladeNumIn, function () {
                                    logger.debug('[SOAP-PushRoll'+ rollNum +'] insert into roll table');
                                });
                        }else{
                            InsertRoll (categoryId, startSerial, endSerial, startCode, endCode, orderId, rollNum, webNum, webNumIn,
                                ActualCountIn, 0, 'dont find  correct scanserials', doctorId, bladeNumIn, function () {
                                    logger.debug('[SOAP-PushRoll'+ rollNum +'] insert into roll table');
                                });
                        }

                        logger.error('[SOAP-PushRoll'+ rollNum +'] dont find  correct scanserials. cont creat roll files.');
                        Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] dont find  correct scanserials. cont creat roll files.', '2');
                        err_message = '小卷寻找正确的接头信息失败';
                        return callback({Status:3, ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message}, null);
                    }
                    isError = false;
                }));
            });

        }
    });
};



function getScan(query, callback) {
    Scan.getScanByQuery(query, '', function (err, docs) {
        if (err) {
            logger.error('[SOAP-PushRoll] Unexpected ERROR: ' + err);
            Logs.addLogs('system', '[SOAP-PushRoll] Unexpected ERROR: ' + err, 'system', '2');
            return callback(err);
        } else {
            return callback(null, docs);
        }
    });
}

function insertRoll(arrEnd, arrContent, webNum, MAXROLLNUM, categoryId, orderId, rollId, actWebNum, ActualCountIn, msgContent, doctorId, bladeNumIn, isError, callback) {
    var ep = new EventProxy();
    ep.fail(function(err) {
        logger.error('[SOAP-PushRoll'+ rollNum +'] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-PushRoll'+ rollNum +'] Unexpected ERROR: '+ err, 'system', '2');
    });
    var sum = 0;
    logger.debug('[SOAP-PushRoll'+ rollId +'] arrEnd: '+ JSON.stringify(arrEnd));
    //反向,使输出的序列与实际小卷的序列相同 大-->小
    arrEnd.reverse();
    arrContent.reverse();
    logger.debug('[SOAP-PushRoll'+ rollId +'] newArrEnd: '+ JSON.stringify(arrEnd));
    logger.debug('[SOAP-PushRoll'+ rollId +'] newArrContent: '+ JSON.stringify(arrContent));
    //因为现在的代码是有接头,就会分为两段分别存入数据库,在想更新的时候,无法准确定位到哪条数据需要更新,所以现在直接把以前该小卷的所有信息删除
    //重新插入
    var rollNums = [rollId];
    //var doctorTimes = parseInt(rollId.substr(2,1));
    var timesright = rollId.substring(3,rollId.length-5);
    //var timesleft = rollId.substring(0,2);
    //如果大于零,就表示多次上纸病机了,要把前一次的内容删掉

        var docTime = '/'+timesright+'/';
        Roll.removeRollBydoctorTimes(docTime, function (err, result) {
            if(err){
                logger.error(err);
            }
            ep.emit('delete_oldRoll');
        });
    ep.all('delete_oldRoll', function () {
        Roll.removeRollByRollNum(rollNums, function (err, result) {
            if(err){
                console.log(err);
            }else{
                if(result.result.n > 0){
                    console.log("has same date: "+rollId+". delete it and insert new date.");
                }
                arrEnd.forEach(function (a, g) {
                    var tmpCount = ((arrEnd[g][1] - arrEnd[g][0]) / webNum) + 1;
                    sum += tmpCount;
                    logger.debug('[SOAP-PushRoll'+ rollId +'] SUM: '+ sum);
                    ep.after('insertOk', g, function () {
                        InsertRoll(categoryId, arrEnd[g][0], arrEnd[g][1], arrContent[g][0], arrContent[g][1], orderId, rollId,
                            webNum, actWebNum, ActualCountIn, tmpCount, msgContent, doctorId, bladeNumIn, function () {
                                ep.emit('insertOk');
                            });
                    });
                });
            }
        });
    });


    //-------------------------把这arrEnd中的数据导出--->导出小卷-----------
    // 如果差值过大，不在生成小卷文件
    var countdiff = Math.abs(ActualCountIn-parseInt(rollId.substr(17, 5)));
    if(ActualCountIn == 99999){
        countdiff = 50;
    }
    if(countdiff <= 500){
        exportRoll(categoryId, rollId, arrEnd, arrContent, webNum);
    }


    //-------------------------------------------------------------------
    //return callback(null);
}

function InsertRoll (categoryId, startSerial, endSerial, startCode, endCode, orderId, rollId, webNum, actWebNum, ActualCountIn,
                     codeCount, msgContent, doctorId, bladeNumIn, callback) {
    // 插入小卷，相同更新，不同新增
    Roll.getRollByNum(rollId, function(err, roll) {
        if (err) {
            logger.error(err);
            return callback();
        } else {
            //写入表中的数据,会按照接头数,分成多条,但是rollId一致,此条件搜索时,可能导致
            //覆盖以前的数据,表中的数据错误,但是由于写入文件和写入表,是分开的操作,不会影响文件生成
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
                        return callback();
                    } else {
                        logger.debug('[SOAP-PushRoll'+ rollId +'] Update roll to DB is ok. orderID: '+ orderId +', rollID: ' + rollId);
                        return callback();
                    }
                });
            } else {
                Roll.newAndSave(orderId, rollId, webNum, actWebNum, startSerial, endSerial, startCode, endCode, ActualCountIn,
                    codeCount, categoryId, msgContent, doctorId, bladeNumIn, function (err) {
                    if (err) {
                        logger.error(err);
                        return callback();
                    } else {
                        logger.debug('[SOAP-PushRoll'+ rollId +'] Save roll to DB is ok. orderID: '+ orderId +', rollID: ' + rollId);
                        return callback();
                        //不再一对数组导出一个小卷文件，按小卷号导出文件
                        //exportRoll(categoryId, rollId, startSerial, endSerial, webNum);
                    }
                });
            }
        };
    });
}


var exportRoll = function (categoryId, rollId, arrEnd, arrContent, webNum) {
    // 生成小卷文件
    var rollFile = 'middlewares/data/roll/'+ rollId +'.txt';
    var input = writeLine(rollFile, {
        cacheLines: 10000
    });
    var CodeCount = 0;
    var rollCodeCount = 0;
    // 循环开始码到结束码，每次按幅数步进；
    logger.debug('[SOAP-PushRoll '+ rollId +'] Start export file for rollid is '+ rollId);
    var ep = new EventProxy();
    ep.fail(function(err) {
        logger.error('[SOAP-PushRoll'+ rollId +'] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-PushRoll'+ rollId +'] Unexpected ERROR: '+ err, 'system', '2');
    });

    ep.after('writeRoll_ok', arrContent.length, function () {
        input.end(function () {
            logger.debug('[SOAP-PushRoll '+ rollId +'] Complete roll file for rollid is '+ rollId +' count is '+ CodeCount+' this roll has '+rollCodeCount+' codes');
        });
    });
    //反向,使输出的序列与实际小卷的序列相同 大-->小
   // arrContent.reverse();
   // arrEnd.reverse();
    arrContent.forEach(function (c, index) {

        ep.after('writeRoll_ok', index, function () {
                ep.all('get_startId', 'get_endId', function (startId, endId) {
                    if (!startId || !endId || c[3]) { //err
                        logger.error('[SOAP-PushRoll' + rollId + '] get qrcode._id failed.');
                        return setTimeout(function () {
                             ep.emit('writeRoll_ok');
                        }, 2000);
                    }
                    var query = {
                        categoryId: categoryId,
                        _id: {}
                    };
                    var totalCount = endId.serialNum - startId.serialNum;
                    if (totalCount < 0) {
                        query._id.$gte = endId._id;
                        query._id.$lte = startId._id;
                    } else {
                        query._id.$gte = startId._id;
                        query._id.$lte = endId._id;
                    }
                    var fields = 'content content1 serialNum';
                    var totalCount = Math.abs(totalCount) + 1;
                    var options = {limit: totalCount, sort: '-_id'};
                    var stream = QRCodeEntity.find(query, fields, options).lean().batchSize(100000).stream();
                    stream.on('data', function (doc) {
                        CodeCount++;
                        stream.pause();
                        var isMatch = false;
                        var serialNum = doc.serialNum;

                        if (serialNum >= arrEnd[index][0] && serialNum <= arrEnd[index][1] && (serialNum - arrEnd[index][0]) % webNum == 0) {
                            isMatch = true;
                        }
                        if (isMatch) {
                            rollCodeCount++;
                            //input.write(doc.content + ', ' + serialNum, stream.resume());
                            if(doc.content1 != null){
                                input.write(doc.content + ', ' + doc.content1 + ', ' + serialNum, stream.resume());
                            }else{
                                input.write(doc.content + ', ' + serialNum, stream.resume());
                            }
                        } else {
                            stream.resume();
                        }

                    }).on('err', function (err) {
                        logger.error('[SOAP-PushRoll ' + rollId + '] Err: ' + err);
                        return false;
                    }).on('close', function () {
                        ep.emit('writeRoll_ok');
                    });
                });
                QRCode.getQRCodeByCode(c[0], ep.done('get_startId'));
                QRCode.getQRCodeByCode(c[1], ep.done('get_endId'));

        });
    });
}