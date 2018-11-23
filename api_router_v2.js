/**
 * Created by youngs1 on 6/15/16.
 */
var config = require('./config');
var logger = require('./common/logger');
var pushOrder = require('./api/SOAP/pushorder');
var pushSplit = require('./api/SOAP/pushsplit');
var pushRoll = require('./api/SOAP/pushroll');
var Order = require('./proxy').Order;
var http = require('http');
//因为使用 express 需要设置一些中间件，直接创建web服务
//开发这个服务，给61调用，然后，回调pushorder函数
//参数：工单号、或者 是 62 临时表中的id号
var server = http.createServer(function(request, response) {
    var postData = "";
    request.setEncoding("utf8");
    request.addListener("data", function(postDataChunk) {
        postData += postDataChunk;
        console.log("Received POST data chunk '"+ postDataChunk + "'.");
    });
    request.addListener("end", function() {
        postData = JSON.parse(postData);
        var orderId = postData.orderId || 0;
        var state = postData.state || 2;    // 1成功 、2失败
        var message = postData.message || '';
        if(orderId != 0 && state == 1){
            // 执行工单, 返回给61 返回值
            response.write('[SOAP-PushOrder '+ orderId +'] apply code success. order continue executing');
            response.end();
        }else{
            response.write('[SOAP-PushOrder '+ orderId +'] apply code fail. order fail.ERR:' + message);
            response.end();
        }
        // 开始调用， 工单生成 的接口， 完成工单, 在调用pushorder 接口，重新来一次
        Order.getOrderByQuery({orderId: orderId.split('-')[0], orderNum: orderId.split('-')[1]}, '', function (err, rs) {
            if(err){

            }
            rs[0].state = 4;
            rs[0].planCount = rs[0].planCount / 1000;
            console.log(rs[0].planCount);
            rs[0].save(function () {
                pushOrder.pushOrder(rs[0]);
            });
        });
    });
});
server.on('startOrder', function(err, socket) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
server.listen(8088);

//新建一个web服务，mes调用， 推送分切信息， 返回分切计算结果(成功、失败)
var splitServer = http.createServer(function (req, res) {
    logger.error('---------------------------------start---------------------------------');
    var postData = "";
    req.setEncoding("utf8");
    req.addListener("data", function(postDataChunk) {
        postData += postDataChunk;
        console.log("Received POST data chunk '"+ postDataChunk + "'.");
    });
    req.addListener("end", function() {
        postData = JSON.parse(postData);    //postData 接收到的参数信息
        // 延用之前的接头函数
        pushSplit.pushSplit(postData, function(err, rs){       //添加一个回调函数， 在计算到小卷结果时，回调， 返回结果
            if(err){
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end(JSON.stringify(err));
            }else{
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end(JSON.stringify(rs));
            }
            logger.error('---------------------------------end---------------------------------');
        });
    });
});
splitServer.on('pushSplit', function(err, socket) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
splitServer.listen(8089);

logger.info('VDP orderCodeApply listening on port', 8088);
logger.info('You can debug your app with http://localhost:' + 8088 + '/startOrder');
