/**
 * Created by taozhou on 2017/3/23.
 *
 * 2017-04-21
 * 1、 在 mes 调用 checkContent 时，增加发挥数据， 添加二维码序列号、所在幅数、该品类该有的幅数
 *      是为了防止在印刷时，出现， 工厂喷码的幅数，与系统中文件安排的文件不一致，防止分切时下卷计算不正确
 *
 * 2017-04-26
 * 1. 从des接收推送信息， 自动创建品类，改为通过 设计号+可变版本号对应
 * 2. 不再关联物料， 也不再考虑 token是否一致， des推送产品名是否一致
 * 3. 但一旦 设计号+版本号一致， 则更新 已创建 品类信息
 */
var eventproxy          = require('eventproxy');
var QRCode              = require('../proxy').QRCode;
var Order               = require('../proxy').Order;
var Category            = require('../proxy').Category;
var Materiel            = require('../proxy').Materiel;
var Customer            = require('../proxy').Customer;
var logger              = require('../common/logger');

exports.checkContent = function (req, res, next) {

    //如果是mes推送
    //var content = req.params.content;
    var content = req.query.q;
    var data = {
        VDPreturnMark: '1',
        VDPqrcode: content,
        VDPclient: '',
        VDPproName: '',
        VDPmaterial: '',
        VDPfield: '',
        VDPerrMessage: '',
        VDPserialNum: 0,
        VDPwebNum: 0,
        VDPwebNumIn: 0
    };

    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_error', function (error) {
        data.VDPerrMessage = error;
        data.VDPreturnMark = '0';
        return res.status(200).json(data);
    });
    ep.all('get_warning', function (error) {
        data.VDPerrMessage = error;
        data.VDPreturnMark = '1';
        return res.status(200).json(data);
    });
    //都在内网中，添加两个ip范围
    var addrs = ['192.168.11', '192.168.6', '127.0.0'];

    var ipaddr = req.ip;
    var isallow = false;
    addrs.forEach(function (a) {
       if(!isallow && ipaddr.indexOf(a) >= 0){
           isallow = true;
       }
    });
    isallow = true;
    if(!isallow){
        var error = 'No access permissions';
        logger.error(error);
        return ep.emit('get_error', error);
    }

    if(content && isallow){
        var tmp = content;
        QRCode.getQRCodeByCode(content, function (err, rs) {
            if(err){
                logger.error('cannot find content: ' + content);
                return ep.emit('get_error', 'cannot find content: ' + content);
            }
            if(rs){
                // 现在不知是通过content1还是content查找到的结果, 需要进行判断
                if(content.indexOf('/') >= 0){
                    tmp = content.substring(content.lastIndexOf('/')+1, content.length);
                }
                if(rs.content.indexOf(tmp) >= 0){
                    tmp = rs.content;
                }
                if(typeof rs.content1 != 'undefined'){
                    if(rs.content1.indexOf(tmp) >= 0){
                        tmp = rs.content1;
                    }
                }
                if(tmp.indexOf('/') >=0 ){
                    data.VDPqrcode = tmp;
                }else{
                    if( typeof rs.url !== 'undefined' && rs.url !== null){
                        if(tmp.length == 26){
                            data.VDPqrcode = rs.url + '/?E=' + tmp;
                        }else{
                            data.VDPqrcode = rs.url + '/' + tmp;
                        }
                    }
                }
                data.VDPserialNum = rs.serialNum || 0;
                //查找category
                Category.getCategoryById(rs.categoryId, ep.done('getCategory_ok'));
                //查找对应工单
                if(typeof rs.orderId !== 'undefined'){
                    Order.getOrderByQuery({orderId:{$in:[rs.orderId, parseInt(rs.orderId)]}, state:1}, '', function (err, or) {
                        if(err){
                            logger.error('cannot find order by content: ' + content);
                            return ep.emit('get_error', 'cannot find order by content: ' + content);
                        }
                        if(or.length > 0){
                            //如果没有找到二维码对应的url，则通过工单接收的url进行拼接
                            if( data.VDPqrcode.indexOf('/') < 0 ){
                                if(tmp.length == 26){
                                    data.VDPqrcode = or[0].codeURL + '/?E=' + tmp;
                                }else{
                                    data.VDPqrcode = or[0].codeURL + '/' + tmp;
                                }
                            }
                            //查找对应客户
                            Customer.getCustomerByNumber(or[0].customerCode, ep.done('getCustomer_ok'));
                            //查找对应物料号
                            Materiel.getMaterielByNumber(or[0].productCode, ep.done('getMaterial_ok'));
                            //查找category
                            //Category.getCategoryById(or[0].categoryId, ep.done('getCategory_ok'));
                        }
                    });
                }else{
                    return ep.emit('get_error', 'cannot find order by content: ' + content);
                }
            }else{
                return ep.emit('get_error', 'cannot find content by content: ' + content);
            }
        });
        
        ep.all('getCategory_ok', 'getCustomer_ok', 'getMaterial_ok', function (category, customer, material) {
            var error = '';
            if(category){
                data.VDPproName = category.name;
                data.VDPwebNum = category.webNum || 0;          //品类幅数
                if(data.VDPserialNum == 0 || data.VDPwebNum == 0){
                    data.VDPwebNumIn = 0;
                }else{
                    data.VDPwebNumIn = data.VDPserialNum % category.webNum ? data.VDPserialNum % category.webNum : category.webNum;  //二维码所在幅
                }

            } else {
                data.VDPproName = '没有找到品类';
                error += 'cannot find category name by content: ' + content;
                logger.error(error);
            }
            if(customer){
                data.VDPclient = customer.client_reviation;
            } else {
                data.VDPclient = '没有找到客户';
                error += 'cannot find customer name by content: ' + content;
                logger.error(error);
            }
            if(material){
                data.VDPmaterial = material.materiel_name;
            } else {
                data.VDPmaterial = '没有找到物料';
                error += 'cannot find material info by content: ' + content;
                logger.error(error);
            }
            if(error !== ''){
                return ep.emit('get_warning', error);
            }
            res.status(200).json(data);
        });

    }else{
        ep.emit('get_error', 'Unable to resolve two-dimensional code');
    }

}

