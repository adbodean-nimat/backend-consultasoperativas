require('dotenv').config();
var Db = require('./dboperacion');
var Pg = require('./dboperacion_pg');
const https = require('https');
const axios = require('axios');
const httpsAgent = new https.Agent({ rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED }); 
const token = process.env.JWT_TOKEN

async function getListadePrecioBUI2() {
    let endpoints = [
        `${process.env.URL_API}` + 'listadepreciobreveusointerno',
        `${process.env.URL_API}` + 'listabreveuso'
    ]
    let response = await Promise.all(endpoints.map((endpoint) => axios.get(endpoint,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {

            var joined = firstResponse.map(function(e) {
                return Object.assign({}, e, secundResponse.reduce(function(acc, val) {
                    if (val.arts_articulo_emp == e.arts_articulo_emp) {
                        return val
                    } else {
                        return acc
                    }
                }, {}))
            });
            return joined;
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response;  
}

async function getConsSecoConfig() {
    let endpoints2 = [
        `${process.env.URL_API}` + 'constsecoarmadoconfig1',
        `${process.env.URL_API}` + 'constsecoarmadoconfig2',
        `${process.env.URL_API}` + 'constseconombresconfig',
      ];
    let response = await Promise.all(endpoints2.map((endpoint2) => axios.get(endpoint2,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}, {data: threeResponse}]) => {

            var joined = firstResponse.map(function(e) {
                return Object.assign({}, e,
                    threeResponse.reduce(function(acc1, val1){
                        if (val1.cod_conf_cs == e.configcs) {
                            return val1
                        } else {
                            return acc1
                        }
                }),
                    secundResponse.reduce(function(acc, val) {
                        if (val.cod_art == e.codptf) {
                            return val
                        } else {
                            return acc
                        }
                },{}))
            });
            return joined
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response;  
}

async function getListaConstSeco() {
    let endpoints3 = [
        `${process.env.URL_API}` + 'listaconstsecoconfig',
        `${process.env.URL_API}` + 'listaconstsecosql',
      ];
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {

            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].codptf === secundResponse[j].ARTS_ARTICULO_EMP) {
                        results.push({
                            ARTS_CLASIF_1: secundResponse[j].ARTS_CLASIF_1, 
                            ARTS_ARTICULO: secundResponse[j].ARTS_ARTICULO,
                            codptf: firstResponse[i].codptf,
                            ARTS_NOMBRE: secundResponse[j].ARTS_NOMBRE,
                            configcs: firstResponse[i].configcs,
                            nombre_conf_cs: firstResponse[i].nombre_conf_cs,
                            nombre_art_lp: firstResponse[i].nombre_art_lp,
                            uni_lp_x_cada_uni_ptf: firstResponse[i].uni_lp_x_cada_uni_ptf,
                            cant: firstResponse[i].cant,
                            uni: firstResponse[i].uni,
                            fracciona_uni_ptf: firstResponse[i].fracciona_uni_ptf,
                            observacion: firstResponse[i].observacion,
                            COD_CTE: secundResponse[j].COD_CTE,
                            CIMP_TASA: secundResponse[j].CIMP_TASA,
                            ARTS_UNIMED_STOCK: secundResponse[j].ARTS_UNIMED_STOCK,
                            DCA1_POR_DESCUENTO: secundResponse[j].DCA1_POR_DESCUENTO,
                            DVC1_LISTA_PRECVTA: secundResponse[j].DVC1_LISTA_PRECVTA,
                            ARPV_PRECIO_VTA: secundResponse[j].ARPV_PRECIO_VTA,
                            ARPV_MONEDA: secundResponse[j].ARPV_MONEDA,
                            COTI_COTIZACION: secundResponse[j].COTI_COTIZACION
                        });
                    }
                }
            }
            return results;
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response;  
}

async function getFamiliaArts() {
    let endpoints4 = [
        `${process.env.URL_API}` + 'vinculararticulosafamilia',
        `${process.env.URL_API}` + 'familiadearticulo',
        `${process.env.URL_API}` + 'setsdeventas',
      ];
    let response = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}, {data: threeResponse}]) => {

            var result = []
            var result2 = []

            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].cod_familia == secundResponse[j].id){
                        result.push({
                            cod: firstResponse[i].cod,
                            cod_art: firstResponse[i].cod_art,
                            cod_familia: firstResponse[i].cod_familia,
                            orden_art_familia: firstResponse[i].orden_art_familia,
                            nombre_fami_art: secundResponse[j].nombre_fami_art,
                            nro_orden_de_la_fami: secundResponse[j].nro_orden_de_la_fami,
                            set_ventas: secundResponse[j].set_ventas
                        });
                    }
                }
            }

            for (var x=0; x<result.length; x++) {
                for (var v=0; v<threeResponse.length; v++) {
                    if (result[x].set_ventas == threeResponse[v].id) {
                        result2.push({
                            cod: result[x].cod,
                            cod_art: result[x].cod_art,
                            cod_familia: result[x].cod_familia,
                            orden_art_familia: result[x].orden_art_familia,
                            nombre_fami_art: result[x].nombre_fami_art,
                            nro_orden_de_la_fami: result[x].nro_orden_de_la_fami,
                            set_ventas: result[x].set_ventas,
                            nombre_set_art: threeResponse[v].nombre_set_art
                        })
                    }
                }
            }

            /* var joined = firstResponse.map(function(e) {
                return Object.assign({}, e,
                    secundResponse.reduce(function(acc, val) {
                        if (val.cod_fami_art == e.cod_familia) {
                            return val
                        } else {
                            return acc
                        }}),  
                )
            });
            var joined2 = joined.map(function(e){
                return Object.assign({}, e,
                    threeResponse.reduce(function(acc2, val2){
                        if (val2.cod_set_art == e.set_de_la_familia) {
                            return val2
                        } else {
                            return acc2
                        }})
                )
            }) */
            return result2
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response;  
}

async function getFamiliaArts2() {
    let endpoints4 = [
        `${process.env.URL_API}` + 'productospdistribucion',
        `${process.env.URL_API}` + 'familiadistribuciones'
      ];
    let response = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var result = []
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].Cod_Familia_producto == secundResponse[j].id){
                        result.push({
                            id: firstResponse[i].id,
                            Codigo_producto: firstResponse[i].Codigo_producto,
                            Orden_producto: firstResponse[i].Orden_producto,
                            Cod_Familia_producto: firstResponse[i].Cod_Familia_producto,
                            nombre_familia: secundResponse[j].nombre_familia,
                            orden_familia: secundResponse[j].orden_familia
                        });
                    }
                }
            }

            /* var joined = firstResponse.map(function(e) {
                return Object.assign({}, e,
                    secundResponse.reduce(function(acc, val) {
                        if (val.id == e.Cod_Familia_producto) {
                            return val
                        } else {
                            return acc
                        }}),  
                );
            });
            var joined2 = joined.map(function(e){
                return Object.assign({}, e,
                    threeResponse.reduce(function(acc2, val2){
                        if (val2.cod_set_art == e.cod_set_art) {
                            return val2
                        } else {
                            return acc2
                        }})
                )
            }) */

            return result
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response;  
}

