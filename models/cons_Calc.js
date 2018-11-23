
/**
 * Created by fengyu on 16/11/7.
 */


var mongoose =require('mongoose');

var Schema=mongoose.Schema;

var consCalc=new Schema({

        uploadDate: {type:Date},
        lindId: {type: String},
        customerFact:String,
        consNum:Number,
        consNumerr:Number,
        consFileName: {type: String}

    }
,{collection:'consTbl'}

);

consCalc.index({customerFact:-1});
consCalc.index({uploadDate:-1});

mongoose.model('cons_Calc',consCalc);