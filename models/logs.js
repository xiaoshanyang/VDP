/**
 * Created by youngs1 on 6/14/16.
 */

var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var utility   = require('utility');
var _ = require('lodash');


var LogsSchema = new Schema({
    opstype: { type: String},
    todo: { type: String},
    opsname: { type: String, default: 'system'},
    create_at: { type: Date, default: Date.now },
    state: { type: Number, default: 1 }
});

LogsSchema.plugin(BaseModel);

LogsSchema.index({create_at: -1});

mongoose.model('Logs', LogsSchema);