/**
 * Created by youngs1 on 7/21/16.
 */

var validator       = require('validator');
var eventproxy      = require('eventproxy');

var moment          = require('moment');
var logger          = require('../common/logger');
var tools           = require('../common/tools');

var QRCode          = require('../proxy').QRCode;
var Roll            = require('../proxy').Roll;
var QRcode_apply    = require('../proxy').QRCodeApply;
var Category        = require('../proxy').Category;


exports.Search = function (req, res, next) {
    var Concent = req.query.concent;
    //var Concent = req.body.concent;
    Concent = Concent.split(' ');
    var Result = {};

    var ep = new eventproxy();
    ep.fail(next);

    Concent.forEach(function (v) {
        var query = {};
        if (v !== '') {
            if (validator.isNumeric(v)) {
                query.serialNum = v;
            } else {
                if (v.length == 26) {
                    query.content = v;
                } else {
                    query.batch = v;
                }
            }
            QRCode.getQRCodeByQuery(query, '', ep.done('qrcode_ok'));
        }
    });

    ep.after('qrcode_ok', Concent.length, function(docs) {
        docs.forEach(function (v) {

            Roll.getRollByCode(v[0].serialNum, ep.done(function(rss) {
                Result.rollinfo = rss;
            }));
            ep.emit('roll_ok');
        });
    });

    ep.after('roll_ok', Concent.length, function(docs){
        res.send(docs);
    });

};

exports.download = function (req, res, next) {
    var date = req.body.dateTime || '';
   // var customer = req.body.customer || '';
    var category = req.body.category || '';
    var name = [];
    var categoryId = [];
    var category_name = [];
    var query = {
        state:1
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

        query.create_at = {};
        query.create_at.$gte = date;
        query.create_at.$lt = nextDate;
    }

    if(category.length > 0){
        if(!(category instanceof Array)){
            category = [category];
        }
        category.forEach(function (c) {
            c = c.split('_');
            categoryId.push(c[0]);
            category_name.push(c[1]);

        });
        query.categoryId = {};
        query.categoryId.$in = categoryId;
    }

    var ep = new eventproxy();
    ep.fail(next);

    ep.all('get_QRcode_apply', 'get_count', 'get_category', function (QRcode_apply, count) {

        var pages = Math.ceil(count / perpage);
        QRcode_apply.forEach(function (r) {
            var index = categoryId.indexOf(r.categoryId.toString());
            if(index>=0){
                r.name = category_name[index];
            }
            r.formatDate = tools.formatDate(r.create_at, false);
            r.dbCount = (r.dbCount/1000).toFixed(3);
            r.dlCount = (r.dlCount/1000).toFixed(3);
        });

        res.render('qrcode/apply',{
            i18n: res,
            Query:{
                DateTime:date,
                Category:req.body.category || ''
            },
            QRcodeApplyList:QRcode_apply,
            QRcodeApplyPage: {
                all_logs_count: count,
                perPage: perpage,
                current_page: page,
                pages: pages
            }
        });
    });

    QRcode_apply.getQRCodeApplyByQuery(query, options, ep.done('get_QRcode_apply'));
    QRcode_apply.getCountByQuery(query, ep.done('get_count'));
    Category.getCategoryByQuery({}, '', function (err, rs) {
        if(err)
        {
            logger.error('get category name err. Err: ' + err);
        }
        rs.forEach(function (r) {
            categoryId.push(r._id.toString());
            category_name.push(r.name);
        });
        ep.emit('get_category');
    })

};