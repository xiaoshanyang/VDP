/**
 * Created by youngs1 on 16/6/1.
 */
var mongoose = require('mongoose');
var bcrypt = require('bcryptjs');
var moment = require('moment');
var i18n = require('i18n');
var config = require('../config');
var logger = require('../common/logger');
var http = require('http');

var FTP = require('ftp');
var unzip = require("unzip2");
var archiver = require("archiver");
var path = require('path');
var fs = require("fs");
var iconv = require('iconv-lite');
var xml2js = require('xml2js');
var shell = require('shelljs');
var soap  = require('soap');
// 解压时存在压缩文件不正确，也能解压的现象，更换插件
var yauzl = require("yauzl");



moment.locale('zh-cn'); // 使用中文

/**
 * 获取本周、本季度、本月、上月的开始日期、结束日期
 */
var now = new Date();                    //当前日期
var nowDayOfWeek = now.getDay();         //今天本周的第几天
var nowDay = now.getDate();              //当前日
var nowMonth = now.getMonth();           //当前月
var nowYear = now.getYear();             //当前年
nowYear += (nowYear < 2000) ? 1900 : 0;  //

var lastMonthDate = new Date();  //上月日期
lastMonthDate.setDate(1);
lastMonthDate.setMonth(lastMonthDate.getMonth()-1);
var lastYear = lastMonthDate.getYear();
var lastMonth = lastMonthDate.getMonth();

// 格式化时间
exports.formatDate = function (date, friendly) {
    date = moment(date);

    if (friendly) {
        return date.fromNow();
    } else {
        return date.format('YYYY-MM-DD HH:mm');
    }
};
exports.formatDateJustHHmm = function (date) {
    date = moment(date);
    return date.format('HH:mm');
};
exports.formatDateforFile = function (date) {
    date = moment(date);
    return date.format('YYYY-MM-DD');
};

exports.formatDateTimeforFile = function (date) {
    date = moment(date);
    return date.format('YYYY-MM-DD-HH-mm-ss-SSS');
};

exports.formatDateSSS = function (date) {
    date = moment(date);
    return date.format('YYYY-MM-DD HH:mm:ss.SSS');
};

exports.formatDateSSSByMs = function(date){
    date = moment(date);
    return date.format('YYYY-MM-DD HH:mm:ss:SSS');
}

exports.formatDateHHmmss = function (date) {
    date = moment(date);
    return date.format('YYYY-MM-DD HH:mm:ss');
};

exports.gcd = function gcd(a, b) {
    var n2 = Math.min(a, b), temp = Math.max(a, b), n1 = temp;
    var product = n1 * n2;

    while(n2 != 0) {
        n1 = n1 > n2 ? n1:n2;
        var m = n1 % n2;
        n1 = n2;
        n2 = m;
    }
    return product/n1;
};

exports.validateId = function (str) {
    return (/^[a-zA-Z0-9\-_.]+$/i).test(str);
};

exports.bhash = function (str, callback) {
    bcrypt.hash(str, 10, callback);
};

exports.bcompare = function (str, hash, callback) {
    bcrypt.compare(str, hash, callback);
};

exports.testdbconn = function (uri, opts, callback) {
    mongoose.createConnection(uri, opts, callback);
    //mongoose.disconnect();
};

exports.testftpconn = function (host, port, user, pass, callback) {
    var c = new FTP();
    c.on('ready', function() {
        c.list(function(err, list) {
            if (err) throw err;
            c.end();
            return callback(null, list);
        });
    });

    c.on('error', function(err) {
        return callback(err);
    });

    c.connect({
        host: host,
        port: port,
        user: user,
        password: pass
    });
};

exports.uploadtoftp = function (host, port, user, pass, file, callback) {
    var u = new FTP();
    var fileName = file;
    fileName = fileName.split('/');
    fileName = fileName[fileName.length - 1];
    u.on('ready', function() {
        u.put(file, fileName, function(err) {
            if (err) {
                return callback(err);
            }
            u.end();
            return callback(null, file);
        });
    });
    u.on('error', function(err) {
        return callback(err);
    });
    u.connect({
        host: host,
        port: port,
        user: user,
        password: pass
    });
}

