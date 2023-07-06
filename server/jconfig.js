require('dotenv').config();
const https = require('https');
const axios = require('axios');
const _ = require('lodash');
const httpsAgent = new https.Agent({ rejectUnauthorized: false }); 
const token = process.env.JWT_TOKEN
async function getListadePrecioBUI2() {
    let endpoints = [
        `${process.env.URL_API}` + 'listadepreciobreveusointerno',
        `${process.env.URL_API}` + 'listabreveuso'
    ]
    let response = await Promise.all(endpoints.map((endpoint) => axios.get(endpoint,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
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
        console.log(error);
   });
    return response;  
}

async function getConsSecoConfig() {
    let endpoints2 = [
        `${process.env.URL_API}` + 'constsecoarmadoconfig1',
        `${process.env.URL_API}` + 'constsecoarmadoconfig2',
        `${process.env.URL_API}` + 'constseconombresconfig',
      ];
    let response = await Promise.all(endpoints2.map((endpoint2) => axios.get(endpoint2,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
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
        console.log(error);
   });
    return response;  
}

async function getListaConstSeco() {
    let endpoints3 = [
        `${process.env.URL_API}` + 'listaconstsecoconfig',
        `${process.env.URL_API}` + 'listaconstsecosql',
      ];
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
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
        console.log(error);
   });
    return response;  
}

async function getFamiliaArts() {
    let endpoints4 = [
        `${process.env.URL_API}` + 'vinculararticulosafamilia',
        `${process.env.URL_API}` + 'familiadearticulo',
        `${process.env.URL_API}` + 'setsdeventas',
      ];
    let response = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}, {data: threeResponse}]) => {

            var joined = firstResponse.map(function(e) {
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
            })
            return joined2
        } 
    ).catch(function (error) {
        console.log(error);
   });
    return response;  
}

async function getFamiliaArts2() {
    let endpoints4 = [
        `${process.env.URL_API}` + 'productospdistribucion',
        `${process.env.URL_API}` + 'familiaartdistribucion',
        `${process.env.URL_API}` + 'setsdeventas',
      ];
    let response = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}, {data: threeResponse}]) => {
            var joined = firstResponse.map(function(e) {
                return Object.assign({}, e,
                    secundResponse.reduce(function(acc, val) {
                        if (val.nombre_familia_art == e.Familia_producto) {
                            return val
                        } else {
                            return acc
                        }}),  
                )
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
            })
            return joined2
        } 
    ).catch(function (error) {
        console.log(error);
   });
    return response;  
}

async function getVN_1() {
    let endpoints3 = [
        `${process.env.URL_API}` + 'familiaarticulos',
        `${process.env.URL_API}` + 'vnsindtofinanc',
      ];
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].cod_art === secundResponse[j].ARTS_ARTICULO_EMP) {
                        results.push({
                            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA, 
                            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
                            cod_art: firstResponse[i].cod_art,
                            cod_set_art: firstResponse[i].cod_set_art,
                            nombre_set_art: firstResponse[i].nombre_set_art,
                            cod_fami_art: firstResponse[i].cod_fami_art,
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
        console.log(error);
   });
    return response  
}

async function getVN_2() {
    let endpoints3 = [
        `${process.env.URL_API}` + 'familiaarticulosdistribucion',
        `${process.env.URL_API}` + 'vnsindtofinanc',
      ];
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {
            var results = [];
            for (var i=0; i<firstResponse.length; i++) {
                for (var j=0; j<secundResponse.length; j++) {
                    if (firstResponse[i].Codigo_producto === secundResponse[j].ARTS_ARTICULO_EMP) {
                        results.push({
                            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA, 
                            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
                            Orden_producto: firstResponse[i].Orden_producto,
                            cod_set_art: firstResponse[i].cod_set_art,
                            nombre_set_art: firstResponse[i].nombre_set_art,
                            cod_familia_art: firstResponse[i].cod_familia_art,
                            nombre_familia_art: firstResponse[i].nombre_familia_art,
                            nro_orden_familia: firstResponse[i].nro_orden_familia,
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
        console.log(error);
   });
    return response  
}

async function getLPDistribucion(){
    let endpoints4 = [
        `${process.env.URL_API}` + 'rubrosventas',
        `${process.env.URL_API}` + 'lpvnrubrosvtasdistribucion',
      ];
      let response2 = await Promise.all(endpoints4.map((endpoint4) => axios.get(endpoint4,{httpsAgent, headers: {'Authorization': `Basic ${token}`}}))).then(
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
        console.log(error);
   });
    return response2
}

module.exports = {
    getListadePrecioBUI2,
    getConsSecoConfig,
    getListaConstSeco,
    getFamiliaArts,
    getFamiliaArts2,
    getVN_1,
    getVN_2,
    getLPDistribucion
    };