const https = require('https');
const axios = require('axios');
const _ = require('lodash');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
async function getListadePrecioBUI2() {
    let endpoints = [
        'https://localhost:8090/api/listadepreciobreveusointerno',
        'https://localhost:8090/api/listabreveuso'        
      ];
    
    let response = await Promise.all(endpoints.map((endpoint) => axios.get(endpoint, {httpsAgent}))).then(
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
    );
    return response;  
}

async function getConsSecoConfig() {
    let endpoints2 = [
        'https://localhost:8090/api/constsecoarmadoconfig1',
        'https://localhost:8090/api/constsecoarmadoconfig2',
        'https://localhost:8090/api/constseconombresconfig'   
      ];
    
    let response = await Promise.all(endpoints2.map((endpoint2) => axios.get(endpoint2,{httpsAgent}))).then(
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
    );
    return response;  
}

async function getListaConstSeco() {
    let endpoints3 = [
        'https://localhost:8090/api/listaconstsecosql',
        'https://localhost:8090/api/listaconstsecoconfig'        
      ];
    
    let response = await Promise.all(endpoints3.map((endpoint3) => axios.get(endpoint3,{httpsAgent}))).then(
        ([{data: firstResponse}, {data: secundResponse}]) => {

            var joined = firstResponse.map(function(e) {
                return Object.assign({}, e, secundResponse.reduce(function(acc, val) {
                    if (val.arts_articulo_emp == e.cod_art) {
                        return val
                    } else {
                        return acc
                    }
                }, {}))
            });
            return joined;
        } 
    );
    return response;  
}

module.exports = {
    getListadePrecioBUI2,
    getConsSecoConfig,
    getListaConstSeco
    };