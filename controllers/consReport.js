/**
 * Created by fengyu on 16/11/10.
 */

var eventproxy      = require('eventproxy');
var logger          = require('../common/logger');
var tools           = require('../common/tools');
var fs              = require('fs');
var cons_Calc_Rep   =require('../proxy').consCalc;

exports.consRecord=function (req,res,next) {

    var uploadDate=req.body.dateTime || '';

    var facName=req.body.fact_name || '';

    var ep=new eventproxy();

    var query={};

    if(uploadDate) {
        query.uploadDate = uploadDate; //query.uploaDate 可视为数组指针，数组实例化自定义变量
    }

    if(facName){

        if(!(facName instanceof Array)) //如果facname是非数组类型，则转换为数组;
        {
           facName=[facName];
        }

        query.customerFact={}; // 此处用来拼接mongo查询条件

        query.customerFact.$in=facName; // mongo $in的查询写法
    }

    var perpage = parseInt(req.body.prePage) || 10;
    var page = parseInt(req.body.page, 10) || 1;
    page = page > 0 ? page : 1;


    var options = { skip: (page - 1) * perpage, limit: perpage, sort: '-_id'};



    var getRow=cons_Calc_Rep.consTblFind_Multi(query,options,function (err,rs) {
                                                    //options：控制数据库 只查询相应的行数，不翻页不会去查询。
        if(err){

            return next(err);

        }else{

            //if(rs.length>0){

                rs.forEach(function (item) {

                    item.FormatDate=tools.formatDateforFile(item.uploadDate); //自引用rs数据库结果集，.字段名的赋值，获取某个字段的值。

                    item.customerFact=transFact(item.customerFact);

                });

                var getcol=cons_Calc_Rep.getConsTblCount(query, function (err,count) {

                    var pages = Math.ceil(count / perpage);

                    if (err) {

                        return next(err);

                        logger.error('Find All_cons_code exception :' + err);
                    }else{

                res.render('consReport/consRep',{  //构造render的json 格式文件,res：response到客户端页面的对象。
                            i18n: res,

                            consSearch:{

                                uploadDate:uploadDate,

                                returnFactname:facName
                            },

                            returnRs:rs, //构造 json格式，rs是结果集，可以直接给将 returRs节点名由 html页面对其进行调用；

                            consPage: {
                                all_logs_count: count,
                                perPage: perpage,
                                current_page: page,
                                pages: pages
                            }

                        });
                    }
                });
            //}
        }

    });

    function transFact(factID) {

        var xmlFile = 'public/report/data.json';
        //data.json 查找工厂对应关系
        var ReportContent=fs.readFileSync(xmlFile,"utf-8");
        ReportContent = JSON.parse(ReportContent);

        var factid=ReportContent.factoryAddress;

        if(typeof (eval('factid._'+factID)) === typeof (undefined) ){   //eval拼接字符串
            factID = 'BJ';   //如果factid是未定义的，默认是BJ的显示
        }

        return eval('factid._'+factID+'.name');

    }


};