exports.UploadFileWithPath = function (host, port, user, pass, file, path, callback) {
    var u = new FTP();
    var fileName = file;
    var filepath = path;
    fileName = fileName.split('/');
    fileName = fileName[fileName.length - 1];
    u.on('ready', function() {
        u.mkdir(filepath, function () {
            u.cwd(filepath, function () {
                u.put(file, fileName, function(err) {
                    if (err) {
                        return callback(err);
                    }
                    u.end();
                    return callback(null, file);
                });
            });
        });
    });
    u.on('error', function(err) {
        return callback(err);
    });
    u.connect({
        host: host,
        port: port,
        user: user,
        password: pass
    });
}
exports.getDesFtpList = function (host, port, user, pass, filepath, fileType, callback) {
    var c = new FTP();
    var filename = [];
    //var desfilepath = '';
    c.on('ready', function() {
        c.cwd(filepath, function () {
            c.list(function(err, items) {
                if (err) {
                    return callback(err);
                }
                items.forEach(function(e){
                    fileType.forEach(function (f) {
                        if(path.extname(e.name) === f)
                            filename.push(filepath +'/'+ e.name);
                    })

                });
            });
            c.end();
        });
    });
    c.on('close', function() {
        return callback(null, filename);
    });
    c.on('error', function(err) {
        return callback(err);
    });
    c.connect({
        host: host,
        port: port,
        user: user,
        password: pass
    });
}

exports.getFTPList = function (host, port, user, pass, dltype, code, callback) {
    var c = new FTP();
    var filename = [];
    c.on('ready', function () {
        console.log('-------------Start getFTPFileList From FTP('+ host +':'+ port +' | code is '+ code +')-------------');
        c.list(function (err, list) {
            if (err) {
                return callback(err);
            }
            switch (dltype) {
                case 'checkPrint':
                    var lineCode = code.split('_');
                    var Today = new Date();
                    var count = 0;
                    list.forEach(function (element, index, array) {
                        if(count >= 1000){ return; } //每次1000个文件,不再去计算日期范围
                        var FileName = iconv.decode(element.name, 'utf8');
                        var FileDate = element.date;
                        var DiffTime = Today.getTime() - FileDate.getTime();
                        DiffTime = DiffTime / 1000 / 60;
                        // 目录：退出
                        if (element.type === 'd') { return; }
                        // 文件名称不包含工厂编码：退出
                        if (FileName.indexOf(lineCode[0]) < 0) { /*console.log('FileName not '+ lineCode[0]);*/ return; }
                        // 不是CSV文件：退出
                        if (path.extname(FileName) !== '.csv') { /*console.log('FileName not csv');*/ return; }
                        // 今天的文件 或 10天前的文件：退出
                        //if (DiffTime < 1440 || DiffTime > 14400) { console.log('FileName not available'+ DiffTime); return; }
                        //先不判断时间把东西当下来
                        //if (DiffTime < 1 || DiffTime > 14400) { console.log('FileName not available'+ DiffTime); return; }
                        //一次100个文件
                        count++;
                        if(count%200==0){console.log('File count is '+ count); }
                        filename.push(FileName);
                    });
                    break;
                case 'checkcanned':
                    var dirCode = code.split(',');
                    dirCode.forEach(function (dir) {
                        c.cwd(dir, function(err, items) {
                            if (err) {
                                return callback(err);
                            }
                            c.list(function(err, items) {
                                if (err) throw err;
                                items.forEach(function(e){
                                    filename.push(dir +'/'+ e.name);
                                });
                            });
                        });
                    });
                    //var Today = new Date();
                    //var Yesterday = new Date();
                    //Yesterday.setDate(Today.getDate() - 1);
                    //Today = moment(Today);
                    //Today = Today.format('YYYY-MM-DD');
                    //Yesterday = moment(Yesterday);
                    //Yesterday = Yesterday.format('YYYY-MM-DD');
                    //list.forEach(function (element, index, array) {
                    //    var FileName = iconv.decode(element.name, 'utf8');
                    //    var FileDate = element.date;
                    //    var DiffTime = forLoopToday.getTime() - FileDate.getTime();
                    //    DiffTime = DiffTime / 1000 / 60;
                    //    if (DiffTime < 30 || DiffTime > 14400) { console.log('FileName not available'+ DiffTime); return; }
                    //    if (element.type === 'd') {
                    //        //console.log('FileName: '+ FileName);
                    //        //console.log('Today: '+ Today);
                    //        //console.log('Yesterday: '+ Yesterday);
                    //        //if ( FileName === Today || FileName === Yesterday) {
                    //        c.cwd(FileName, function(err, items) {
                    //            c.list(function(err, items) {
                    //                if (err) throw err;
                    //                items.forEach(function(e){
                    //                    filename.push(FileName +'/'+ e.name);
                    //                });
                    //            });
                    //        });
                    //        //}
                    //    }
                    //});
                    break;
            }
            c.end();
        });
    });
    c.on('close', function() {
        return callback(null, filename);
    });
    c.on('error', function(err) {
        return callback(err);
    });
    c.connect({
        host: host,
        port: port,
        user: user,
        password: pass
    });
}

