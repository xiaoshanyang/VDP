/**
 * Created by youngs1 on 8/15/16.
 */
var EventProxy          = require('eventproxy');
var FS                  = require('fs');
var path                = require('path');
var moment              = require('moment');

var logger              = require('../common/logger');
var tools               = require('../common/tools');
var Logs                = require('../proxy').Logs;
var Qrcode              = require('../proxy').QRCode;
var Category            = require('../proxy').Category;
var FacConsInfo          = require('../proxy').FacConsInfo;
var readLine            = require('lei-stream').readLine;
var models              = require('../models');


exports.getfactoryconsInfo1 = function (Yesterday) {
    var savePath = 'middlewares/data/getcons';
    var List = [];
    var fileList = [];
        List = walkDir(savePath,List);
    // 获取前一天的罐装数据
    List.forEach(function (savePath) {
        savePath = savePath +'/'+ Yesterday;
        if (!FS.existsSync(savePath)) {
            logger.error('[Task-GetCansData] no such file or dircetory: '+ savePath);
            Logs.addLogs('system', '[Task-GetCansData] no such file or dircetory: '+ savePath, 'system', '2');
        }else {
            logger.debug('[Task-GetCansData] Start Loop Folder: ' + savePath);
            fileList = walk(savePath, fileList);
        }
    });
    if(fileList.length<=0){
        logger.error('[Task-GetCansData] no such '+Yesterday+' file or dircetory: middlewares/data/getcons');
        return Logs.addLogs('system', '[Task-GetCansData] no such '+Yesterday+' file or dircetory: middlewares/data/getcons', 'system', '2');
    }
    //getOneCons(fileList,Yesterday);

};

