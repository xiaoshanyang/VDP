/**
 * Created by youngs1 on 7/19/16.
 */
var models = require('../models');
var Materiel = models.Materiel;
var logger = require('../common/logger');

exports.updateMateriel = function (filter, update, callback) {
    Materiel.update(filter, update, { multi: true }, callback);
};

exports.getMaterielByNumber = function (number, callback) {
    if (!number) {
        return callback();
    }
    Materiel.findOne({materiel_number: number}, callback);
};

exports.getMaterielByQuery = function (query, opt, callback) {
    Materiel.find(query, '', opt, callback);
};

exports.newAndSave = function (materiel_id, materiel_number, materiel_name, unit, materiel_abbreviation,
                               materiel_norms, norms_code, materiel_code, materiel_small_class,
                               materiel_big_class, materiel_edition, materiel_status, maintainer, bar_code_serial,
                               org_id, Field1, Field2, Field3, Field4, Field5, Field6, Field7, Field8, Field9, Field10,
                               Field11, Field12, Field13, Field14, Field15, push_tag, callback) {
    var materiel = new Materiel();
    materiel.materiel_id = materiel_id;
    materiel.materiel_number = materiel_number;
    materiel.materiel_name = materiel_name;
    materiel.unit = unit;
    materiel.materiel_abbreviation = materiel_abbreviation;
    materiel.materiel_norms = materiel_norms;
    materiel.norms_code = norms_code;
    materiel.materiel_code = materiel_code;
    materiel.materiel_small_class = materiel_small_class;
    materiel.materiel_big_class = materiel_big_class;
    materiel.materiel_edition = materiel_edition;
    materiel.materiel_status = materiel_status;
    materiel.maintainer = maintainer;
    materiel.bar_code_serial = bar_code_serial;
    materiel.org_id = org_id;
    materiel.Field1 = Field1;
    materiel.Field2 = Field2;
    materiel.Field3 = Field3;
    materiel.Field4 = Field4;
    materiel.Field5 = Field5;
    materiel.Field6 = Field6;
    materiel.Field7 = Field7;
    materiel.Field8 = Field8;
    materiel.Field9 = Field9;
    materiel.Field10 = Field10;
    materiel.Field11 = Field11;
    materiel.Field12 = Field12;
    materiel.Field13 = Field13;
    materiel.Field14 = Field14;
    materiel.Field15 = Field15;
    materiel.push_tag = push_tag;
    materiel.save(callback);
}
