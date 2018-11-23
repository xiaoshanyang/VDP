/**
 * Created by youngs1 on 16/6/1.
 */
var mongoose  = require('mongoose');
var BaseModel = require("./base_model");
var Schema    = mongoose.Schema;
var utility   = require('utility');
var _ = require('lodash');

var UserSchema = new Schema({
    name: { type: String},
    pass: { type: String },
    email: { type: String},
    profile_image_url: {type: String},
    location: { type: String },
    is_block: {type: Boolean, default: false},
    create_at: { type: Date, default: Date.now },
    update_at: { type: Date, default: Date.now },
    role: { type: String },
    active: { type: Boolean, default: false },
    accessToken: {type: String}
});

UserSchema.plugin(BaseModel);

UserSchema.index({name: 1}, {unique: true});
UserSchema.index({email: 1}, {unique: true});
UserSchema.index({accessToken: 1});

mongoose.model('User', UserSchema);