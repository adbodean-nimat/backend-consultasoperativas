import dotenv from 'dotenv';
dotenv.config();
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import zlib from 'node:zlib';
import path from 'path';
import https from 'https';
import axios from 'axios';
import { stringify } from 'querystring';
import { CronJob } from 'cron';
const httpsAgent = new https.Agent({ rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED }); 
const token = process.env.JWT_TOKEN
XLSX.set_fs(fs);
async function getWebNimat(){
    try {
        let endpoints4 = [
            `${process.env.URL_API}` + 'articulosweb',
            `${process.env.URL_API}` + 'planillaimportarstockprecio',
          ];
          let response2 = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Bearer ${token}`}}))).then(
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
                                Name: (secundResponse[j].Name).trim(),
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
        ).catch((error) => {
            console.error(error);
       });
     
     return response2
    } catch (error) {
        console.error(error);
    }
}

async function getWebNimatCombo(){
    try {
        let endpoints4 = [
            `${process.env.URL_API}` + 'articulosweb',
            `${process.env.URL_API}` + 'comboweb',
          ];
          let response2 = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Bearer ${token}`}}))).then(
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
            console.error(error);
       });
     return response2
    } catch (error) {
        console.error(error);
    }
}

async function jsontosheet(){
    try {
        const raw_data = await getWebNimat().then((response)=>response).catch(error => {
            console.error('Error fetching data:', error);
            throw error;
        });
        const raw_data2 = await getWebNimatCombo().then((response)=>response).catch(error => {
            console.error('Error fetching combo data:', error);
            throw error;
        });
        const route = `${process.env.URL_DROPBOX}`
        const routePath = path.normalize(route);
        const filePath = path.join(route, '/Importar_AgileWorks_M2.xlsx');
        const array = [...raw_data, ...raw_data2];
        const workSheet = XLSX.utils.json_to_sheet(array);
        const wb = XLSX.utils.book_new();
        
        //XLSX.CFB.utils.use_zlib(zlib);
        XLSX.utils.book_append_sheet(wb, workSheet, 'Hoja1');
        XLSX.writeFileXLSX(wb, filePath, { compression: true });
        return true;
    } catch(error) {
        console.error(error);
    }
}

async function actualizadoWeb() {
    try {
        let urlapi = `${process.env.URL_API}` + 'actualizacionwebnow/1';
        await axios.put(urlapi, {}, {httpsAgent, headers: {'Authorization': `Bearer ${token}`, 'Accept-Encoding': 'gzip, deflate, br'}});
    } catch (error) {
        console.error(error);
    }
}

async function getActualizacionWeb() {
    try {
        let urlActualizacionWeb = `${process.env.URL_API}` + 'actualizacionweb';
        const getData = (await axios.get(urlActualizacionWeb, {httpsAgent, headers: {'Authorization': `Bearer ${token}`, 'Accept-Encoding': 'gzip, deflate, br'}})).data
        var data = getData[0];
        return data
    } catch (error) {
        console.error(error);
    }
}   

async function jsontosheet2(){
    try{
        let url = `${process.env.URL_API}` + 'informesacindar';
        const raw_data = (await axios(url, {httpsAgent, headers: {'Authorization': `Bearer ${token}`,'Accept-Encoding': 'gzip, deflate, br'}})).data;

        const date = new Date();
        const month = date.getMonth();
        const monthNumbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const folder = `${process.env.URL_DIR_ACINDAR}/`+ new Date().getFullYear() +'.'+ monthNumbers[month - 1]
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
          }
        const routePath = normalize(folder);
        const filePathXSLS = join(folder, '/Archivo.xlsx');
        const filePathCSV = join(folder, '/Archivo.csv');
        const filePathTXT = join(folder, '/Archivo.txt');
        const workSheet = XLSX.utils.json_to_sheet(raw_data, {dense: true});
        const wb = XLSX.utils.book_new();
        XLSX.CFB.utils.use_zlib(zlib);
        XLSX.utils.book_append_sheet(wb, workSheet, "Hoja1");
        XLSX.utils.sheet_add_aoa(workSheet, [["DEA","SUCURSAL","Nº DOC LEGAL","TIPO DOC LEGAL","TIPO DE TRANSACCION","ITEM DOC LEGAL","FECHA DOC LEGAL","Nº DOC REFERENCIA","TIPO DOC REF","ITEM DOC REF","FECHA DOC REF","CUIT CLIENTE","N°INTERNO CLIENTE","RAZON SOCIAL","SEGMENTO","DIRECCION","CIUDAD","PROVINCIA","CODIGO ART","DESCRIPCION","UMV","CANTIDAD","MONTO","FECHA COSTO","DESCRIPCION COND VTA","DIAS","OBSERVACION"]], { origin: "A1" });
        const sorkCSV = XLSX.utils.sheet_to_csv(workSheet, {FS: ";"});
        XLSX.writeFile(wb, filePathXSLS, {bookType: 'xlsx'});
        //XLSX.writeFile(wb, filePathCSV, {bookType: "csv", FS: ";"});
        //XLSX.writeFile(wb, filePathCSV);
        fs.writeFileSync(filePathTXT, sorkCSV);
        fs.writeFileSync(filePathCSV, sorkCSV);
    }
    catch(error){
        console.error(error);
    }    
}

async function jsontosheet3(getDates){
    try{
        var queryParams = stringify(getDates)
        let url = `${process.env.URL_API}` + 'informesacindarentrefechasexportar?'+queryParams;
        const raw_data = (await axios(url, {httpsAgent, headers: {'Authorization': `Bearer ${token}`}})).data;
        const date1 = getDates.fechadesde
        const date2 = getDates.fechahasta
        const month = date1.substring(5,7);
        const year = date1.substring(0,4);
        const monthNumbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        const folder = `${process.env.URL_DIR_ACINDAR}/`+ year +'.'+ month
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
          }
        const routePath = normalize(folder);
        const filePathXSLS = join(folder, '/Archivo.xlsx');
        const filePathCSV = join(folder, '/Archivo.csv');
        const filePathTXT = join(folder, '/Archivo.txt');
        const workSheet = XLSX.utils.json_to_sheet(raw_data);
        const wb = XLSX.utils.book_new();
        XLSX.CFB.utils.use_zlib(zlib);
        XLSX.utils.book_append_sheet(wb, workSheet, "Hoja1");
        XLSX.utils.sheet_add_aoa(workSheet, [["DEA","SUCURSAL","Nº DOC LEGAL","TIPO DOC LEGAL","TIPO DE TRANSACCION","ITEM DOC LEGAL","FECHA DOC LEGAL","Nº DOC REFERENCIA","TIPO DOC REF","ITEM DOC REF","FECHA DOC REF","CUIT CLIENTE","Nº INTERNO CLIENTE","RAZON SOCIAL","SEGMENTO","DIRECCION","CIUDAD","PROVINCIA","CODIGO ART","DESCRIPCION","UMV","CANTIDAD","MONTO","FECHA COSTO","DESCRIPCION COND VTA","DIAS","OBSERVACION"]], { origin: "A1" });
        const sorkCSV = XLSX.utils.sheet_to_csv(workSheet, {FS: ";"});
        XLSX.writeFile(wb, filePathXSLS, {bookType: 'xlsx'});
        //XLSX.writeFile(wb, filePathCSV);
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
    'America/Argentina/Buenos_Aires'    
);

export default {
    getWebNimat,
    jsontosheet,
    getWebNimatCombo,
    actualizadoWeb,
    getActualizacionWeb,
    jsontosheet2,
    jsontosheet3
  };
  