exports.getfactoryconsInfo = function (fileList, Yesterday){

    logger.debug('-----------------Start Task: [Task-GetFactoriesData] -----------------');

    var xmlfile = './config.xml';
    var urlList = [],       //url
        fileNameList = [],  //存放xml读出的文件名
        needsUrl = [],      //导出灌装文件是否需要url 0:不需要 1:需要
        categoryNameList = [];  //从xml中读出的品类名存放 目的是给首页报表中下方中国地图,传品类值

    var ep = new EventProxy();
    ep.fail(function(err) {
        Logs.addLogs('system', '[Task-GetFactoriesData] fail.  ERROR: '+ err, 'system', '2');
        return logger.error('[Task-GetFactoriesData] fail.  ERROR: '+ err);
    });

    tools.readXML(xmlfile, '', function (err, xml) {
        if(err){
            logger.error('[Task-GetCansData] Cannot read xml to get URL FILENAME FTP '+xmlfile+' ERR:'+err);
            Logs.addLogs('system', '[Task-GetCansData] Cannot read xml to get URL FILENAME FTP '+xmlfile+' ERR:'+err, 'system', '2');
            return;
        }
        urlList = xml.root.con[0].url;
        fileNameList = xml.root.con[0].filename;
        needsUrl = xml.root.con[0].needUrl;
        categoryNameList = xml.root.con[0].categoryname;
        ep.emit('readxml_ok');
    });

    var startTime = Date.now();

    function msToS(v) {
        return parseInt(v / 1000, 10);
    }

    function getSpentTime() {
        return Date.now() - startTime;
    }

    var counter = 0;
    var newcounter = 0;
    var endNum = 0;
    var isfirstLine = false;
    var factoryConsCount = {        //存放工厂灌装各品类数量
        categorys:[]
    };
    var categoryList = [];

    var j = -1;  //记录在factoryConsCount中哪个品类上
    var isSSR = false;
    var ssrNum = 0;
    //var result =new RegExp("^[A-Za-z]$");  //^开头$结尾

    var tmpData1 = '';
    var tmpData2 = '';


    ep.all('readxml_ok', function () {

        logger.debug('[Task-GetFactoriesData] File Count is '+ fileList.length);
        // 生成一天内所有的码数据文件 ［二维码（不带URL）, 按原文件内容写入］
        var outpath = 'middlewares/data/cons_original' + '/' + Yesterday +'/';

        if (!FS.existsSync(outpath)) {
            FS.mkdirSync(outpath);
        }

        //用来匹配二维码

        if (fileList) {
            fileList.forEach(function (f, index) {
                ep.after('readconsfile_ok',index,function () {  //一个文件一个文件的读取
                    isfirstLine=true;//同一文件内的码属于同一品类,只判断第一行即可
                    ssrNum = 0;
                    isSSR = false;
                    readLine(f).go(function (data, next) {
                        counter++;
                        //如果没有生产批次号,跳过该行,不再导入//没有找到noread即二维码读出的情况
                        if(data.indexOf(',')<0){
                            return next();
                        }
                        //--------------------------------------------------
                        //酸酸乳的码长度为26、数码通的码长度不确定，已知有一种为21位
                        //去掉没有生产批此号的情况、数码通的码与url组合有不带 '?E=' 的情况、 酸酸乳的码带着'?E=' ,需要去掉
                        data = data.replace('\r','');
                        data = data.split(',');
                        tmpData1 = data[0];
                        tmpData1 = tmpData1.replace('?E=', '');
                        tmpData2 = data[1];
                        //如果没有生产批次号,跳过该行,不再导入
                        if(tmpData2===''){
                            return next();
                        }
                        //----------------------------------------------------
                        if (counter % 10000 === 0) {
                            printSpeedInfo();
                        }
                        if(tmpData1.indexOf('noread')<0){
                            newcounter++;
                            //-------获取工厂名
                            var fac = f.split('/');
                            fac = fac[fac.length - 2];
                            //S61 认为是 S6
                            fac = fac.substr(0, 2);//只取两位作为工厂名

                            if(isfirstLine){
                                    //查码所属品类
                                    ssrNum = 1;
                                    //tmpData1 = tmpData1.substring(tmpData1.lastIndexOf('/')+1, tmpData1.length);
                                    Qrcode.getQRCodeByCode(tmpData1, function (err, rs) {
                                        if (err || !rs) {
                                            logger.error('get QRCode  by code: ' + tmpData1 + ' is Error:' + err);
                                            //错误的时候不写入文件了,直接跳出进行取读下一条
                                            return next();
                                        }
                                        if (rs) {
                                            Category.getCategoryById(rs.categoryId, function (c_err, c_rs) {
                                                if (c_err || !c_rs) {
                                                    logger.error('get Category  by Id: ' + rs.categoryId + ' is Error:' + err);
                                                    return next();
                                                }
                                                if (c_rs) {
                                                    j = categoryList.indexOf(c_rs.name);
                                                    if (j < 0) {
                                                        j = categoryList.length;
                                                        categoryList.push(c_rs.name);
                                                        var categoty = {
                                                            name: c_rs.name,
                                                            factory: []
                                                        }
                                                        factoryConsCount.categorys.push(categoty);
                                                    }
                                                    isfirstLine = false;
                                                    ep.emit('get_categoryname_ok');
                                                }
                                            });
                                        }
                                    });
                            }else{
                                ssrNum = 0;
                            }

                            ep.after('get_categoryname_ok', ssrNum, function () { //已知品类
                                var samefac = false;//是否找到相同的工厂
                                factoryConsCount.categorys[j].factory.forEach(function (f) {
                                    if (f.fac === fac) {
                                        f.count++;
                                        samefac = true;
                                    }
                                });
                                if (!samefac) {//没有找到相同的工厂
                                    if(fac === '1R'){
                                        console.log(f,tmpData1);
                                    }
                                    factoryConsCount.categorys[j].factory.push({
                                        fac: fac,
                                        count: 1
                                    });
                                }
                                delete samefac;
                                return next();
                            });
                        }else{
                            return next();
                        }

                    }, function(){
                        ep.emit('readconsfile_ok');
                        endNum++;
                        if(endNum === fileList.length){
                            //表示所有文件读取完成,开始更新库
                            console.log(factoryConsCount);
                            //----------把得到的灌装数量信息,写入文件 即把factoryConsCount输出到文件中
                            recoderFactoryCount(Yesterday, factoryConsCount);
                        }
                    });
                });
            });
        }
    });

     // 打印进度
    function printSpeedInfo () {
        var t = msToS(getSpentTime());
        var s = counter / t;
        if (!isFinite(s)) s = counter;
        logger.debug('[Task-GetFactoriesData] read %s lines %s, speed: %sL/S', counter, newcounter, s.toFixed(0));
    }
}

