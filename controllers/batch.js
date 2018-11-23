/**
 * Created by lxrent on 16/11/4.
 */
var eventproxy      = require('eventproxy');
var moment          = require('moment');
var Order           = require('../proxy').Order;
var Materiel        = require('../proxy').Materiel;
var Customer        = require('../proxy').Customer;
var Category        = require('../proxy').Category;
var Qrcode          = require('../proxy').QRCode;
var tool            = require('../common/tools');

exports.index = function (req, res, next) {
    var date = req.body.dateTime || '';
    var factory = req.body.factory || '';
    var line_no = req.body.line_no || '';
    var client = req.body.client_name || '';
    var category = req.body.category || '';
    var customer_name = []; //存储客户名
    var category_name = []; //存储品类名 方便从品类名->_id
    var categoryId = [];
    var customerCode = [];
    var orderId = req.body.orderId || '';
    var qrcode = req.body.qrcode || '';
    var query = {
        vdpType:{$in:[0,1,2,3,4]}
    };

    var requst = {
        dateTime:date,
        factory:factory,
        line_no:line_no,
        client_name:client,
        category:category,
        orderId:orderId,
        qrcode:qrcode
    };
    var perpage = parseInt(req.body.prePage) || 10;
    var page = parseInt(req.body.page, 10) || 1;
    page = page > 0 ? page : 1;
    //跳过前边的页数包含的条数,只返回当前页面的值
    var options = { skip: (page - 1) * perpage, limit: perpage, sort: '-_id'};

    if(date!==''){
        date = new Date(date);
        date = moment(date);
        date = date.format('YYYY-MM-DD');

        var nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate()+1);
        nextDate = moment(nextDate);
        nextDate = nextDate.format('YYYY-MM-DD');

        query.pushPrintDate = {};
        query.pushPrintDate.$gte = date;
        query.pushPrintDate.$lt = nextDate;
    }
    if(factory !== ''){
        if(!(factory instanceof Array)){
            factory = [factory];
        }
        query.factoryCode = {};
        query.factoryCode.$in = factory;
    }
    if(line_no !== ''){
        if(line_no.indexOf(',')>=0){
            line_no = line_no.replace(new RegExp(',','gm'),' ');
        }
        line_no = line_no.split(' ');
        query.lineCode = {};
        query.lineCode.$in = line_no;
    }
    if(client.length > 0){
        if(!(client instanceof Array)){
            client = [client];
        }
        client.forEach(function (c) {
           c = c.split('_');
           customerCode.push(c[0]);
           customer_name.push(c[1]);
        });
        query.customerCode = {};
        query.customerCode.$in = customerCode;
    }
    if(category.length > 0){
        if(!(category instanceof Array)){
            category = [category];
        }
        category.forEach(function (c) {
            c = c.split('_');
            categoryId.push(c[0]);
            //category_name.push(c[1]);

        });
        query.categoryId = {};
        query.categoryId.$in = categoryId;
    }
    if(orderId !== ''){ //replace 只能替换第一个逗号,后边的不行
        if(orderId.indexOf(',')>=0){
            orderId = orderId.replace(new RegExp(',','gm'),' ');
        }
        orderId = orderId.split(' ');
        query.orderId = {};
        orderId.forEach(function (r, index) {
            if(isNaN(parseInt(r))){
                orderId[index] = null;
            }
        });
        query.orderId.$in = orderId;
    }

    var ep = new eventproxy();
    ep.fail(next);

    if(qrcode !== ''){
        qrcode = qrcode.trim();
        if(qrcode.indexOf(',')>=0){
            qrcode = qrcode.replace(new RegExp(',','gm'),' ');
        }
        qrcode = qrcode.split(' ');
        for(var i=0; i<qrcode.length; i++){
            if(qrcode[i] == ''){
                qrcode.splice(i--, 1);
            }
        }
        qrcode.forEach(function (q) {
            Qrcode.getQRCodeByCode(q, function (err, rs) {
                if(err){
                    next(err);
                    return ep.emit('getQrcode_ok');;
                }
                if(rs==null){
                    return ep.emit('getQrcode_ok');;
                }
                if(orderId === ''){
                    query.orderId = {};
                    orderId = [];
                }

                if(orderId.indexOf(rs.orderId)>=0){

                }else{
                    orderId.push(rs.orderId);
                }

                ep.emit('getQrcode_ok');
            });

        });
    }

    ep.after('getQrcode_ok', (qrcode==='')?1:qrcode.length, function () {
        if(orderId == '' && qrcode.length>0){
            return errandnull();
        }
        if(orderId !== ''){
            query.orderId.$in = orderId;
        }
        Order.getOrderByQuery(query, options, function (err, rs) {
            if(err){
                next(err);
                return errandnull();
            }
            var materials = [];
            var i=0;
            var orders = [];
            categoryId=[];
            rs.forEach(function (r) {
                var a = i++;
                ep.all('r'+a, function () {
                    ep.all('get_Customer'+a, 'get_Category'+a, 'get_Material'+a, function (customer, category, productCode) {
                        if(!customer){
                            customer = '空';
                        }else if(!category){
                            category = '空';
                        }else if(!productCode){
                            productCode = '空';
                        }
                        r.customerCode = (typeof customer == "string")?customer:customer.client_reviation;
                        r.categoryName = (typeof category == "string")?category:category.name;
                        r.productCode =  (typeof productCode == "string")?productCode:productCode.materiel_name.substring(0,productCode.materiel_name.indexOf(';'));
                        if(typeof category !== "string"){
                            category_name.push(r.categoryName);
                        }
                        if(typeof customer !== "string"){
                            customer_name.push(r.customerCode);
                        }
                        if(typeof productCode !== "string"){
                            materials.push(r.productCode);
                        }
                        if(r.state==1){
                            if(typeof r.fileName == 'undefined'){
                                r.fileName = "可变图，使用工厂保留打印文件";
                            }else{
                                r.fileName = r.fileName.substring(r.fileName.lastIndexOf('/')+1,r.fileName.length);
                            }

                            r.sendState = "成功";
                        }else{
                            r.fileName = "";
                            r.sendState = (r.state==0 || r.state==3 || r.state==4)?"生成中……":"失败";
                        }
                        r.dateTime = tool.formatDate(r.pushPrintDate,false);
                        r.dateTimeJustHHmm = tool.formatDateJustHHmm(r.pushPrintDate);
                        r.planCount =  (r.planCount/1000).toFixed(3);
                        r.actCount =  (r.actCount/1000).toFixed(3);
                        // r.qrType = r.vdpType == 0?(r.categoryName.indexOf('角标码')>=0?"角标码":(r.categoryName.indexOf('底标码')>=0?"底标码":"可变码"))
                        //                     :(r.vdpType == 1?"可变图":(r.vdpType == 2?"可变图码":"折角码"));
                        orders.push(r);
                        ep.emit('r'+(a+1));
                    });
                    var customer_index = customerCode.indexOf(r.customerCode);

                    if(customer_index>=0){
                        ep.emit('get_Customer'+a,customer_name[customer_index]);
                    }else{
                        customerCode.push(r.customerCode);
                        if(isNaN(parseInt(r.customerCode))){
                            ep.emit('get_Customer'+a,"客户号_"+r.customerCode);
                        }else{
                            Customer.getCustomerByNumber(r.customerCode, ep.done('get_Customer'+a));
                        }
                    }
                    var category_index = categoryId.indexOf(r.categoryId.toString());
                    if(category_index>=0){
                        ep.emit('get_Category'+a,category_name[category_index]);
                    }else{
                        categoryId.push(r.categoryId.toString());
                        Category.getCategoryById(r.categoryId, ep.done('get_Category'+a));
                    }
                    //获得物料名
                    if(materials.indexOf(r.productCode)>=0){
                        ep.emit('get_Material'+a, materials[materials.indexOf(r.productCode)+1]);
                    }else{
                        materials.push(r.productCode);
                        if(isNaN(parseInt(r.productCode))){
                            ep.emit('get_Material'+a,"物料号_"+r.productCode);
                        }else{
                            Materiel.getMaterielByNumber(r.productCode, ep.done('get_Material'+a));
                        }
                    }
                });
            });
            var str = 'r'+rs.length;
            ep.all(str, function(){
                ep.emit('getOrders_ok',orders);
            });
            ep.emit('r0');
        });
        Order.getCountByQuery(query, ep.done('getOrderCount_ok'));
    });

    ep.all('getOrders_ok','getOrderCount_ok', function (orders, count) {
        var pages = Math.ceil(count / perpage);

        res.render('batch/batch', {
            i18n: res,
            OrderList:orders,
            Query:requst,
            OrdersPage: {
                all_logs_count: count,
                perPage: perpage,
                current_page: page,
                pages: pages
            }
        });
    });

    if(qrcode === ''){
        ep.emit('getQrcode_ok');
    }

    function errandnull() {
        ep.emit('getOrders_ok', []);
        ep.emit('getOrderCount_ok', 0);
    }
};