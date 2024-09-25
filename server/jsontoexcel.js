require('dotenv').config();
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

async function getWebNimat(){
    let endpoints4 = [
        `${process.env.URL_API}` + 'articulosweb',
        `${process.env.URL_API}` + 'planillaimportarstockprecio',
      ];
      let response2 = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].codigo_art === secundResponse[j].SKU) {
                        results.push({
                            ProductType: secundResponse[j].ProductType,
                            VisibleIndividually: firstResponse[i].publicado === false ? "FALSE" 
                            : secundResponse[j].Published == "BLOQUEADO" && firstResponse[i].bloq_vtas === false ? "FALSE" 
                            : secundResponse[j].Published == "BLOQUEADO" && firstResponse[i].bloq_vtas == true && firstResponse[i].stock == 0 && secundResponse[j].StockQuantity == 0 ? "FALSE" 
                            : secundResponse[j].Published == "BLOQUEADO" && firstResponse[i].bloq_vtas == true && firstResponse[i].stock >= 0 ? "TRUE" 
                            : secundResponse[j].StockQuantity >= firstResponse[i].min_para_web ? "TRUE" 
                            : secundResponse[j].Published, 
                            Name: secundResponse[j].Name,
                            ShortDescription: secundResponse[j].ShortDescription +' '+ (firstResponse[i].copete == "" ? '' : '<span>'+ firstResponse[i].copete +'</span>'),
                            FullDescription: secundResponse[j].FullDescription,
                            ProductTemplate: secundResponse[j].ProductTemplate,
                            ShowOnHomePage: firstResponse[i].mostrar_inicio === true ? "TRUE" : "FALSE",
                            MetaKeywords: secundResponse[j].MetaKeywords,
                            MetaDescription: secundResponse[j].MetaDescription,
                            MetaTitle: secundResponse[j].MetaTitle,
                            SeName: secundResponse[j].SeName,
                            AllowCustomerReviews: secundResponse[j].AllowCustomerReviews == "FALSO" ? "FALSE" : secundResponse[j].AllowCustomerReviews,
                            Published: firstResponse[i].publicado === false ? "FALSE" 
                            : secundResponse[j].Published == "BLOQUEADO" && firstResponse[i].bloq_vtas == false ? "FALSE" 
                            : secundResponse[j].Published == "BLOQUEADO" && firstResponse[i].bloq_vtas == true && firstResponse[i].stock == 0 && secundResponse[j].StockQuantity == 0 ? "FALSE" 
                            : secundResponse[j].Published == "BLOQUEADO" && firstResponse[i].bloq_vtas == true && firstResponse[i].stock >= 0 ? "TRUE" 
                            : secundResponse[j].StockQuantity >= firstResponse[i].min_para_web ? "TRUE"
                            : secundResponse[j].Published,
                            SKU: secundResponse[j].SKU,
                            IsShipEnabled: secundResponse[j].IsShipEnabled == "VERDADERO" ? "TRUE" : secundResponse[j].IsShipEnabled,
                            ManageInventoryMethod: secundResponse[j].ManageInventoryMethod,
                            StockQuantity: firstResponse[i].stock > 0 && firstResponse[i].bloq_vtas == true ? firstResponse[i].stock : secundResponse[j].StockQuantity >= firstResponse[i].stock ? secundResponse[j].StockQuantity : secundResponse[j].StockQuantity,
                            DisplayStockAvailability: secundResponse[j].DisplayStockAvailability,
                            DisplayStockQuantity: secundResponse[j].DisplayStockQuantity,
                            NotifyAdminForQuantityBelow: secundResponse[j].NotifyAdminForQuantityBelow,
                            BackorderMode: secundResponse[j].BackorderMode,
                            OrderMinimumQuantity: 1,
                            OrderMaximumQuantity: 1000,
                            CallForPrice: secundResponse[j].CallForPrice == "FALSO" ? "FALSE" : secundResponse[j].CallForPrice == "VERDADERO" ? "TRUE" : secundResponse[j].CallForPrice,
                            DisableBuyButton: firstResponse[i].stock > 0 && firstResponse[i].bloq_vtas == true ? "FALSE" : secundResponse[j].DisableBuyButton,
                            Price: secundResponse[j].Price,
                            Categories: 
                               firstResponse[i].outlet == true ? '3127|' + firstResponse[i].orden_art +';'
                             + firstResponse[i].categorias1 +'|'+ firstResponse[i].orden_art +';' 
                             + firstResponse[i].categorias2 +'|'+ (firstResponse[i].categorias2 == "" ? '' : firstResponse[i].orden_art) + ';' 
                             + firstResponse[i].categorias3 +'|'+ (firstResponse[i].categorias3 == "" ? '' : firstResponse[i].orden_art) + ';' 
                             + firstResponse[i].categorias4 +'|'+ (firstResponse[i].categorias4 == "" ? '' : firstResponse[i].orden_art) + ';' 
                             : firstResponse[i].categorias1 +'|'+ firstResponse[i].orden_art +';'
                             + firstResponse[i].categorias2 +'|'+ (firstResponse[i].categorias2 == "" ? '' : firstResponse[i].orden_art) +';' 
                             + firstResponse[i].categorias3 +'|'+ (firstResponse[i].categorias3 == "" ? '' : firstResponse[i].orden_art) +';'
                             + firstResponse[i].categorias4 +'|'+ (firstResponse[i].categorias4 == "" ? '' : firstResponse[i].orden_art) +';',
                            Manufacturers: secundResponse[j].Manufacturers,
                            Weight: secundResponse[j].Weight,
                            Picture1: secundResponse[j].Picture1,
                            BasepriceAmount: secundResponse[j].BasepriceAmount,
                            MarkAsNew: firstResponse[i].marcar_nuevo === true ? "TRUE" : "FALSE",
                            Deleted: secundResponse[j].Deleted == "FALSO" ? "FALSE" : ''
                        });
                    }
                }
            }
            return results
        } 
    ).catch(function (error) {
        console.log(error);
   });
 
 return response2
}

