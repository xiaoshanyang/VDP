/**
 * Created by youngs1 on 6/28/16.
 */

var mongoose  = require('mongoose');
var Schema    = mongoose.Schema;
var _ = require('lodash');

var MaterielSchema = new Schema({
    id: { type: String },
    materiel_id: { type: String },
    materiel_number: { type: Number },
    materiel_name: { type: String },
    unit: { type: String },
    materiel_abbreviation: { type: String },
    materiel_norms: { type: String },
    norms_code: { type: String },
    materiel_code: { type: String },
    materiel_small_class: { type: String },
    materiel_big_class: { type: String },
    materiel_edition: { type: String },
    materiel_status: { type: String },
    maintainer: { type: String },
    bar_code_serial: { type: String },
    org_id: { type: String },
    Field1: { type: String, default: 0 },
    Field2: { type: String },
    Field3: { type: String },
    Field4: { type: String },
    Field5: { type: String },
    Field6: { type: String },
    Field7: { type: String },
    Field8: { type: String },
    Field9: { type: String },
    Field10: { type: String },
    Field11: { type: String },
    Field12: { type: String },
    Field13: { type: String },
    Field14: { type: String },
    Field15: { type: String },
    push_tag: { type: String },
    state: { type: Number, default: 0 }
},{ collection: 'materiel' });

MaterielSchema.index({ materiel_number: -1 }, {unique: true});

mongoose.model('Materiel', MaterielSchema);