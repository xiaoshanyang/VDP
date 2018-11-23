/**
 * Created by youngs1 on 7/27/16.
 *
 * 返回值：
 *      Status:
 *          1、成功
 *          3、失败
 *      ID:args.ID,  ActualCodeNum:0, FaultTolerantValue:0, ErrMessage:err_message
 *
 *  2017-06-03
 *  为了应对内蒙工厂出现的扫描连续的两个码作为接头的情况，增加作为接头的两个序列号之间差值的判断
 *  起码差值要大于幅数
 *
 *  2017-06-23
 *  为了防止 出现一次接头扫描错误 导致 后续 所有该小卷接头计算出现异常的情况，加入纸病机的PuID作标识，与纸病下卷给的PuID 联合查找改卷所有接头信息
 *  现行 纸病接头 需要添加 一个 PuID 字段，保存入库， 也无需在判断重扫的情况， 一般情况下，如果下卷正确了，不会再重新扫描一次接头
 */
var mongoose            = require('mongoose');
var EventProxy          = require('eventproxy');
var _                   = require('lodash');
var logger              = require('../../common/logger');

var Logs                = require('../../proxy').Logs;
var QRCode              = require('../../proxy').QRCode;
var Category            = require('../../proxy').Category;
var Scan                = require('../../proxy').ScanSerial;