async function getWebNimatCombo(){
    let endpoints4 = [
        `${process.env.URL_API}` + 'articulosweb',
        `${process.env.URL_API}` + 'comboweb',
      ];
      let response2 = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];

            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].codigo_art == secundResponse[j].Cod_Combo) {
                        results.push({
                            ProductType: "Simple Product",
                            VisibleIndividually: firstResponse[i].publicado === false ? "FALSE"
                            : secundResponse[j].Sotck_Bool == 0 ? "FALSE" 
                            : secundResponse[j].SumaDeStockDispon_CantCombo == 0 ? "FALSE"
                            : secundResponse[j].CMBA_FECHA_VIG_HASTA == null ? "TRUE"
                            : new Date(secundResponse[j].CMBA_FECHA_VIG_HASTA) <= new Date() ? "FALSE"
                            : secundResponse[j].SumaDeStockDispon_CantCombo >= firstResponse[i].min_para_web ? "TRUE" 
                            : secundResponse[j].Sotck_Bool == 1 ? "TRUE" 
                            : firstResponse[i].publicado === true ? "TRUE" 
                            : "FALSE",
                            Name: firstResponse[i].nombre_art,
                            ShortDescription: firstResponse[i].copete == "" ? '' : '<span>'+ firstResponse[i].copete +'</span>',
                            FullDescription: firstResponse[i].descripcion,
                            ProductTemplate: "Simple Product",
                            ShowOnHomePage: firstResponse[i].mostrar_inicio === true ? "TRUE" : "FALSE",
                            MetaKeywords: "",
                            MetaDescription: "",
                            MetaTitle: "",
                            SeName: "",
                            AllowCustomerReviews: "FALSE",
                            Published: firstResponse[i].publicado == false ? "FALSE"
                            : secundResponse[j].Sotck_Bool == 0 ? "FALSE" 
                            : secundResponse[j].SumaDeStockDispon_CantCombo == 0 ? "FALSE"
                            : secundResponse[j].CMBA_FECHA_VIG_HASTA == null ? "TRUE"
                            : new Date(secundResponse[j].CMBA_FECHA_VIG_HASTA) <= new Date() ? "FALSE"
                            : secundResponse[j].SumaDeStockDispon_CantCombo >= firstResponse[i].min_para_web ? "TRUE" 
                            : secundResponse[j].Sotck_Bool == 1 ? "TRUE" 
                            : firstResponse[i].publicado == true ? "TRUE" 
                            : "FALSE",
                            SKU: secundResponse[j].Cod_Combo,
                            IsShipEnabled: "TRUE",
                            ManageInventoryMethod: "Manage Stock",
                            StockQuantity: secundResponse[j].SumaDeStockDispon_CantCombo,
                            DisplayStockAvailability: "TRUE",
                            DisplayStockQuantity: "TRUE",
                            NotifyAdminForQuantityBelow: "1",
                            BackorderMode: "No Backorders",
                            OrderMinimumQuantity: 1,
                            OrderMaximumQuantity: 1000,
                            CallForPrice: "FALSE",
                            DisableBuyButton: secundResponse[j].SumaDeStockDispon_CantCombo == 0 ? "TRUE" : "FALSE",
                            Price: secundResponse[j].SumaDePre_Oferta_Cdo_total,
                            Categories: 
                               firstResponse[i].outlet == true ? '3127|' + firstResponse[i].orden_art +';'
                             + firstResponse[i].categorias1 +'|'+ firstResponse[i].orden_art +';' 
                             + firstResponse[i].categorias2 +'|'+ (firstResponse[i].categorias2 == "" ? '' : firstResponse[i].orden_art) + ';' 
                             + firstResponse[i].categorias3 +'|'+ (firstResponse[i].categorias3 == "" ? '' : firstResponse[i].orden_art) + ';' 
                             + firstResponse[i].categorias4 +'|'+ (firstResponse[i].categorias4 == "" ? '' : firstResponse[i].orden_art) + ';' 
                             : firstResponse[i].categorias1 +'|'+ firstResponse[i].orden_art +';'
                             + firstResponse[i].categorias2 +'|'+ (firstResponse[i].categorias2 == "" ? '' : firstResponse[i].orden_art) +';' 
                             + firstResponse[i].categorias3 +'|'+ (firstResponse[i].categorias3 == "" ? '' : firstResponse[i].orden_art) +';'
                             + firstResponse[i].categorias4 +'|'+ (firstResponse[i].categorias4 == "" ? '' : firstResponse[i].orden_art) +';',
                            Manufacturers: secundResponse[j].PrimeroDeCA06_NOMBRE,
                            Weight: secundResponse[j].SumaDeWeight,
                            Picture1: "",
                            BasepriceAmount: secundResponse[j].SumaDeBasepriceAmount,
                            MarkAsNew: firstResponse[i].marcar_nuevo === true ? "TRUE" : "FALSE",
                            Deleted: "FALSE"
                        });
                    }
                }
            }
            return results
        } 
    ).catch(function (error) {
        console.log(error);
   });
 
 return response2
}