//按工厂记录每个工厂生产的不同品类的数量
function recoderFactoryCount(Yesterday, factoryinfo) {
    var SaveFile = 'public/report/data.json';//把配置文件中的信息读出
    var ReportContent=FS.readFileSync(SaveFile,"utf-8");
    ReportContent = JSON.parse(ReportContent);
    //只需要地址对应的信息即可
    var address = ReportContent.factoryAddress;
    ReportContent.mapData = [];
    factoryinfo.categorys.forEach(function (c) {
        var c_address = {
            name:c.name,
            mapinfo:[]
        };
        var color = '#' + Math.floor(16777216*Math.random()).toString(16);
        for(;color.length<7;){
            color = color + '0';
        }
        c.factory.forEach(function (c_f) {
            var data = {};
            if(typeof (eval('address._'+c_f.fac)) === typeof (undefined) ){
                c_f.fac = 'BJ';
            }
            data.code = eval('address._'+c_f.fac+'.code');//address.fac.code;
            data.name = eval('address._'+c_f.fac+'.name');//address.fac.name;
            data.latitude = eval('address._'+c_f.fac+'.latitude');
            data.longitude = eval('address._'+c_f.fac+'.longitude');
            data.value = (c_f.count/10000).toFixed(2);
            data.color = color;
            c_address.mapinfo.push(data);
        });
        ReportContent.mapData.push(c_address);
    });

    //写入数据库
    FacConsInfo.getConsInfoByDate(Yesterday,function (err, rs) { //如果已经该日期的信息,则覆盖,没有则新建
        if(rs != null) {
            // rs.consInfo = JSON.stringify(ReportContent.mapData);
            rs.consInfo = ReportContent.mapData;
            rs.save();
            console.log(rs);
        }else{
            //更新
            FacConsInfo.newAndSave(Yesterday, ReportContent.mapData, function () {
                console.log('Update '+Yesterday+' cans info.');
            });
        }
    });
}


function walk(path,list){
    var dirList = FS.readdirSync(path);
    dirList.forEach(function(item){
        if (FS.statSync(path + '/' + item).isDirectory()) {
            walk(path + '/' + item, list);
        } else {
            if (item.length > 20) {
                list.push(path + '/' + item);
            }
        }
    });
    return list;
}
function walkDir(path, list) {
    var dirlist = FS.readdirSync(path);
    dirlist.forEach(function(item){
        if(FS.statSync(path + '/' + item).isDirectory()) {
            list.push(path + '/' + item);
        }else{

        }
    });
    return list;
}

exports.getConsByDate = function(date){
    var savePath = 'middlewares/data/getcons';
    var List = [];
    var fileList = [];
    List = walkDir(savePath,List);
    var Yesterday = new Date(date);
    Yesterday = moment(Yesterday);
    Yesterday = Yesterday.format('YYYY-MM-DD');
    // 获取前一天的罐装数据
    List.forEach(function (savePath) {
        savePath = savePath +'/'+ Yesterday;
        if (!FS.existsSync(savePath)) {
            logger.error('[Task-GetCansData] no such file or dircetory: '+ savePath);
            Logs.addLogs('system', '[Task-GetCansData] no such file or dircetory: '+ savePath, 'system', '2');
        }else {
            logger.debug('[Task-GetCansData] Start Loop Folder: ' + savePath);
            fileList = walk(savePath, fileList);
        }
    });
    if(fileList.length<=0){
        logger.error('[Task-GetCansData] no such '+Yesterday+' file or dircetory: middlewares/data/getcons');
        return Logs.addLogs('system', '[Task-GetCansData] no such '+Yesterday+' file or dircetory: middlewares/data/getcons', 'system', '2');
    }
    //getOneCons(fileList,Yesterday);
};