// 纸病序列
exports.pushDefect = function (args, callback) {
    var arrScan = args.scanSequences,
        arrScanCode = [],
        arrScanSerNum = [],
        intScanSerNum = 0,
        vsScanCode = [],
        categoryId = '',
        webNum = 0;
    arrScan = arrScan.split(',');
    logger.debug('------------Received PushSequences-------------');
    logger.debug('[SOAP-PushSequences] arrScan: '+ JSON.stringify(arrScan));

    var err_message = '';
    var ep = new EventProxy();
    ep.fail(function(err) {
        logger.error('[SOAP-PushSequences] Unexpected ERROR: '+ err);
        Logs.addLogs('system', '[SOAP-PushSequences] Unexpected ERROR: '+ err, 'system', '2');
        err_message = '执行异常，发生错误';
        return callback({Status:3, ID:args.ID, ErrMessage:err_message}, null);
    });

    // 查询二维码
    arrScan.forEach(function (e) {
        //console.log('BeforCode: '+ e);
        //由于数码通url包含没有?E=的情况,所以要把这个?E=先去掉
        // e = e.replace('?E=', '');
        // //e = e.split('=');
        // e = e.split('/');
        // e = e[e.length-1];
        //console.log('AferCode: '+ e);
        //二维码上直接带有url，无需在拆分直接搜索即可
        // 只处理?E=的情况， 非数码通的二维码， 不自带url， 还是需要拆分
        if(e.indexOf('?E=') >= 0){
            e = e.replace('?E=', '');
            e = e.substring(e.lastIndexOf('/')+1, e.length);
        }
        arrScanCode.push(e);
        QRCode.getQRCodeByCode(e, ep.done('getQRCode_ok'));
    });
    // 由于Sharding机制导致返回次序为乱序，需要将序列数组排序为参数传递过来的次序
    ep.after('getQRCode_ok', arrScan.length, function(docs) {
        if (docs != null) {
            // 循环传递过来的二维码数组
            arrScanCode.forEach(function (f) {
                docs.forEach(function (e) {
                    if (e) {
                        categoryId = e.categoryId;
                        if (e.content == f || f.indexOf(e.content)>=0 ) {
                            arrScanSerNum.push(e.serialNum);
                            vsScanCode.push(e.content);
                        }
                        if (e.content1 == f || f.indexOf(e.content1)>=0) {
                            arrScanSerNum.push(e.serialNum);
                            vsScanCode.push(e.content1);
                        }
                    }
                });
                ep.emit('ReQRCode_ok');
            });
        } else {
            logger.error('[SOAP-PushSequences] Cant find all qrcode');
            Logs.addLogs('system', '[SOAP-PushSequences] Cant find all qrcode', 'system', '2');
            err_message = '查询接头二维码失败';
            return callback({Status:3, ID:args.ID, ErrMessage:err_message}, null);
        }
    });
    // 输出没有找到的二维码
    ep.after('ReQRCode_ok', arrScan.length, function() {
        //http://q.openhema.com/H0000O000060DJiAkJ1r2oPE 与 H0000O000060DJiAkJ1r2oPE 不一致，导致错误
        var nofindCode = _.difference(arrScanCode, vsScanCode);
        if (nofindCode.length > 0) {
            // 如果发现不同，处理带url的二维码后，在进行比较
            vsScanCode.forEach(function (vc, index) {
               if(vc.indexOf('/')<0){
                   arrScanCode[index] = arrScanCode[index].replace('?E=', '');
                   arrScanCode[index] = arrScanCode[index].slice(arrScanCode[index].lastIndexOf('/')+1, arrScanCode[index].length);
               }
            });
            nofindCode = _.difference(arrScanCode, vsScanCode);
            if(nofindCode.length > 0){
                logger.error('[SOAP-PushSequences] Cant find qrcode: '+ JSON.stringify(nofindCode));
                Logs.addLogs('system', '[SOAP-PushSequences] Cant find qrcode: '+ JSON.stringify(nofindCode), 'system', '2');
                err_message = '二维码查库失败，有二维码不在库中';
                return callback({Status:3, ID:args.ID, ErrMessage:err_message}, null);
            } else {
                logger.debug('[SOAP-PushSequences] befor Arr: '+JSON.stringify(arrScanCode));
                logger.debug('[SOAP-PushSequences] after Arr: '+JSON.stringify(arrScanSerNum));
                logger.debug('[SOAP-PushSequences] vs Code:'+JSON.stringify(vsScanCode));
                ep.emit('FindCode_ok');
            }
        } else {
            logger.debug('[SOAP-PushSequences] befor Arr: '+JSON.stringify(arrScanCode));
            logger.debug('[SOAP-PushSequences] after Arr: '+JSON.stringify(arrScanSerNum));
            logger.debug('[SOAP-PushSequences] vs Code:'+JSON.stringify(vsScanCode));
           ep.emit('FindCode_ok');
        }
    });
    // 获取品类幅数
    ep.all('FindCode_ok', function () {
        Category.getCategoryById(mongoose.Types.ObjectId(categoryId), function (err, rs) {
            if (err) {
                Logs.addLogs('system', '[SOAP-PushSequences] Cant find Category: ' + categoryId, 'system', '2');
                logger.error('[SOAP-PushSequences] Cant find Category: ' + categoryId);
                err_message = '获取品类幅数失败';
                return callback({Status:3, ID:args.ID, ErrMessage:err_message}, null);
            } else {
                if (rs != null) {
                    webNum = rs.webNum;
                    ep.emit('getCategory_ok');
                } else {
                    Logs.addLogs('system', '[SOAP-PushSequences] Cant find Category: ' + categoryId, 'system', '2');
                    logger.error('[SOAP-PushSequences] Cant find Category: ' + categoryId);
                    err_message = '获取品类幅数失败';
                    return callback({Status:3, ID:args.ID, ErrMessage:err_message}, null);
                }
            }
        });
    });
    // 纸病序列查重、找到重复的数据,删除以前的数据,在导入
    // 由于在接头扫描时， 会出现重复扫描 但是 扫描点 不一致的情况 例如：第一次：604782],[609414、第二次 609420],[604788
    // 这样会导致 在小卷生成 时 重复计算该接头造成超出接头数量不能下卷的情况，现在改为 如果重收到 接头时，判断 该接头附近是否有接头出现，
    // 如果有则删除之前的，保留现在接头 计算规则： 接头附近 5*webNum 个码范围内的删除之前，保留现在
    ep.tail('getCategory_ok', 'ReQRCode_ok', function() {
        //将默认数组顺序从表到底（大,小）调整为从底到表（小,大）
        //CodeSerial = CodeSerial.reverse();
        arrScanSerNum.forEach(function (e, index) {
            var query = {
                $or:[{codeSerial:e},{groupCode:e}],
                categoryId:mongoose.Types.ObjectId(categoryId)
            };
            Scan.removeScanByCodeSerial(query, function (err, result) {
                if(err){
                    logger.error(err);
                }else{
                    if(result.result.n>0){
                        console.log("has same date: "+e+". delete it. insert new scanserials");
                        ep.emit('ReCode_ok',index);
                    }else{
                        ep.emit('ReCode_ok',-1);
                    }

                }
            });
        });

        // arrScanSerNum.forEach(function (e, index) {


                // var query = {
                //     $or:[{$and:[{codeSerial:{$gte:e-5*webNum}},{codeSerial:{$lte:e+5*webNum}}]},
                //         {$and:[{groupCode:{$gte:e-5*webNum}},{groupCode:{$lte:e+5*webNum}}]}],
                //     categoryId:mongoose.Types.ObjectId(categoryId)
                //     //actWeb: e%webNum==0 ? webNum : e%webNum
                // };
                // Scan.getScanByQuery(query, '', function (err, rs) {
                //     if(err){
                //         logger.error(err);
                //         err_message = '查找接头范围失败!';
                //         return ep.emit('err_message', err_message);
                //     }
                //     if(rs){
                //         if(rs.length == 0){
                //             ep.emit('ReCode_ok',-1);
                //         }else{
                //             rs.forEach(function (r) {
                //                 if(Math.abs(e-r.codeSerial)%webNum == 0 || Math.abs(e-r.groupCode)%webNum == 0){
                //                     Scan.removeScanByCodeSerial({_id:r._id}, function (err, result) {
                //                         if(err){
                //                             logger.error(err);
                //                         }else{
                //                             if(result.result.n>0){
                //                                 console.log("has same date: "+e+". delete it. insert new scanserials");
                //                             }
                //                         }
                //                     });
                //
                //                 }
                //             });
                //             ep.emit('ReCode_ok',index);
                //         }
                //     }else{
                //         ep.emit('ReCode_ok',-1);
                //     }
                //
                //
                // });


        // });
        // arrScanSerNum.forEach(function (e, index) {
        //     var query = {
        //         $or:[{$and:[{codeSerial:{$gte:e-5*webNum}},{codeSerial:{$lte:e+5*webNum}}]},{$and:[{groupCode:{$gte:e-5*webNum}},{groupCode:{$lte:e+5*webNum}}]}],
        //         //$or:[{codeSerial:{$gte:e-5*webNum}},{codeSerial:{$lte:e+5*webNum}}],
        //         categoryId:mongoose.Types.ObjectId(categoryId),
        //         actWeb: e%webNum==0 ? webNum : e%webNum
        //     };
        //     // Scan.getScanByQuery(query, '', function (err, rs) {
        //     //     console.log(query);
        //     //     console.log(rs.length);
        //     //     rs.forEach(function (r) {
        //     //         console.log(r.codeSerial,r.groupCode);
        //     //     });
        //     //
        //     // });
        //     Scan.removeScanByCodeSerial(query, function (err, result) {
        //         if(err){
        //             logger.error(err);
        //         }else{
        //             if(result.result.n>0){
        //                 console.log("has same date: "+e+". delete it. insert new scanserials");
        //                 ep.emit('ReCode_ok',index);
        //             }else{
        //                 ep.emit('ReCode_ok',-1);
        //             }
        //
        //         }
        //     });
        // });

        logger.debug('[SOAP-PushSequences] categoryId: '+ categoryId);
        logger.debug('[SOAP-PushSequences] webNum: '+ webNum);
    });


    // 纸病序列入库
    ep.after('ReCode_ok', arrScan.length, function(docs) {
        logger.debug('[SOAP-PushSequences] arrScanSerNum: '+ arrScanSerNum.length);
        var actWeb = 0,
            sum = 0,
            groupCode = 0,
            codeContent = '',
            groupCodeContent = '',
            recount = 0;
        docs.forEach(function(e){
            //输出重复的数据
            if(e >= 0){
                logger.error('[SOAP-PushSequences] Have the same data: '+ JSON.stringify(arrScanSerNum[e]) +' in Category: '+ categoryId+". delete it.");
                Logs.addLogs('system', '[SOAP-PushSequences] Have the same data: '+ JSON.stringify(arrScanSerNum[e]) +' in Category: '+ categoryId+". delete it.", 'system', '2');
                //recount++;
            }
        });
        // 入库
        // 如果没有重复数据，增加扫描序列
        // 序列 两两一对，每条记录groupCode为上一条记录的扫描码，codeSerial为实际扫描码；
        if (recount == 0) {
            err_message = '';
            arrScanSerNum.forEach(function(e){

                if (e % webNum == 0) {
                    actWeb = webNum;
                } else {
                    actWeb = e % webNum;
                }
                codeContent = vsScanCode[sum++];
                if (sum % 2 == 0) {
                    groupCode = arrScanSerNum[sum - 2];
                    groupCodeContent = vsScanCode[sum-2];
                } else {
                    groupCode = arrScanSerNum[sum];
                    groupCodeContent = vsScanCode[sum];
                }
                // 判断e、groupCode之间的差值，来确认接头是否扫描正确
                // 如果错误，不入库
                if(Math.abs(e-groupCode) <= webNum*2 && Math.abs(e-groupCode)%webNum == 0 ){    //与幅数相等，表示接头扫描错误，或者说 在一个区间之内都是错误
                    ep.emit('nearlySequences',sum);
                }else{
                    // false:是否为虚拟接头
                    Scan.newAndSave(categoryId, e, codeContent, actWeb, groupCode, groupCodeContent, false, ep.done('Insert_ok'));
                }

            });
        }
    });
    // 输出入库结果
    ep.after('Insert_ok', arrScan.length, function(docs) {
        logger.debug('[SOAP-PushSequences] Insert into DB is ok. DOCS: '+ JSON.stringify(docs));
        return callback(null,{Status:1, ID:args.ID, ErrMessage:err_message});
    });
    ep.all('nearlySequences', function (sum) {
        err_message = '接头扫描错误,请检查第'+parseInt((sum+1)/2)+'个接头.';
        return callback({Status:3, ID:args.ID, ErrMessage:err_message}, null);
    });
    ep.all('err_message', function (message) {
        return callback({Status:3, ID:args.ID, ErrMessage:message}, null);
    });
}

