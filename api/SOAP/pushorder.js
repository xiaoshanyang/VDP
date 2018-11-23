/**
 * Created by youngs1 on 7/24/16.
 * 1、所有二维码来自数码通，无需再上传电信平台
 * 2、不在判断三元儿童奶、蒙牛海外奶，这两个使用国家二维码、上传电信平台的品类
 * 3、不再生产上传电信平台的zip、xml文件（暂时需要生成，到2017-04-22停止生成这类文件）
 * 4、及时更新 为url+二维码，一起存放在数据库中的形态
 *
 * 2017-04-14
 * 1、除可变图以外的所有工单生成的 文件， 都要上传数码通的ftp地址， 而三元、蒙牛海外奶这两种也要生成文件 上传数码通ftp
 * 由数码通判断，上传电信平台
 * 2、需要完成工作：
 *      a.在所有工单做完后，将发送到工厂的文件上传数码通ftp，此时要去除 vdpType=1 && (三元、海外奶)
 *      b.在vdpType=1 && (三元、海外奶) 遵照之前的上传电信平台流程，只修改ftp地址
 *
 * 2017-04-21
 * 1、以后在下工单时 根据对应品类，自动下码， 等下码完成以后， 开始下发工单
 * 具体：
 *      要把下码操作放在61上， 62可能会因为缺少信息重启，放在61上，重启的几率比较小
 *      在61下码完成后， 调用62的接口， 接口中调用 pushOrder 函数 继续执行这个工单
 *      这个需要在61中创建一个临时表，把需要下码的记录存放，下码成功以后，删除记录
 *      同样62 需要一个临时表， 存放未完成的工单信息， 在下码完成以后， 去取出信息， 推送到pushorder
 *      *******： 未知情况： 关联品类不确定，需要确认
 *
 *      category.addCode() 使用post发送请求，需要参数：
 *      var categoryId = req.body.pk;var dlCount = validator.trim(req.body.dlcount) || 1000000;var generalId = validator.trim(req.body.generalid);
 *      品类ID， 申请量， 申请ID(token), 添加一个标记，标识，这个请求是来自62的
 * 2017-05-02
 * 1. 修改下单 基本数据， 抛弃以物料号关联 品类的方式 修改为 以 设计号+数码版本号(designId+vdpVersion) 组合在一起判断 品类的方式 来查询 具体使用哪个品类的 二维码来
 * 制作下发工厂的txt文件
 * 2. 在 三元儿童奶、蒙牛海外奶 类似的 工单 ，需要生成 xml 文件， 对下发zip解析， 其中包含一条来自 物料的信息， 此时修改为 小品类的名字(即des推送的产品名)
 *
 * 2017-07-05
 * 1. 将getdes文件的方式 由从ftp获取变更为 直接挂在2.200的共享文件夹到14.62服务器上
 * tif、job文件存放在 middlewares/data/getdes/VDP-HST
 * txt 文件存放在 middleware/data/getdes/VDP-PC
 * 直接读取本地文件夹，获取文件，然后上传工厂ftp
 *
 * 2017-07-06
 * 1. 添加一个新类型
 * 可变图形码：流程与可变图码基本一致
 * 只是单个txt文件的最大行数变为 10100 行, 放到固定文件地址，发送消息触发GMS启动，开始生成图片文件
 *
 */
var EventProxy          = require('eventproxy');
var logger              = require('../../common/logger');
var tools               = require('../../common/tools');
var cache               = require('../../common/cache');
var readLine            = require('lei-stream').readLine;
var writeLine           = require('lei-stream').writeLine;
var FTP                 = require('ftp');
var FS                  = require('fs');
var soap                = require('soap');
var config              = require('../../config');
var mongoose            = require('mongoose');

var Logs                = require('../../proxy').Logs;
var Category            = require('../../proxy').Category;
var FTPInfo             = require('../../proxy').FTPInfo;
var QRCode              = require('../../proxy').QRCode;
var Order               = require('../../proxy').Order;
var Customer            = require('../../proxy').Customer;
var Materiel            = require('../../proxy').Materiel;
var models              = require('../../models');
var QRCodeEntity        = models.QRCode;
var _this               = this;
//表示是否有工单正在执行
var isExecuted          = false;
//用来存放进入Redis的工单
var orderList           = [];
//设置一个循环,每1分钟,刷一次redis,查看是否有工单存在,有工单时,查看是否有工单正在执行,没有正在执行的工单,则在redis中抽出一个执行
setInterval(function () {
    if(!isExecuted){
        // 触发排队工单
        var redisOrder = "order*";
         if(orderList.length > 0){
            redisOrder = "order"+orderList[0];
        }
        cache.keys(redisOrder, function (err, keys) {
            if (keys.length > 0) {
                logger.debug('Go to Order: '+ keys[0]);
                cache.get(keys[0], function(err, data) {
                    if (err) {
                        logger.debug('Get Redis is err : '+ err);
                    } else {
                        logger.debug('Ready Restart pushorder. data: '+ JSON.stringify(data));
                        makeOrder(data);
                        cache.del(keys[0]);
                        logger.debug('del key : '+ keys[0]);
                    }
                });
            }
        });
    }
}, 60000);

exports.pushOrder = function(args){

    // 为了防止接收到工单的时间间隔太短,查库的时间过长,导致无法阻断工单,造成工单重码的情况
    // 当接收到工单是直接进入Redis,每次从redis中取出一个单子执行, 这样可能无法实现不同品类工单的并发执行
    orderList.push(args.orderId + '-' + args.orderNum);
    cache.set('order'+ args.orderId + '-' + args.orderNum, args, function (err, setredis) {
        logger.debug('set key err: '+ err);
        logger.debug('set key keys: '+ JSON.stringify(setredis));
    });
    return logger.error('[SOAP-PushOrder '+ args.orderId +'] Push order ('+ args.orderId +') to redis.');
}