exports.downloadFTP = function (host, port, user, pass, dlfile, dlpath, callback) {
    // CSV在线检测2016
    if (dlfile.indexOf('/') > 0) {
        dlfile = dlfile.split('/');
        var FileName = dlfile[1],
            strPath = dlfile[0],
            localPath = dlpath + strPath,
            serverPath = strPath +'/'+ FileName;
        fs.exists(localPath, function( exists ) {
            if (!exists) {
                fs.mkdir(localPath);
            }
        });
        var d = new FTP();
        d.on('ready', function () {
            d.get(serverPath, function (err, stream) {
                if (err) {
                    return callback(err);
                };
                stream.once('close', function () {
                    d.end();
                    return callback(null, serverPath);
                });
                stream.pipe(fs.createWriteStream(localPath+'/'+FileName));
            });
        });
        d.on('error', function(err) {
            return callback(err);
        });
        d.connect({
            host: host,
            port: port,
            user: user,
            password: pass,
            connTimeout: 400000
        });
    } else {
        var d = new FTP();
        d.on('ready', function () {
            d.get(dlfile, function (err, stream) {
                if (err) {
                    return callback(err);
                };
                stream.once('close', function () {
                    d.end();
                    return callback(null, dlfile);
                });
                stream.pipe(fs.createWriteStream(dlpath+dlfile));
            });
        });
        d.on('error', function(err) {
            return callback(err);
        });
        d.connect({
            host: host,
            port: port,
            user: user,
            password: pass,
            connTimeout: 400000
        });
    }
}


exports.downloadFTP2 = function (host, port, user, pass, dlfile, dlpath, callback) {
    // dlfile = xxxx/xxx.txt
    // dlpath = middlewares/data/getdes/

    if (dlfile.indexOf('/') > 0) {
        dlfile = dlfile.split('/');

        var FileName = dlfile[1],
            strPath = dlfile[0],
            localPath = dlpath,
            serverPath = strPath +'/'+ FileName;

        var d = new FTP();
        d.on('ready', function () {
            d.get(serverPath, function (err, stream) {
                if (err) {
                    return callback(err);
                };
                stream.once('close', function () {
                    d.end();
                    //return callback(null, serverPath);
                    return callback(null, FileName);
                });
                stream.pipe(fs.createWriteStream(localPath+'/'+FileName));
            });
        });
        d.on('error', function(err) {
            return callback(err);
        });
        d.connect({
            host: host,
            port: port,
            user: user,
            password: pass,
            connTimeout: 400000
        });
    } else {
        var d = new FTP();
        d.on('ready', function () {
            d.get(dlfile, function (err, stream) {
                if (err) {
                    return callback(err);
                };
                stream.once('close', function () {
                    d.end();
                    return callback(null, dlfile);
                });
                stream.pipe(fs.createWriteStream(dlpath+dlfile));
            });
        });
        d.on('error', function(err) {
            return callback(err);
        });
        d.connect({
            host: host,
            port: port,
            user: user,
            password: pass,
            connTimeout: 400000
        });
    }
}

