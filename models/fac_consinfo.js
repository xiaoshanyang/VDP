/**
 * Created by lxrent on 16/10/26.
 */

var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;

var ConsinfoSchema = new Schema({
    consDate: {type:String},
    consInfo: []
    //name : {type: String}
},{collection: 'fac_consinfo' });

ConsinfoSchema.index({consDate:-1},{unique: true});

mongoose.model('FacConsInfo', ConsinfoSchema);