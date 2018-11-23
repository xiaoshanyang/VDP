/**
 * Created by lxrent on 2016/12/12.
 */
/**
 * Created by youngs1 on 8/15/16.
 * 1.从之前的国家编码中心下码，改成现在从数码通盒码平台下码，不能再根据url不同去判断，所属品类
 * 2.所有码都以数码通的url为准，只能通过查找单个文件内的第一个码来确认 所属品类
 * 3.按照品类不同，生成文件（询问数码通，是根据品类生成文件还是根据token生成文件）
 */
var EventProxy          = require('eventproxy');
var FS                  = require('fs');
var path                = require('path');
var moment              = require('moment');
var mongoose            = require('mongoose');
var readLine            = require('lei-stream').readLine;
var writeLine           = require('lei-stream').writeLine;
var logger              = require('../common/logger');
var tools               = require('../common/tools');
var Logs                = require('../proxy').Logs;
var FTPinfo             = require('../proxy').FTPInfo;
var QRCode              = require('../proxy').QRCode;
var Category            = require('../proxy').Category;
var FacConsInfo         = require('../proxy').FacConsInfo;
var models              = require('../models');
var QRCodeEntity        = models.QRCode;

var getConsubfile       = require('./constosubfile');
var getfactoryconsInfo  = require('./getfactoryconsInfo');

var updateFileCount = 0;

exports.getCons = function () {
    var savePath = 'middlewares/data/getcons';
    var List = [];
    var fileList = [];
    List = walkDir(savePath,List);
    var Today = new Date();
    var Yesterday = new Date();
    Yesterday.setDate(Today.getDate() - 1);
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
    getOneCons(fileList,Yesterday);
    //getfactoryconsInfo.getfactoryconsInfo(fileList,Yesterday);

};

