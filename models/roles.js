/**
 * Created by youngs1 on 6/14/16.
 */

var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var utility   = require('utility');
var _ = require('lodash');


var RolesSchema = new Schema({
    name: { type: String},
    permissions: []
});

mongoose.model('Roles', RolesSchema);