async function jsontosheet(){
    let url = `${process.env.URL_API}` + 'planillaimportarweb';
    let urlcombo = `${process.env.URL_API}` + 'planillaimportarwebcombo';
    const raw_data = (await axios(url, {httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}})).data;
    const raw_data2 = (await axios(urlcombo, {httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}})).data;
    const route = `${process.env.URL_DROPBOX}`
    const routePath = path.normalize(route);
    const filePath = path.join(route, '/Importar_AgileWorks_M2.xlsx');
    const array = [...raw_data, ...raw_data2];
    const workSheet = xlsx.utils.json_to_sheet(array, {dense: true});
    const wb = xlsx.utils.book_new();
    
    xlsx.CFB.utils.use_zlib(zlib);
    xlsx.utils.book_append_sheet(wb, workSheet, 'Hoja1');
    
    const s = xlsx.writeFileXLSX(wb, filePath, {
        bookType: 'xlsx',
        type: 'file',
        bookSST: true,
        compression: true
    });
}

async function actualizadoWeb(){
    let urlapi = `${process.env.URL_API}` + 'actualizacionwebnow/1';
    await axios.put(urlapi, {}, {httpsAgent: new https.Agent({ rejectUnauthorized: false }), headers: {'Authorization': `Basic ${token}`, 'Accept-Encoding': 'gzip, deflate, br'}});
}

async function getActualizacionWeb() {
    let urlActualizacionWeb = `${process.env.URL_API}` + 'actualizacionweb';
    const getData = (await axios.get(urlActualizacionWeb, {httpsAgent, headers: {'Authorization': `Basic ${token}`, 'Accept-Encoding': 'gzip, deflate, br'}})).data
    var data = getData[0];
    return data
}
getActualizacionWeb();