async function getVN_1() {
    let endpoints3 = [
        `${process.env.URL_API}` + 'familiaarticulos',
        `${process.env.URL_API}` + 'vnsindtofinanc',
      ];
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].cod_art === secundResponse[j].ARTS_ARTICULO_EMP) {
                        results.push({
                            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA, 
                            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
                            cod_art: firstResponse[i].cod_art,
                            set_ventas: firstResponse[i].set_ventas,
                            nombre_set_art: firstResponse[i].nombre_set_art,
                            cod_familia: firstResponse[i].cod_familia,
                            nombre_fami_art: firstResponse[i].nombre_fami_art,
                            nro_orden_de_la_fami: firstResponse[i].nro_orden_de_la_fami,
                            orden_art_familia: firstResponse[i].orden_art_familia,
                            ARTS_ARTICULO: secundResponse[j].ARTS_ARTICULO,
                            ARTS_ARTICULO_EMP: secundResponse[j].ARTS_ARTICULO_EMP,
                            ARTS_NOMBRE: secundResponse[j].ARTS_NOMBRE,
                            ARTS_UNIMED_STOCK: secundResponse[j].ARTS_UNIMED_STOCK,
                            ARVE_BLOQUEO_VENTA: secundResponse[j].ARVE_BLOQUEO_VENTA,
                            ARTS_FACTOR_HOMSTO: secundResponse[j].ARTS_FACTOR_HOMSTO,
                            COD_CTE: secundResponse[j].COD_CTE,
                            ARTS_CLASIF_1: secundResponse[j].ARTS_CLASIF_1,
                            ARTS_CLASIF_8: secundResponse[j].ARTS_CLASIF_8,
                            CIMP_TASA: secundResponse[j].CIMP_TASA,
                            ARTS_PESO_EMB_UMS: secundResponse[j].ARTS_PESO_EMB_UMS,
                            DVC1_LISTA_PRECVTA: secundResponse[j].DVC1_LISTA_PRECVTA,
                            DCA1_POR_DESCUENTO: secundResponse[j].DCA1_POR_DESCUENTO,
                            ARPV_PRECIO_VTA: secundResponse[j].ARPV_PRECIO_VTA,
                            ARPV_MONEDA: secundResponse[j].ARPV_MONEDA,
                            ARPV_FECHA_ULT_ACT: secundResponse[j].ARPV_FECHA_ULT_ACT,
                            COTI_COTIZACION: secundResponse[j].COTI_COTIZACION,
                            COTI_FECHA: secundResponse[j].COTI_FECHA,
                            Fecha_cambio_precios_hasta: secundResponse[j].Fecha_cambio_precios_hasta,
                            PRECIO_LISTA_CON_IVA: secundResponse[j].PRECIO_LISTA_CON_IVA,
                            Fecha_Ult_Modif: secundResponse[j].Fecha_Ult_Modif,
                            Delay_cambio_precio: secundResponse[j].Delay_cambio_precio,
                        });
                    }
                }
            }
            return results
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response  
}

async function getVN_2() {
    let endpoints3 = [
        `${process.env.URL_API}` + 'familiaarticulosdistribucion',
        `${process.env.URL_API}` + 'vnsindtofinanc',
      ];
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].Codigo_producto === secundResponse[j].ARTS_ARTICULO_EMP) {
                        results.push({
                            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA, 
                            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
                            Orden_producto: firstResponse[i].Orden_producto,
                            cod_set_art: '',
                            nombre_set_art: '',
                            cod_familia_art: firstResponse[i].id,
                            nombre_familia_art: firstResponse[i].nombre_familia,
                            nro_orden_familia: firstResponse[i].orden_familia,
                            ARTS_ARTICULO: secundResponse[j].ARTS_ARTICULO,
                            ARTS_ARTICULO_EMP: secundResponse[j].ARTS_ARTICULO_EMP,
                            ARTS_NOMBRE: secundResponse[j].ARTS_NOMBRE,
                            ARTS_UNIMED_STOCK: secundResponse[j].ARTS_UNIMED_STOCK,
                            ARVE_BLOQUEO_VENTA: secundResponse[j].ARVE_BLOQUEO_VENTA,
                            ARTS_FACTOR_HOMSTO: secundResponse[j].ARTS_FACTOR_HOMSTO,
                            COD_CTE: secundResponse[j].COD_CTE,
                            ARTS_CLASIF_1: secundResponse[j].ARTS_CLASIF_1,
                            ARTS_CLASIF_8: secundResponse[j].ARTS_CLASIF_8,
                            CIMP_TASA: secundResponse[j].CIMP_TASA,
                            ARTS_PESO_EMB_UMS: secundResponse[j].ARTS_PESO_EMB_UMS,
                            DVC1_LISTA_PRECVTA: secundResponse[j].DVC1_LISTA_PRECVTA,
                            DCA1_POR_DESCUENTO: secundResponse[j].DCA1_POR_DESCUENTO,
                            ARPV_PRECIO_VTA: secundResponse[j].ARPV_PRECIO_VTA,
                            ARPV_MONEDA: secundResponse[j].ARPV_MONEDA,
                            ARPV_FECHA_ULT_ACT: secundResponse[j].ARPV_FECHA_ULT_ACT,
                            COTI_COTIZACION: secundResponse[j].COTI_COTIZACION,
                            COTI_FECHA: secundResponse[j].COTI_FECHA,
                            Fecha_cambio_precios_hasta: secundResponse[j].Fecha_cambio_precios_hasta,
                            PRECIO_LISTA_CON_IVA: secundResponse[j].PRECIO_LISTA_CON_IVA,
                            Fecha_Ult_Modif: secundResponse[j].Fecha_Ult_Modif,
                            Delay_cambio_precio: secundResponse[j].Delay_cambio_precio,
                        });
                    }
                }
            }
            return results
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response  
}