function getOneCons(fileList, Yesterday){
    logger.debug('-----------------Start Task: [Task-GetCansData] -----------------');


    var categoryList = [],  //用来记录 从灌装文件中读出的 品类， 避免重复查询
        fileName = [],      //文件名, 与上边变量一一对应
        filePathList = [],  //按照xml读出的文件名 组合成新的 文件名 加入数组中
        fileWriteList = []; //按照文件名路径生成写入流
    var factoryConsCount = {        //存放工厂灌装各品类数量
        categorys:[]
    };

    var ep = new EventProxy();
    ep.fail(function(err) {
        Logs.addLogs('system', '[Task-GetCansData] fail.  ERROR: '+ err, 'system', '2');
        return logger.error('[Task-GetCansData] fail.  ERROR: '+ err);
    });

        var j = -1;
        var i = -1;
        var samefac = false;
        var startTime = Date.now();
        function msToS(v) {
            return parseInt(v / 1000, 10);
        }
        function getSpentTime() {
            return Date.now() - startTime;
        }

        logger.debug('[Task-GetCansData] File Count is ' + fileList.length);
        // 生成一天内所有的码数据文件 ［二维码（不带URL）, 按原文件内容写入］
        var outpath = 'middlewares/data/cons_original' + '/' + Yesterday + '/';
        if (!FS.existsSync(outpath)) {
            FS.mkdirSync(outpath);
        }
        var counter = 0;
        var newcounter = 0;
        var endNum = 0;
        var outPath = '';
        var tmpData1 = '',
            tmpData = '',
            tmpData2 = '',
            fac = '',
            category_new = '',
            hasOldContent = false;  // 如果文件中存在300的码，记录文件名
        var oldContentFile = [];    // 记录文件名


        if (fileList) {
            fileList.forEach(function (f, index) {
                ep.after('readconsfile_ok',index,function () {
                    var isfirstLine = true;
                    var line = 0;
                    var ssrNum = 0;     //与ep.after一起使用来，判断是否找到对应的品类信息
                    hasOldContent = false;
                    logger.debug('[Task-GetCansData] curFile is ' + index + ', fileName: '+ f);
                    readLine(f).go(function (data, next) {
                        counter++;
                        line++; //记录该文件的第几行
                        //如果没有生产批次号,跳过该行,不再导入//没有找到noread即二维码读出的情况
                        if (data.indexOf('noread') >= 0){
                            return next();
                        }
                        if (counter % 10000 === 0) {
                            printSpeedInfo();
                        }
                        data = data.trim();
                        if (data.indexOf(',') < 0) {
                            // 没有逗号应对1ACF车间，设置不正确的情况
                            tmpData1 = data.replace('\r', '');
                            return next();
                        }

                        // 有逗号 且 逗号不在第一位的情况
                        if (data.indexOf(',') > 0) {
                            tmpData1 = data.split(',')[0].trim();  //url+content
                        }


                        //--------------------------------------------------
                        //酸酸乳的码长度为26、数码通的码长度不确定，已知有一种为21位
                        //去掉没有生产批此号的情况、数码通的码与url组合有不带 '?E=' 的情况、 酸酸乳的码带着'?E=' ,需要去掉
                        /*var tmpData1 = data.split(',')[0];
                        tmpData1 = tmpData1.substring(tmpData1.lastIndexOf('/')+1,tmpData1.length);
                        tmpData1 = tmpData1.replace('?E=', '');
                        var tmpData2 = data.substring(data.indexOf(',') + 1, data.length);
                        tmpData2 = tmpData2.replace('\r', '');
                        //如果没有生产批次号,跳过该行,不再导入
                        if (tmpData2 === '') {
                            return next();
                        }*/
                        // 数据库已切换为url+content 组合为 一个字段，采集到的二维码无需再把url+content进行拆分，直接用来查询即可

                        //由于灌装比较慢，防止 收到之前 url和content分离时，方便查找二维码信息
                        tmpData = tmpData1.substring(tmpData1.lastIndexOf('/')+1,tmpData1.length);
                        tmpData = tmpData.replace('?E=', '');
                        //http[\u0000-\uffff]+?[*],1A20180501BE0108:05,2018-05-01 08:05:14:096
                        if(tmpData == tmpData1){
                            return next();
                        }

                        tmpData2 = data.substring(data.indexOf(',') + 1, data.length);  //生产批次信息
                        tmpData2 = tmpData2.replace('\r', '');
                        //----------------------------------------------------

                        newcounter++;       //正确扫描出来的条数

                        // 如果300开头的二维码，记录一下文件名
                        if(tmpData.startsWith('300') && !hasOldContent){
                            hasOldContent = true;
                            oldContentFile.push(f+'<br>');
                        }

                        if(isfirstLine){  //在第一行 或者是 还未确认品类的文件，继续查询下一条码

                            //---------------------------start:获取工厂名---------------------------
                            fac = f.split('/');
                            fac = fac[fac.length - 2];
                            //S61 认为是 S6
                            fac = fac.substr(0, 2);//只取两位作为工厂名
                            //---------------------------end:获取工厂名-----------------------------

                            ssrNum = 1;
                            QRCode.getQRCodeByQuery({content: {$in:[tmpData,tmpData1]}}, '', function (err, rs) {
                                if (err) {
                                    logger.error('get QRCode  by code: ' + tmpData1 + ' is Error:' + err);
                                    //错误的时候不写入文件了,直接跳出进行取读下一条
                                    return next();
                                }
                                if (rs.length > 0) {
                                    Category.getCategoryById(mongoose.Types.ObjectId(rs[0].categoryId), function (c_err, c_rs) {
                                        if (c_err || !c_rs) {
                                            logger.error('get Category  by Id: ' + rs.categoryId + ' is Error:' + err);
                                            return next();
                                        }
                                        if (c_rs) {
                                            j = categoryList.indexOf(c_rs.name);
                                            if (j < 0) {
                                                j = categoryList.length;
                                                categoryList.push(c_rs.name);
                                                //查找该品类对应的 文件名

                                                var tmp = 'newFile'+j;
                                                fileName.push(tmp);

                                                //------------------工厂生产信息--------------
                                                category_new = {
                                                    name: c_rs.name,
                                                    factory: []
                                                }
                                                factoryConsCount.categorys.push(category_new);
                                            }
                                            isfirstLine = false;
                                            ssrNum = 0;
                                            ep.emit('get_categoryname_ok');
                                        }
                                    });
                                }else{  //当前条没有在库中查到
                                    return next();
                                }
                            });
                        }else{
                            ssrNum = 0;
                        }
                        // 确认品类，即确认存入哪个文件, 开始遍历该文件存入一个总的文件中
                        ep.after('get_categoryname_ok', ssrNum, function () {
                            outPath = outpath + Yesterday +'_' + fileName[j] + '.txt';
                            // if(FS.existsSync(outPath)){
                            //
                            // }
                            i = filePathList.indexOf(outPath);
                            if (i == -1) {
                                filePathList.push(outPath);
                                var write_new = writeLine(outPath, {
                                    newline: '\n',
                                    cacheLines: 1000
                                });
                                fileWriteList.push(write_new);
                                i = filePathList.length - 1;
                            }

                            samefac = false;//是否找到相同的工厂
                            factoryConsCount.categorys[j].factory.forEach(function (f) {
                                if (f.fac === fac) {
                                    f.count++;
                                    samefac = true;
                                }
                            });
                            if (!samefac) {//没有找到相同的工厂
                                factoryConsCount.categorys[j].factory.push({
                                    fac: fac,
                                    count: 1
                                });
                            }
                            // fileWriteList[i].write((tmpData1 + ',' +tmpData2), function(){
                            //     next();
                            // });
                            fileWriteList[i].write((tmpData1 + ',' +tmpData2), next);

                        });
                    }, function () {
                        setTimeout(function () {
                            ep.emit('readconsfile_ok');
                        }, 1000*5);

                        endNum++;
                        logger.debug(endNum + 'file');
                        if (endNum === fileList.length) {
                            logger.debug('[Task-GetCansData] done. total %s lines, spent %sS', counter, msToS(getSpentTime()));
                            logger.debug(endNum + ' files end');
                            // 如果存在300的二维码，需要查看是否全部识别，发送邮件告知
                            if (oldContentFile.length > 0) {
                                logger.debug('[Task-GetCansData] has qrcode startwith 300, please confirm again. Files: ' + oldContentFile);
                                Logs.addLogs('system', '[Task-GetCansData] has qrcode startwith 300, please confirm again. Files: ' + oldContentFile, 'system', 2);
                            }
                            //表示所有文件读取完成,开始更新库
                            //----------把存放文件的数组清空
                            // getfactoryconsInfo.getfactoryconsInfo(fileList, Yesterday);
                            fileList = [];
                            //----------
                            fileWriteList.forEach(function (wf, index) {
                                // 直接更新lei-stream中间件, 在end方法中循环调用flush方法，只要缓存中有数据就重复清空缓存写入文件操作

                                // wf.flush(function () {
                                    wf.end(function () {
                                        var remotePath = '';
                                        var file = filePathList[index];
                                        var name = file.split('_');
                                        if (name.length > 2) {         //因为文件名cons_original本身就带着_ 所以要判断大于2的情况
                                            name = name[name.length - 1];
                                            name = name.substring(0, name.indexOf('.txt'));
                                            remotePath = name + '-SD/' + Yesterday;
                                        } else {

                                        }
                                        updateCode(file, remotePath, index, fileWriteList.length);
                                    });
                                //});
                            });
                            recoderFactoryCount(Yesterday, factoryConsCount);
                        }
                    });
                });
            });
        }

        // 打印进度
        function printSpeedInfo() {
            var t = msToS(getSpentTime());
            var s = counter / t;
            if (!isFinite(s)) s = counter;
            logger.debug('[Task-GetCansData] read %s lines %s, speed: %sL/S', counter, newcounter, s.toFixed(0));
        }

    //更新库
    function updateCode (filepath, remotePath, curIndex, fileCount) {
        // 基于文件开始批量更新数据
        var loopUpdateNum = 0;
        var updatedDoc = 0;
        logger.debug('[Task-GetCansData] Start update DB from '+ filepath);

        var batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
        var production_Batch = '';
        var code = '';
        readLine(filepath).go(function (data, next) {
            code = data.substring(0, data.indexOf(','));
            //--------如果是以前的码， 可以用这种方式， 取出二维码，在库中执行
            var tmpData = code.substring(code.lastIndexOf('/')+1,code.length);
            tmpData = tmpData.replace('?E=', '');

            production_Batch = data.substring(data.indexOf(',')+1, data.length);
            production_Batch.replace('\r','');
            loopUpdateNum++;
            batch.find({ content: {$in: [code, tmpData]}}).update({ $inc: { state: 10000, cansNum: 1}, $set:{ batch: production_Batch, cansDate:Yesterday} });

            if (loopUpdateNum % 5000 === 0) {
                batch.execute(function(err, rs) {
                    if (err) {
                        Logs.addLogs('system', '[Task-GetCansData] Update Code is Error: '+ err, 'system', '2');
                        return logger.error('[Task-GetCansData] Update Code is Error: '+ err);
                    } else {
                        updatedDoc = updatedDoc + rs.nModified;
                        logger.debug('[Task-GetCansData] Count: ('+ loopUpdateNum +'). Updated: ('+ updatedDoc +').');
                        batch = QRCodeEntity.collection.initializeUnorderedBulkOp();
                        return next();
                    }
                });
            } else {
                return next();
            }
        }, function () {
            if (loopUpdateNum % 5000 != 0) {
                batch.execute(function(err, rs) {
                    if (err) {
                        Logs.addLogs('system', '[Task-GetCansData] Update Code is Error: '+ err, 'system', '2');
                        return logger.error('[Task-GetCansData] Update Code is Error: '+ err);
                    }
                    updatedDoc = updatedDoc + rs.nModified;
                    logger.debug('[Task-GetCansData] Count: ('+ loopUpdateNum +'). Last Updated: ('+ updatedDoc +').');
                    batch = null;
                    updateFileCount++;
                    //更新完成开始生成各种文件
                    if((remotePath.indexOf('SMT')>=0 || remotePath.indexOf('newFile')>=0) && updateFileCount == fileCount ){
                    	updateFileCount = 0;
                        getConsubfile.getconsSubfile(Yesterday);
                        //删除txt文件
                        // FS.unlink(filepath,function (err) {
                        //     if(err){
                        //         logger.error('[Task-GetCansData] TXT file delete fail. ERROR:'+err);
                        //     }
                        // });
                    }else{
                        //上传ssr文件
                        //uploadSSRfile(filepath, remotePath);
                    }

                });
            } else {
                logger.debug('[Task-GetCansData] Update code is ok.');
                batch = null;
                updateFileCount++;
                //更新完成开始生成各种文件
                if((remotePath.indexOf('SMT')>=0 || remotePath.indexOf('newFile')>=0) && updateFileCount == fileCount ){
                	updateFileCount = 0;
                    getConsubfile.getconsSubfile(Yesterday);
                    //删除txt文件
                    // FS.unlink(filepath,function (err) {
                    //     if(err){
                    //         logger.error('[Task-GetCansData] TXT file delete fail. ERROR:'+err);
                    //     }
                    // });
                }else{
                    //上传ssr文件
                    //uploadSSRfile(filepath, remotePath);
                }
            }
        });
    }

    function uploadSSRfile(filepath, remotePath) {
        var str = remotePath.split('-');
        if(str.length>1){
            str = str[0];
        }
        var zipPath = filepath.substring(0, filepath.indexOf('.')) +'.zip';
        var zipfileList = [filepath];
        var query = {
            code:ftpCode[fileNameList.indexOf(str)],
            type:"category"
        };
        FTPinfo.getFTPInfoByQuery(query, '', function (err ,ftpinfo) {
            tools.shellZip('','',zipfileList, zipPath, function (err) {
                if(err){
                    logger.error('[Task-GetCansData] make zip: '+zipPath+'file fail. ERROR: '+err);
                    return Logs.addLogs('system', '[Task-GetCansData] make zip: '+zipPath+'file fail. ERROR: '+ err, 'system', '2');
                }
                //删除txt文件
                FS.unlink(filepath,function (err) {
                    if(err){
                        logger.error('[Task-GetCansData] TXT file delete fail. ERROR:'+err);
                    }
                });
                if(ftpinfo.length<=0){
                    logger.error('[Task-GetCansData] '+query.code+' ftp connot find.'+zipPath+' upload fail');
                    return Logs.addLogs('system', '[Task-GetCansData] '+query.code+' ftp connot find.'+zipPath+' upload fail', 'system', '2');
                }
                //生成xml文件,先上传zip再传xml
                uploadFile(ftpinfo[0], zipPath, remotePath, function (err, files) {
                    if (err) {
                        return logger.error('[Task-GetCansData] Upload to Customer is  Error. File:'+ zipPath +' FTP: '+ ftpinfo[0].host +' Err:'+ err);
                    }
                    // 上传成功
                    logger.debug('[Task-GetCansData] Upload file to customer is ok. File: '+ zipPath +' FTP: '+ ftpinfo[0].host);
                    Logs.addLogs('system', '[Task-GetCansData] Upload file to customer is ok. File: '+ zipPath +' FTP: '+ ftpinfo[0].host, 'system', '0');

                });

            });
        });
    }
    function uploadFile (ftpinfo, file, path, callback) {

        logger.debug('[Task-GetCansData] Make and Zip file is ok. File: '+ file);
        tools.UploadFileWithPath(ftpinfo.host,ftpinfo.port, ftpinfo.user, ftpinfo.pass, file, path, function(err, files) {
            return callback(err, files);
        });
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
            //Logs.addLogs('system', '[Task-GetCansData] no such file or dircetory: '+ savePath, 'system', '2');
        }else {
            logger.debug('[Task-GetCansData] Start Loop Folder: ' + savePath);
            fileList = walk(savePath, fileList);
        }
    });
    if(fileList.length<=0){
        logger.error('[Task-GetCansData] no such '+Yesterday+' file or dircetory: middlewares/data/getcons');
        //return Logs.addLogs('system', '[Task-GetCansData] no such '+Yesterday+' file or dircetory: middlewares/data/getcons', 'system', '2');
    }
    getOneCons(fileList,Yesterday);
    //getfactoryconsInfo.getfactoryconsInfo(fileList,Yesterday);
    //getConsubfile.getconsSubfile(Yesterday);
};