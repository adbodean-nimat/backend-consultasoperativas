require('dotenv').config();
var Db = require('./dboperacion');
var DbCAD = require('./dboperacion_cad');
const xlsx = require('xlsx');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); 
const token = process.env.JWT_TOKEN
const querystring = require('querystring');
var CronJob = require('cron').CronJob

async function getUsuariosCAD(){
    try{
        const results = [];
        const data1 = [];
        await Db.ListaClientesPlataforma().then((data)=>{data1.push(data[0])})
        const data2 = [];
        await DbCAD.getListaClientesCAD().then((data)=>{data2.push(data[0])})
        const data3 = [];
        await Db.ListaClientesPlataformaAcopios().then((data)=>{data3.push(data[0])})
        const data4 = [];
        await Db.ListaClientesPlataformaCtaCte().then((data)=>{data4.push(data[0])})
        function validateEmail(email) {
            const pattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
            return pattern.test(email);
        }
        for(var i=0; i < data1[0].length; i++){
            const emails = data1[0][i].CLIE_EMAIL
            const cad = data2[0].some(item => item.UserName == data1[0][i].CLIE_CLIENTE)
            const clienteAcopio = data3[0].some(item => item.PACA_CLIENTE == data1[0][i].CLIE_CLIENTE)
            const clienteCtaCte = data4[0].some(item => item.CLIE_CLIENTE == data1[0][i].CLIE_CLIENTE)
            const tipo_cuit = new String(data1[0][i].CLIE_CUIT).substring(0,2)
            const nombre_cliente = new String(data1[0][i].CLIE_NOMBRE)
            if(validateEmail(emails) && cad == false && clienteAcopio == true && clienteCtaCte == true){
                const fechaEmisionAcopio = data3[0].filter(item => item.PACA_CLIENTE == data1[0][i].CLIE_CLIENTE).map(data => data.FECHA_EMI);
                const fechaVigenteAcopio = data3[0].filter(item => item.PACA_CLIENTE == data1[0][i].CLIE_CLIENTE).map(data => data.FECHA_VIG_HASTA);
                const fechaClienteCAD = data2[0].filter(item => item.UserName == data1[0][i].CLIE_CLIENTE).map(data => data.UserCreDate);
                const apellido = tipo_cuit == '99' ? nombre_cliente.split(' ')[0] : 
                tipo_cuit == '20' ? nombre_cliente.split(' ')[0] : 
                tipo_cuit == '23' ? nombre_cliente.split(' ')[0] :
                tipo_cuit == '24' ? nombre_cliente.split(' ')[0] :
                tipo_cuit == '25' ? nombre_cliente.split(' ')[0] :
                tipo_cuit == '26' ? nombre_cliente.split(' ')[0] :
                tipo_cuit == '27' ? nombre_cliente.split(' ')[0] :
                tipo_cuit == '30' ? '.' :
                tipo_cuit == '33' ? '.' :
                tipo_cuit == '34' ? '.' : ''
                const nombre = tipo_cuit == '99' ? nombre_cliente.split(' ')[1] : 
                tipo_cuit == '20' ? nombre_cliente.split(' ')[1] : 
                tipo_cuit == '23' ? nombre_cliente.split(' ')[1] :
                tipo_cuit == '24' ? nombre_cliente.split(' ')[1] :
                tipo_cuit == '25' ? nombre_cliente.split(' ')[1] :
                tipo_cuit == '26' ? nombre_cliente.split(' ')[1] :
                tipo_cuit == '27' ? nombre_cliente.split(' ')[1] :
                tipo_cuit == '30' ? nombre_cliente.toString() :
                tipo_cuit == '33' ? nombre_cliente.toString() :
                tipo_cuit == '34' ? nombre_cliente.toString() : ''
                const email = emails.split(/;/)
                const diaHoy = new Date();
                results.push({
                    CLIE_CLIENTE: data1[0][i].CLIE_CLIENTE,
                    CLIE_NOMBRE_PTF: data1[0][i].CLIE_NOMBRE,
                    CLIE_APELLIDO: apellido.trim(),
                    CLIE_NOMBRE: nombre.trim(),
                    CLIE_EMAIL: email[0],
                    CLIE_TIPO_CUIT: tipo_cuit,
                    CLIE_CUIT: data1[0][i].CLIE_CUIT,
                    CLIE_CAD: cad,
                    CLIE_DATE: fechaClienteCAD.length == 0 ? '' : fechaClienteCAD,
                    CLIE_UPDATE: fechaClienteCAD.length == 0 ? '' : fechaClienteCAD,
                    CLIE_ACOPIOS: data3[0].some(item => item.PACA_CLIENTE == data1[0][i].CLIE_CLIENTE),
                    CLIE_ACOPIOS_EMI: fechaEmisionAcopio.length == 0 ? '' : fechaEmisionAcopio,
                    CLIE_ACOPIOS_VIG: fechaVigenteAcopio.length == 0 ? '' : fechaVigenteAcopio,
                    CLIE_CTACTE: data4[0].some(item => item.CLIE_CLIENTE == data1[0][i].CLIE_CLIENTE)
                })
            }            
        }

        const resultsToCAD = [];
        for(var j = 0; j < results.length; j++){
            resultsToCAD.push({
                CLIE: results[j].CLIE_CLIENTE,
                EMAIL: results[j].CLIE_EMAIL,
                APELLIDO: results[j].CLIE_APELLIDO,
                NOMBRE: results[j].CLIE_NOMBRE,               
                DESCUENTO: 'S'
            })
        }
        //console.log(resultsToCAD)
        return resultsToCAD
    }
    catch(error){
        console.log(error)
    }
}

async function jsontotxt(){
    try{
        const data = [];
        let getData = await getUsuariosCAD().then((response)=>data.push(response))
        const fileTest = "C:/Users//abodean//Desktop"
        const fileCAD = `${process.env.URL_DIR_CAD}`
        const filePathXLSX = path.join(fileTest, '/USUARIOSCAD.xlsx');
        const filePathCSV = path.join(fileTest, '/USUARIOSCAD.csv');
        const filePathTXT = path.join(fileCAD, '/USUARIOSCAD.txt');
        const ws = xlsx.utils.json_to_sheet(data[0], {skipHeader: true});
        const wb = xlsx.utils.book_new();
        xlsx.CFB.utils.use_zlib(zlib);
        xlsx.utils.book_append_sheet(wb, ws, "Hoja1");
        const dataToTxt = xlsx.utils.sheet_to_csv(ws, {FS: ";"});
        xlsx.writeFile(wb, filePathXLSX);
        xlsx.writeFile(wb, filePathCSV);
        fs.writeFileSync(filePathTXT, dataToTxt.replaceAll(";","---"));
        
        
    }
    catch(error){
        console.log(error)
    }
}

module.exports = {
    getUsuariosCAD,
    jsontotxt
}