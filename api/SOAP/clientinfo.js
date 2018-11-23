/**
 * Created by youngs1 on 8/26/16.
 */
var Customer = require('../../proxy').Customer;
var logger   = require('../../common/logger');
var Logs     = require('../../proxy').Logs;

exports.pushData = function (args) {
    var clientId = args.arg0,
        clientNumber =  args.arg1 || '',
        clientName =  args.arg2 || '',
        clientreviation = args.arg3,
        clientAdd = args.arg4,
        Addreviation = args.arg5,
        contacts = args.arg6,
        contactsTel = args.arg7,
        contactsCell = args.arg8,
        editinNumber = args.arg9,
        clientStatus = args.arg10,
        maintainer = args.arg11,
        Field1 = args.arg12,
        Field2 = args.arg13,
        Field3 = args.arg14,
        Field4 = args.arg15,
        Field5 = args.arg16,
        Field6 = args.arg17,
        Field7 = args.arg18,
        Field8 = args.arg19,
        Field9 = args.arg20,
        Field10 = args.arg21,
        Field11 = args.arg22,
        Field12 = args.arg23,
        Field13 = args.arg24,
        Field14 = args.arg25,
        Field15 = args.arg26;
    if ([clientNumber, clientName].some(function (item) { return item === ''; })) {
        return ;
    };
    var data = {
        client_id: clientId,
        client_number: clientNumber,
        client_name: clientName,
        client_reviation: clientreviation,
        client_add: clientAdd,
        add_reviation: Addreviation,
        contacts: contacts,
        contacts_tel: contactsTel,
        contacts_cell: contactsCell,
        editin_number: editinNumber,
        client_status: clientStatus,
        maintainer: maintainer,
        Field1: Field1,
        Field2: Field2,
        Field3: Field3,
        Field4: Field4,
        Field5: Field5,
        Field6: Field6,
        Field7: Field7,
        Field8: Field8,
        Field9: Field9,
        Field10: Field10,
        Field11: Field11,
        Field12: Field12,
        Field13: Field13,
        Field14: Field14,
        Field15: Field15
    };
    // 查询数据库中是否存在相同的客户，存在更新，不存在新增
    Customer.getCustomerByNumber(data.client_number, function(err, rs) {
        if (!err) {
            if (rs) {
                //更新
                data.isVDP = rs.isVDP || false;
                Customer.updateCustomer({'client_number':data.client_number}, data, function (err, m_rs) {
                    if(err){
                        logger.error('[SOAP-UpdateCustomer] '+clientNumber+' Unexpected ERROR: '+ err);
                        Logs.addLogs('system', '[SOAP-UpdateCustomer] '+clientNumber+' Unexpected ERROR: '+ err, 'system', '2');
                        return;
                    }
                    logger.debug('[SOAP-UpdateCustomer] update is OK. DATA: ' + data.client_number +' '+data.client_name );
                    Logs.addLogs('system', '[SOAP-UpdateCustomer] update is OK. DATA: ' + data.client_number +' '+data.client_name , 'system', '0');

                });

                //第二种方法 直接修改rs,然后保存

            } else {
                //新增
                Customer.newAndSave(data.client_number, data.client_name, data.client_reviation, data.client_add,
                    data.add_reviation, data.contacts, data.contacts_tel, data.contacts_cell, data.editin_number,
                    data.client_status, data.maintainer, data.Field1, data.Field2, data.Field3, data.Field4, data.Field5,
                    data.Field6, data.Field7, data.Field8, data.Field9, data.Field10, data.Field11, data.Field12, data.Field13,
                    data.Field14, data.Field15, data.isVDP, function (err, in_rs) {
                        if(err){
                            logger.error('[SOAP-AddCustomer] '+clientNumber+' Unexpected ERROR: '+ err);
                            Logs.addLogs('system', '[SOAP-UpdateCustomer] '+clientNumber+' Unexpected ERROR: '+ err, 'system', '2');
                            return;
                        }
                        logger.debug('[SOAP-AddCustomer] add is OK. DATA: ' + data.client_number +' '+data.client_name );
                        Logs.addLogs('system', '[SOAP-AddCustomer] add is OK. DATA: ' + data.client_number +' '+data.client_name , 'system', '0');

                    });
            }
        }
    });

}