/**
 * Created by lxrent on 2016/12/9.
 */
var EventProxy          = require('eventproxy');
var FS                  = require('fs');
var path                = require('path');
var moment              = require('moment');

var logger              = require('../common/logger');
var tools               = require('../common/tools');
var Logs                = require('../proxy').Logs;
var Qrcode              = require('../proxy').QRCode;
var Order               = require('../proxy').Order;
var Category            = require('../proxy').Category;
var FtpInfo             = require('../proxy').FTPInfo;
var readLine            = require('lei-stream').readLine;
var writeLine           = require('lei-stream').writeLine;
var models              = require('../models');
var QRCodeEntity        = models.QRCode;

exports.getconsSubfile = function (Yesterday) {

    logger.debug('-----------------Start Task: [Task-GetCanstoSubFile] -----------------');

    var ep = new EventProxy();
    ep.fail(function(err) {
        Logs.addLogs('system', '[Task-GetCanstoSubFile] fail.  ERROR: '+ err, 'system', '2');
        return logger.error('[Task-GetCanstoSubFile] fail.  ERROR: '+ err);
    });

    var udf = 0;
    Yesterday = moment(Yesterday);
    var yd_file = Yesterday.format('YYYY-MM-DD');
    var yd_query = Yesterday.format('YYYYMMDD');
    var startTime = Date.now();
    function msToS (v) {
        return parseInt(v / 1000, 10);
    }
    function getSpentTime () {
        return Date.now() - startTime;
    }

    // 如果文件夹不存在自动创建
    if(!FS.existsSync('middlewares/data/cons_original/' + yd_file)){
        FS.mkdirSync('middlewares/data/cons_original/' + yd_file);
    }


    var Today = new Date();
    //var SMTdate = tools.formatDateforFile(Today);
    //读取数码通URL
    var smtInfoFile = 'middlewares/data/smtURL.json';
    var smtInfo=FS.readFileSync(smtInfoFile,"utf-8");
    smtInfo = JSON.parse(smtInfo);
    var ftpcode = smtInfo.smtConsFTP;
    var password = smtInfo.password;
    var count = 0;
    var catagoryList = []; //存放品类、token信息
    var fileStreams = [];   //存放文件名、存放文件流
    var conscount = []; //存放每种的灌装量
    var code = '';          //存放当前行
    var query = {
        //batch:eval('/'+yd_query+'/')
        cansDate:yd_file
    };
    var fields = 'content categoryId batch';
    //var options = {sort: '_id'};
    var stream = QRCodeEntity.find(query, fields, '').lean().batchSize(100000).stream();
    stream.on('data', function (doc) {
        count++;
        stream.pause();
        if (count % 10000 === 0) {
            printSpeedInfo();
        }
        var l = -1;
        catagoryList.forEach(function (c, index) {
            if(c[0] == doc.categoryId.toString()){
                l = index;
            }
        });
        if(l >= 0){
            conscount[l]++;
            fileStreams[l*2+1].write(doc.content+','+doc.batch, stream.resume());
        }else{
            Category.getCategoryById(doc.categoryId, function (err, rs) {
                if(err){
                    logger.error('[Task-GetCanstoSubFile] get qrcode token error. Error:'+err);
                    return stream.resume();
                }
                catagoryList.push([rs._id.toString(), rs.generalId]);
                conscount.push(1);
                // 然后新建文件流 写入
                var outputfile = 'middlewares/data/cons_original/' + yd_file + '/' + yd_file + '_' + rs.generalId + '.txt';
                fileStreams.push(outputfile);
                fileStreams.push(
                    writeLine(outputfile, {
                    newline: '\n',
                    cacheLines: 1000
                    //cacheLines: 0
                    })
                );
                fileStreams[fileStreams.length-1].write(doc.content+','+doc.batch, stream.resume());
            });
        }
    }).on('err', function (err) {
        logger.error('err :' + err);
    }).on('close', function () {

        //closefileupload();
        setTimeout(closefileupload, 1000*10);

    });

    function closefileupload(){
        //不用读文件,所以stream流读完以后直接文件end
        fileStreams.forEach(function(f, index){     //0/1/2/3/4/5/6/7  0、2、4、6filename 1/3/5/7 stream流
            if( index%2 == 0 ){
                return;
            }
            f.end(function () {
                logger.debug(fileStreams[index-1]+'output ok.');
                // 压缩文件
                tools.shellZip('','',[fileStreams[index-1]], fileStreams[index-1].replace('txt', 'zip'), function (err) {
                    if(err){
                        return logger.error('[Task-GetCanstoSubFile] make zip: ' + fileStreams[index-1].replace('txt', 'zip') + 'file fail. ERROR: ' + err);
                    }
                    //删除txt文件
                    FS.unlink(fileStreams[index-1], function (err) {
                        if (err) {
                            logger.error('[Task-GetCanstoSubFile] TXT file delete fail. ERROR:' + err);
                        }
                    });
                    // 上传ftp
                    var tmp = {
                        pass : "Nopass@1q2w3e",
                        user : "ftpuser",
                        port : 21,
                        //host : "47.93.124.87"
                        host : "ftp.greatdata.com.cn"
                    };
                    var  zipfilename = fileStreams[index-1].replace('txt', 'zip');
                    // tools.UploadFileWithPath(tmp.host, tmp.port, tmp.user, tmp.pass, zipfilename, '/collectCode/normal', function(err, files) {
                    //     if(err){
                    //         logger.debug('[Task-GetCanstoSubFile] upload file is err. File: '+ zipfilename);
                    //     }else{
                    //         logger.debug('[Task-GetCanstoSubFile] Upload file to customer is ok. File: '+ zipfilename +' FTP: '+ tmp.host);
                    //         Logs.addLogs('system', '[Task-GetCanstoSubFile] Upload file to customer is ok. File: '+ zipfilename +' FTP: '+ tmp.host, 'system', '0');
                    //     }
                    // });

                });
            });

        });
        logger.debug('[Task-GetCanstoSubFile] get cansDate: '+yd_file+' is OK. Count: '+conscount);
    }

    // 打印进度
    function printSpeedInfo () {
        var t = msToS(getSpentTime());
        var s = count / t;
        if (!isFinite(s)) s = count;
        logger.debug('[Task-GetCanstoSubFile] read %s lines, speed: %sL/S', count, s.toFixed(0));
    }

    function zipupload(file, zipfilename, xmlfilename, consNum) {
        var zipfileList = [file];

        tools.shellZip(password,'',zipfileList, zipfilename, function (err) {
            if (err) {
                logger.error('[Task-GetCanstoSubFile] make zip: ' + zipfilename + 'file fail. ERROR: ' + err);
                return Logs.addLogs('system', '[Task-GetCanstoSubFile] make zip: ' + zipfilename + 'file fail. ERROR: ' + err, 'system', '2');
            }
            //删除txt文件
            FS.unlink(file, function (err) {
                if (err) {
                    logger.error('[Task-GetCanstoSubFile] TXT file delete fail. ERROR:' + err);
                }
            });
            // ep.all('getftp_ok', function (ftp) {
            //
            // });
            var query = {
                code:ftpcode,
                type:'category'
            };
            FtpInfo.getFTPInfoByQuery(query, '', function (err ,ftpinfo) {
                if(err){
                    logger.error('get smt ftp err: '+err);
                    Logs.addLogs('system', 'get smt ftp err: '+err, 2);
                } else if(ftpinfo.length > 0){
                    logger.debug('get smt ftp address ok. ftp:'+ftpinfo[0]);
                   // ep.emit('getftp_ok', ftpinfo[0]);
                    var ftp = ftpinfo[0];
                    logger.debug('[Task-GetCanstoSubFile] Make and Zip file is ok. File: '+ file);
                    //tools.uploadtoftp(ftp.host,ftp.port, ftp.user, ftp.pass, zipfilename, function(err, files) {
                    tools.uploadtoftp('192.168.15.110', '', 'lxrent', 'qwe123', zipfilename, function(err, files) {
                        if(err){
                            logger.debug('[Task-GetCanstoSubFile] upload file is err. File: '+ zipfilename);
                        }else{
                            logger.debug('[Task-GetCanstoSubFile] Upload file to customer is ok. File: '+ zipfilename +' FTP: '+ ftp.host);
                            Logs.addLogs('system', '[Task-GetCanstoSubFile] Upload file to customer is ok. File: '+ zipfilename +' FTP: '+ ftp.host, 'system', '0');
                            makexml(ftp, file, zipfilename, xmlfilename, consNum);
                        }

                    });
                } else {
                    logger.error('get smt ftp null.');
                    Logs.addLogs('system', 'get smt ftp null', 2);
                }
            });
        });
    }

    function makexml(ftp, file, zipfilename, xmlfilename, consNum) {
        //生成xml文件 json --> xml
        var fileinfo = {};
        fileinfo.Files = {
            FileType: 'txt'
        };
        var zipfile = zipfilename.split('/');
        var filepath = file.split('/');
        filepath = filepath[filepath.length-1];
        var subfileList = [];//只需要文件名
        subfileList.push(filepath);
        fileinfo.FileList = {
            ReduceFile: zipfile[zipfile.length - 1], //zip文件名
            FileType: '02',    //文件类型,01印刷码,02采集码
            Number: subfileList.length, //子文件个数
            FileName: subfileList  //子文件名
        };
        fileinfo.ProductInfo = {
            QrTotalNumber: consNum
        };
        tools.writetoXML(fileinfo, xmlfilename, function (err) {
            if (err) {
                logger.debug('outPut XML File Error:' + err);
                return Logs.addLogs('system', 'outPut XML File Error:' + err, 'system', '2');
            }
            //tools.uploadtoftp(ftp.host, ftp.port, ftp.user, ftp.pass, xmlfilename, function () {
            tools.uploadtoftp('192.168.15.110', '', 'lxrent', 'qwe123', xmlfilename, function () {
                if (err) {
                    Logs.addLogs('system', '[Task-GetCanstoSubFile] Upload XMLfile to Customer is  Error. File:'+ xmlfilename +' FTP: '+ ftp.host +' Err:'+ err, 'system', '2');
                    return logger.error('[Task-GetCanstoSubFile] Upload XMLfile to Customer is  Error. File:'+ xmlfilename +' FTP: '+ ftp.host +' Err:'+ err);
                }
                logger.debug('[Task-GetCanstoSubFile] Upload XMLfile to customer is ok. File: '+ xmlfilename +' FTP: '+ ftp.host);
                Logs.addLogs('system', '[Task-GetCanstoSubFile] Upload XMLfile to customer is ok. xmloutpath: '+ xmlfilename +' FTP: '+ ftp.host, 'system', '0');
            });
        });
    }

}