exports.changeOrderState = function (req, res, next) {
    var orderId = req.params.designId || '';         //工单号
    if(orderId == ''){
        return {state:2,message:'orderId is null'};
    }
    orderId = orderId.split('-');
    var query = {
        orderId: parseInt(orderId[0]),
        orderNum: parseInt(orderId[1])
    };
    Order.updateOrder(query , { state:1 }, function (err) {
        if(err){
            logger.error(err);
            return {state:2,message:'update orderInfo err. Error:'+err};
        }
        // 返回值
        return {state:1,message:'orderId is complete'};
    });
}

exports.test = function (req, res, next) {
    var JSFtp = require('jsftp');
    var Ftp = new JSFtp({
        host: "47.93.124.87",
        port: 21, // defaults to 21
        user: "ftpuser", // defaults to "anonymous"
        pass: "Nopass@1q2w3e" // defaults to "@anonymous"
    });
    Ftp.ls("./printCode", function(err, res) {
        res.forEach(function(file) {
            console.log(file.name);
        });
    });
}

// 接受des推送信息，增加 设计推送人、以及折角码需要的特定参数
exports.createCategory = function (req, res, next) {
    logger.debug('DES send to VDP category Infomation:'+JSON.stringify(req.body));
    //检查参数是否正确
    var designId = req.body.designID || '';         //设计号
    var vdpVersion = req.body.version || '';        //可变印刷版本号
    var name = req.body.name || '';                 //品类名
    var webNum = req.body.webNum || '';             //幅数
    var splitSpec = req.body.splitSpec || '';       //分拆规格
    var generalId = req.body.token || '';       //申请二维码Id
    var createUser = req.body.createUser || '';   //设计创建人员
    var QRCodeCount = parseInt(req.body.QRCodeCount) || 1;
    var QRCodeVersion = req.body.QRCodeVersion || '';   //二维码版本
    var modulePoints = req.body.ModulePoints || 0;   //模块点数
    var ErrorLevel = req.body.ErrorLevel || 0;   //纠错级别
    var pen_offset = req.body.pen_offset || 0;   //喷头水平偏移
    var QRCodeSize = req.body.QRCodeSize || 0;   //二维码尺寸
    var RotAngle = req.body.RotAngle || 0;   //旋转角度
    var PicFormat = req.body.PicFormat || '';   //图像格式
    var PicModel = req.body.PicModel || '';   //图像模式
    var PicDpi = req.body.PicDpi || '';   //图像分辨率
    var JobType = req.body.JobType || '';   //对应柯达热文件夹名
    var VDPType = req.body.VDPType || '';   //可变印刷类型

    var data = {        //返回json
        state: 0,
        designId: designId,
        message: ''
    };

    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_error', function (error) {
        logger.error(error);
        data.message = error;
        return res.status(200).json(data);
    });
    ep.all('get_success', function (message) {
        data.message = message;
        res.status(200).json(data);
    });
    //判断是否有参数为空
    if([designId, vdpVersion, name, webNum, splitSpec, generalId, VDPType].some(function (item) { return item === ''; })){
        var error = '[Task-CreateCategory] a variable of [designId, vdpVersion, name, webNum, splitSpec, generalId]  is empty';
        return ep.emit('get_error', error);
    }

    //参数不为空，创建新品类
    // 先通过designId+vdpVersion(唯一)查看是否已经创建
    Category.getCategoryByQuery({designId: designId, vdpVersion: vdpVersion}, '', function (err, rs) {
       if(err){
           var error = '[Task-CreateCategory] find category info fail. Error: ' + err;
           return ep.emit('get_error', error);
       }
       if(rs.length > 0){
           logger.debug('[Task-CreateCategory] designId is already exists. Update category info');
           rs[0].name = name;
           rs[0].webNum = webNum;
           rs[0].splitSpec = splitSpec;
           rs[0].generalId = generalId;
           rs[0].createUser = createUser;
           rs[0].createDate = Date.now();
           rs[0].VDPType = VDPType;
           // 如果QRCodeVersion值不为空，则需要把折角码相关的信息，入库
           if(QRCodeVersion != ''){
               rs[0].QRCodeVersion = QRCodeVersion;
               rs[0].modulePoints = modulePoints;
               rs[0].ErrorLevel = ErrorLevel;
               rs[0].pen_offset = pen_offset;
               rs[0].QRCodeSize = QRCodeSize;
               rs[0].RotAngle = RotAngle;
               rs[0].PicFormat = PicFormat;
               rs[0].PicModel = PicModel;
               rs[0].PicDpi = PicDpi;
               rs[0].JobType = JobType;
           }
           rs[0].save(function () {
              logger.debug('[Task-CreateCategory] update category ok. Args:' + designId+'-'+vdpVersion + ' ' + name + ' ' + webNum + ' '
                  + splitSpec + ' ' + generalId);
               data.state = 1;
               return ep.emit('get_success', 'update category ok');
           });
       }else{
           ep.emit('new_category');
       }

    });
    // 库中 没有查到相同设计号、版本号的品类， 添加新品类
    ep.all('new_category', function () {
        //(name, materiel_number, webNum, splitSpec, isGDT, designId, sendURL, sendXML, callback)
        //isGDT = true 默认标记为数码通类型
        Category.newAndSave(name, [], webNum, splitSpec, true, designId, vdpVersion, createUser, Date.now(), VDPType, QRCodeCount, QRCodeVersion, modulePoints,
            ErrorLevel, pen_offset, QRCodeSize, RotAngle, PicFormat, PicModel, PicDpi, JobType,
            false, false, function (err, newrs) {
            //
            if(err){
                var error = '[Task-CreateCategory] create category fail. Args:' + designId+'_'+vdpVersion +' ' + name + ' ' + webNum + ' '
                    + splitSpec + ' ' + generalId;
                return ep.emit('get_error', error);
            }
            logger.debug('[Task-CreateCategory] create category success. Args:' + designId+'_'+vdpVersion +' ' + name + ' ' + webNum + ' '
                + splitSpec + ' ' + generalId);
            newrs.generalId = generalId;
            newrs.save(function () {
                ep.emit('create_ok', newrs);
            });

        });
    });

    ep.all('create_ok', function (new_rs) {
        // 根据设计号关联物料信息
        //designId = parseInt(designId);
        var query_m = {materiel_name: { $regex: new RegExp(designId, 'i') }, state:0, Field1:"1"};
        Materiel.getMaterielByQuery(query_m, '', function(err, rs){
            if(err){
                var error = '[Task-CreateCategory] add materiel fail. ERR: ' + err;
                logger.error(error);
                data.state = 3;
                return ep.emit('get_success', 'add materiel fail.');
            }else{
                if(rs != null){
                    if(rs.length > 0){
                        if(new_rs.materiel_number.indexOf(rs[0].materiel_number) == -1){
                            new_rs.materiel_number.push(rs[0].materiel_number);
                            new_rs.generalId = generalId;
                            new_rs.save(function () {
                                rs[0].state = 1;
                                rs[0].save();
                                logger.debug('[Task-CreateCategory] add materiel success. materiel_number: ' + rs[0].materiel_number);
                                data.state = 2;
                                return ep.emit('get_success', 'add materiel success.');
                            });

                        }
                    }else{
                        logger.error('[Task-CreateCategory] cannot find materiel info by desingId: '+ designId +'. Add materiel fail.');
                        data.state = 3;
                        return ep.emit('get_success', 'add materiel fail.');
                    }
                }else{
                    logger.error('[Task-CreateCategory] cannot find materiel info by desingId: '+ designId +'. Add materiel fail.');
                    data.state = 3;
                    return ep.emit('get_success', 'add materiel fail.');
                }
            }
        });
    });



}
