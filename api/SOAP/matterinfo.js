/**
 * Created by youngs1 on 8/26/16.
 */
var materiel = require('../../proxy/').Materiel;
var Category = require('../../proxy').Category;
var logger   = require('../../common/logger');
var Logs     = require('../../proxy').Logs;


exports.pushData = function (args) {
    var matterId = args.arg0,
        matterNumber = args.arg1 || '',
        matterName = args.arg2 || '',
        unit = args.arg3,
        matterAbbreviation = args.arg4,
        matterNorms = args.arg5,
        normsCode = args.arg6,
        matterCode = args.arg7,
        matterSmallClass = args.arg8,
        matterBigClass = args.arg9,
        matteEdition = args.arg10,
        matterStatus = args.arg11,
        maintainer = args.arg12,
        BarCodeSerial = args.arg13,
        org_id = args.arg14,
        Field1 = args.arg15,
        Field2 = args.arg16,
        Field3 = args.arg17,
        Field4 = args.arg18,
        Field5 = args.arg19,
        Field6 = args.arg20,
        Field7 = args.arg21,
        Field8 = args.arg22,
        Field9 = args.arg23,
        Field10 = args.arg24,
        Field11 = args.arg25,
        Field12 = args.arg26,
        Field13 = args.arg27,
        Field14 = args.arg28,
        Field15 = args.arg29;
    if ([matterNumber, matterName].some(function (item) { return item === ''; })) {
        return ;
    };
    var data = {
        materiel_id: matterId,
        materiel_number: matterNumber,
        materiel_name: matterName,
        unit: unit,
        materiel_abbreviation: matterAbbreviation,
        materiel_norms: matterNorms,
        norms_code: normsCode,
        materiel_code: matterCode,
        materiel_small_class: matterSmallClass,
        materiel_big_class: matterBigClass,
        materiel_edition: matteEdition,
        materiel_status: matterStatus,
        maintainer: maintainer,
        bar_code_serial: BarCodeSerial,
        org_id: org_id,
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
    // 查询数据库中是否存在相同的物料，存在更新，不存在新增
    var qrcodeMateriels = ['一包一码', '可变图', '可变码', '可变图码','角标码','底标码','折角码'];
    qrcodeMateriels.forEach(function (m) {
       if(matterName.indexOf(m)>=0){
           data.Field1 = '1';
       }
    });
    materiel.getMaterielByNumber(data.materiel_number, function (err, rs) {
        if(err)
            return;
        if(rs){
            if(rs.Field1 == '1'){
                data.Field1 = '1';
                data.state = rs.state;
            }
            materiel.updateMateriel({materiel_number:data.materiel_number}, data, function(err, m_rs){
                if(err){
                    logger.error('[SOAP-UpdateMateriel] '+data.materiel_number+' Unexpected ERROR: '+ err);
                    Logs.addLogs('system', '[SOAP-UpdateMateriel] '+data.materiel_number+' Unexpected ERROR: '+ err, 'system', '2');
                    return;
                }
                if(m_rs.nModified > 0){
                    logger.debug('[SOAP-UpdateMateriel] update is OK. DATA: ' + data.materiel_number);
                    Logs.addLogs('system', '[SOAP-UpdateMateriel] update is OK. DATA: ' + data.materiel_number, 'system', '0');
                }
            });
        }else{
            materiel.newAndSave(data.materiel_id, data.materiel_number, data.materiel_name, data.unit, data.materiel_abbreviation,
                data.materiel_norms, data.norms_code, data.materiel_code, data.materiel_small_class,
                data.materiel_big_class, data.materiel_edition, data.materiel_status, data.maintainer, data.bar_code_serial,
                data.org_id, data.Field1, data.Field2, data.Field3, data.Field4, data.Field5, data.Field6, data.Field7, data.Field8,
                data.Field9, data.Field10, data.Field11, data.Field12, data.Field13, data.Field14, data.Field15, data.push_tag,
                function (err, in_rs) {
                    if(err){
                        logger.error('[SOAP-AddMateriel] '+data.materiel_number+' Unexpected ERROR: '+ err);
                        Logs.addLogs('system', '[SOAP-AddMateriel] '+data.materiel_number+' Unexpected ERROR: '+ err, 'system', '2');
                        return;
                    }
                    if(in_rs != null){
                        logger.debug('[SOAP-AddMateriel] add is OK. DATA: ' + data.materiel_number);
                        Logs.addLogs('system', '[SOAP-AddMateriel] add is OK. DATA: ' + data.materiel_number, 'system', '0');

                        //物料添加成功， 关联品类
                        // 1.拆分 materiel_name 字段得到 desingId:313520_0001_01
                        var designId = '';
                        var name = data.materiel_name.split(';');
                        name.forEach(function (n){
                            var tmp = n.split('_');
                            if(tmp.length == 3){
                                if(!isNaN(tmp[0]) && !isNaN(tmp[0]) && !isNaN(tmp[0])){
                                    designId = n;
                                }
                            }
                        });
                        // 2.去category表中 通过desingId查找 对应品类
                        if(designId !== '' && data.Field1 == '1'){
                            Category.getCategoryByQuery({designId: designId}, '', function (err_c, rs_c) {
                                if(err_c){
                                    return logger.error('[SOAP-AddMateriel] find category info err: ' + err_c);
                                }
                                // 3.关联 品类
                                if(rs_c.length == 1){
                                    if(rs_c[0].materiel_number.indexOf(data.materiel_number) == -1){
                                        rs_c[0].materiel_number.push(data.materiel_number);
                                        rs_c[0].save(function () {
                                            in_rs.state = 1;
                                            in_rs.save();
                                            logger.debug('[SOAP-AddMateriel] add materiel success. ');
                                        });
                                    }
                                }else{
                                    return logger.error('[SOAP-AddMateriel] cannot find correct category info by designId: ' + designId);
                                }
                            });
                        }

                    }
                });
        }
    });
}