exports.deleteFTP = function (host, port, user, pass, file, callback) {
    var e = new FTP();
    e.on('ready', function() {
        e.delete(file, function(err) {
            if (err) {
                return callback(err);
            }
            e.end();
            return callback(null, file);
        });
    });
    e.on('error', function(err) {
        return callback(err);
    });
    e.connect({
        host: host,
        port: port,
        user: user,
        password: pass
    });
}

exports.unzip = function (zipPath, outPath, callback) {
    // fs.createReadStream(zipPath)
    //     .pipe(unzip.Parse())
    //     .on('entry', function (entry) {
    //         var fileName = entry.path;
    //         var type = entry.type;
    //         var size = entry.size;
    //         var filePath = outPath +''+ fileName;
    //         entry.pipe(fs.createWriteStream(filePath));
    //         entry.on('end', function() {
    //             callback(null, fileName);
    //         });
    //         entry.on('error', function (err) {
    //             callback(err);
    //         });
    //     })
    //     .on('close', function () {
    //         return callback;
    //     })
    //     .on('error', function (err) {
    //         return callback(err);
    //     })

    yauzl.open(zipPath, {lazyEntries: true}, function(err, zipfile) {
        if (err) return callback(err);
        zipfile.readEntry();
        zipfile.on("entry", function(entry) {
            if (/\/$/.test(entry.fileName)) {
                zipfile.readEntry();
            } else {
                zipfile.openReadStream(entry, function(err, readStream) {
                    if (err) throw err;
                        readStream.on("end", function() {
                        zipfile.readEntry();
                        callback(null, entry.fileName);
                    });
                    var filePath = outPath +''+ entry.fileName;
                    readStream.pipe(fs.createWriteStream(filePath));
                });
            }
        });
    });
    
};

exports.zip = function (fileList, zipPath, callback) {
    var output = fs.createWriteStream(zipPath);
    var zipArchiver = archiver('zip');
    zipArchiver.pipe(output);
    for (var i=0; i< fileList.length; i++) {
        var fileName = fileList[i];
        fileName = fileName.split('/');
        fileName = fileName[fileName.length - 1];
        zipArchiver.append(fs.createReadStream(fileList[i]), {'name': fileName});
    }
    zipArchiver.finalize();
    return callback(zipPath);



};

exports.writetoXML = function (fileinfo, outfile, callback) {
    //var WorkInfo = {};
    //WorkInfo.Files = { FileType: 'txt'}; //压缩包中文件类型
    /*
    var FileList = {};
    FileList.ReduceFile = fileinfo.zipName; //压缩包名
    FileList.FileType = fileinfo.step;//即现在是印刷 还是 灌装
    FileList.Number = fileinfo.fileList.length; //子文件数量
    FileList.FileName = [];
    fileinfo.fileList.forEach(function (e) {
        FileList.FileName.push(e);
    });
    WorkInfo.FileList = FileList;

    var obj = {};
    obj.WorkInfo = WorkInfo;

    if(fileinfo.proInfo != null) {
        var productInfo = {};
        productInfo.Name = fileinfo.proInfo.Name || '';
        productInfo.Customer = fileinfo.proInfo.Customer || '';
        productInfo.DesignNumber = fileinfo.proInfo.DesignNumber || '';
        productInfo.PrintVerson = fileinfo.proInfo.PrintVerson || '';
        productInfo.DataDesignNumber = fileinfo.proInfo.DataDesignNumber || '';
        productInfo.DataPrintVersion = fileinfo.proInfo.DataPrintVersion || '';
        productInfo.QrTotalNumber = fileinfo.proInfo.productInfo || '';
        obj.productInfo = productInfo;
    }
    */
    var obj = {};
    obj.WorkInfo = fileinfo;
    var builder = new xml2js.Builder();
    var xml = builder.buildObject(obj);

    var str = xml.substring(xml.indexOf('<WorkInfo>'), xml.length);
    fs.writeFile(outfile, str, function (err) {
        return callback(err);
    })
};

