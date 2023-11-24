require('dotenv').config();
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); 
const token = process.env.JWT_TOKEN
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
                            DisableBuyButton: secundResponse[j].DisableBuyButton,
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

async function jsontosheet(){
    let url = `${process.env.URL_API}` + 'planillaimportarweb';
    const raw_data = (await axios(url, {httpsAgent, headers: {'Authorization': `Basic ${token}`}})).data;
    const route = `${process.env.URL_DROPBOX}`
    const routePath = path.normalize(route);
    const filePath = path.join(__dirname, '/Importar_AgileWorks _M2.xlsx');
    console.log(filePath);
    const workSheet = xlsx.utils.json_to_sheet(raw_data);
    const wb = xlsx.utils.book_new();
    
    xlsx.utils.book_append_sheet(wb, workSheet, 'Hoja1');
    
    const s = xlsx.writeFile(wb, filePath, {
        bookType: 'xlsx',
        type: 'file',
        compression: true
    });
}

async function actualizadoWeb(){
    let urlapi = `${process.env.URL_API}` + 'actualizadoweb/1';
    await axios.put(urlapi, {}, {httpsAgent: new https.Agent({ rejectUnauthorized: false }), headers: {'Authorization': `Basic ${token}`}});
}

var lunvie = new CronJob(
    "0 */60 7-19 * * 1-5",
    function () {
        jsontosheet();
        actualizadoWeb();
        console.log('Actualizado Web');
    },
    null,
    true,
    "America/Buenos_Aires"
  );

var sab = new CronJob(
    "0 */60 7-13 * * 6",
    function () {
        jsontosheet();
        actualizadoWeb();
        console.log('Actualizado Web');
    },
    null,
    true,
    "America/Buenos_Aires"
);

module.exports = {
    getWebNimat,
    jsontosheet
}