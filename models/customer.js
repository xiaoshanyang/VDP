/**
 * Created by youngs1 on 6/14/16.
 */

var mongoose  = require('mongoose');
var Schema    = mongoose.Schema;
var utility   = require('utility');
var _ = require('lodash');


var CustomerSchema = new Schema({
    client_id: { type: String},
    client_number: { type: Number},
    client_name: { type: String},
    client_reviation: { type: String},
    client_add: { type: String},
    add_reviation: { type: String},
    contacts: { type: String},
    contacts_tel: { type: String},
    contacts_cell: { type: String},
    editin_number: { type: String},
    client_status: { type: String},
    maintainer: { type: String},
    Field1: { type: String},
    Field2: { type: String},
    Field3: { type: String},
    Field4: { type: String},
    Field5: { type: String},
    Field6: { type: String},
    Field7: { type: String},
    Field8: { type: String},
    Field9: { type: String},
    Field10: { type: String},
    Field11: { type: String},
    Field12: { type: String},
    Field13: { type: String},
    Field14: { type: String},
    Field15: { type: String},
    isVDP: { type: Boolean, default: false}
},{ collection: 'customer' });

CustomerSchema.index({ client_number: -1 });

mongoose.model('Customer', CustomerSchema);