async function getLPDistribucion(){
    let endpoints4 = [
        `${process.env.URL_API}` + 'rubrosventas',
        `${process.env.URL_API}` + 'lpvnrubrosvtasdistribucion',
      ];
      let response2 = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].rubros_id === secundResponse[j].ARVE_RUBRO_VENTA) {
                        results.push({
                            RUBV_COD: firstResponse[i].rubros_id,
                            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA, 
                            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
                            RUBV_ORDEN: firstResponse[i].orden_rubros, 
                            cod_familia_art: secundResponse[j].cod_familia_art,
                            nombre_familia_art: secundResponse[j].nombre_familia_art,
                            nro_orden_familia: secundResponse[j].nro_orden_familia,                          
                            cod_set_art: secundResponse[j].cod_set_art,
                            nombre_set_art: secundResponse[j].nombre_set_art,
                            ORDEN_ARTICULO: secundResponse[j].Orden_producto,
                            ARTS_ARTICULO: secundResponse[j].ARTS_ARTICULO,
                            ARTS_ARTICULO_EMP: secundResponse[j].ARTS_ARTICULO_EMP,
                            ARTS_NOMBRE: secundResponse[j].ARTS_NOMBRE,
                            ARTS_UNIMED_STOCK: secundResponse[j].ARTS_UNIMED_STOCK,
                            ARVE_BLOQUEO_VENTA: secundResponse[j].ARVE_BLOQUEO_VENTA,
                            ARTS_FACTOR_HOMSTO: secundResponse[j].ARTS_FACTOR_HOMSTO,
                            COD_CTE: secundResponse[j].COD_CTE,
                            ARTS_CLASIF_1: secundResponse[j].ARTS_CLASIF_1,
                            ARTS_CLASIF_8: secundResponse[j].ARTS_CLASIF_8,
                            CIMP_TASA: secundResponse[j].CIMP_TASA,
                            ARTS_PESO_EMB_UMS: secundResponse[j].ARTS_PESO_EMB_UMS,
                            DVC1_LISTA_PRECVTA: secundResponse[j].DVC1_LISTA_PRECVTA,
                            DCA1_POR_DESCUENTO: secundResponse[j].DCA1_POR_DESCUENTO,
                            ARPV_PRECIO_VTA: secundResponse[j].ARPV_PRECIO_VTA,
                            ARPV_MONEDA: secundResponse[j].ARPV_MONEDA,
                            ARPV_FECHA_ULT_ACT: secundResponse[j].ARPV_FECHA_ULT_ACT,
                            COTI_COTIZACION: secundResponse[j].COTI_COTIZACION,
                            COTI_FECHA: secundResponse[j].COTI_FECHA,
                            Fecha_cambio_precios_hasta: secundResponse[j].Fecha_cambio_precios_hasta,
                            PRECIO_LISTA_CON_IVA: secundResponse[j].PRECIO_LISTA_CON_IVA,
                            Fecha_Ult_Modif: secundResponse[j].Fecha_Ult_Modif,
                            Delay_cambio_precio: secundResponse[j].Delay_cambio_precio,
                        });
                    }
                }
            }
            return results;
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response2
}