exports.readXML = function (xmlfile, outfile, callback) {
    var parser = new xml2js.Parser();
    fs.readFile(xmlfile, function(err, data) {
        if(err){
            console.log(err);
        }else {
            var str = iconv.decode(data, 'utf-8');
            parser.parseString(str, function (err, result) {
                callback(err, result);

            });
        }
    });
};

exports.shellZip = function (password, dirpath, filepath, zippath, callback) {
    //cd('/Users/lxrent/Desktop/QRCode/middlewares/data/preprint_send/');
    /*
    shell.cd(dirpath);
    zippath = zippath.split('/');
    zippath = zippath[zippath.length-1];*/
    // 如果 zip 包已经存在，首先删除
    if(fs.existsSync(zippath)){
        fs.unlinkSync(zippath);
    }

    var fileList = '';
    filepath.forEach(function (f) {
       // f = f.split('/');
       // f = f[f.length-1];
        fileList = f+' '+fileList;
    });
    var str = 'zip -jP '+password+' '+zippath+' '+fileList; //-j是把文件目录去掉,只压缩文件,不带目录
    if(password === ''){
        str = 'zip -j'+' '+zippath+' '+fileList;
    }
    var child = shell.exec(str, {async:true});
    child.stdout.on('data', function(data) {
        logger.debug(data);
    });
    child.stdout.on('close', function () {
        // if(config.istest) {
        //     cd('/Users/lxrent/Desktop/QRCode/');
        // }else{
        //     cd('/home/www/');
        // }
        return callback();
    });
    child.stdout.on('error', function (err) {
        return callback(err);
    })
};
//得到文件行数,检查下发工单时生成alltxt文件是否正确,以避免行数生成不正确却下发到工厂的悲剧
exports.shellgetLine = function (filepath, callback) {
    var lineNum = ''; //记录行数
    var str = 'awk \'{print NR}\' '+filepath+' |tail -n1';
    var child = shell.exec(str, {async:true});
    child.stdout.on('data', function(data) {
        lineNum = data;
        logger.debug(filepath + 'line:' +data);
    });
    child.stdout.on('close', function () {
        return callback(null,parseInt(lineNum));
    });
    child.stdout.on('error', function (err) {
        return callback(err,null);
    })

};

exports.SendRollToGD = function (volume, token, code, callback) {

    var path = '/code/volume/'+token+'/'+volume;
    var options = {
        hostname: 'uma-api.openhema.com',
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(code)
        }
    };

    var req = http.request(options, function(res)  {
        // console.log('STATUS: ${res.statusCode}');
        // console.log('HEADERS: ${JSON.stringify(res.headers)}');
        res.setEncoding('utf8');
        res.on('data', function(chunk)  {
            var chunk_json;
            if(chunk.indexOf('html')>=0){
                return callback('error', chunk);
            }else{
                chunk_json=JSON.parse(chunk);
            }
            if(chunk_json.status==0){
                console.log('卷码文件： '+volume);
                return callback(null,chunk_json.message);
            }else if(chunk_json.status==-1){
                return callback('error',chunk_json.message);
            }else if(chunk_json.status==-2){
                return callback('error',chunk_json.message);
            }else{
                return callback('error',chunk_json);
            }
        });
        res.on('end', function() {
            console.log(volume+ ' 传送完成。');
        });
    }); // 先建立连接

    // 请求出错时，返回的信息
    req.on('error', function(e) {
        console.log('Network请求遇到问题: '+e.message);
        return callback('error',e.message);
    });

    // 写入数据到请求主体
    req.write(code);
    req.end();
};