function makeOrder(args) {
    //工单正在执行
    isExecuted = true;

    var saleNum = args.saleNum,
        orderId = args.orderId,
        customerCode = args.customerCode,
        productCode = args.productCode,
        vdpType = args.vdpType,
        codeURL = args.codeURL.toLowerCase(),
        planCount = parseFloat(args.planCount) * 1000,
        //multipleNum = args.multipleNum,
        // 不在按比例，计算下码量，改为在计划量的基础上增加30万
        multipleNum = 1.0,
        splitSpec = args.splitSpec,
        designId = args.designId,
        vdpVersion = args.vdpVersion,
        orderNum = args.orderNum,
        factoryCode = args.factoryCode,
        lineCode = args.lineCode,
        webNum = args.webNum,
        pushMESDate = args.pushMESDate,
        customerOrderNum = args.customerOrderNum,
        smtDesginID = args.gd_Number || '',
        smtVersionID = args.gd_Ver || '';

    logger.debug('Request PushOrder from MES');
    //splitSpec、webNum 两个值取品类中的值，不采用mes传送的值，取消他们的非空判断
    if ([saleNum, orderId, customerCode,
            vdpType, productCode,
            //planCount, multipleNum, splitSpec,
            planCount, multipleNum,
            designId, vdpVersion, orderNum, factoryCode, lineCode,
            //webNum, pushMESDate].some(function (item) { return item === ''; })) {
            pushMESDate].some(function (item) { return item === ''; })) {
        //工单状态设为false
        isExecuted = false;
        orderList.shift();
        Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Received a SOAP request from MES. Call: PushOrder Args(vdpVersion) has Null', 'system', '2');
        returnFeedbackInfo(factoryCode, lineCode, orderId, 10, '', '', '', orderNum, '');
        return logger.error('[SOAP-PushOrder '+ orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null.');
    }

    var categoryId = '',
        categoryName = '',
        generalId = '',
        qrcodeCount = 1,
        desRow = 1,
        maxRow = parseInt(config.interface_opts.MaxPrintRows),
        avlCode = 0,
        ftpinfo = {},
        lcmNum = 0,
        totalCount = 0,
        fileRow = 0,
        fileCount = 0,
        file = [],
        CodeCount = 0,
        // 不通过比例计算实际下码量，改为自动追加30万码量
        //AddCodeCount = 30 * 10000;
        AddCodeCount = 0 * 10000,
        Order_id = '',
        Start_id = '',
        End_id = '',
        Start_Num = 0,
        End_Num = 0,
        tifjobDesFile = 'middlewares/data/getdes/VDP-HST/',
        //txtDesFile = 'middlewares/data/getdes/VDP-PC/',
        txtDesFile = 'middlewares/data/getdes/VDP-HST/',
        arrDesPic = [],
        arrDesPicId = [],
        returnExit = false,
        BeforSerial = 0,
        allCodeFile = '',
        allCodeFile_PicID = '',
        allCodeFile_Codes = '',
        BeforCodeID = '',
        tifjobFileList = [],
        isFirstExport = false,
        //-------------数码通标识-----------------
        isSMT = false,      //此标识用来 判断是否为数码通平台的二维码， 根据此处来判断url， 组合下发工厂的文件内容
        SMTFile = false,       //标识，是否生成 zip、xml文件上传电信平台
        withoutE = true,
        withoutUpload = true,
        password = '',
        smtprintFTP = '';
        //-------------数码通标识-----------------

    var PID = 1,
        baseFilePath = 'middlewares/data/preprint/',
        baseSendFilePath = 'middlewares/data/preprint_send/';

    // 折角码参数
    var QRCodeVersion = '',
        modulePoints = 0,
        ErrorLevel = 0,
        pen_offset = 0,
        QRCodeSize = 0,
        RotAngle = 0,
        PicFormat = '',
        PicModel = '',
        PicDpi = '',
        JobType = '';

    // 按照工单计划量来设置 冗余比例
    var oo = planCount/10000;
    if(oo <= 30){
        multipleNum = 2;
    }else if(oo <= 70){
        multipleNum = 1.5;
    }else if(oo <= 150){
        multipleNum = 1.2;
    }else{
        multipleNum = 1.0;
        if(factoryCode.indexOf('F1') >= 0){
            AddCodeCount = 30 * 10000;
        }else{
            AddCodeCount = 20 * 10000;
        }
    }

    // 双码关连 暂时设置比例为1.5倍
    if(multipleNum < 1.5 && vdpType == 4){
        multipleNum = 1.5;
        AddCodeCount = 0;
    }

    var ep = new EventProxy();
    ep.fail(function(err) {
        //工单状态设为false
        isExecuted = false;
        orderList.shift();
        Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Request from MES. ERROR: '+ err, 'system', '2');
        returnFeedbackInfo(factoryCode, lineCode, orderId, 10, '', '', '', orderNum, '');
        return logger.error('[SOAP-PushOrder '+ orderId +'] Request from MES. ERROR: '+ err);
    });

    // 错误统一处理
    ep.all('get_error', function (Info) {
        if(Info._id != ''){
            Order.getOrderById(Info._id, function(err, rs) {
                rs.state = 2;
                rs.save();
            });
        }
        //工单状态设为false
        isExecuted = false;
        orderList.shift();
        Logs.addLogs('system', Info.error, 'system', '2');
        returnFeedbackInfo(factoryCode, lineCode, orderId, 10, '', '', '', orderNum, '');
        return logger.error(Info.error);
    });

    // 初始化信息、客户、物料(已经不再处理)、品类、ftp地址
    Customer.getCustomerByNumber(parseInt(customerCode), ep.done('get_customer'));
    //根据product_code 获取 materiel_name
    // 修改为根据 设计号+数字版本号 来判断所属品类，不在通过物料号判断，也无需判断 该物料是否存在
    // Materiel.getMaterielByNumber(parseInt(productCode), ep.done('get_materiel'));

    //ep.all('get_customer', 'get_materiel', function (customer, materiel) {
    ep.all('get_customer', function (customer) {
        // 如果没找到客户或者物料信息，报错，工单失败，不在继续执行
        if(!customer /*|| !materiel*/) {
            var errMessage = '';
            if (!customer){
                errMessage = '[SOAP-PushOrder '+ orderId +'] getCustomerByNumber [' + customerCode + '] is error';
            }
            /*if (!materiel){
             errMessage +=  '[SOAP-PushOrder '+ orderId +'] getMaterielByNumber [' + productCode + '] is error';
             }*/
            return ep.emit('get_error', {_id:Order_id, error:errMessage});
        }
        var query = {
            designId: designId,
            vdpVersion: vdpVersion
        };
        Category.getCategoryByQuery(query, '', function(err, rs) {
            if (err) {
                //工单状态设为false
                var errMessage = '[SOAP-PushOrder '+ orderId +'] query categoryinfo fail.'
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            if (rs.length > 0) {
                categoryId = rs[0]._id;
                categoryName = rs[0].name;
                splitSpec = rs[0].splitSpec;
                webNum = rs[0].webNum;
                avlCode = rs[0].codeAvailable;
                isSMT = rs[0].isGDT;
                generalId = rs[0].generalId;
                qrcodeCount = rs[0].QRCodeCount || 1;

                //折角码
                if(vdpType == 3){
                    QRCodeVersion = (rs[0].QRCodeVersion || 'QR3').split("|")[0];
                    modulePoints = parseInt((rs[0].modulePoints || 8).split("|")[0]);
                    ErrorLevel = parseInt((rs[0].ErrorLevel || 1).split("|")[0]);
                    pen_offset = parseInt((rs[0].pen_offset || 3).split("|")[0]);
                    QRCodeSize = rs[0].QRCodeSize || 10.2;
                    RotAngle = rs[0].RotAngle || 225;
                    PicFormat = rs[0].PicFormat || 'tif';
                    PicModel = rs[0].PicModel || 'Gray';
                    PicDpi = rs[0].PicDpi || 600;
                    JobType = rs[0].JobType || 'GAB250';
                    QRCodeVersion = 'QR5';
                    modulePoints = 8;
                    ErrorLevel = 2;

                }

                if(rs[0].disable || rs[0].designIdVersion === '104020_0586_01-001'){
                    // 如果是蒙牛_特仑苏有机纯牛奶_可变图. 104020_0586_01-001，不执行下码操作，但是记录工单号，方便统计
                    if(rs[0].designIdVersion === '104020_0586_01-001'){
                        var errMessage = '';
                        Order.newAndSave(saleNum, orderId, customerCode, productCode, 1, codeURL, planCount, multipleNum,
                            splitSpec, designId, customerOrderNum, vdpVersion, orderNum, factoryCode, lineCode,
                            webNum, pushMESDate, categoryId, "", "", function(err, orderRS) {
                                if (err) {
                                    //工单状态设为false
                                    errMessage = '[SOAP-PushOrder '+ orderId +'] order.newAndSave is err: '+ err;
                                    Logs.addLogs('system', errMessage, 'system', '2');
                                    logger.error(errMessage);
                                }else{
                                    errMessage = '[SOAP-PushOrder '+ orderId +'] order newAndSave. categoryName: ' + categoryName;
                                    Logs.addLogs('system', errMessage, 'system', '1');
                                    logger.debug(errMessage);
                                    orderRS.state = 1;
                                    orderRS.save();
                                }

                            });
                    }
                    errMessage = '[SOAP-PushOrder '+ orderId +'] Request from MES. categoryName:'+categoryName+'. Category is disabled by designID+vdpVersion: '+ designId+'-'+vdpVersion;
                    return ep.emit('get_error', {_id:Order_id, error:errMessage});
                }else{
                    ep.emit('category_ok');
                }
            } else {
                // 没有找到相关物料品类
                //工单状态设为false
                var errMessage = '[SOAP-PushOrder '+ orderId +'] Request from MES. cannot find categoryinfo by designID+vdpVersion: '+ designId+'-'+vdpVersion;
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
        });
    });

    ep.all('category_ok', function() {
        if(isSMT){
            //如果是数码通，他们给出的二维码必定是带url的，无需再添加?E=
            withoutE = true;
        }else{
            //非数码通的码，现在不确认，先认为他们需要添加 ?E=
            withoutE = false;
        }

        // 数码通 设计号、版本号，入库 字段 与 mes推送字段，变量名不一致
        smtDesginID = smtDesginID===''?args.smtDesginID || '' : smtDesginID;
        smtVersionID = smtVersionID===''?args.smtVersionID || '' : smtVersionID;

        //非数码通判断 url是否为空
        // 以后非数码通工单 url不能为空
        if(!isSMT && codeURL === ''){
            //工单状态设为false
            var errMessage = '[SOAP-PushOrder '+ orderId +'] Received a SOAP request from MES. Call: PushOrder Args(url) is Null';
            return ep.emit('get_error', {_id:null, error:errMessage});
        }

        //---------------------------
        ep.emit('check_order');
        logger.debug('categoryId: '+ categoryId);
        logger.debug('splitSpec: '+ splitSpec);
        logger.debug('webNum: '+ webNum);
        logger.debug('avlCode: '+ avlCode);

    });
    // 判断是否当前品类下是否有进行中的工单, state:0, 正在执行， state:3 等码状态
    ep.all('check_order', function () {
        Order.getOrderByQuery({categoryId: categoryId, state: {$in:[0, 3]}},'', function(err, catrs) {
            if (err) {
                //工单状态设为false
                var errMessage = '[SOAP-PushOrder '+ orderId +'] query order info fail.';
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            if (catrs.length > 0) {
                // 如果该品类有正在处理的工单，将工单请求存放在redis缓存中等待处理。
                cache.set('order'+ orderId, args, function (err, setredis) {
                    logger.debug('set key err: '+ err);
                    logger.debug('set key keys: '+ JSON.stringify(setredis));
                });
                //工单状态设为false
                isExecuted = false;
                orderList.shift();
                return logger.error('[SOAP-PushOrder '+ orderId +'] Push order ('+ orderId +') to redis.');
            } else {
                // 没有工单正在执行, 创建新工单
                ep.emit('get_end_serialNum');
            }
        });
    });
    // 获取同品类工单的结束码
    ep.all('get_end_serialNum', function(){
        // 查询最大序列号
        var orderQuery = {categoryId: categoryId, state: 1, vdpType:{$in:[0, 2, 4]}};
        // 工单号大于5位数，表示虚拟工单，查询需要从虚拟工单中查找
        if(orderId > 100000 && vdpType == 3){
            orderQuery = {categoryId: categoryId, state: 1, orderId:{$gt:100000}, vdpType:{$in:[3]}};
        }
        console.log(orderQuery);
            Order.getOrderByQuery(orderQuery, {sort: '-endSerialNum'}, function(err, maxrs) {
                if (err) {
                    //工单状态设为false
                    var errMessage = '[SOAP-PushOrder '+ orderId +'] Order.getOrderByQuery by maxNum is err: '+ err;
                    return ep.emit('get_error', {_id:Order_id, error:errMessage});
                } else {
                    if (maxrs.length > 0) {
                        BeforSerial = maxrs[0].endSerialNum;
                        BeforCodeID = maxrs[0].endCodeId;
                        ep.emit('create_new_order');
                    } else if(vdpType != 1 && avlCode != 0){    //如果存在执行成功的工单,则设置好BeforCodeID、没有时需要,找到该品类的第一个码的位置
                        //在下边批量查码时,通过这种大于_id的这种方法比较快
                        //为新品类准备,这样会跳过该品类的第一个码
                        isFirstExport = true;
                        QRCode.getQRCodeByQuery({categoryId: categoryId, state: 1}, {sort: '_id', limit: 1}, function (err, rs) {
                            if (err) {
                                //工单状态设为false
                                var errMessage = '[SOAP-PushOrder '+ orderId +'] QRCode.getQRCodeByQuery get first code order by _id is err: '+ err;
                                return ep.emit('get_error', {_id:Order_id, error:errMessage});
                            }
                            if(rs.length>0){
                                BeforSerial = 0;
                                BeforCodeID = rs[0]._id;
                            }
                            ep.emit('create_new_order');
                        });
                    }else{
                        ep.emit('create_new_order');
                    }
                }
            });
    });
    // 创建新工单
    ep.all('create_new_order', function(){
        // 在创建新工单之前，先查询是不是 之前等码的工单重新开始
        Order.getOrderByQuery({orderId: orderId, orderNum: orderNum, state:4}, function (err, rs) {
            if (err) {
                //工单状态设为false
                var errMessage = '[SOAP-PushOrder '+ orderId +'] QRCode.getQRCodeByQuery get first code order by _id is err: '+ err;
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            if(rs.length>0){    //找到之前的工单
                // 把状态改为正在执行 state：0
                rs[0].state = 0;
                rs[0].planCount = rs[0].planCount;
                rs[0].save(function () {
                    Order_id = rs[0]._id;
                    planCount = rs[0].planCount;
                    smtDesginID = rs[0].smtDesginID;
                    smtVersionID = rs[0].smtVersionID;
                    ep.emit('get_fac_ftp');
                });
            }else{  // 之前没有该工单
                // 创建新工单
                Order.newAndSave(saleNum, orderId, customerCode, productCode, vdpType, codeURL, planCount, multipleNum,
                    splitSpec, designId, customerOrderNum, vdpVersion, orderNum, factoryCode, lineCode,
                    webNum, pushMESDate, categoryId, smtDesginID, smtVersionID, function(err, orderRS) {
                        if (err) {
                            //工单状态设为false
                            var errMessage = '[SOAP-PushOrder '+ orderId +'] rder.newAndSave is err: '+ err;
                            return ep.emit('get_error', {_id:Order_id, error:errMessage});
                        } else {
                            Order_id = orderRS._id;
                            ep.emit('get_fac_ftp');
                        }
                    });
            }
        });

    });

    // 获取FTP信息：上传工厂FTP
    ep.all('get_fac_ftp', function() {

        var query = {
            code: factoryCode +'_'+ lineCode,
            type: 'preprint',
            disabled: false
        };
        FTPInfo.getFTPInfoByQuery(query, '', function(err, rs) {
            if (err) {
                var errMessage = '[SOAP-PushOrder '+ orderId +'] FTPInfo.getFTPInfoByQuery is err: '+ err;
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            if (rs.length > 0) {
                ftpinfo.factory = {
                    host: rs[0].host,
                    port: rs[0].port,
                    user: rs[0].user,
                    pass: rs[0].pass
                };
                ep.emit('fac_ftp_ok');
            } else {
                // 没有找到相关物料品类
                var errMessage = '[SOAP-PushOrder '+ orderId +'] Request from MES. Get factory ftp info error';
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
        });
    });

    // 可变图、可变码类型的获取DES文件
    ep.all('fac_ftp_ok', function () {
        if(vdpType == "3"){ // 折角码，发送地址不同
            //ftpinfo.factory.host = '192.168.97.8';
            ftpinfo.factory.host = '192.168.97.17';
            ftpinfo.factory.port = '21';
            ftpinfo.factory.user = 'GmsFtpUser';
            ftpinfo.factory.pass = 'Aa123456';
        }else{
            ftpinfo.factory.host = '192.168.101.139';
            ftpinfo.factory.port = '8096';
            ftpinfo.factory.user = 'test';
            ftpinfo.factory.pass = 'test';
        }

        logger.debug('ftpinfo: '+ JSON.stringify(ftpinfo));
        if (vdpType == "0" || vdpType == "4" || vdpType == "3") {
            // 打印类型为可变二维码，跳过此过程
            ep.emit('desfile_ok');
        } else {
            // 不在从ftp上获取txt文件

            txtDesFile = txtDesFile + designId + '-' + vdpVersion;
            var picsTxt = txtDesFile + '/' + designId + '-' + vdpVersion + '.txt';
            var txtFileList = walkDir(txtDesFile, ['txt']);

            if(txtFileList.txtList.length==0){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] DES_FILE_Error: The txt file cannot find. FILE: ' + picsTxt;
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }

            if(txtFileList.txtList.length>1){
                //表示存在 图片素材ID对应关系
                picsTxt = txtDesFile + '/' + designId + '-' + vdpVersion + '-' + smtDesginID + '-' + smtVersionID + '.txt'
            }
            if(!FS.existsSync(picsTxt)){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] DES_FILE_Error: The txt file cannot find. FILE: ' + picsTxt;
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            readLine(picsTxt).go(function (data, next) {
                desRow++;
                if(vdpType == "1"){
                    if (data.indexOf('\r') > 0) {
                        data = data.replace('\r','');
                    }
                    arrDesPic.push(data);
                }
                if(vdpType == "2"){
                    var arrData = data.split(',');
                    if(arrData.length > 1){
                        var strData = arrData[1];
                        if (strData.indexOf('\r') > 0) {
                            strData = strData.replace('\r','');
                        }
                        arrDesPic.push(strData);
                        if(arrData.length == 3 || SMTFile){     //如果包含素材ID 或者 是三元类似的品类
                            //if(arrData.length == 3 || smtDesginID !== ''){
                            var numData = arrData[2];
                            if(typeof numData == 'undefined'){
                                numData = 100;
                            }else {
                                if (numData.indexOf('\r') > 0) {
                                    numData = numData.replace('\r','');
                                }
                            }
                            arrDesPicId.push(numData);
                        }
                    }else{
                        desRow--;
                    }
                }
                next();
            }, function () {
                desRow = desRow - 1;
                console.log(arrDesPic.length);
                if (arrDesPic.length > 20000) {   //20000表示在特殊可变图码情况,设定一下总量的计算情况,不再根据幅数去计算最小公倍数,那样会导致浪费特别大
                    desRow = 1;
                }
                console.log(desRow);
                ep.emit('desfile_ok');
            });
        }
    });
    // 初始化信息计算
    ep.all('desfile_ok', function() {
        // DES 文件行数 与 分拆规格的最小公倍数
        lcmNum = tools.gcd(desRow, splitSpec);
        // 总量 ＝ 计划量 * 码倍数
        totalCount = planCount * multipleNum;
        // 码倍数改为 1.0 不再根据比例调整下发码量
        // 改为在计划量的基础上添加30万
        totalCount = totalCount + AddCodeCount;
        // 实际总量 ＝ 总量 + (分拆规格 - 总量与分拆规格的余数)
        //totalCount = totalCount - totalCount % lcmNum + lcmNum;
        totalCount = totalCount + (totalCount%lcmNum==0 ? 0 : (lcmNum-totalCount % lcmNum));
        //----------------------
        // 如果现在可用码量不够时， 开启自动下码
        if(vdpType == 3){
            totalCount = planCount;
        }
        
        if(orderId = 88033){
            totalCount = totalCount*2;
        }

        //----------------------
        if (avlCode < totalCount && vdpType != '1'){
            // 暂时从orderList中删除，存入一个临时表中，等待导码完成，再次导入，先把工单标成 stat：3, 表示等待补码，等码到以后在开始执行
            // 此时是否需要 开始执行别的工单 ，不执行，最简单不会出错
            // 如果想要继续执行别的工单， 可以将相同品类的单子，暂时控制在外边
            Order.getOrderById(Order_id, function (err, rs) {
                if(err){
                    console.log(err);
                }
                rs.state = 3;
                rs.save(function () {
                    // 调用61接口，开始补码
                    var applyInfo = {
                        categoryId: categoryId,
                        dlCount: totalCount-avlCode,  // 如果该品类 没有二维码， 首次导入， 多导入一个 二维码， 方便取得BeforCodeID， 加快批量查库速度
                        orderId: orderId+'-'+orderNum,
                        generalId: generalId,
                        qrcodeCount: qrcodeCount
                    };
                    tools.ApplyCode(JSON.stringify(applyInfo), function (err, rs_message) {
                        if(err){
                            logger.error(rs_message);
                            // 如果补码失败，修改 工单状态 ，让后边的工单可以继续进行
                            rs.state = 2;   // 标成工单失败
                            rs.save(function () {
                                Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] apply code fail. ERR: ' + rs_message, 'system', '2');
                                returnFeedbackInfo(factoryCode, lineCode, orderId, 10, '', '', '', orderNum, '');
                            });
                        }else{
                            // 开始下码，已与61完成通信， 在61上开始下码
                            logger.debug('[SOAP-PushOrder ' + orderId + '] start apply code. download count:' + totalCount);
                        }
                    });
                });
            });
            //工单状态设为false
            isExecuted = false;
            orderList.shift();
            //Logs.addLogs('system', '[SOAP-PushOrder ' + orderId + '] Request from MES. avlCode: ' + avlCode + ' < totalCount:' + totalCount, 'system', '1');
            //returnFeedbackInfo(factoryCode, lineCode, orderId, 10, '', '', '', orderNum, '');
            logger.warn('[SOAP-PushOrder ' + orderId + '] Request from MES. avlCode: ' + avlCode + ' < totalCount:' + totalCount);
        }else {


            //上传图片、job文件到工厂ftp
            // 获得可变图、可变图码 需要的tif文件、job文件

            tifjobDesFile = tifjobDesFile + designId + '-' + vdpVersion;
            //获得tif图片文件、job文件, 发送到工厂
            var tifjobFileList = walkDir(tifjobDesFile, ['tif','job']);
            // 可变图、可变图码时，判断图片数量
            if(vdpType == '1' || vdpType == '2'){
                if( tifjobFileList.tifList.length <= 0 ){
                    var errMessage = '[SOAP-PushOrder '+ orderId +'] DES_FILE_Error: The number of pictures is wrong';
                    return ep.emit('get_error', {_id:Order_id, error:errMessage});
                }
            }
            if(tifjobFileList.jobList.length != 1){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] DES_FILE_Error: The number of job is wrong';
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            // 判断job文件名是否正确
            var jobFile = tifjobDesFile+'/'+designId + '-' + vdpVersion+'.job';
            if(tifjobFileList.jobList[0].toLowerCase() != jobFile.toLowerCase()){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] DES_FILE_Error: Connot find correct job file:'+jobFile;
                return ep.emit('get_error', {_id:Order_id, error:errMessage});
            }
            // 图片、job 文件没有错误，上传工厂ftp地址
            // 先上传 图片文件，后上传job文件
            var fileList = [];
            fileList = fileList.concat(tifjobFileList.tifList);
            fileList = fileList.concat(tifjobFileList.jobList);

            fileList.forEach(function (f, index) {
                ep.after('tifjob_upload_ok', index, function () {
                    //f = f.split('/');
                    //f = f[f.length-1];
                    var uploadfile = 'image';
                    if(f.indexOf('.job')>0) {//把job文件发送到根目录,tif文件发送到image目录
                        uploadfile = './';
                        if(vdpType=='3'){
                            uploadfile = orderId + '-' + orderNum;
                        }
                    }

                    uploadagain(ftpinfo.factory.host, ftpinfo.factory.port, ftpinfo.factory.user, ftpinfo.factory.pass, f, uploadfile,0,'uploadtifjob',function (haserr) {
                        if(haserr){
                            var errMessage = '[SOAP-PushOrder '+ orderId +'] DES_FILE_Error: Upload to Factory Error. File:'+ f +' Err:'+ haserr;
                            return ep.emit('get_error', {_id:Order_id, error:errMessage});
                        }
                        ep.emit('tifjob_upload_ok');
                        if(index === fileList.length-1){
                            //tif、job文件上传成功
                            logger.debug('[SOAP-PushOrder '+ orderId + '] .tif files and .job file Upload to Factory is OK:' + ftpinfo.factory.host);
                            Logs.addLogs('system', '[SOAP-PushOrder '+ orderId + '] .tif files and .job file Upload to Factory is OK:' + ftpinfo.factory.host, 'system', '0');
                            ep.emit('printfileUpload_ok');
                        }
                    });
                });
            });

            if(vdpType=='3'){
                tools.GetGMSPid({designId:designId+'-'+vdpVersion}, function (err, data) {
                    if(err){
                        return logger.error('[SOAP-PushOrder '+ orderId + '] get PID fail from GMS. Error:' + err);
                    }
                    logger.debug(data);
                    data = JSON.parse(data);
                    if( typeof data.state == 'undefined' ){
                        PID = parseInt(data.MaxPID) || 0;
                        ep.emit('getGMSPID_ok');
                    }else{
                        logger.error(data);
                    }


                });
            }else{
                ep.emit('getGMSPID_ok');
            }
        }
    });

    ep.all('printfileUpload_ok', 'getGMSPID_ok',function () {

        //可变图形码 单个文件最大行数改变 10100
        if(vdpType=='3'){
            maxRow = parseInt(config.interface_opts.GMSMaxPrintRows);
        }

        // 单个文件行数 ＝ 最大文件行数 － 最大文件行数和最小公倍数的余数
        fileRow = maxRow - maxRow % lcmNum + lcmNum;
        // 总量小于文件最大行数
        if (totalCount < maxRow) {
            fileRow = totalCount;
        }
        // 实际文件数量 下舍入
        fileCount = Math.floor(totalCount / fileRow);
        // 循环生成文件序列(文件名称, )
        // 文件名称：orderId-designId-productCode-YYYYMMDD-fileSerial.txt
        // 单个文件行数：fileRow
        // 如果是可变图形码的情况，文件名需要特殊处理，方便生成ijp文件可排序性
        var basicFilePath = factoryCode + '_' + orderId + '-' + designId + '-' + productCode + '-' + tools.formatDateforFile(Date.now()).replace(/-/g, '');
        var tmpFileCount = 0;
        if(vdpType == 3){
            tmpFileCount = 1000000+PID;
            basicFilePath = designId + '-' + vdpVersion ;
        }

        for (var i = 0; i < fileCount; i++) {
            // 如果折角码，txt文件单独存放
            var tfName = basicFilePath + '-' + eval(tmpFileCount+i + 1);
            var tfRows = fileRow;
            file.push({
                fileName: tfName,
                fileRows: tfRows
            });
        }
        if (totalCount % fileRow > 0) {
            var tfName = basicFilePath + '-' + eval(tmpFileCount+fileCount + 1);
            var tfRows = totalCount % fileRow;
            file.push({
                fileName: tfName,
                fileRows: tfRows
            });
            fileCount++;
        }

        logger.debug('----------------------------------------------------------');
        logger.debug('[SOAP-PushOrder ' + orderId + '] totalCount: ' + totalCount);
        logger.debug('[SOAP-PushOrder ' + orderId + '] avlCode: ' + avlCode);
        logger.debug('[SOAP-PushOrder ' + orderId + '] fileRow: ' + fileRow);
        logger.debug('[SOAP-PushOrder ' + orderId + '] fileCount: ' + fileCount);
        logger.debug('[SOAP-PushOrder ' + orderId + '] file: ' + JSON.stringify(file));
        logger.debug('----------------------------------------------------------');

        ep.emit('Receive_ok');
    });

    // 生成文件
    ep.all('Receive_ok', function() {
        // 调用MES接口，通知接收成功
        logger.debug('[SOAP-PushOrder '+ orderId +'] Test and verifye SOAP from MES is ok. OrderId: '+ orderId +' File: '+ JSON.stringify(file));
        Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Test and verifye SOAP from MES is ok. OrderId: '+ orderId +' File: '+ JSON.stringify(file), 'system', '0');
        returnFeedbackInfo(factoryCode, lineCode, orderId, 1, '', '', '', orderNum, '');

        //----------------数码通文件-------------
        //--------------------------------------

        var orderFilePath = factoryCode +'_'+ orderId +'-'+ designId +'-'+ productCode +'-'+ tools.formatDateforFile(Date.now()).replace(/-/g,'') + '-' + orderNum;

        //折角码工单，放入特定文件夹中
        if(vdpType == 3){
            baseFilePath = 'middlewares/data/preprint/AQRCVariable/';
            baseSendFilePath = 'middlewares/data/preprint_send/AQRCVariable/';
            orderFilePath = designId + '-' + vdpVersion;
            if(!FS.existsSync(baseFilePath)){
                FS.mkdir(baseFilePath);
            }
            if(!FS.existsSync(baseSendFilePath)){
                FS.mkdir(baseSendFilePath);
            }
        }

        // 生成一个工单全部码的文件
        // 最终文件
        allCodeFile = baseFilePath + 'ALL_' + orderFilePath + '.txt';
        // 包含图片素材ID的文件
        allCodeFile_PicID = baseFilePath + 'ALL_' + orderFilePath +'_PicID.txt';
        // 仅包含二维码的文件
        allCodeFile_Codes = baseFilePath + 'ALL_' + orderFilePath +'_QRCodes.txt';



        switch(vdpType) {

            case 0:    // 因为补码完成以后，vdpType类型变成整型， 无法识别字符型的，多加一个case 0，以便让工单执行下去
            case "0":
                allCodeFile_Codes = allCodeFile;
                ep.emit('writeqrcodefile');
                break;
            case 3:
            case "3":   //可变图形码的流程，还是走可变码的流程，只是文件最大行数发生变化
                allCodeFile_Codes = allCodeFile;
                ep.emit('writeqrcodefile');
                break;
            case 4:
            case "4":
                allCodeFile_Codes = allCodeFile;
                ep.emit('writeqrcodefile');
                break;
            case 2:
            case "2":
                ep.emit('writeqrcodefile');
                break;
            case 1:
            case "1":
                ep.emit('writePictruesFile');
                break;

        }
    });

    // 将二维码写入文件
    ep.all('writeqrcodefile', function () {

        var input = writeLine(allCodeFile_Codes, {
            cacheLines: 100000
        });

        // 生成一个工单全部码的文件
        var query = {
            categoryId: categoryId,
            state: 1
        };
        if (BeforCodeID !== '' && typeof BeforCodeID !== 'undefined') {
            query._id = {};
            if(isFirstExport){
                query._id.$gte = BeforCodeID;
            }else{
                query._id.$gt = BeforCodeID;
            }
        }
        var fields = '_id content content1 url distribution';
        var options = { limit: totalCount, sort: '_id'};
        logger.debug('[SOAP-PushOrder '+ orderId +'] start query content by '+ JSON.stringify(query) + ' sort: ' + JSON.stringify(options));
        var stream = QRCodeEntity.find(query, fields, options).lean().batchSize(100000).stream();
        stream.on('data', function (doc) {
            CodeCount++;
            if (CodeCount == 1) {
                logger.debug('[SOAP-PushOrder '+ orderId +'] Order Start ID: '+ doc._id);
                Start_id = doc._id;
                Start_Num = BeforSerial + 1;
                query.distribution = doc.distribution;
            }
            if (CodeCount == totalCount) {
                logger.debug('[SOAP-PushOrder '+ orderId +'] Order End ID: '+ doc._id);
                End_id = doc._id;
                End_Num = BeforSerial + totalCount;
            }
            stream.pause();

            if(doc.content1 != null){
                input.write(doc.url+doc.content+','+doc.content1, stream.resume());
            }else{
                input.write(doc.url+doc.content, stream.resume());
            }

        }).on('err', function (err) {
            returnExit = true;
            var errMessage = '[SOAP-PushOrder '+ orderId +'] Create PrePrint File Error OrderID: '+ orderId +' ERR: '+ err;
            return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 20});
        }).on('close', function () {
            input.end(function () {
                // 生成子文件
                if (!returnExit) {
                    // 检查文件行数，是否正常
                    CheckFileLineNumber(allCodeFile_Codes, totalCount, function () {
                        // 如果需要继续写入图片
                        if(arrDesPic.length > 0){
                            ep.emit('writePictruestoQrcodeFile');
                        }else{
                            ep.emit('split_TotalFile');
                        }
                    });
                }else{
                    //工单状态设为false
                    var errMessage = '[SOAP-PushOrder '+ orderId +'] All txt file: '+allCodeFile_Codes+' create fail.';
                    return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 20});
                }
            });
        });
    });

    // 仅可变图的情况
    ep.all('writePictruesFile', function () {
        // 写入图片
        // 获取DES文件
        logger.info('des count is '+ totalCount);
        logger.info('in img');

        var input = writeLine(allCodeFile, {
            cacheLines: 100000
        });

        codeURL = '';
        var DesPicNum = 0;
        for(var i=0; i<totalCount; i++){
            if(DesPicNum == arrDesPic.length){
                DesPicNum = 0;
            }
            input.write(arrDesPic[DesPicNum]);
            DesPicNum++;
        }
        input.end(function (err) {
            if(err){
                //工单状态设为false
                var errMessage = '[SOAP-PushOrder '+ orderId +'] Create txt file fail.Path:'+ allCodeFile + ' Err:'+ err;
                return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 20});
            }
            ep.emit('check_FileLineNumber');
        });
    });

    // 在可变码的基础上，增加图片信息
    ep.all('writePictruestoQrcodeFile', function () {
        //如果 不含素材id的可变图码，也需要上传数码通
        if(arrDesPic.length > 0 && arrDesPicId.length == 0){
            arrDesPicId.push('0');
        }
        var input = writeLine(allCodeFile, {
            cacheLines: 10000
        });
        // 可变图码在没有素材ID的情况下，是否需要上传数码通平台
        withoutUpload = false;
        SMTFile = true;
        var input_PID = writeLine(allCodeFile_PicID, {
            cacheLines: 10000
        });
        //读取二维码文件
        var DesPicNum = 0, DesPicID = 0;
        readLine(allCodeFile_Codes).go(function (data, next) {
            if(DesPicNum == arrDesPic.length){
                DesPicNum = 0;
            }
            if(DesPicID == arrDesPicId.length){
                DesPicID = 0;
            }
            input.write(data+','+arrDesPic[DesPicNum++]);
            input_PID.write(data+','+arrDesPicId[DesPicID++]);
            next();
        }, function () {
            input.end(function (err) {
                if(err){
                    //工单状态设为false
                    var errMessage = '[SOAP-PushOrder '+ orderId +'] Create txt file fail.Path:'+ allCodeFile + ' Err:'+ err;
                    return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 20});
                }
                ep.emit('check_FileLineNumber');
            });
            input_PID.end(function (err) {
                if(err){
                    //工单状态设为false
                    var errMessage = '[SOAP-PushOrder '+ orderId +'] Create txt file fail.Path:'+ allCodeFile_PicID + ' Err:'+ err;
                    return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 20});
                }
                ep.emit('check_PidFileLineNumber');
            });
        });
    });

    //判断文件行数是否正确
    ep.all('check_FileLineNumber', function () {
        CheckFileLineNumber(allCodeFile, totalCount, ep.done('split_TotalFile'));
    });
    ep.all('check_PidFileLineNumber', function () {
        CheckFileLineNumber(allCodeFile_PicID, totalCount, ep.done('split_PidTotalFile'));
    });

    //拆分成子文件
    ep.all('split_TotalFile', function(){
        var tpmRows = 1;
        file.forEach(function(f){
            var outfile = baseFilePath + f.fileName +'.txt';
            makePrintFile(allCodeFile, outfile, tpmRows, f.fileRows, codeURL, withoutE, isSMT, function(){
                ep.emit('makefile_ok', outfile);
            });

            tpmRows = tpmRows + parseInt(f.fileRows);
        });
        ep.after('makefile_ok', file.length, function (fileList) {
            ep.emit('makesubfile_ok' ,fileList);
        });
        logger.debug('[SOAP-PushOrder '+ orderId +'] Split file is ok.');
    });
    ep.all('split_PidTotalFile', function(){
        var tpmRows = 1;
        file.forEach(function(f){
            //var outfile = baseFilePath + f.fileName +'.txt';
            var outfile = baseSendFilePath + f.fileName +'.txt';
            makePrintFile(allCodeFile_PicID, outfile, tpmRows, f.fileRows, codeURL, withoutE, isSMT, function(){
                ep.emit('makepidfile_ok', outfile);
            });

            tpmRows = tpmRows + parseInt(f.fileRows);
        });
        ep.after('makepidfile_ok', file.length, function (fileList) {
            ep.emit('makesubpidfile_ok' ,fileList);
        });
        logger.debug('[SOAP-PushOrder '+ orderId +'] Split pid file is ok.');
    });

    //压缩文件
    ep.all('makesubfile_ok', function (fileList) {
        logger.debug('[SOAP-PushOrder ' + orderId + '] write to subfile is ok.');

        var outPath = baseFilePath + factoryCode + '_' + orderId + '-' + designId + '-' + productCode + '-' + tools.formatDateforFile(Date.now()).replace(/-/g, '') + '-' + orderNum + '.zip';

        if(vdpType == 3){
            outPath = baseFilePath + orderId + '_' + designId + '-' + vdpVersion + '_' + orderNum + '.zip';
        }

        ZipFile(allCodeFile, fileList, outPath, vdpType==1?true:false, '', function () {
            ep.emit('zipfile_ok', outPath);
        });
    });
    ep.all('makesubpidfile_ok', function (fileList) {
        logger.debug('[SOAP-PushOrder ' + orderId + '] write to subpidfile is ok.');

        var outPath_PicID = baseSendFilePath + factoryCode + '_' + orderId + '-' + designId + '-' + productCode + '-' + tools.formatDateforFile(Date.now()).replace(/-/g, '') + '-' + orderNum + '.zip';

        if(vdpType == 3){
            outPath_PicID = baseSendFilePath + orderId + '_' + designId + '-' + vdpVersion + '_' + orderNum + '.zip';
        }

        ZipFile(allCodeFile_PicID, fileList, outPath_PicID, vdpType==1?true:false, '', function () {
            ep.emit('zippiffile_ok', outPath_PicID);
        });
    });

    //上传工厂ftp
    ep.all('zipfile_ok', function (zipFilePath) {
        var path = "";
        // 折角码
        if(vdpType == 3){
            path = "/" + orderId + "-" + orderNum;
        }

        uploadZipFiletoFtp(ftpinfo.factory, zipFilePath, path, function(){
            ep.emit('upload_ok', zipFilePath);
            if(!SMTFile){
                if(vdpType == 1 || vdpType == 4){
                    ep.emit('uploadgdt_ok');
                }else{
                    ep.emit('zippiffile_ok', zipFilePath);
                }

            }
        });
    });

    // 等待上传工厂完成以后，在上传 GDT FTP
    ep.all('zippiffile_ok', 'upload_ok', function (zipPidFilePath) {
        var gdtftpinfo = {
                pass : "Nopass@1q2w3e",
                user : "ftpuser",
                port : 21,
                //host : "47.93.124.87"
                host : "ftp.greatdata.com.cn"
            };
        var path = '/printCode/normal';
        uploadToGDTWithPath(gdtftpinfo, zipPidFilePath, path, function(){
            ep.emit('uploadgdt_ok');
        });
    });


    // 更新相关数据：工单信息；品类信息；二维码信息；继续执行排队工单；
    ep.all('upload_ok', 'uploadgdt_ok', function(outPath) {        //zipFile, SMTList, SMTZipFile

        logger.debug('[SOAP-PushOrder '+ orderId +'] Upload file to factory is ok. OrderId: '+ orderId +' UploadHost: '+ ftpinfo.factory.host);
        Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Upload file to factory is ok. OrderId: '+ orderId +' UploadHost: '+ ftpinfo.factory.host, 'system', '0');
        returnFeedbackInfo(factoryCode, lineCode, orderId, 3, totalCount, fileCount, file, orderNum, outPath);

            // 更新工单
            Order.getOrderById(Order_id, function(err, rs){
                rs.pushPrintDate = Date.now();
                rs.fileName = outPath;
                rs.actCount = totalCount;
                rs.state = 1;
                if(vdpType != "1"){ //即只是可变图的情况,无需二维码
                    rs.startSerialNum = Start_Num;
                    rs.endSerialNum = End_Num;
                    rs.startCodeId = Start_id;
                    rs.endCodeId = End_id;
                }
                if(vdpType == '3'){ //折角码，暂时不能更新状态，等待ijp文件生成完成以后才能更新状态
                    //rs.state = 0;
                }
                rs.save(function(err) {
                    if (err) {
                        var errMessage = '[SOAP-PushOrder '+ orderId +'] Update orderInfo fail. Err:'+ err ;
                        return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 30});
                    } else {

                        // 更新品类
                        Category.getCategoryById(categoryId, function(err, rs){
                            if(vdpType != "1"){//非可变图的情况,可变图无需二维码
                                //rs.codeAvailable = eval(rs.codeAvailable - totalCount);
                            }
                            if(vdpType == 3){
                                //rs.codePool = rs.codePool - totalCount;
                                rs.PID += fileCount;
                            }
                            rs.save(function(err) {
                                if (err) {
                                    var errMessage = '[SOAP-PushOrder '+ orderId +'] Update category info fail. Err:'+ err ;
                                    return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 30});
                                } else {
                                    //工单完成,正在执行设为false
                                    isExecuted = false;
                                    orderList.shift();

                                    // 更新二维码
                                    if (vdpType === "0" || vdpType === 0 || vdpType === "4" || vdpType === 4) {
                                        updateCode(orderId, allCodeFile, BeforSerial, vdpType);
                                    }else if(vdpType === "2" || vdpType === 2){
                                        updateCode(orderId, allCodeFile, BeforSerial, vdpType);
                                        // 如果存在pId，需要删除pidtxt文件和qrcodetxt文件
                                        if(arrDesPic.length > 0){
                                            FS.unlink(allCodeFile_Codes, function (err) {
                                                if (err) {
                                                    logger.error('[SOAP-PushOrder ' + orderId + '] Delete ALL File Error. File:' + allCodeFile_Codes + ' OrderId: ' + orderId + ' Err:' + err);
                                                }
                                            });
                                            FS.unlink(allCodeFile_PicID, function (err) {
                                                if (err) {
                                                    logger.error('[SOAP-PushOrder ' + orderId + '] Delete ALL File Error. File:' + allCodeFile_PicID + ' OrderId: ' + orderId + ' Err:' + err);
                                                }
                                            });
                                        }
                                    }if (vdpType === "3" || vdpType === 3){
                                        // 发送请求到 11.91, 开始批量生成
                                        // tools.GetGMSPid({PID:-1, orderId:orderId+'-'+orderNum, designId:designId+'-'+vdpVersion}, function (err, data) {
                                        //     if(err){
                                        //         return logger.error(data);
                                        //     }
                                        //     logger.debug(data);
                                        //     data = JSON.parse(data);
                                            var params = {
                                                PID:PID+1, OrderID:orderId+'-'+orderNum, DesignID:designId+'-'+vdpVersion,
                                                QRType:0, SingleMul:3, ImportedFileName:outPath.substring(outPath.lastIndexOf('/')+1, outPath.length), HasUrl:0, PreUrl:null, ConUrl:'?E=',
                                                QRVersion:QRCodeVersion, CorrectionLevel:ErrorLevel, ModulePoint:modulePoints, ScaleDownCheck:false, ScaleDown:0,
                                                AddIconCheck:false, IconSeq:0, RotateCheck:true, RotAngle:RotAngle, SliceCheck:false,
                                                BleedSize:0, Quantity:fileRow, LastQuantity:totalCount%fileRow==0?fileRow:totalCount%fileRow, PicFormat:PicFormat, PicMode:PicModel, PicDpi:PicDpi, JobName:JobType
                                            };
                                            logger.debug(params);
                                            tools.ExcuteBatchGMS(params, function (err, data) {
                                                if(err){
                                                    return logger.error(data);
                                                }
                                                logger.debug(data);
                                            });
                                        // });
                                        //updateCode(orderId, allCodeFile, BeforSerial, vdpType);
                                    }
                                }
                            });
                        });
                    }
                });
            });
            //同时发给数码通、和 品类的 ftp
            if(vdpType === "2"){//可变图码发给数码通

            }
            //按品类发到不同的ftp



    });

    function CheckFileLineNumber(filePath, totalLineCount, callback){
        //判断行数是否一致
        tools.shellgetLine(filePath, function (err, lineNum) {
            if(lineNum === totalLineCount){
                logger.debug('[SOAP-PushOrder ' + filePath + '] is completed.');
                return callback();
            }else{
                var errMessage = '[SOAP-PushOrder '+ orderId +'] All txt file create fail. lineNum:'+ lineNum +' != totalCount:'+ totalLineCount +'. Err:'+ err;
                return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 20});
            }
        });
    }
    function makePrintFile(filepath, outfile, sline, count, url, withoutE, isGDT, callback) {
        var codeUrl = '';
        if(!isGDT){     //如果是数码通的情况， url已自带在content字段中，无需再次组合，只考虑非数码通情况即可
            if (withoutE) {
                codeUrl = url + '/';
            } else {
                codeUrl = url + '/?E=';
            }
        }
        var cs = 0;
        var output = writeLine(outfile, {
            cacheLines: 100000
        });
        readLine(filepath).go(function (data, next) {
            cs++;
            if (cs >= sline && cs < eval(sline + count)) {
                output.write(codeUrl + data+'\r', next);
            } else {
                next();
            }
        }, function () {
            output.end(function () {
                callback(null, 'ok');
            });
        });
    };

    function ZipFile(filePath, fileList, outFilePath, isDelete, password, callback){
        if(isDelete){
            FS.unlink(filePath, function (err) {
                if (err) {
                    logger.error('[SOAP-PushOrder ' + orderId + '] Delete ALL File Error. File:' + filePath + ' OrderId: ' + orderId + ' Err:' + err);
                }
            });
        }
        //因为由于压缩问题,上传ftp时,发生zip文件没有完全做完就发送到工厂的情况,更换压缩方式,使用shell压缩
        tools.shellZip(password, '', fileList, outFilePath, function (err) {
            if(err){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] make zip file fail. Err:'+ err;
                return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 30});
            }
            // 调用MES接口，通知接收成功
            logger.debug('[SOAP-PushOrder '+ orderId +'] Make and Zip file is ok. OrderId: '+ orderId +' File: '+ outFilePath);
            Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Make and Zip file is ok. OrderId: '+ orderId +' File: '+ outFilePath, 'system', '0');
            returnFeedbackInfo(factoryCode, lineCode, orderId, 2, '', '', '', orderNum, '');

            //压缩完文件，删除sub文件，折角码时保留 拆分后的txt文件
            if(vdpType != 3){
                fileList.forEach(function (df) {
                    FS.unlink(df, function (err) {
                        if (err) {
                            logger.error('[SOAP-PushOrder ' + orderId + '] Delete ALL File Error. File:' + df + ' OrderId: ' + orderId + ' Err:' + err);
                        }
                    });
                });
            }

            return callback();
        });

    }

    function uploadZipFiletoFtp(ftpAddress, zipFilePath, path, callback) {
        uploadagain(ftpAddress.host, ftpAddress.port, ftpAddress.user, ftpAddress.pass, zipFilePath, path, 0, 'qrcode', function (err_f){
            //上传成功，不对本地文件操作
            if(err_f){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] Upload to Factory Error. File:' + zipFilePath + ' OrderId: ' + orderId + ' Err:' + err_f;
                return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 30});;
            }else{
                // logger.debug('[SOAP-PushOrder '+ orderId +'] Upload to Factory success. File:' + zipFilePath + ' OrderId: ' + orderId);
                // Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Upload to Factory success. File:' + zipFilePath + ' OrderId: ' + orderId, 'system', '0');
                return callback();
            }
        });
    }

    function uploadToGDTWithPath(ftpAddress, uploadPath, path, callback) {
        uploadagain(ftpAddress.host, ftpAddress.port, ftpAddress.user, ftpAddress.pass, uploadPath, path, 0, 'gdt', function (err_f){
            //上传成功，不对本地文件操作
            if(err_f){
                var errMessage = '[SOAP-PushOrder '+ orderId +'] upload print file to GDT ftp fail. Error: ' + err_f;
                return ep.emit('get_error', {_id:Order_id, error:errMessage, returnId: 30});;
            }else{
                logger.debug('[SOAP-PushOrder '+ orderId +'] upload print file to GDT ftp success.');
                Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] upload print file to GDT ftp success', 'system', '0');
                return callback();
            }
        });
    }

    //times传送次数
    //index怕不同文件之间同一个事件响应导致错误第几个文件
    var uploadagain = function (host, port, user, pass, file, path, times, index, callback){
        var hasErr = false;
        tools.UploadFileWithPath(host, port, user, pass, file, path, function (err) {
            if(err){
                hasErr = true;
                // 保存错误原因
                logger.error('[SOAP-PushOrder '+ orderId +'] upload file ' + file + ' to '+ host +' fail. Error:' + err);
                if(times==3){
                    ep.emit('hasErr'+index);
                }else {
                    times++;
                    uploadagain(host, port, user, pass, file, path, times, index, function () {});
                }
            }else{
                hasErr = false;
                ep.emit('hasErr'+index);
            }
        });
        ep.once('hasErr'+index, function () {
            return callback(hasErr);
        });
    }
};

