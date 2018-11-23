/**
 * Created by youngs1 on 6/25/16.
 */

var eventproxy      = require('eventproxy');

var Logs            = require('../proxy').Logs;


exports.index = function (req, res, next) {

    var opstype = req.body.logstype || '';
    var state = req.body.logsstate || '';
    var todo = req.body.logsdo || '';
    var opsname = req.body.opsname || '';
    var datestart = req.body.datestart || '';
    var endstart = req.body.endstart || '';
    var query = {};
    var perpage = parseInt(req.body.prePage) || 10;
    var page = parseInt(req.body.page, 10) || 1;
    page = page > 0 ? page : 1;


    if (opstype !== '') {
        query.opstype = opstype;
    }
    if (state !== '') {
        query.state = state;
    }
    if (todo !== '') {
        //query.$text = {};
        //query.$text.$search = todo;
        query.todo = {};
        query.todo.$regex = eval('/'+ todo +'/');
    }
    if (opsname !== '') {
        query.opsname = opsname;
    }

    if (datestart !== '' && endstart !== '') {
        query.create_at = {};
        query.create_at.$gte = datestart+' 00:00:00';
        query.create_at.$lt = endstart+' 23:59:59';
    }

    var options = { skip: (page - 1) * perpage, limit: perpage, sort: '-create_at'};

    //logger.debug(JSON.stringify(query));
    //logger.debug(JSON.stringify(options));

    /*logger.debug(JSON.stringify(req.body));
    logger.debug('Type: '+ opstype);
    logger.debug('State: '+ state);
    logger.debug('Todo: '+ todo);
    logger.debug('Name: '+ opsname);
    logger.debug('SDate: '+ datestart);
    logger.debug('EDate: '+ endstart);
    logger.debug('perPage: '+ perpage);
    logger.debug('Page: '+ page);
    logger.debug('Query: '+ JSON.stringify(query));*/


    var ep = new eventproxy();
    ep.fail(next);
    ep.all('get_logs', 'get_count', function (logs, count) {
        if (!logs) {
            return next();
        }
        var pages = Math.ceil(count / perpage);

        res.render('logs/logs',{
            i18n: res,
            logsList: logs,
            logsSearch: {
                logstype: opstype,
                logsstate: state,
                logsdo: todo,
                opsname: opsname,
                datestart: datestart,
                endstart: endstart
            },
            logsPage: {
                all_logs_count: count,
                perPage: perpage,
                current_page: page,
                pages: pages
            }
        });
    });
    // 获得日志列表
    Logs.getLogsByQuery(query, options, ep.done('get_logs'));
    Logs.getCountByQuery(query, ep.done('get_count'));
};