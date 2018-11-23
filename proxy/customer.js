/**
 * Created by youngs1 on 7/1/16.
 */
var models = require('../models');
var Customer = models.Customer;

exports.getCustomerByQuery = function (query, opt, callback) {
    Customer.find(query, '', opt, callback);
};

exports.getCountByQuery = function (query, callback) {
    Customer.count(query, callback);
};

exports.updateCustomer = function (filter, update, callback) {
    Customer.update(filter, update, { multi: true }, callback);
};

exports.getCustomerForSelect = function (query, opt, callback) {
    Customer.find(query, opt, callback);
};

exports.getCustomerByNumber = function (numNumber, callback) {
    if (!numNumber) {
        return callback(numNumber);
    }
    Customer.findOne({client_number: numNumber}, callback);
};

exports.newAndSave = function (client_number, client_name, client_reviation, client_add,
                               add_reviation, contacts, contacts_tel, contacts_cell, editin_number,
                               client_status, maintainer, Field1, Field2, Field3, Field4, Field5,
                               Field6, Field7, Field8, Field9, Field10, Field11, Field12, Field13,
                               Field14, Field15, isVDP, callback) {
    var customer = new Customer();
    customer.client_number = client_number;
    customer.client_name = client_name;
    customer.client_reviation = client_reviation;
    customer.client_add = client_add;
    customer.add_reviation = add_reviation;
    customer.contacts = contacts;
    customer.contacts_tel = contacts_tel;
    customer.contacts_cell = contacts_cell;
    customer.editin_number = editin_number;
    customer.client_status = client_status;
    customer.maintainer = maintainer;
    customer.Field1 = Field1;
    customer.Field2 = Field2;
    customer.Field3 = Field3;
    customer.Field4 = Field4;
    customer.Field5 = Field5;
    customer.Field6 = Field6;
    customer.Field7 = Field7;
    customer.Field8 = Field8;
    customer.Field9 = Field9;
    customer.Field10 = Field10;
    customer.Field11 = Field11;
    customer.Field12 = Field12;
    customer.Field13 = Field13;
    customer.Field14 = Field14;
    customer.Field15 = Field15;
    customer.isVDP = isVDP;
    customer.save(callback);
}