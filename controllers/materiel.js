/**
 * Created by youngs1 on 6/28/16.
 */


var logger          = require('../common/logger');
var models          = require('../models/index');
var Materiel          = models.Materiel;

exports.getMateriel = function (req, res, next) {
    //Materiel.find({"materiel_name" : { $regex: /一包一码/}}, 'materiel_number materiel_name state', '', function(err, data){
    //Materiel.find({"materiel_name" : { $regex: /可变图/}}, 'materiel_number materiel_name state', '', function(err, data){
    //Materiel.find({"materiel_name" : { $regex: /可变图码/}}, 'materiel_number materiel_name state', '', function(err, data){
    //Materiel.find({"materiel_name" : { $regex: /可变码/}}, 'materiel_number materiel_name state', '', function(err, data){
    Materiel.find({"Field1": "1"}, 'materiel_number materiel_name state', '', function(err, data){
        res.send(data);
    });
};

exports.addMateriel = function (req, res, next) {

    Materiel.newAndSave(req.materiel_id, req.materiel_number, req.materiel_name, req.unit, req.materiel_abbreviation,
        req.materiel_norms, req.norms_code, req.materiel_code, req.materiel_small_class,
        req.materiel_big_class, req.materiel_edition, req.materiel_status, req.maintainer, req.bar_code_serial,
        req.org_id, req.Field1, req.Field2, req.Field3, req.Field4, req.Field5, req.Field6, req.Field7, req.Field8,
        req.Field9, req.Field10, req.Field11, req.Field12, req.Field13, req.Field14, req.Field15, req.push_tag,
        function (err, data) {
            if(err){
                logger.error('[SOAP-AddMateriel] '+materiel_number+' Unexpected ERROR: '+ err);
                return;
            }
            logger.debug('[SOAP-AddMateriel] add is OK. DATA: ' + data.materiel_number);

        });
};

exports.index = function (req, res, next) {
    Materiel.find({"Field1": "1"}, '', '', function(err, data){
        if(err){
            return next(err);
        }
        if(data.length>0){
            res.render('materiel/materiel',{
                i18n: res,
                materielList: data
            });
        }

    });
};