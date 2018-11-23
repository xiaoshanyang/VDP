var fs = require('fs'),
    soap = require('soap'),
    http = require('http'),
    logger = require('./common/logger'),
    Logs = require('./proxy').Logs;
var config = require('./config');
var pushOrder = require('./api/SOAP/pushorder');
var PushSplit = require('./api/SOAP/pushsplit');
var PushDefect = require('./api/SOAP/pushdefect');
var PushRoll = require('./api/SOAP/pushroll');
var PushMatter = require('./api/SOAP/matterinfo');
var PushClient = require('./api/SOAP/clientinfo');
var PushVDPRoll = require('./api/SOAP/pushvdproll');
var configFile  = 'config.json';

require('./app');

var ws_port = 8080,
    ws_path = '/v1/soap',
    //hostname = '192.168.0.37';
    //hostname = '192.168.6.31';
    hostname = 'localhost';
    // hostname = 'vdp-api.greatviewpack.org';

var VDPService = {
    VdpApiService: {
        VdpApiPort: {
            PushOrder: function(args, cb, soapHeader) {
                /* saleNum,orderID,customerCode,productCode,vdpType,codeURL,planCount,multipleNum,
                splitSpec,designID,vdpVersion,orderNum,factoryCode,lineCode,webNum,pushMESDate,customerOrderNum */
                // 记录接口日志
                logger.debug('Received a SOAP request from MES. Call: PushOrder Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushOrder Args:'+ JSON.stringify(args), 'system', '0');
                // 验证参数
                if(args.vdpType == '1'){//可变图的情况,设置默认url值
                    args.codeURL = ' ';
                }
                //splitSpec、webNum 两个值取品类中的值，不采用mes传送的值，取消他们的非空判断
                if ([args.saleNum, args.orderId, args.customerCode,
                        args.vdpType, args.productCode,
                        //args.planCount, args.multipleNum, args.splitSpec,
                        args.planCount, args.multipleNum,
                        args.designId, args.orderNum, args.factoryCode, args.lineCode,
                        //args.webNum, args.pushMESDate].some(function (item) { return item === ''; })) {
                        args.pushMESDate].some(function (item) { return item === ''; })) {
                    logger.error('[SOAP-PushOrder '+ args.orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null');
                    Logs.addLogs('system', '[SOAP-PushOrder '+ args.orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null. Args:' + JSON.stringify(args), 'system', '2');
                    return {return: false};
                }
                if (args.vdpType == '1' || args.vdpType == '2') {
                    if (args.vdpVersion == '') {
                        logger.error('[SOAP-PushOrder '+ args.orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null');
                        Logs.addLogs('system', '[SOAP-PushOrder '+ args.orderId +'] Received a SOAP request from MES. Call: PushOrder Args has Null', 'system', '2');
                        return {return: false};
                    }
                }
                // 调用pushOrder方法开始处理请求
                pushOrder.pushOrder(args);
                return {return: true};
            },

            PushSplit: function(args, cb, soapHeader) {
                logger.debug('Received a SOAP request from MES. Call: PushSplit Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushSplit Args:'+ JSON.stringify(args), 'system', '0');
                // 验证参数
                if ([args.orderId, args.rollNum, args.rollCode, args.webNum].some(function (item) { return item === ''; })) {
                    logger.error('Received a SOAP request from MES. Call: PushSplit Args has Null');
                    Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushSplit Args has Null', 'system', '2');
                    return {return: false};
                }
                // 偶数判断
                var arrCode = args.rollCode;
                arrCode = arrCode.split(',');
                if (arrCode.length % 2 == 0) {
                    // 加了一个callback函数， 这个是对应 通过web请求 访问分切接口的情况，实际在webservice接口部分，没有意义
                    PushSplit.pushSplit(args, function (err, rs) {
                        console.log(rs);
                    });
                    return {return: true};
                } else {
                    logger.error('Received a SOAP request from MES. Call: PushSplit rollCode not Even numbers.');
                    Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushSplit rollCode not Even numbers.', 'system', '2');
                    return {return: false};
                }
            },

            PushDefects: function(args, cb, soapHeader) {
                logger.debug('Received a SOAP request from MES. Call: PushSequences Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushSequences Args:'+ JSON.stringify(args), 'system', '0');
                // 验证参数
                if ([args.scanSequences].some(function (item) { return item === ''; })) {
                    logger.error('Received a SOAP request from MES. Call: PushSequences Args has Null');
                    Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushSequences Args has Null', 'system', '2');
                    return {return: false};
                }
                // 偶数判断
                var arrCode = args.scanSequences;
                arrCode = arrCode.split(',');
                if (arrCode.length % 2 == 0) {
                    PushDefect.pushDefect(args, function (err, rs) {
                        console.log(err);
                        console.log(rs);
                    });
                    return {return: true};
                } else {
                    logger.error('Received a SOAP request from MES. Call: PushSequences rollCode not Even numbers.');
                    Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushSequences rollCode not Even numbers.', 'system', '2');
                    return {return: false};
                }
            },

            PushRoll: function(args, cb, soapHeader) {
                logger.debug('Received a SOAP request from MES. Call: PushRoll Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushRoll Args:'+ JSON.stringify(args), 'system', '0');
                // 验证参数
                if ([args.orderId, args.rollNum, args.startCode, args.endCode].some(function (item) { return item === ''; })) {
                    logger.error('Received a SOAP request from MES. Call: PushRoll Args has Null');
                    Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushRoll Args has Null', 'system', '2');
                    return {return: false};
                }
                PushRoll.pushRoll(args, function (err, rs) {
                    console.log(rs);
                });
                return {return: true};
            },

            PushVDPRoll: function(args, cb, soapHeader) {
                logger.debug('Received a SOAP request from MES. Call: PushVDPRoll Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushVDPRoll Args:'+ JSON.stringify(args), 'system', '0');
                // 验证参数
                //if ([args.orderId, args.VDPRoll, args.SentTime, args.FactoryId, args.Operator, args.OutDlCode, args.Counts].some(function (item) { return item === ''; })) {
                if ([args.orderId, args.VDPRoll, args.SentTime, args.Operator, args.OutDlCode, args.Counts].some(function (item) { return item === ''; })) {
                    logger.error('Received a SOAP request from MES. Call: PushVDPRoll Args has Null');
                    Logs.addLogs('system', 'Received a SOAP request from MES. Call: PushVDPRoll Args has Null', 'system', '2');
                    return {return: false};
                }
                PushVDPRoll.PushVDPRoll(args);
                return {return: true};
            },

            MatterInformation: function(args, cb, soapHeader) {
                logger.debug('Received a SOAP request from ERP. Call: MatterInformation Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from ERP. Call: MatterInformation Args:'+ JSON.stringify(args), 'system', '0');
                if ([args.arg1, args.arg2].some(function (item) { return item === ''; })) {
                    logger.error('Received a SOAP request from ERP. Call: MatterInformation Args has Null');
                    Logs.addLogs('system', 'Received a SOAP request from ERP. Call: MatterInformation Args has Null', 'system', '2');
                    return {return: false};
                }
                PushMatter.pushData(args);
                return {return: true};
            },

            ClientInfo: function(args, cb, soapHeader, req) {
                //var ip = req.headers['x-forwarded-for'] ||
                //    req.connection.remoteAddress ||
                //    req.socket.remoteAddress ||
                //    req.connection.socket.remoteAddress;
                //ip = ip.replace('::ffff:','');
                //logger.debug('CB is: '+ cb);
                //logger.debug('ip is: '+ ip);
                logger.debug('Received a SOAP request from ERP. Call: ClientInfo Args:'+ JSON.stringify(args));
                Logs.addLogs('system', 'Received a SOAP request from ERP. Call: ClientInfo Args:'+ JSON.stringify(args), 'system', '0');
                if ([args.arg1, args.arg2].some(function (item) { return item === ''; })) {
                    logger.error('Received a SOAP request from ERP. Call: ClientInfo Args has Null');
                    Logs.addLogs('system', 'Received a SOAP request from ERP. Call: ClientInfo Args has Null', 'system', '2');
                    return {return: false};
                }
                PushClient.pushData(args);
                return {return: true};
            },

            ReceiveConfigInfo: function (args, cb, soapHeader) {
                logger.debug('Received a SOAP request from VDP. Call: ConfigInfo Args:'+ JSON.stringify(args));
                config.interface_opts = args.config.interface_opts;
                fs.writeFile(configFile, JSON.stringify(config, null, 4));
                return {return: true};
            },

            TestSoapInterface: function (args, cb, soapHeader) {
                console.log(args);
                logger.debug('Received a SOAP request from VDP. Call: TestSoapInterface Args:'+ JSON.stringify(args));
                return {return: true};
            }
        }
    }
};

var xml = fs.readFileSync('vdpservice_ERP.wsdl', 'utf8'),
    server = http.createServer(function(req, res) {
        res.end('404: Not Found:'+ req.url);
    });


server.listen(ws_port);
soap.listen(server, ws_path, VDPService, xml);

logger.info('VDP WebApp_Service listening on port', ws_port);
logger.warn('Wanna date me? ...');
logger.info('You can debug your app with http://' + hostname + ':' + ws_port + ws_path +'?wsdl');
logger.info();
