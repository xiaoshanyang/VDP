/**
 * Created by youngs1 on 6/25/16.
 */

var validator       = require('validator');
var eventproxy      = require('eventproxy');
var Customer        = require('../proxy').Customer;
var Logs            = require('../proxy').Logs;

exports.index = function (req, res, next) {

    var isVDP = req.body.isVDP || '';
    var client_name = req.body.client_name || '';
    var query = {};
    var perpage = parseInt(req.body.prePage) || 10;
    var page = parseInt(req.body.page, 10) || 1;

    page = page > 0 ? page : 1;
    if (isVDP !== '') {
        query.isVDP = isVDP;
    }
    if (client_name !== '') {
        //query.$text = {};
        //query.$text.$search = client_name;
        if (validator.isNumeric(client_name)) {
            query.client_number = client_name;
        } else {
            query.client_name = {};
            query.client_name.$regex = eval('/'+ client_name +'/');
        }
    }
    var options = { skip: (page - 1) * perpage, limit: perpage, sort: '-isVDP'};

    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_customer', 'get_count', function (customer, count) {
        if (!customer) {
            return next();
        }
        var pages = Math.ceil(count / perpage);

        res.render('customers/customers',{
            i18n: res,
            customerList: customer,
            customerSearch: {
                isVDP: isVDP,
                client_name: client_name
            },
            customerPage: {
                all_logs_count: count,
                perPage: perpage,
                current_page: page,
                pages: pages
            }
        });
    });
    // 获得日志列表
    Customer.getCustomerByQuery(query, options, ep.done('get_customer'));
    Customer.getCountByQuery(query, ep.done('get_count'));
};

exports.setOneCode = function (req, res, next) {
    var reqValue = req.body.value;
    var reqOneCode = req.body.onecode || true;

    var ep = new eventproxy();
    ep.fail(next);
    ep.on('update_err', function (msg) {
        res.status(422);
        res.send(msg);
    });
    // 验证信息的正确性
    if (reqValue === '') {
        return ep.emit('update_err', res.__('missing data'));
    }

    var filter = {};
    var update = {};
    filter.client_number = {};
    filter.client_number.$in = reqValue;
    update.isVDP = reqOneCode;

    Customer.updateCustomer(filter, update, function(err, data){
        if (err) {
            return next(err);
        }
        Logs.addLogs('users', 'Set Customer to OneCode: '+ JSON.stringify(reqValue), req.session.user.name, '0');
        res.send({success: true, reload: true});
    });

};

exports.getCustomer = function (req, res, next) {
    var query = {};
    query.isVDP = true;
    Customer.getCustomerForSelect(query,'client_number client_name', function(err, data) {
        if (err) {
            return next(err);
        }
        res.send(data);
    });
};