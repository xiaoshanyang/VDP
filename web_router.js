/**
 * Created by youngs1 on 16/6/2.
 */
var express = require('express');
var config = require('./config');
var auth = require('./middlewares/auth').auth;

var materiel = require('./controllers/materiel');
var dashboard = require('./controllers/dashboard');
var setup = require('./controllers/setup');
var sign = require('./controllers/sign');
var users = require('./controllers/users');
var roles = require('./controllers/roles');
var logs = require('./controllers/logs');
var category = require('./controllers/category');
var customer = require('./controllers/customer');
var qrcode = require('./controllers/qrcode');
var ftp = require('./controllers/ftp');
var InterFace = require('./controllers/interface');
var order = require('./controllers/order');
var search = require('./controllers/search');
var batch = require('./controllers/batch');

var consReport = require('./controllers/consReport');
var mesRequest = require('./controllers/mesRequest');
var shards = require('./controllers/distributionShard');
var qrcodeTrace = require('./controllers/qrcodeQualityTraceability');
var getSendRollInfo = require('./controllers/getSendRollInfoByDate');


var router = express.Router();

// 首页，判断是否已经初始化
if (config.isinit) {
    //初始化完成进入dashboard
    router.get('/', function(req, res){
        res.redirect('/dashboard');
    });
    router.get('/getmateriel', materiel.getMateriel); // 获取物料信息
    router.get('/materiel', auth ,materiel.index);// 物料信息
    router.get('/getcustomer', customer.getCustomer); // 获取客户信息
    router.get('/dashboard', auth, dashboard.index); // 首页
    router.post('/dashboard/getfac', auth, dashboard.getFacInfo);//查看工厂的灌装数量
    router.get('/active_account', sign.activeAccount); //账号激活
    router.get('/signin', sign.showLogin);  //登录页面
    router.post('/signin', sign.login); //登录校验
    router.get('/signout', sign.signout); // 退出登录
    router.post('/changePassword', sign.changePassword); //更新密码
    router.get('/download', auth, qrcode.download); // 下载二维码
    router.post('/download', auth, qrcode.download);
    router.get('/qrcode/search', auth, qrcode.Search); // 搜索二维码
    router.get('/order', auth, order.index); // 工单展现
    router.post('/order', auth, order.index); // 工单查询
    //---------------------------------------
    //router.post('/order/getroll', auth, roll.search); //按工单号查询小卷信息
    // router.post('/order/getroll', auth, order.getRoll); //按工单号查询小卷信息
    // router.post('/order/getrollcode', auth, order.getRollCode);
    //---------------------------------------
    router.get('/users', auth, users.index); // 用户管理
    router.post('/users/create', auth, users.createUser); // 创建新用户
    router.post('/users/update', auth, users.updateUser); // 更新老用户
    router.get('/roles', auth, roles.index); // 角色权限管理
    router.post('/roles/create', auth, roles.createRole); // 创建角色
    router.post('/roles/update', auth, roles.updateRole); // 更新老角色
    router.get('/ftp', auth, ftp.index); // FTP管理
    router.post('/ftp/create', auth, ftp.createFTP); // FTP管理-创建
    router.post('/ftp/test', auth, ftp.testFTP); // FTP管理-测试
    router.post('/ftp/update', auth, ftp.updateFTP); // FTP管理－更新
    router.get('/interface', auth, InterFace.index); // 接口管理
    router.post('/interface/update', auth, InterFace.updateAPI); // 接口管理-更新
    router.get('/logs', auth, logs.index); // 日志管理
    router.post('/logs', auth, logs.index); // 日志管理
    router.get('/category', auth, category.index); // 品类管理
    router.post('/category/create', auth, category.createCategory); // 品类管理-创建
    router.post('/category/update', auth, category.updateCategory); // 品类管理-更新
    router.post('/category/search', auth, category.searchCategory); // 品类管理-搜索
    router.post('/category/addcode', auth, category.addCode); // 品类管理-补码
    router.post('/category/addcodepool', auth, category.addCodePool); // 品类管理-补充码池
    router.post('/category/stopcodepool', auth, category.stopCodePool); // 品类管理-清除品类的补充码池任务
    router.get('/customer', auth, customer.index); // 客户管理
    router.post('/customer', auth, customer.index); // 客户管理
    router.post('/customer/setone', auth, customer.setOneCode); // 客户管理
    router.post('/search', search.Result); // 搜索页面
    router.post('/order/roll', order.getRollOne); // 依据工单号查询小卷
    router.post('/order/exportRoll', order.getRollExport); // 小卷导出
    //+++++++++cons report++++++++++++
    router.get('/consReport', auth, consReport.consRecord); // 工单展现
    router.post('/consReport', auth, consReport.consRecord); // 工单查询
    //+++++++++++++++++++++
    //--------------------
    router.get('/batch', auth, batch.index);
    router.post('/batch', auth, batch.index);
    router.get('/getcategory', category.getCategory);
    router.get('/downloadfile', auth, order.download);
    //router.get('/checkContent/:content', mesRequest.checkContent);
    router.get('/checkContent', mesRequest.checkContent);
    router.get('/checkContent/test', mesRequest.test);
    //router.get('/createCategory/:designId/:version/:name/:webNum/:splitSpec/:generalId', mesRequest.createCategory);
    router.post('/createCategory', mesRequest.createCategory);

    router.post('/downloadbyorder', category.addCode);
    router.get('/shards', auth, shards.distribution);
    router.post('/shards', auth, shards.distribution);
    router.post('/shards/update', auth, shards.updateRange);

    router.get('/changeOrderState/:orderId', mesRequest.changeOrderState);
    router.get('/qrcodeQualityTraceability/:content', qrcodeTrace.qrcodeTrace);

    router.post('/getSendRollInfoByDate', getSendRollInfo.getSendRollInfoByDate);   // 按日期查询小卷发货信息
    router.get('/getDownloadFile', category.downloadFile);
    //--------------------
} else {
    //初始化未完成进入setup
    router.get('/', setup.index);
    router.post('/setup/testdb', setup.testdb);  // 测试数据库连接
    router.post('/setup/testemail', setup.testemail);  // 测试电子邮件连接
    router.post('/setup/finish', setup.save); // 保存初始化数据
}

module.exports = router;