var updateCode = function (orderId, filename, maxSerial, vdpType) {
    // 更新二维码
    logger.debug('[SOAP-PushOrder '+ orderId +'] Start update code. maxSerial: '+ maxSerial +', fileName: '+ filename);
    var loopUpdateNum = 0;
    var batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
    readLine(filename).go(function (data, next) {
        loopUpdateNum++;
        //QRCodeEntity.update({content: data},{$set: {orderId: orderId, state: 11, printNum: 0, cansNum: 0, serialNum: eval(maxSerial + loopUpdateNum)}}, function(err) {
        //    if (err) {
        //        Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Update Code State Error OrderID: '+ orderId +' ERR: '+ err, 'system', '2');
        //        return logger.error('[SOAP-PushOrder '+ orderId +'] Update Code State Error OrderID: '+ orderId +' ERR: '+ err);
        //    } else {
        //        //logger.debug('[SOAP-PushOrder '+ orderId +'] Update 5000 code.');
        //        //batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
        //        next();
        //    }
        //});
        var tmpdata = '';
        var strImg  = '';
        data = data.split(',');
        if(vdpType == 2){
            strImg = data[1];
        }
        data = data[0];
        if(data.indexOf('/')>=0){
            tmpdata = data.slice(data.lastIndexOf('/')+1, data.length);
        }

        batch.find({content: {$in: [data, tmpdata]}}).update({
            $set: {
                orderId: parseInt(orderId),
                state: 11,
                printNum: 0,
                cansNum: 0,
                serialNum: eval(maxSerial + loopUpdateNum),
                imgName: strImg
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
        FS.unlink(filename, function(err) {
            if (err) {
                Logs.addLogs('system', '[SOAP-PushOrder '+ orderId +'] Delete ALL File Error. File:'+ filename +' OrderId: '+ orderId +' Err:'+ err, 'system', '2');
                return logger.error('[SOAP-PushOrder '+ orderId +'] Delete ALL File Error. File:'+ filename +' OrderId: '+ orderId +' Err:'+ err);
            }
            logger.debug('[SOAP-PushOrder '+ orderId +'] Delete temp file is ok.');
        });
    });
};


var returnFeedbackInfo = function (facCode, linCode, orderNo, returnFlag, codeQuantity, fileCount, filesName, applyTimes, reduceFile) {
    logger.debug('[SOAP-PushOrder '+ orderNo +'] Call mes soap. orderNo:'+ orderNo +' returnFlag: '+ returnFlag);

    var orderNo = orderNo || '';
    var returnFlag = returnFlag || '';
    var codeQuantity = codeQuantity || '';
    var fileCount = fileCount || '';
    var filesName = filesName || '';
    var applyTimes = applyTimes || '';
    var reduceFile = reduceFile || '';
    var factoryCode = facCode || 'F1C';
    var lineCode = linCode || '2';
    var ReturnCode = factoryCode +'_'+ lineCode;
    var arrFileName = [];
    var strFileName = '';
    var arrReduceFile = [];
    var strReduceFile = '';
    var url = '';

    for(var i=0;;i++){
        var c = i==0?'':i;
        var fac = eval('config.interface_opts.apiReturnCode'+c);
        if(typeof fac == 'undefined' || fac == ''){
            url = config.interface_opts.apiPushOrderReturn;
            break;
        }else{
            if(ReturnCode == fac){
                url = eval('config.interface_opts.apiPushOrderReturn'+c);
                break;
            }
        }
    }

    if (filesName.length > 0) {
        filesName.forEach(function(f) {
            arrFileName.push(f.fileName +'.txt');
        });
        strFileName = arrFileName.join(';');
    }
    if (reduceFile !== '') {
        arrReduceFile = reduceFile.split('/');
        strReduceFile = arrReduceFile[3];
    }

    var args = {
        orderNo: orderNo,
        returnFlag: returnFlag,
        codeQuantity: codeQuantity,
        fileCount: fileCount,
        filesName: strFileName.toString(),
        applyTimes: applyTimes,
        reduceFile: strReduceFile.toString()
    };
    logger.debug('[SOAP-PushOrder '+ orderNo +'] Args: '+ JSON.stringify(args));
    if (!config.istest) {
        soap.createClient(url, function(err, client) {
            client.get_QRCode_Feedback_Info(args, function(err, result) {
                if (err) {
                    Order.updateOrder({orderId:orderNo, orderNum:applyTimes, state:0}, {state:2}, function(ordererr, rs) {
                        logger.error('[SOAP-PushOrder '+ orderNo +'] Error:' + ordererr);
                    });
                    logger.warn(err);
                } else {
                    logger.debug(result);
                }
            });
        });
    }
};

function walkDir(path, filetype) {

    var tifList = [];
    var jobList = [];
    var txtList = [];

    // 首先判断这个文件是否存在
    if(!FS.existsSync(path)){
        return {tifList:tifList, jobList:jobList, txtList:txtList};
    }
    //
    var dirlist = FS.readdirSync(path);

    dirlist.forEach(function(item){
        if(FS.statSync(path + '/' + item).isDirectory()) {

        }else{
            var tmp = item.split('.');
            filetype.forEach(function (t) {
                if(tmp[tmp.length-1].toLowerCase() == t.toLowerCase() && t == 'tif'){
                    tifList.push(path + '/' + item);
                }
                if(tmp[tmp.length-1].toLowerCase() == t.toLowerCase() && t == 'job'){
                    jobList.push(path + '/' + item);
                }
                if(tmp[tmp.length-1].toLowerCase() == t.toLowerCase() && t == 'txt'){
                    txtList.push(path + '/' + item);
                }

            });
        }
    });

    return {tifList:tifList, jobList:jobList, txtList:txtList};
}

var returnPaperDefectInfo = function (orderNo, rollNo, defectSeq, startMeter, endMeter, scanTimeS, scanTimeE,
                                      horMeter, defectFlag, nullQuantity, repeatQuantity, unknownQuantity) {
    logger.debug('call mes soap');
};