exports.ApplyCode = function (code, callback) {
    var options = {
        //hostname: 'vdp.greatviewpack.org',
        hostname: 'localhost',
        path: '/downloadbyorder',
        method: 'POST',
        port: 3001,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(code)
        }
    };

    var req = http.request(options, function(res)  {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            if(res.statusCode == 422){
                return callback('err', data);
            }else{
                return callback(null, data);
            }

        });
    }); // 先建立连接

    // 请求出错时，返回的信息
    req.on('error', function(e) {
        console.log('Network请求遇到问题: '+e.message);
        return callback('error',e.message);
    });

    // 写入数据到请求主体
    req.write(code);
    req.end();
}

exports.ExecuteOrder = function (applyInfo, callback) {
    var applyInfo = JSON.stringify(applyInfo);
    var options = {
        //hostname: 'vdp-api.greatviewpack.org',
        hostname: 'localhost',
        path: '/api/v1/startOrder',
        // path: '/api/v1/pushSplit',
        method: 'POST',
        port: 3001,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(applyInfo)
        }
    };

    var req = http.request(options, function(res)  {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            return callback(null, data);
        });
    }); // 先建立连接

    // 请求出错时，返回的信息
    req.on('error', function(e) {
        console.log('Network请求遇到问题: '+e.message);
        return callback('error',e.message);
    });

    // 写入数据到请求主体
    req.write(applyInfo);
    req.end();
}

exports.GetGMSPid = function (data, callback) {
    var applyInfo = JSON.stringify(data);
    var options = {
        //hostname: 'vdp-api.greatviewpack.org',
        //hostname: '192.168.97.8',
        hostname: '192.168.97.17',
        //hostname: '192.168.5.52',
        //path: '/Services/CheckPIDHandler.ashx',
        path: 'GetMaxPID',
        // path: '/api/v1/pushSplit',
        method: 'POST',
        port: 81,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(applyInfo)
        }
    };

    var req = http.request(options, function(res)  {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            return callback(null, data);
        });
    }); // 先建立连接

    // 请求出错时，返回的信息
    req.on('error', function(e) {
        console.log('Network请求遇到问题: '+e.message);
        return callback('error',e.message);
    });

    // 写入数据到请求主体
    req.write(applyInfo);
    req.end();
}

exports.ExcuteBatchGMS = function (data, callback) {
    var applyInfo = JSON.stringify(data);
    var options = {
        //hostname: 'vdp-api.greatviewpack.org',
        //hostname: '192.168.97.8',
        hostname: '192.168.97.17',
        //hostname: '192.168.5.52',
        //path: '/Services/ProcessQRHandler.ashx?c=0',
        path: 'SetOrderInfo',
        method: 'POST',
        port: 81,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(applyInfo)
        }
    };

    var req = http.request(options, function(res)  {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            return callback(null, data);
        });
    }); // 先建立连接

    // 请求出错时，返回的信息
    req.on('error', function(e) {
        console.log('Network请求遇到问题: '+e.message);
        return callback('error',e.message);
    });

    // 写入数据到请求主体
    req.write(applyInfo);
    req.end();
}

exports.returnMesOrderInfo = function (orderNo, applyTimes, facLine) {
    var url = '';

    for(var i=0;;i++){
        var c = i==0?'':i;
        var fac = eval('config.interface_opts.apiReturnCode'+c);
        if(typeof fac == 'undefined' || fac == ''){
            url = config.interface_opts.apiPushOrderReturn;
            break;
        }else{
            if(facLine == fac){
                url = eval('config.interface_opts.apiPushOrderReturn'+c);
                break;
            }
        }
    }
    //下码失败，回传mes通知
    var args = {
        orderNo: orderNo,
        returnFlag: 10,
        codeQuantity: 0,
        fileCount: 0,
        filesName: "",
        applyTimes: applyTimes,
        reduceFile: ""
    };
    logger.debug('[SOAP-PushOrder '+ orderNo +'] Args: '+ JSON.stringify(args));
    if (!config.istest) {
        soap.createClient(url, function(err, client) {
            client.get_QRCode_Feedback_Info(args, function(err, result) {
                if (err) {
                    logger.warn(err);
                } else {
                    logger.debug(result);
                }
            });
        });
    }
}