async function getPlanillaImportarStock(){
    let endpoints4 = [
        `${process.env.URL_API}` + 'planillaimportar',
        `${process.env.URL_API}` + 'stockfisicoydispon',
        `${process.env.URL_API}` + 'listadeprecioweb',
        `${process.env.URL_API}` + 'artsclasif5alconsultar',
      ];
      let response = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`,'Accept-Encoding': 'gzip, deflate, br'}}))).then(
        ([{data: firstResponse}, {data: secundResponse}, {data: threeResponse}, {data: fourResponse}]) => {
            //console.log(fourResponse)
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].SKU === secundResponse[j].Cod_Art) {
                        results.push({
                            ProductType: firstResponse[i].ProductType,
                            Name: firstResponse[i].Name,
                            ShortDescription: secundResponse[j].ARTS_CLASIF_8 == "0130" && secundResponse[j].Uni_M2_Disp == 0 ? "<strong>Producto sin stock. Disponible a pedido de cliente. Antes de comprar, consultanos por el plazo de entrega.</strong>" :
                                              fourResponse.filter(item => secundResponse[j].ARTS_CLASIF_5 == item.arts_clasif_5[0]['input']) && secundResponse[j].Uni_M2_Disp == 0 ? "<strong>"+fourResponse.map(data => data.descripcion)[0] + "<a class='navigation-block__link navigation-block__link--whatsapp' href='https://wa.me/"+fourResponse.map(data => data.whatsapp.replace('+', '')) +"'>"+ fourResponse.map(data => data.whatsapp) +"</a></strong>" :
                                              secundResponse[j].ARTS_CLASIF_8 == "0180" ? "<strong>Discontinuado. Venta hasta agotar stock.</strong>" :
                                              secundResponse[j].ARTS_CLASIF_8 == "0190" ? "<strong>Discontinuado. Venta hasta agotar stock.</strong>" :
                                              secundResponse[j].ARTS_CLASIF_8 == "0004" ? "<strong>* Antes de la compra leé las Recomendaciones para la Colocación de Cerámicas y Porcelanatos, <a style='color: green' href='https://www.nimat.com.ar/Content/Images/uploaded/pdf/Recomendacionesparaceramicasyterminaciones.pdf'>ver aquí</a>.</strong>" :
                                              "",
                            FullDescription: firstResponse[i].FullDescription,
                            ProductTemplate: firstResponse[i].ProductTemplate,
                            MetaKeywords: firstResponse[i].MetaKeywords,
                            MetaDescription: firstResponse[i].MetaDescription,
                            MetaTitle: firstResponse[i].MetaTitle,
                            SeName: firstResponse[i].SeName,
                            AllowCustomerReviews: firstResponse[i].AllowCustomerReviews,
                            Published: secundResponse[j].ARVE_BLOQUEO_VENTA == 1 ? "BLOQUEADO" 
                            : secundResponse[j].ARTS_CLASIF_8 == "0180" && secundResponse[j].Uni_M2_Disp == 0 ? "FALSE" 
                            : secundResponse[j].ARTS_CLASIF_8 == "0190" && secundResponse[j].Uni_M2_Disp == 0 ? "FALSE" 
                            : secundResponse[j].ARTS_CLASIF_8 == "0130" ? "TRUE" 
                            : firstResponse[i].SKU.substring(0,2)=="81" ? "TRUE" 
                            : "FALSE",
                            SKU: firstResponse[i].SKU,
                            IsShipEnabled: firstResponse[i].IsShipEnabled,
                            ManageInventoryMethod: firstResponse[i].ManageInventoryMethod,
                            StockQuantity: secundResponse[j].Uni_M2_Disp,
                            DisplayStockAvailability: secundResponse[j].ARTS_CLASIF_8 == "0130" && secundResponse[j].Uni_M2_Disp == 0 ? "FALSE" : 
                                                      fourResponse.filter(item => secundResponse[j].ARTS_CLASIF_5 == item.arts_clasif_5[0]['input']) && secundResponse[j].Uni_M2_Disp == 0 ? 'FALSE' :
                                                      firstResponse[i].SKU.substring(0,3)=="811" ? "TRUE" : "TRUE",
                            DisplayStockQuantity: "TRUE",
                            NotifyAdminForQuantityBelow: firstResponse[i].NotifyAdminForQuantityBelow,
                            BackorderMode: firstResponse[i].BackorderMode,
                            OrderMinimumQuantity: firstResponse[i].OrderMinimumQuantity,
                            OrderMaximumQuantity: 1000,
                            CallForPrice: firstResponse[i].CallForPrice,
                            DisableBuyButton: secundResponse[j].ARTS_CLASIF_8 == "0130" && secundResponse[j].Uni_M2_Disp == 0 ? "TRUE" :  secundResponse[j].Uni_M2_Disp == 0 ? "TRUE" : "FALSE",
                            Manufacturers: firstResponse[i].Manufacturers,
                            Weight: firstResponse[i].Weight,
                            Picture1: firstResponse[i].Picture1,
                            BasepriceAmount: firstResponse[i].BasepriceAmount,
                            Deleted: firstResponse[i].Deleted
                        });
                    }
                }
            }
            var results2 = [];
            for (var i=0; i<results.length; i++) {
                for (var j=0; j<threeResponse.length; j++) {
                    if (results[i].SKU === threeResponse[j].ARTS_ARTICULO_EMP) {
                        results2.push({
                            ProductType: results[i].ProductType,
                            Name: results[i].Name,
                            ShortDescription: results[i].ShortDescription,
                            FullDescription: results[i].FullDescription,
                            ProductTemplate: results[i].ProductTemplate,
                            MetaKeywords: results[i].MetaKeywords,
                            MetaDescription: results[i].MetaDescription,
                            MetaTitle: results[i].MetaTitle,
                            SeName: results[i].SeName,
                            AllowCustomerReviews: results[i].AllowCustomerReviews,
                            Published: results[i].Published,
                            SKU: results[i].SKU,
                            IsShipEnabled: results[i].IsShipEnabled,
                            ManageInventoryMethod: results[i].ManageInventoryMethod,
                            StockQuantity: results[i].StockQuantity,
                            DisplayStockQuantity: results[i].DisplayStockQuantity,
                            DisplayStockAvailability: results[i].DisplayStockAvailability,
                            NotifyAdminForQuantityBelow: results[i].NotifyAdminForQuantityBelow,
                            BackorderMode: results[i].BackorderMode,
                            OrderMinimumQuantity: results[i].OrderMinimumQuantity,
                            OrderMaximumQuantity: results[i].OrderMaximumQuantity,
                            CallForPrice: results[i].CallForPrice,
                            DisableBuyButton: results[i].DisableBuyButton,
                            Price: threeResponse[j].Pre_Cdo_con_IVA_L1,
                            Manufacturers: results[i].Manufacturers,
                            Weight: results[i].Weight,
                            Picture1: results[i].Picture1,
                            BasepriceAmount: results[i].BasepriceAmount,
                            Deleted: results[i].Deleted
                        });
                    }
                }
            }
            return results2;
        } 
    ).catch(function (error) {
        console.error(error);
   });
    return response
}

async function getInformesAcindar(){
    let endpoints = [
        `${process.env.URL_API}` + 'informesacindarptf',
        `${process.env.URL_API}` + 'acindarclasifclientes',
        `${process.env.URL_API}` + 'acindarcomprobantes',
        `${process.env.URL_API}` + 'acindarequivalcodfactorcant',
        `${process.env.URL_API}` + 'ncinformesacindarptf',
        `${process.env.URL_API}` + 'stockartsall'
    ]
    let response = await Promise.all(endpoints.map((endpoint)=> axios.get(endpoint,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: data1}, {data: data2}, {data: data3}, {data: data4}, {data: data5},{data: data6}])=>{
            let getData5 = []
            data5.forEach((e) => {({
                    CVCL_TIPO_VAR,
                    CVCL_SUCURSAL_IMP,
                    CVCL_NUMERO_CVCL,
                    CVRF_RENGLON_CVRF,
                    CVCL_FECHA_EMI,
                    ARTS_ARTICULO_EMP,
                    ARTS_NOMBRE,
                    ...VENT_NCFA
                } = e)
                    let d = getData5.find((x) => e.CVCL_NUMERO_CVCL == x.CVCL_NUMERO_CVCL && e.CVRF_RENGLON_CVRF == x.CVRF_RENGLON_CVRF)
                if (d) {
                    d.VENT_NCFA.push(VENT_NCFA)
                } else {
                    getData5.push({
                        CVCL_TIPO_VAR,
                        CVCL_SUCURSAL_IMP,
                        CVCL_NUMERO_CVCL,
                        CVRF_RENGLON_CVRF,
                        CVCL_FECHA_EMI,
                        ARTS_ARTICULO_EMP,
                        ARTS_NOMBRE,
                        VENT_NCFA: [VENT_NCFA]
                    })
                }
            })
            /* console.log(getData5.map(data => data.VENT_NCFA)) */
            var results = [];
            for(var i = 0; i < data1.length; i++){
                for(var j = 0; j < data2.length; j++){
                    for (var k = 0; k < data3.length; k++){
                        if(data1[i].CLIE_CLASIF_1.trim() == data2[j].clasif_1_ptf && data1[i].Tipo_cpbte == data3[k].comprobante_ptf){
                            var nro_doc_referencia_tipo = data3.filter(item => item.comprobante_ptf == (getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[i].Sucursal && item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC))).map(data => data.comprobante_acindar)
                            var tipo_doc_referencia = data3.filter(item => item.comprobante_ptf == (getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[i].Sucursal && item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC))).map(data => data.tipo_doc_legal)
                            var nro_doc_referencia_sucursal = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[i].Sucursal && item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_SUCURSAL_FC_ANTIC)
                            var nro_doc_referencia_numero = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[i].Sucursal && item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA.map(data => data.NCFA_NUMERO_FC_ANTIC))
                            var nro_doc_referencia_item = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[i].Sucursal && item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_RENGLON_FC_ANTIC)
                            var fecha_doc_referencia = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[i].Sucursal && item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF).map(data => data.CVCL_FECHA_EMI)
                            var nro_doc_referencia_a_observaciones = nro_doc_referencia_numero.toString().length >= 9 ? nro_doc_referencia_numero.map(data => {
                                const acc = [];
                                data.forEach(i => acc.push({
                                    data: (nro_doc_referencia_tipo + '-' + (
                                        nro_doc_referencia_sucursal.toString().length == 1 ? '00' + nro_doc_referencia_sucursal : 
                                        nro_doc_referencia_sucursal.toString().length == 2 ? '0' + nro_doc_referencia_sucursal : 
                                        nro_doc_referencia_sucursal.toString().length == 3 ? nro_doc_referencia_sucursal : 
                                        nro_doc_referencia_sucursal.toString().length == 0 ? '' : '')
                                        + '-' + (
                                        i.toString().length == 1 ? '000000' + i : 
                                        i.toString().length == 2 ? '000000' + i : 
                                        i.toString().length == 3 ? '00000' + i : 
                                        i.toString().length == 4 ? '0000' + i : 
                                        i.toString().length == 5 ? '000' + i : 
                                        i.toString().length == 6 ? '00' + i : 
                                        i.toString().length == 7 ? '0' + i : 
                                        i.toString().length == 8 ? i : 
                                        i.toString().length == 0 ? '' : 
                                        ''))
                                }));
                                acc.shift()
                                return acc.map(data => data.data).join(" - ")
                                }) : ''; 
                            
                            var nro_doc_referencia = nro_doc_referencia_tipo + '-' + (
                                nro_doc_referencia_sucursal.toString().length == 1 ? '00' + nro_doc_referencia_sucursal : 
                                nro_doc_referencia_sucursal.toString().length == 2 ? '0' + nro_doc_referencia_sucursal : 
                                nro_doc_referencia_sucursal.toString().length == 3 ? nro_doc_referencia_sucursal : 
                                nro_doc_referencia_sucursal.toString().length == 0 ? '' : '')
                                + '-' + (
                                nro_doc_referencia_numero.toString().length == 1 ? '000000' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 2 ? '000000' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 3 ? '00000' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 4 ? '0000' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 5 ? '000' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 6 ? '00' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 7 ? '0' + nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length == 8 ? nro_doc_referencia_numero : 
                                nro_doc_referencia_numero.toString().length >= 9 ? nro_doc_referencia_numero.map(data => 
                                    data[0].toString().length == 1 ? '000000' + data[0] : 
                                    data[0].toString().length == 2 ? '000000' + data[0] : 
                                    data[0].toString().length == 3 ? '00000' + data[0] : 
                                    data[0].toString().length == 4 ? '0000' + data[0] : 
                                    data[0].toString().length == 5 ? '000' + data[0] : 
                                    data[0].toString().length == 6 ? '00' + data[0] : 
                                    data[0].toString().length == 7 ? '0' + data[0] : 
                                    data[0].toString().length == 8 ? data : '' ) : 
                                nro_doc_referencia_numero.toString().length == 0 ? '' : '')


                            const cantidadxfactor = (data1[i].Cant * (data4.filter(item => item.codigo_ptf == data1[i].ARTS_ARTICULO_EMP).map(data => data.factor_cant)));
                            const codigoAcindar = data4.filter(item => item.codigo_ptf == data1[i].ARTS_ARTICULO_EMP).map(data => data.codigo_acindar);
                            const nombrePTF = data6.filter(item => item.ARTS_ARTICULO_EMP == codigoAcindar).map(data => data.ARTS_NOMBRE);
                            const montoDecimal = data1[i].Subtotal_item_SI_a_infomar_a_Acindar
                            const montoSIDecimal = data1[i].Subtotal_item_SI
                            results.push({
                                DEA: 'PRD',
                                SUCURSAL: '1',
                                NRO_DOC_LEGAL: data3[k].comprobante_acindar.replace(/\./g, '') + '-' + data1[i].Comprobante.substring(0,4).replace(/\./g, '') + '-' + data1[i].Comprobante.substring(9).replace(/\./g, ''),
                                TIPO_DOC_LEGAL: data3[k].tipo_doc_legal.replace(/\./g, ''),
                                TIPO_DE_TRANSACCION: data3[k].tipo_de_transaccion.replace(/\./g, ''),
                                ITEM_DOC_LEGAL: data1[i].CVRF_RENGLON_CVRF,
                                FECHA_DOC_LEGAL: data1[i].CVCL_FECHA_EMI.replace(/\./g, ''),
                                NRO_DOC_REFERENCIA: nro_doc_referencia == "--" ? '': nro_doc_referencia.toString().replace(/\./g, ''),
                                TIPO_DOC_REF: tipo_doc_referencia.toString().replace(/\./g, ''),
                                ITEM_DOC_REF: nro_doc_referencia_item.toString().replace(/\./g, ''),
                                FECHA_DOC_REF: fecha_doc_referencia.toString().replace(/\./g, ''),
                                CUIT: data1[i].CLIE_CUIT.replace(/\./g, ''),
                                NRO_INTERNO_CLIENTE: data1[i].CVCL_CLIENTE,
                                RAZON_SOCIAL: data1[i].CLIE_NOMBRE.trim().replace(/\./g, ''),
                                SEGMENTO: data2[j].segmento_cliente_acindar.replace(/\./g, ''),
                                DIRECCION: data1[i].CLIE_DOMICILIO.replace(/\./g, ''),
                                CIUDAD: data1[i].CLIE_LOCALIDAD.replace(/\./g, ''),
                                PROVINCIA: data1[i].PCIA_NOMBRE.replace(/\./g, ''),
                                CODIGO_ART: codigoAcindar.toString().replace(/\./g, ''),
                                DESCRIPCION: data1[i].ARTS_NOMBRE !== nombrePTF.toString() ? nombrePTF.toString().replace(/\./g, '') : data1[i].ARTS_NOMBRE.replace(/\./g, ''),
                                UMV: data1[i].CVRF_UNIMED.replace(/\./g, ''),
                                CANTIDAD: cantidadxfactor.toString().replace(/\./g, ','),
                                MONTO: Number(montoDecimal).toFixed(2).replace(/\./g, ','),
                                FECHA_COSTO: data1[i].Fecha_Costo.replace(/\./g, ''),
                                DESCRIPCION_COND_VTA: data1[i].Nombre_Cond_Vta.replace(/\./g, ''),
                                DIAS: data1[i].DIAS_COND_VTA,
                                OBSERVACION: nro_doc_referencia_a_observaciones.toString().length > 1 && data2[j].observacion.toString().length > 1 ? data2[j].observacion +', Otros DOC REFERENCIA: '+ nro_doc_referencia_a_observaciones.toString().replace(/\./g, '') : nro_doc_referencia_a_observaciones.toString().length > 1 ? 'Otros DOC REFERENCIA: '+ nro_doc_referencia_a_observaciones.toString().replace(/\./g, '') : data2[j].observacion 
                            })
                        }
                    }
                    
                }
            }
            return results
        }
    )
    return response
}

async function getInformesAcindarEntreFechas(getDates){
    try{
        var data1 = [];
        var data5 = [];
        let getData1 = await Db.InformesAcindarPTFDate(getDates).then((response)=>data1.push(response))
        let getData2 = await Db.NCInformesAcindarPTFDate(getDates).then((response)=>data5.push(response))
        
        let getData5 = []

        data5[0][0].forEach((e) => {
        ({
            CVCL_TIPO_VAR,
            CVCL_SUCURSAL_IMP,
            CVCL_NUMERO_CVCL,
            CVRF_RENGLON_CVRF,
            CVCL_FECHA_EMI,
            ARTS_ARTICULO_EMP,
            ARTS_NOMBRE,
            ...VENT_NCFA
        } = e)
        let d = getData5.find((x) => e.CVCL_NUMERO_CVCL == x.CVCL_NUMERO_CVCL && e.CVRF_RENGLON_CVRF == x.CVRF_RENGLON_CVRF)
        if (d) {
            d.VENT_NCFA.push(VENT_NCFA)
        } else {
            getData5.push({
                CVCL_TIPO_VAR,
                CVCL_SUCURSAL_IMP,
                CVCL_NUMERO_CVCL,
                CVRF_RENGLON_CVRF,
                CVCL_FECHA_EMI,
                ARTS_ARTICULO_EMP,
                ARTS_NOMBRE,
                VENT_NCFA: [VENT_NCFA]
            })
        }
        })
        
        let endpoints = [
            `${process.env.URL_API}` + 'acindarclasifclientes',
            `${process.env.URL_API}` + 'acindarcomprobantes',
            `${process.env.URL_API}` + 'acindarequivalcodfactorcant',
            `${process.env.URL_API}` + 'stockartsall'
        ]

        let response = await Promise.all(endpoints.map((endpoint)=> axios.get(endpoint,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
            ([{data: data2},{data: data3},{data: data4},{data: data6}])=>{
                var results = [];
                for(var i = 0; i < data1[0][0].length; i++){
                    for(var j = 0; j < data2.length; j++){
                        for (var k = 0; k < data3.length; k++){
                            if(data1[0][0][i].CLIE_CLASIF_1.trim() == data2[j].clasif_1_ptf && data1[0][0][i].Tipo_cpbte == data3[k].comprobante_ptf){
                                var nro_doc_referencia_tipo = data3.filter(item => item.comprobante_ptf == (getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC))).map(data => data.comprobante_acindar)
                                var tipo_doc_referencia = data3.filter(item => item.comprobante_ptf == (getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC))).map(data => data.tipo_doc_legal)
                                var nro_doc_referencia_sucursal = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_SUCURSAL_FC_ANTIC)
                                var nro_doc_referencia_numero = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA.map(data => data.NCFA_NUMERO_FC_ANTIC))
                                var nro_doc_referencia_item = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_RENGLON_FC_ANTIC)
                                var fecha_doc_referencia = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.CVCL_FECHA_EMI)
                                var nro_doc_referencia_a_observaciones = nro_doc_referencia_numero.toString().length >= 9 ? nro_doc_referencia_numero.map(data => {
                                    const acc = [];
                                    data.forEach(i => acc.push({
                                        data: (nro_doc_referencia_tipo + '-' + (
                                            nro_doc_referencia_sucursal.toString().length == 1 ? '00' + nro_doc_referencia_sucursal : 
                                            nro_doc_referencia_sucursal.toString().length == 2 ? '0' + nro_doc_referencia_sucursal : 
                                            nro_doc_referencia_sucursal.toString().length == 3 ? nro_doc_referencia_sucursal : 
                                            nro_doc_referencia_sucursal.toString().length == 0 ? '' : '')
                                            + '-' + (
                                            i.toString().length == 1 ? '000000' + i : 
                                            i.toString().length == 2 ? '000000' + i : 
                                            i.toString().length == 3 ? '00000' + i : 
                                            i.toString().length == 4 ? '0000' + i : 
                                            i.toString().length == 5 ? '000' + i : 
                                            i.toString().length == 6 ? '00' + i : 
                                            i.toString().length == 7 ? '0' + i : 
                                            i.toString().length == 8 ? i : 
                                            i.toString().length == 0 ? '' : 
                                            ''))
                                    }));
                                    acc.shift()
                                    return acc.map(data => data.data).join(" - ")
                                    }) : ''; 
                                
                                var nro_doc_referencia = nro_doc_referencia_tipo + '-' + (
                                    nro_doc_referencia_sucursal.toString().length == 1 ? '00' + nro_doc_referencia_sucursal : 
                                    nro_doc_referencia_sucursal.toString().length == 2 ? '0' + nro_doc_referencia_sucursal : 
                                    nro_doc_referencia_sucursal.toString().length == 3 ? nro_doc_referencia_sucursal : 
                                    nro_doc_referencia_sucursal.toString().length == 0 ? '' : '')
                                    + '-' + (
                                    nro_doc_referencia_numero.toString().length == 1 ? '000000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 2 ? '000000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 3 ? '00000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 4 ? '0000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 5 ? '000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 6 ? '00' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 7 ? '0' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 8 ? nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length >= 9 ? nro_doc_referencia_numero.map(data => 
                                        data[0].toString().length == 1 ? '000000' + data[0] : 
                                        data[0].toString().length == 2 ? '000000' + data[0] : 
                                        data[0].toString().length == 3 ? '00000' + data[0] : 
                                        data[0].toString().length == 4 ? '0000' + data[0] : 
                                        data[0].toString().length == 5 ? '000' + data[0] : 
                                        data[0].toString().length == 6 ? '00' + data[0] : 
                                        data[0].toString().length == 7 ? '0' + data[0] : 
                                        data[0].toString().length == 8 ? data : '' ) : 
                                    nro_doc_referencia_numero.toString().length == 0 ? '' : '')
    


                                const cantidadxfactor = (data1[0][0][i].Cant * (data4.filter(item => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP).map(data => data.factor_cant)));
                                const codigoAcindar = data4.filter(item => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP).map(data => data.codigo_acindar);
                                const nombrePTF = data6.filter(item => item.ARTS_ARTICULO_EMP == codigoAcindar).map(data => data.ARTS_NOMBRE)
                                const montoDecimal = data1[0][0][i].Subtotal_item_SI_a_infomar_a_Acindar
                                const montoSIDecimal = data1[0][0][i].Subtotal_item_SI
                                results.push({
                                    DEA: 'PRD',
                                    SUCURSAL: '1',
                                    NRO_DOC_LEGAL: data3[k].comprobante_acindar + '-' + data1[0][0][i].Comprobante.substring(0,4) + '-' + data1[0][0][i].Comprobante.substring(9),
                                    TIPO_DOC_LEGAL: data3[k].tipo_doc_legal,
                                    TIPO_DE_TRANSACCION: data3[k].tipo_de_transaccion,
                                    ITEM_DOC_LEGAL: data1[0][0][i].CVRF_RENGLON_CVRF,
                                    FECHA_DOC_LEGAL: data1[0][0][i].CVCL_FECHA_EMI,
                                    NRO_DOC_REFERENCIA: nro_doc_referencia == "--" ? '': nro_doc_referencia,
                                    TIPO_DOC_REF: tipo_doc_referencia,
                                    ITEM_DOC_REF: nro_doc_referencia_item,
                                    FECHA_DOC_REF: fecha_doc_referencia,
                                    CUIT: data1[0][0][i].CLIE_CUIT,
                                    NRO_INTERNO_CLIENTE: data1[0][0][i].CVCL_CLIENTE,
                                    RAZON_SOCIAL: data1[0][0][i].CLIE_NOMBRE.replace(/\s+/g, ' '),
                                    SEGMENTO: data2[j].segmento_cliente_acindar,
                                    DIRECCION: data1[0][0][i].CLIE_DOMICILIO,
                                    CIUDAD: data1[0][0][i].CLIE_LOCALIDAD,
                                    PROVINCIA: data1[0][0][i].PCIA_NOMBRE,
                                    CODIGO_ART: codigoAcindar,
                                    DESCRIPCION: data1[0][0][i].ARTS_NOMBRE !== nombrePTF.toString() ? nombrePTF.toString() : data1[0][0][i].ARTS_NOMBRE,
                                    UMV: data1[0][0][i].CVRF_UNIMED,
                                    CANTIDAD: cantidadxfactor,
                                    CANTIDAD_ING: data1[0][0][i].Cant,
                                    SUBTOTAL_ITEM_SI: montoSIDecimal,
                                    MONTO: montoDecimal.toLocaleString('es-AR',{maximumFractionDigits:2, useGrouping:false}),
                                    FECHA_COSTO: data1[0][0][i].Fecha_Costo,
                                    DESCRIPCION_COND_VTA: data1[0][0][i].Nombre_Cond_Vta,
                                    DIAS: data1[0][0][i].DIAS_COND_VTA,
                                    OBSERVACION: nro_doc_referencia_a_observaciones.toString().length > 1 && data2[j].observacion.toString().length > 1 ? data2[j].observacion +', Otros DOC REFERENCIA: '+ nro_doc_referencia_a_observaciones.toString().replace(/\./g, '') : nro_doc_referencia_a_observaciones.toString().length > 1 ? 'Otros DOC REFERENCIA: '+ nro_doc_referencia_a_observaciones.toString().replace(/\./g, '') : data2[j].observacion 
                                })
                            }
                        }
                        
                    }
                } 
                return results
            }
        )
        return response
    }
    catch(e){
        console.error(e)
    }
}

async function getInformesAcindarEntreFechasExportar(getDates){
    try{
        var data1 = [];
        var data5 = [];
        let getData1 = await Db.InformesAcindarPTFDate(getDates).then((response)=>data1.push(response))
        let getData2 = await Db.NCInformesAcindarPTFDate(getDates).then((response)=>data5.push(response))

        let getData5 = []

        data5[0][0].forEach((e) => {
        ({
            CVCL_TIPO_VAR,
            CVCL_SUCURSAL_IMP,
            CVCL_NUMERO_CVCL,
            CVRF_RENGLON_CVRF,
            CVCL_FECHA_EMI,
            ARTS_ARTICULO_EMP,
            ARTS_NOMBRE,
            ...VENT_NCFA
        } = e)
        let d = getData5.find((x) => e.CVCL_NUMERO_CVCL == x.CVCL_NUMERO_CVCL && e.CVRF_RENGLON_CVRF == x.CVRF_RENGLON_CVRF)
        if (d) {
            d.VENT_NCFA.push(VENT_NCFA)
        } else {
            getData5.push({
                CVCL_TIPO_VAR,
                CVCL_SUCURSAL_IMP,
                CVCL_NUMERO_CVCL,
                CVRF_RENGLON_CVRF,
                CVCL_FECHA_EMI,
                ARTS_ARTICULO_EMP,
                ARTS_NOMBRE,
                VENT_NCFA: [VENT_NCFA]
            })
        }
        })
        
        let endpoints = [
            `${process.env.URL_API}` + 'acindarclasifclientes',
            `${process.env.URL_API}` + 'acindarcomprobantes',
            `${process.env.URL_API}` + 'acindarequivalcodfactorcant',
            `${process.env.URL_API}` + 'stockartsall'
        ]

        let response = await Promise.all(endpoints.map((endpoint)=> axios.get(endpoint,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
            ([{data: data2},{data: data3},{data: data4},{data: data6}])=>{
                var results = [];
                for(var i = 0; i < data1[0][0].length; i++){
                    for(var j = 0; j < data2.length; j++){
                        for (var k = 0; k < data3.length; k++){
                            if(data1[0][0][i].CLIE_CLASIF_1.trim() == data2[j].clasif_1_ptf && data1[0][0][i].Tipo_cpbte == data3[k].comprobante_ptf){
                                var nro_doc_referencia_tipo = data3.filter(item => item.comprobante_ptf == (getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC))).map(data => data.comprobante_acindar)
                                var tipo_doc_referencia = data3.filter(item => item.comprobante_ptf == (getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC))).map(data => data.tipo_doc_legal)
                                var nro_doc_referencia_sucursal = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_SUCURSAL_FC_ANTIC)
                                var nro_doc_referencia_numero = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA.map(data => data.NCFA_NUMERO_FC_ANTIC))
                                var nro_doc_referencia_item = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.VENT_NCFA[0].NCFA_RENGLON_FC_ANTIC)
                                var fecha_doc_referencia = getData5.filter(item => item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte && item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal && item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF).map(data => data.CVCL_FECHA_EMI)
                                
                                var nro_doc_referencia_a_observaciones = nro_doc_referencia_numero.toString().length >= 9 ? nro_doc_referencia_numero.map(data => {
                                    const acc = [];
                                    data.forEach(i => acc.push({
                                        data: (nro_doc_referencia_tipo + '-' + (
                                            nro_doc_referencia_sucursal.toString().length == 1 ? '00' + nro_doc_referencia_sucursal : 
                                            nro_doc_referencia_sucursal.toString().length == 2 ? '0' + nro_doc_referencia_sucursal : 
                                            nro_doc_referencia_sucursal.toString().length == 3 ? nro_doc_referencia_sucursal : 
                                            nro_doc_referencia_sucursal.toString().length == 0 ? '' : '')
                                            + '-' + (
                                            i.toString().length == 1 ? '000000' + i : 
                                            i.toString().length == 2 ? '000000' + i : 
                                            i.toString().length == 3 ? '00000' + i : 
                                            i.toString().length == 4 ? '0000' + i : 
                                            i.toString().length == 5 ? '000' + i : 
                                            i.toString().length == 6 ? '00' + i : 
                                            i.toString().length == 7 ? '0' + i : 
                                            i.toString().length == 8 ? i : 
                                            i.toString().length == 0 ? '' : 
                                            ''))
                                    }));
                                    acc.shift()
                                    return acc.map(data => data.data).join(" - ")
                                    }) : ''; 
                                
                                var nro_doc_referencia = nro_doc_referencia_tipo + '-' + (
                                    nro_doc_referencia_sucursal.toString().length == 1 ? '00' + nro_doc_referencia_sucursal : 
                                    nro_doc_referencia_sucursal.toString().length == 2 ? '0' + nro_doc_referencia_sucursal : 
                                    nro_doc_referencia_sucursal.toString().length == 3 ? nro_doc_referencia_sucursal : 
                                    nro_doc_referencia_sucursal.toString().length == 0 ? '' : '')
                                    + '-' + (
                                    nro_doc_referencia_numero.toString().length == 1 ? '000000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 2 ? '000000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 3 ? '00000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 4 ? '0000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 5 ? '000' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 6 ? '00' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 7 ? '0' + nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length == 8 ? nro_doc_referencia_numero : 
                                    nro_doc_referencia_numero.toString().length >= 9 ? nro_doc_referencia_numero.map(data => 
                                        data[0].toString().length == 1 ? '000000' + data[0] : 
                                        data[0].toString().length == 2 ? '000000' + data[0] : 
                                        data[0].toString().length == 3 ? '00000' + data[0] : 
                                        data[0].toString().length == 4 ? '0000' + data[0] : 
                                        data[0].toString().length == 5 ? '000' + data[0] : 
                                        data[0].toString().length == 6 ? '00' + data[0] : 
                                        data[0].toString().length == 7 ? '0' + data[0] : 
                                        data[0].toString().length == 8 ? data : '' ) : 
                                    nro_doc_referencia_numero.toString().length == 0 ? '' : '')
    

                                const cantidadxfactor = (data1[0][0][i].Cant * (data4.filter(item => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP).map(data => data.factor_cant)));
                                const codigoAcindar = data4.filter(item => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP).map(data => data.codigo_acindar);
                                const nombrePTF = data6.filter(item => item.ARTS_ARTICULO_EMP == codigoAcindar).map(data => data.ARTS_NOMBRE);
                                const montoDecimal = data1[0][0][i].Subtotal_item_SI_a_infomar_a_Acindar
                                const montoSIDecimal = data1[0][0][i].Subtotal_item_SI
                                results.push({
                                    DEA: 'PRD',
                                    SUCURSAL: '1',
                                    NRO_DOC_LEGAL: data3[k].comprobante_acindar.replace(/\./g, '') + '-' + data1[0][0][i].Comprobante.substring(0,4).replace(/\./g, '') + '-' + data1[0][0][i].Comprobante.substring(9).replace(/\./g, ''),
                                    TIPO_DOC_LEGAL: data3[k].tipo_doc_legal.replace(/\./g, ''),
                                    TIPO_DE_TRANSACCION: data3[k].tipo_de_transaccion.replace(/\./g, ''),
                                    ITEM_DOC_LEGAL: data1[0][0][i].CVRF_RENGLON_CVRF,
                                    FECHA_DOC_LEGAL: data1[0][0][i].CVCL_FECHA_EMI.replace(/\./g, ''),
                                    NRO_DOC_REFERENCIA: nro_doc_referencia == "--" ? '': nro_doc_referencia.toString().replace(/\./g, ''),
                                    TIPO_DOC_REF: tipo_doc_referencia.toString().replace(/\./g, ''),
                                    ITEM_DOC_REF: nro_doc_referencia_item.toString().replace(/\./g, ''),
                                    FECHA_DOC_REF: fecha_doc_referencia.toString().replace(/\./g, ''),
                                    CUIT: data1[0][0][i].CLIE_CUIT == null ? "" : data1[0][0][i].CLIE_CUIT.replace(/\./g, ''),
                                    NRO_INTERNO_CLIENTE: data1[0][0][i].CVCL_CLIENTE,
                                    RAZON_SOCIAL: data1[0][0][i].CLIE_NOMBRE.trim().replace(/\./g, ''),
                                    SEGMENTO: data2[j].segmento_cliente_acindar.replace(/\./g, ''),
                                    DIRECCION: data1[0][0][i].CLIE_DOMICILIO.replace(/\./g, ''),
                                    CIUDAD: !data1[0][0][i].CLIE_LOCALIDAD ? '' : data1[0][0][i].CLIE_LOCALIDAD.replace(/\./g, ''),
                                    PROVINCIA: data1[0][0][i].PCIA_NOMBRE.replace(/\./g, ''),
                                    CODIGO_ART: codigoAcindar.toString().replace(/\./g, ''),
                                    DESCRIPCION: data1[0][0][i].ARTS_NOMBRE !== nombrePTF.toString() ? nombrePTF.toString().replace(/\./g, '') : data1[0][0][i].ARTS_NOMBRE.replace(/\./g, ''),
                                    UMV: data1[0][0][i].CVRF_UNIMED.replace(/\./g, ''),
                                    CANTIDAD: cantidadxfactor.toString().replace(/\./g, ','),
                                    MONTO: montoDecimal.toLocaleString('es-AR',{maximumFractionDigits:2, useGrouping:false}),
                                    FECHA_COSTO: data1[0][0][i].Fecha_Costo,
                                    DESCRIPCION_COND_VTA: data1[0][0][i].Nombre_Cond_Vta.replace(/\./g, ''),
                                    DIAS: data1[0][0][i].DIAS_COND_VTA,
                                    OBSERVACION: nro_doc_referencia_a_observaciones.toString().length > 1 && data2[j].observacion.toString().length > 1 ? data2[j].observacion +', Otros DOC REFERENCIA: '+ nro_doc_referencia_a_observaciones.toString().replace(/\./g, '') : nro_doc_referencia_a_observaciones.toString().length > 1 ? 'Otros DOC REFERENCIA: '+ nro_doc_referencia_a_observaciones.toString().replace(/\./g, '') : data2[j].observacion
                                })
                            }
                        }
                        
                    }
                } 
                return results
            }
        )
        return response
    }
    catch(e){
        console.error(e)
    }
}

/* async function getListaStock() {
    let endpoints = [
        `${process.env.URL_API}` + 'depositoanoconsiderarparastockfisico',
        `${process.env.URL_API}` + 'stock'
    ]
    let response = await Promise.all(endpoints.map((endpoint) => axios.get(endpoint,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            var results2 = secundResponse.map(function(e) {
                return Object.assign({}, e, firstResponse.reduce(function(acc, val) {
                    if (val.codigo_deposito == e.STDP_DEPOSITO) {
                        return val
                    } else {
                        return acc
                    }
                }, {}))
            });
            results2.forEach(elements =>{
                if(elements.codigo_deposito == null){
                  results.push(
                    {
                        ARTS_ART: elements.ARTS_ARTICULO,
                        ARTS_COD: elements.ARTS_ARTICULO_EMP,
                        ARTS_NOMBRE: elements.ARTS_NOMBRE,
                        STDP_STOCK_ACT: elements.STDP_STOCK_ACT,
                        ARTS_UNIMED_HOMSTO: elements.ARTS_UNIMED_HOMSTO,
                        ARTS_FACTOR_HOMSTO: elements.ARTS_FACTOR_HOMSTO,
                        ARTS_CLASIF_1: elements.ARTS_CLASIF_1,
                        ARTS_CLASIF_2: elements.ARTS_CLASIF_2,
                        ARTS_CLASIF_3: elements.ARTS_CLASIF_3,
                        ARTS_CLASIF_4: elements.ARTS_CLASIF_4,
                        ARTS_CLASIF_5: elements.ARTS_CLASIF_5,
                        ARTS_CLASIF_6: elements.ARTS_CLASIF_6,
                        ARTS_CLASIF_7: elements.ARTS_CLASIF_7,
                        ARTS_CLASIF_8: elements.ARTS_CLASIF_8
                    }
                    )
                }
            })

            const sumMap = new Map();

            for (entry of results) {
                if (entry.ARTS_COD) {
                  const batchAcc = sumMap.get(entry.ARTS_COD)
              
                  if (batchAcc) {
                    batchAcc.STDP_STOCK_ACT += entry.STDP_STOCK_ACT
                  } else {
                    sumMap.set(entry.ARTS_COD, entry)
                  }
                }
            }
              
            const arr = Array.from(sumMap, ([, value]) => value)
            
            console.log(results.length)
            console.log(arr.length)
            return arr;
        } 
    ).catch(function (error) {
        console.log(error);
    });
    return response;  
} */

module.exports = {
    getListadePrecioBUI2,
    getConsSecoConfig,
    getListaConstSeco,
    getFamiliaArts,
    getFamiliaArts2,
    getVN_1,
    getVN_2,
    getLPDistribucion,
    getPlanillaImportarStock,
    getInformesAcindar,
    getInformesAcindarEntreFechas,
    getInformesAcindarEntreFechasExportar
    };