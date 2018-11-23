/**
 * Created by youngs1 on 7/19/16.
 */

var mongoose  = require('mongoose');
var Schema    = mongoose.Schema;
var _ = require('lodash');

var FTPSchema = new Schema({
    type: { type: String},
    host: { type: String, default: 'localhost'},
    port: { type: Number, default: 21},
    user: { type: String},
    pass: { type: String},
    code: { type: String},
    disabled: {type: Boolean, default: false}
},{ collection: 'ftpinfo' });

mongoose.model('FTP', FTPSchema);