async function jsontosheet2(){
    try{
        let url = `${process.env.URL_API}` + 'informesacindar';
        const raw_data = (await axios(url, {httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}})).data;

        const date = new Date();
        const month = date.getMonth();
        const monthNumbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const folder = `${process.env.URL_DIR_ACINDAR}/`+ new Date().getFullYear() +'.'+ monthNumbers[month - 1]
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
          }
        const routePath = path.normalize(folder);
        const filePathXSLS = path.join(folder, '/Exportar Acindar.xlsx');
        const filePathCSV = path.join(folder, '/Archivo.csv');
        const filePathTXT = path.join(folder, '/Archivo.txt');
        const workSheet = xlsx.utils.json_to_sheet(raw_data, {dense: true});
        const wb = xlsx.utils.book_new();
        xlsx.CFB.utils.use_zlib(zlib);
        xlsx.utils.book_append_sheet(wb, workSheet, "Hoja1");
        xlsx.utils.sheet_add_aoa(workSheet, [["DEA","SUCURSAL","Nº DOC LEGAL","TIPO DOC LEGAL","TIPO DE TRANSACCION","ITEM DOC LEGAL","FECHA DOC LEGAL","Nº DOC REFERENCIA","TIPO DOC REF","ITEM DOC REF","FECHA DOC REF","CUIT CLIENTE","N°INTERNO CLIENTE","RAZON SOCIAL","SEGMENTO","DIRECCION","CIUDAD","PROVINCIA","CODIGO ART","DESCRIPCION","UMV","CANTIDAD","MONTO","FECHA COSTO","DESCRIPCION COND VTA","DIAS","OBSERVACION"]], { origin: "A1" });
        const sorkCSV = xlsx.utils.sheet_to_csv(workSheet, {FS: ";"});
        xlsx.writeFile(wb, filePathXSLS, {bookType: 'xlsx'});
        //xlsx.writeFile(wb, filePathCSV, {bookType: "csv", FS: ";"});
        //xlsx.writeFile(wb, filePathCSV);
        fs.writeFileSync(filePathTXT, sorkCSV);
        fs.writeFileSync(filePathCSV, sorkCSV);
    }
    catch(error){
        console.error(error);
    }    
}

async function jsontosheet3(getDates){
    try{
        var queryParams = querystring.stringify(getDates)
        let url = `${process.env.URL_API}` + 'informesacindarentrefechasexportar?'+queryParams;
        const raw_data = (await axios(url, {httpsAgent, headers: {'Authorization': `Basic ${token}`}})).data;
        const date1 = getDates.fechadesde
        const date2 = getDates.fechahasta
        const month = date1.substring(5,7);
        const year = date1.substring(0,4);
        const monthNumbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const folder = `${process.env.URL_DIR_ACINDAR}/`+ year +'.'+ month
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
          }
        const routePath = path.normalize(folder);
        const filePathXSLS = path.join(folder, '/Achivo.xlsx');
        const filePathCSV = path.join(folder, '/Archivo.csv');
        const filePathTXT = path.join(folder, '/Archivo.txt');
        const workSheet = xlsx.utils.json_to_sheet(raw_data);
        const wb = xlsx.utils.book_new();
        xlsx.CFB.utils.use_zlib(zlib);
        xlsx.utils.book_append_sheet(wb, workSheet, "Hoja1");
        xlsx.utils.sheet_add_aoa(workSheet, [["DEA","SUCURSAL","Nº DOC LEGAL","TIPO DOC LEGAL","TIPO DE TRANSACCION","ITEM DOC LEGAL","FECHA DOC LEGAL","Nº DOC REFERENCIA","TIPO DOC REF","ITEM DOC REF","FECHA DOC REF","CUIT CLIENTE","Nº INTERNO CLIENTE","RAZON SOCIAL","SEGMENTO","DIRECCION","CIUDAD","PROVINCIA","CODIGO ART","DESCRIPCION","UMV","CANTIDAD","MONTO","FECHA COSTO","DESCRIPCION COND VTA","DIAS","OBSERVACION"]], { origin: "A1" });
        const sorkCSV = xlsx.utils.sheet_to_csv(workSheet, {FS: ";"});
        xlsx.writeFile(wb, filePathXSLS, {bookType: 'xlsx'});
        //xlsx.writeFile(wb, filePathCSV);
        fs.writeFileSync(filePathTXT, sorkCSV);
        fs.writeFileSync(filePathCSV, sorkCSV);
    }
    catch(error){
        console.error(error);
    }    
}

new CronJob(
    "0 0 6 1 1-12 *",
    function(){
      jsontosheet2();
      console.log('Generado correctamente');                
    },
    null,
    true,
    'America/Buenos_Aires'    
);

module.exports = {
    getWebNimat,
    jsontosheet,
    getWebNimatCombo,
    actualizadoWeb,
    getActualizacionWeb,
    jsontosheet2,
    jsontosheet3
}
