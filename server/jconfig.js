import dotenv from "dotenv";
dotenv.config();
import Db from "./dboperacion.js";
import Pg from "./dboperacion_pg.js";

async function getListadePrecioBUI2() {
  try {
    const [firstResponse, secundResponse] = await Promise.all([
      await Pg.getListadePrecioBUI2(),
      await Db.getListaPrecioBreveUsoInterno(),
    ]);

    const joined = firstResponse.map((e) => {
      return Object.assign(
        {},
        e,
        secundResponse.reduce((acc, val) => {
          if (val.arts_articulo_emp == e.arts_articulo_emp) {
            return val;
          } else {
            return acc;
          }
        }, {}),
      );
    });

    return joined;
  } catch (error) {
    console.error("Error al obtener los datos de ListadePrecioBUI2:", error);
    throw error;
  }
}

async function getConsSecoConfig() {
  try {
    const [firstResponse, secundResponse, threeResponse] = await Promise.all([
      await Pg.getConstSecoArmadoConfig1_2(),
      await Pg.getConstSecoArmadoConfig2_2(),
      await Pg.getConstSecoNombresConfig_2(),
    ]);

    const joined = firstResponse.map(function (e) {
      return Object.assign(
        {},
        e,
        threeResponse.reduce(function (acc1, val1) {
          if (val1.cod_conf_cs == e.configcs) {
            return val1;
          } else {
            return acc1;
          }
        }),
        secundResponse.reduce(function (acc, val) {
          if (val.cod_art == e.codptf) {
            return val;
          } else {
            return acc;
          }
        }, {}),
      );
    });

    return joined;
  } catch (error) {
    console.error("Error al obtener los datos de ConsSecoConfig:", error);
    throw error;
  }
}

async function getListaConstSeco() {
  try {
    const [firstResponse, secundResponse] = await Promise.all([
      await getConsSecoConfig(),
      await Db.getListaConstSecoSQL(),
    ]);

    var results = [];
    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
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
            COTI_COTIZACION: secundResponse[j].COTI_COTIZACION,
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error("Error al obtener los datos de ListaConstSeco:", error);
    throw error;
  }
}

async function getFamiliaArts() {
  try {
    const [firstResponse, secundResponse, threeResponse] = await Promise.all([
      await Pg.getVincularArtFamilia_2(),
      await Pg.getFamiliaArt_2(),
      await Pg.getSetsVentas_2(),
    ]);

    var result = [];
    var result2 = [];

    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
        if (firstResponse[i].cod_familia == secundResponse[j].id) {
          result.push({
            cod: firstResponse[i].cod,
            cod_art: firstResponse[i].cod_art,
            cod_familia: firstResponse[i].cod_familia,
            orden_art_familia: firstResponse[i].orden_art_familia,
            url_imagen: firstResponse[i].url_imagen,
            nombre_fami_art: secundResponse[j].nombre_fami_art,
            nro_orden_de_la_fami: secundResponse[j].nro_orden_de_la_fami,
            set_ventas: secundResponse[j].set_ventas,
          });
        }
      }
    }

    for (var x = 0; x < result.length; x++) {
      for (var v = 0; v < threeResponse.length; v++) {
        if (result[x].set_ventas == threeResponse[v].id) {
          result2.push({
            cod: result[x].cod,
            cod_art: result[x].cod_art,
            cod_familia: result[x].cod_familia,
            orden_art_familia: result[x].orden_art_familia,
            url_imagen: result[x].url_imagen,
            nombre_fami_art: result[x].nombre_fami_art,
            nro_orden_de_la_fami: result[x].nro_orden_de_la_fami,
            set_ventas: result[x].set_ventas,
            nombre_set_art: threeResponse[v].nombre_set_art,
          });
        }
      }
    }
    return result2;
  } catch (error) {
    console.error("Error al obtener los datos de FamiliaArts:", error);
    throw error;
  }
}

async function getFamiliaArts2() {
  try {
    const [firstResponse, secundResponse] = await Promise.all([
      await Pg.getProductosDistribucion_2(),
      await Pg.getFamiliaDist_2(),
    ]);

    var result = [];
    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
        if (firstResponse[i].Cod_Familia_producto == secundResponse[j].id) {
          result.push({
            id: firstResponse[i].id,
            Codigo_producto: firstResponse[i].Codigo_producto,
            Orden_producto: firstResponse[i].Orden_producto,
            Cod_Familia_producto: firstResponse[i].Cod_Familia_producto,
            Url_imagen: firstResponse[i].Url_imagen,
            nombre_familia: secundResponse[j].nombre_familia,
            orden_familia: secundResponse[j].orden_familia,
          });
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Error al obtener los datos de FamiliaArts2:", error);
    throw error;
  }
}

async function getVN_1() {
  try {
    const [firstResponse, secundResponse] = await Promise.all([
      await getFamiliaArts(),
      await Db.getVN_sin_dto_financ(),
    ]);

    var results = [];

    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
        if (firstResponse[i].cod_art === secundResponse[j].ARTS_ARTICULO_EMP) {
          results.push({
            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA,
            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
            cod_art: firstResponse[i].cod_art,
            set_ventas: firstResponse[i].set_ventas,
            nombre_set_art: firstResponse[i].nombre_set_art,
            cod_familia: firstResponse[i].cod_familia,
            nombre_fami_art: firstResponse[i].nombre_fami_art,
            url_imagen: firstResponse[i].url_imagen,
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
            Fecha_cambio_precios_hasta:
              secundResponse[j].Fecha_cambio_precios_hasta,
            PRECIO_LISTA_CON_IVA: secundResponse[j].PRECIO_LISTA_CON_IVA,
            Fecha_Ult_Modif: secundResponse[j].Fecha_Ult_Modif,
            Delay_cambio_precio: secundResponse[j].Delay_cambio_precio,
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error("Error al obtener los datos de VN_1:", error);
    throw error;
  }
}

async function getVN_2() {
  try {
    const [firstResponse, secundResponse] = await Promise.all([
      await getFamiliaArts2(),
      await Db.getVN_sin_dto_financ(),
    ]);

    var results = [];
    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
        if (
          firstResponse[i].Codigo_producto ===
          secundResponse[j].ARTS_ARTICULO_EMP
        ) {
          results.push({
            ARVE_RUBRO_VENTA: secundResponse[j].ARVE_RUBRO_VENTA,
            RUBV_NOMBRE: secundResponse[j].RUBV_NOMBRE,
            Orden_producto: firstResponse[i].Orden_producto,
            cod_set_art: "",
            nombre_set_art: "",
            cod_familia_art: firstResponse[i].id,
            nombre_familia_art: firstResponse[i].nombre_familia,
            nro_orden_familia: firstResponse[i].orden_familia,
            Url_imagen: firstResponse[i].Url_imagen,
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
            Fecha_cambio_precios_hasta:
              secundResponse[j].Fecha_cambio_precios_hasta,
            PRECIO_LISTA_CON_IVA: secundResponse[j].PRECIO_LISTA_CON_IVA,
            Fecha_Ult_Modif: secundResponse[j].Fecha_Ult_Modif,
            Delay_cambio_precio: secundResponse[j].Delay_cambio_precio,
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error("Error al obtener los datos de VN_2:", error);
    throw error;
  }
}

async function getLPDistribucion() {
  try {
    const [firstResponse, secundResponse] = await Promise.all([
      await Pg.getRubrosVtas_2(),
      await getVN_2(),
    ]);
    var results = [];
    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
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
            Fecha_cambio_precios_hasta:
              secundResponse[j].Fecha_cambio_precios_hasta,
            PRECIO_LISTA_CON_IVA: secundResponse[j].PRECIO_LISTA_CON_IVA,
            Fecha_Ult_Modif: secundResponse[j].Fecha_Ult_Modif,
            Delay_cambio_precio: secundResponse[j].Delay_cambio_precio,
            Url_imagen: secundResponse[j].Url_imagen,
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error(
      "Error al obtener la lista de precios de distribución:",
      error,
    );
    throw error;
  }
}

async function getPlanillaImportarStock() {
  try {
    const [firstResponse, secundResponse, threeResponse, fourResponse] =
      await Promise.all([
        await Db.getPlanillaImportar(),
        await Db.getStockFisicoyDisp(),
        await Db.getListadePrecioWeb(),
        await Pg.getArtsClasif5AlConsultar2(),
      ]);

    var results = [];
    for (var i = 0; i < firstResponse.length; i++) {
      for (var j = 0; j < secundResponse.length; j++) {
        if (firstResponse[i].SKU === secundResponse[j].Cod_Art) {
          results.push({
            ProductType: firstResponse[i].ProductType,
            Name: firstResponse[i].Name,
            ShortDescription:
              secundResponse[j].ARTS_CLASIF_8 == "0130" &&
              secundResponse[j].Uni_M2_Disp == 0
                ? "<strong>Producto sin stock. Disponible a pedido de cliente. Antes de comprar, consultanos por el plazo de entrega.</strong>"
                : fourResponse.filter(
                      (item) =>
                        secundResponse[j].ARTS_CLASIF_5 ==
                        item.arts_clasif_5[0]["input"],
                    ) && secundResponse[j].Uni_M2_Disp == 0
                  ? "<strong>" +
                    fourResponse.map((data) => data.descripcion)[0] +
                    "<a class='navigation-block__link navigation-block__link--whatsapp' href='https://wa.me/" +
                    fourResponse.map((data) => data.whatsapp.replace("+", "")) +
                    "'>" +
                    fourResponse.map((data) => data.whatsapp) +
                    "</a></strong>"
                  : secundResponse[j].ARTS_CLASIF_8 == "0180"
                    ? "<strong>Discontinuado. Venta hasta agotar stock.</strong>"
                    : secundResponse[j].ARTS_CLASIF_8 == "0190"
                      ? "<strong>Discontinuado. Venta hasta agotar stock.</strong>"
                      : secundResponse[j].ARTS_CLASIF_8 == "0004"
                        ? "<strong>* Antes de la compra leé las Recomendaciones para la Colocación de Cerámicas y Porcelanatos, <a style='color: green' href='https://www.nimat.com.ar/Content/Images/uploaded/pdf/Recomendacionesparaceramicasyterminaciones.pdf'>ver aquí</a>.</strong>"
                        : "",
            FullDescription: firstResponse[i].FullDescription,
            ProductTemplate: firstResponse[i].ProductTemplate,
            MetaKeywords: firstResponse[i].MetaKeywords,
            MetaDescription: firstResponse[i].MetaDescription,
            MetaTitle: firstResponse[i].MetaTitle,
            SeName: firstResponse[i].SeName,
            AllowCustomerReviews: firstResponse[i].AllowCustomerReviews,
            Published:
              secundResponse[j].ARVE_BLOQUEO_VENTA == 1
                ? "BLOQUEADO"
                : secundResponse[j].ARTS_CLASIF_8 == "0180" &&
                    secundResponse[j].Uni_M2_Disp == 0
                  ? "FALSE"
                  : secundResponse[j].ARTS_CLASIF_8 == "0190" &&
                      secundResponse[j].Uni_M2_Disp == 0
                    ? "FALSE"
                    : secundResponse[j].ARTS_CLASIF_8 == "0130"
                      ? "TRUE"
                      : firstResponse[i].SKU.substring(0, 2) == "81"
                        ? "TRUE"
                        : "FALSE",
            SKU: firstResponse[i].SKU,
            IsShipEnabled: firstResponse[i].IsShipEnabled,
            ManageInventoryMethod: firstResponse[i].ManageInventoryMethod,
            StockQuantity: secundResponse[j].Uni_M2_Disp,
            DisplayStockAvailability:
              secundResponse[j].ARTS_CLASIF_8 == "0130" &&
              secundResponse[j].Uni_M2_Disp == 0
                ? "FALSE"
                : fourResponse.filter(
                      (item) =>
                        secundResponse[j].ARTS_CLASIF_5 ==
                        item.arts_clasif_5[0]["input"],
                    ) && secundResponse[j].Uni_M2_Disp == 0
                  ? "FALSE"
                  : firstResponse[i].SKU.substring(0, 3) == "811"
                    ? "TRUE"
                    : "TRUE",
            DisplayStockQuantity: "TRUE",
            NotifyAdminForQuantityBelow:
              firstResponse[i].NotifyAdminForQuantityBelow,
            BackorderMode: firstResponse[i].BackorderMode,
            OrderMinimumQuantity: firstResponse[i].OrderMinimumQuantity,
            OrderMaximumQuantity: 1000,
            CallForPrice: firstResponse[i].CallForPrice,
            DisableBuyButton:
              secundResponse[j].ARTS_CLASIF_8 == "0130" &&
              secundResponse[j].Uni_M2_Disp == 0
                ? "TRUE"
                : secundResponse[j].Uni_M2_Disp == 0
                  ? "TRUE"
                  : "FALSE",
            Manufacturers: firstResponse[i].Manufacturers,
            Weight: firstResponse[i].Weight,
            Picture1: firstResponse[i].Picture1,
            BasepriceAmount: firstResponse[i].BasepriceAmount,
            Deleted: firstResponse[i].Deleted,
          });
        }
      }
    }
    var results2 = [];
    for (var i = 0; i < results.length; i++) {
      for (var j = 0; j < threeResponse.length; j++) {
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
            Deleted: results[i].Deleted,
          });
        }
      }
    }
    return results2;
  } catch (error) {
    console.error(error);
  }
}

async function getInformesAcindar() {
  try {
    const [data1, data2, data3, data4, data5, data6] = await Promise.all([
      await Db.InformesAcindarPTF(),
      await Pg.getAcindarClasifClientes2(),
      await Pg.getAcindarComprobantes2(),
      await Pg.getAcindarEquivalCodFactorCant2(),
      await Db.NCInformesAcindarPTF(),
      await Db.getStocArtsAll(),
    ]);

    let getData5 = [];
    data5.forEach((e) => {
      const {
        CVCL_TIPO_VAR,
        CVCL_SUCURSAL_IMP,
        CVCL_NUMERO_CVCL,
        CVRF_RENGLON_CVRF,
        CVCL_FECHA_EMI,
        ARTS_ARTICULO_EMP,
        ARTS_NOMBRE,
        ...VENT_NCFA
      } = e;
      let d = getData5.find(
        (x) =>
          e.CVCL_NUMERO_CVCL == x.CVCL_NUMERO_CVCL &&
          e.CVRF_RENGLON_CVRF == x.CVRF_RENGLON_CVRF,
      );
      if (d) {
        d.VENT_NCFA.push(VENT_NCFA);
      } else {
        getData5.push({
          CVCL_TIPO_VAR,
          CVCL_SUCURSAL_IMP,
          CVCL_NUMERO_CVCL,
          CVRF_RENGLON_CVRF,
          CVCL_FECHA_EMI,
          ARTS_ARTICULO_EMP,
          ARTS_NOMBRE,
          VENT_NCFA: [VENT_NCFA],
        });
      }
    });
    /* console.log(getData5.map(data => data.VENT_NCFA)) */
    var results = [];
    for (var i = 0; i < data1.length; i++) {
      for (var j = 0; j < data2.length; j++) {
        for (var k = 0; k < data3.length; k++) {
          if (
            data1[i].CLIE_CLASIF_1.trim() == data2[j].clasif_1_ptf &&
            data1[i].Tipo_cpbte == data3[k].comprobante_ptf
          ) {
            var nro_doc_referencia_tipo = data3
              .filter(
                (item) =>
                  item.comprobante_ptf ==
                  getData5
                    .filter(
                      (item) =>
                        item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte &&
                        item.CVCL_SUCURSAL_IMP == data1[i].Sucursal &&
                        item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF,
                    )
                    .map((data) => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC),
              )
              .map((data) => data.comprobante_acindar);
            var tipo_doc_referencia = data3
              .filter(
                (item) =>
                  item.comprobante_ptf ==
                  getData5
                    .filter(
                      (item) =>
                        item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte &&
                        item.CVCL_SUCURSAL_IMP == data1[i].Sucursal &&
                        item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF,
                    )
                    .map((data) => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC),
              )
              .map((data) => data.tipo_doc_legal);
            var nro_doc_referencia_sucursal = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.VENT_NCFA[0].NCFA_SUCURSAL_FC_ANTIC);
            var nro_doc_referencia_numero = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF,
              )
              .map((data) =>
                data.VENT_NCFA.map((data) => data.NCFA_NUMERO_FC_ANTIC),
              );
            var nro_doc_referencia_item = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.VENT_NCFA[0].NCFA_RENGLON_FC_ANTIC);
            var fecha_doc_referencia = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.CVCL_FECHA_EMI);
            var nro_doc_referencia_a_observaciones =
              nro_doc_referencia_numero.toString().length >= 9
                ? nro_doc_referencia_numero.map((data) => {
                    const acc = [];
                    data.forEach((i) =>
                      acc.push({
                        data:
                          nro_doc_referencia_tipo +
                          "-" +
                          (nro_doc_referencia_sucursal.toString().length == 1
                            ? "00" + nro_doc_referencia_sucursal
                            : nro_doc_referencia_sucursal.toString().length == 2
                              ? "0" + nro_doc_referencia_sucursal
                              : nro_doc_referencia_sucursal.toString().length ==
                                  3
                                ? nro_doc_referencia_sucursal
                                : nro_doc_referencia_sucursal.toString()
                                      .length == 0
                                  ? ""
                                  : "") +
                          "-" +
                          (i.toString().length == 1
                            ? "000000" + i
                            : i.toString().length == 2
                              ? "000000" + i
                              : i.toString().length == 3
                                ? "00000" + i
                                : i.toString().length == 4
                                  ? "0000" + i
                                  : i.toString().length == 5
                                    ? "000" + i
                                    : i.toString().length == 6
                                      ? "00" + i
                                      : i.toString().length == 7
                                        ? "0" + i
                                        : i.toString().length == 8
                                          ? i
                                          : i.toString().length == 0
                                            ? ""
                                            : ""),
                      }),
                    );
                    acc.shift();
                    return acc.map((data) => data.data).join(" - ");
                  })
                : "";

            var nro_doc_referencia =
              nro_doc_referencia_tipo +
              "-" +
              (nro_doc_referencia_sucursal.toString().length == 1
                ? "00" + nro_doc_referencia_sucursal
                : nro_doc_referencia_sucursal.toString().length == 2
                  ? "0" + nro_doc_referencia_sucursal
                  : nro_doc_referencia_sucursal.toString().length == 3
                    ? nro_doc_referencia_sucursal
                    : nro_doc_referencia_sucursal.toString().length == 0
                      ? ""
                      : "") +
              "-" +
              (nro_doc_referencia_numero.toString().length == 1
                ? "000000" + nro_doc_referencia_numero
                : nro_doc_referencia_numero.toString().length == 2
                  ? "000000" + nro_doc_referencia_numero
                  : nro_doc_referencia_numero.toString().length == 3
                    ? "00000" + nro_doc_referencia_numero
                    : nro_doc_referencia_numero.toString().length == 4
                      ? "0000" + nro_doc_referencia_numero
                      : nro_doc_referencia_numero.toString().length == 5
                        ? "000" + nro_doc_referencia_numero
                        : nro_doc_referencia_numero.toString().length == 6
                          ? "00" + nro_doc_referencia_numero
                          : nro_doc_referencia_numero.toString().length == 7
                            ? "0" + nro_doc_referencia_numero
                            : nro_doc_referencia_numero.toString().length == 8
                              ? nro_doc_referencia_numero
                              : nro_doc_referencia_numero.toString().length >= 9
                                ? nro_doc_referencia_numero.map((data) =>
                                    data[0].toString().length == 1
                                      ? "000000" + data[0]
                                      : data[0].toString().length == 2
                                        ? "000000" + data[0]
                                        : data[0].toString().length == 3
                                          ? "00000" + data[0]
                                          : data[0].toString().length == 4
                                            ? "0000" + data[0]
                                            : data[0].toString().length == 5
                                              ? "000" + data[0]
                                              : data[0].toString().length == 6
                                                ? "00" + data[0]
                                                : data[0].toString().length == 7
                                                  ? "0" + data[0]
                                                  : data[0].toString().length ==
                                                      8
                                                    ? data
                                                    : "",
                                  )
                                : nro_doc_referencia_numero.toString().length ==
                                    0
                                  ? ""
                                  : "");

            const cantidadxfactor =
              data1[i].Cant *
              data4
                .filter((item) => item.codigo_ptf == data1[i].ARTS_ARTICULO_EMP)
                .map((data) => data.factor_cant);
            const codigoAcindar = data4
              .filter((item) => item.codigo_ptf == data1[i].ARTS_ARTICULO_EMP)
              .map((data) => data.codigo_acindar);
            const nombrePTF = data6
              .filter((item) => item.ARTS_ARTICULO_EMP == codigoAcindar)
              .map((data) => data.ARTS_NOMBRE);
            const montoDecimal = data1[i].Subtotal_item_SI_a_infomar_a_Acindar;
            const montoSIDecimal = data1[i].Subtotal_item_SI;
            results.push({
              DEA: "PRD",
              SUCURSAL: "1",
              NRO_DOC_LEGAL:
                data3[k].comprobante_acindar.replace(/\./g, "") +
                "-" +
                data1[i].Comprobante.substring(0, 4).replace(/\./g, "") +
                "-" +
                data1[i].Comprobante.substring(9).replace(/\./g, ""),
              TIPO_DOC_LEGAL: data3[k].tipo_doc_legal.replace(/\./g, ""),
              TIPO_DE_TRANSACCION: data3[k].tipo_de_transaccion.replace(
                /\./g,
                "",
              ),
              ITEM_DOC_LEGAL: data1[i].CVRF_RENGLON_CVRF,
              FECHA_DOC_LEGAL: data1[i].CVCL_FECHA_EMI.replace(/\./g, ""),
              NRO_DOC_REFERENCIA:
                nro_doc_referencia == "--"
                  ? ""
                  : nro_doc_referencia.toString().replace(/\./g, ""),
              TIPO_DOC_REF: tipo_doc_referencia.toString().replace(/\./g, ""),
              ITEM_DOC_REF: nro_doc_referencia_item
                .toString()
                .replace(/\./g, ""),
              FECHA_DOC_REF: fecha_doc_referencia.toString().replace(/\./g, ""),
              CUIT: data1[i].CLIE_CUIT.replace(/\./g, ""),
              NRO_INTERNO_CLIENTE: data1[i].CVCL_CLIENTE,
              RAZON_SOCIAL: data1[i].CLIE_NOMBRE.trim().replace(/\./g, ""),
              SEGMENTO: data2[j].segmento_cliente_acindar.replace(/\./g, ""),
              DIRECCION: data1[i].CLIE_DOMICILIO.replace(/\./g, ""),
              CIUDAD: data1[i].CLIE_LOCALIDAD
                ? data1[i].CLIE_LOCALIDAD.replace(/\./g, "")
                : "",
              PROVINCIA: data1[i].PCIA_NOMBRE.replace(/\./g, ""),
              CODIGO_ART: codigoAcindar.toString().replace(/\./g, ""),
              DESCRIPCION:
                data1[i].ARTS_NOMBRE !== nombrePTF.toString()
                  ? nombrePTF.toString().replace(/\./g, "")
                  : data1[i].ARTS_NOMBRE.replace(/\./g, ""),
              UMV: data1[i].CVRF_UNIMED.replace(/\./g, ""),
              CANTIDAD: cantidadxfactor.toString().replace(/\./g, ","),
              MONTO: Number(montoDecimal).toFixed(2).replace(/\./g, ","),
              FECHA_COSTO: data1[i].Fecha_Costo.replace(/\./g, ""),
              DESCRIPCION_COND_VTA: data1[i].Nombre_Cond_Vta.replace(/\./g, ""),
              DIAS: data1[i].DIAS_COND_VTA,
              OBSERVACION:
                nro_doc_referencia_a_observaciones.toString().length > 1 &&
                data2[j].observacion.toString().length > 1
                  ? data2[j].observacion +
                    ", Otros DOC REFERENCIA: " +
                    nro_doc_referencia_a_observaciones
                      .toString()
                      .replace(/\./g, "")
                  : nro_doc_referencia_a_observaciones.toString().length > 1
                    ? "Otros DOC REFERENCIA: " +
                      nro_doc_referencia_a_observaciones
                        .toString()
                        .replace(/\./g, "")
                    : data2[j].observacion,
            });
          }
        }
      }
    }
    return results;
  } catch (error) {
    console.error("Error al obtener los informes de Acindar:", error);
    throw error;
  }
}

async function getInformesAcindarEntreFechas(getDates) {
  try {
    var data1 = [];
    var data5 = [];
    await Db.InformesAcindarPTFDate(getDates).then((response) =>
      data1.push(response),
    );
    await Db.NCInformesAcindarPTFDate(getDates).then((response) =>
      data5.push(response),
    );

    let getData5 = [];

    data5[0][0].forEach((e) => {
      const {
        CVCL_TIPO_VAR,
        CVCL_SUCURSAL_IMP,
        CVCL_NUMERO_CVCL,
        CVRF_RENGLON_CVRF,
        CVCL_FECHA_EMI,
        ARTS_ARTICULO_EMP,
        ARTS_NOMBRE,
        ...VENT_NCFA
      } = e;
      let d = getData5.find(
        (x) =>
          e.CVCL_NUMERO_CVCL == x.CVCL_NUMERO_CVCL &&
          e.CVRF_RENGLON_CVRF == x.CVRF_RENGLON_CVRF,
      );
      if (d) {
        d.VENT_NCFA.push(VENT_NCFA);
      } else {
        getData5.push({
          CVCL_TIPO_VAR,
          CVCL_SUCURSAL_IMP,
          CVCL_NUMERO_CVCL,
          CVRF_RENGLON_CVRF,
          CVCL_FECHA_EMI,
          ARTS_ARTICULO_EMP,
          ARTS_NOMBRE,
          VENT_NCFA: [VENT_NCFA],
        });
      }
    });

    const [data2, data3, data4, data6] = await Promise.all([
      await Pg.getAcindarClasifClientes2(),
      await Pg.getAcindarComprobantes2(),
      await Pg.getAcindarEquivalCodFactorCant2(),
      await Db.getStocArtsAll(),
    ]);
    var results = [];
    for (var i = 0; i < data1[0][0].length; i++) {
      for (var j = 0; j < data2.length; j++) {
        for (var k = 0; k < data3.length; k++) {
          if (
            data1[0][0][i].CLIE_CLASIF_1.trim() == data2[j].clasif_1_ptf &&
            data1[0][0][i].Tipo_cpbte == data3[k].comprobante_ptf
          ) {
            var nro_doc_referencia_tipo = data3
              .filter(
                (item) =>
                  item.comprobante_ptf ==
                  getData5
                    .filter(
                      (item) =>
                        item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                        item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                        item.CVRF_RENGLON_CVRF ==
                          data1[0][0][i].CVRF_RENGLON_CVRF,
                    )
                    .map((data) => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC),
              )
              .map((data) => data.comprobante_acindar);
            var tipo_doc_referencia = data3
              .filter(
                (item) =>
                  item.comprobante_ptf ==
                  getData5
                    .filter(
                      (item) =>
                        item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                        item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                        item.CVRF_RENGLON_CVRF ==
                          data1[0][0][i].CVRF_RENGLON_CVRF,
                    )
                    .map((data) => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC),
              )
              .map((data) => data.tipo_doc_legal);
            var nro_doc_referencia_sucursal = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.VENT_NCFA[0].NCFA_SUCURSAL_FC_ANTIC);
            var nro_doc_referencia_numero = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) =>
                data.VENT_NCFA.map((data) => data.NCFA_NUMERO_FC_ANTIC),
              );
            var nro_doc_referencia_item = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.VENT_NCFA[0].NCFA_RENGLON_FC_ANTIC);
            var fecha_doc_referencia = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.CVCL_FECHA_EMI);
            var nro_doc_referencia_a_observaciones =
              nro_doc_referencia_numero.toString().length >= 9
                ? nro_doc_referencia_numero.map((data) => {
                    const acc = [];
                    data.forEach((i) =>
                      acc.push({
                        data:
                          nro_doc_referencia_tipo +
                          "-" +
                          (nro_doc_referencia_sucursal.toString().length == 1
                            ? "00" + nro_doc_referencia_sucursal
                            : nro_doc_referencia_sucursal.toString().length == 2
                              ? "0" + nro_doc_referencia_sucursal
                              : nro_doc_referencia_sucursal.toString().length ==
                                  3
                                ? nro_doc_referencia_sucursal
                                : nro_doc_referencia_sucursal.toString()
                                      .length == 0
                                  ? ""
                                  : "") +
                          "-" +
                          (i.toString().length == 1
                            ? "000000" + i
                            : i.toString().length == 2
                              ? "000000" + i
                              : i.toString().length == 3
                                ? "00000" + i
                                : i.toString().length == 4
                                  ? "0000" + i
                                  : i.toString().length == 5
                                    ? "000" + i
                                    : i.toString().length == 6
                                      ? "00" + i
                                      : i.toString().length == 7
                                        ? "0" + i
                                        : i.toString().length == 8
                                          ? i
                                          : i.toString().length == 0
                                            ? ""
                                            : ""),
                      }),
                    );
                    acc.shift();
                    return acc.map((data) => data.data).join(" - ");
                  })
                : "";

            var nro_doc_referencia =
              nro_doc_referencia_tipo +
              "-" +
              (nro_doc_referencia_sucursal.toString().length == 1
                ? "00" + nro_doc_referencia_sucursal
                : nro_doc_referencia_sucursal.toString().length == 2
                  ? "0" + nro_doc_referencia_sucursal
                  : nro_doc_referencia_sucursal.toString().length == 3
                    ? nro_doc_referencia_sucursal
                    : nro_doc_referencia_sucursal.toString().length == 0
                      ? ""
                      : "") +
              "-" +
              (nro_doc_referencia_numero.toString().length == 1
                ? "000000" + nro_doc_referencia_numero
                : nro_doc_referencia_numero.toString().length == 2
                  ? "000000" + nro_doc_referencia_numero
                  : nro_doc_referencia_numero.toString().length == 3
                    ? "00000" + nro_doc_referencia_numero
                    : nro_doc_referencia_numero.toString().length == 4
                      ? "0000" + nro_doc_referencia_numero
                      : nro_doc_referencia_numero.toString().length == 5
                        ? "000" + nro_doc_referencia_numero
                        : nro_doc_referencia_numero.toString().length == 6
                          ? "00" + nro_doc_referencia_numero
                          : nro_doc_referencia_numero.toString().length == 7
                            ? "0" + nro_doc_referencia_numero
                            : nro_doc_referencia_numero.toString().length == 8
                              ? nro_doc_referencia_numero
                              : nro_doc_referencia_numero.toString().length >= 9
                                ? nro_doc_referencia_numero.map((data) =>
                                    data[0].toString().length == 1
                                      ? "000000" + data[0]
                                      : data[0].toString().length == 2
                                        ? "000000" + data[0]
                                        : data[0].toString().length == 3
                                          ? "00000" + data[0]
                                          : data[0].toString().length == 4
                                            ? "0000" + data[0]
                                            : data[0].toString().length == 5
                                              ? "000" + data[0]
                                              : data[0].toString().length == 6
                                                ? "00" + data[0]
                                                : data[0].toString().length == 7
                                                  ? "0" + data[0]
                                                  : data[0].toString().length ==
                                                      8
                                                    ? data
                                                    : "",
                                  )
                                : nro_doc_referencia_numero.toString().length ==
                                    0
                                  ? ""
                                  : "");

            const cantidadxfactor =
              data1[0][0][i].Cant *
              data4
                .filter(
                  (item) => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP,
                )
                .map((data) => data.factor_cant);
            const codigoAcindar = data4
              .filter(
                (item) => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP,
              )
              .map((data) => data.codigo_acindar);
            const nombrePTF = data6
              .filter((item) => item.ARTS_ARTICULO_EMP == codigoAcindar)
              .map((data) => data.ARTS_NOMBRE);
            const montoDecimal =
              data1[0][0][i].Subtotal_item_SI_a_infomar_a_Acindar;
            const montoSIDecimal = data1[0][0][i].Subtotal_item_SI;
            results.push({
              DEA: "PRD",
              SUCURSAL: "1",
              NRO_DOC_LEGAL:
                data3[k].comprobante_acindar +
                "-" +
                data1[0][0][i].Comprobante.substring(0, 4) +
                "-" +
                data1[0][0][i].Comprobante.substring(9),
              TIPO_DOC_LEGAL: data3[k].tipo_doc_legal,
              TIPO_DE_TRANSACCION: data3[k].tipo_de_transaccion,
              ITEM_DOC_LEGAL: data1[0][0][i].CVRF_RENGLON_CVRF,
              FECHA_DOC_LEGAL: data1[0][0][i].CVCL_FECHA_EMI,
              NRO_DOC_REFERENCIA:
                nro_doc_referencia == "--" ? "" : nro_doc_referencia,
              TIPO_DOC_REF: tipo_doc_referencia,
              ITEM_DOC_REF: nro_doc_referencia_item,
              FECHA_DOC_REF: fecha_doc_referencia,
              CUIT: data1[0][0][i].CLIE_CUIT,
              NRO_INTERNO_CLIENTE: data1[0][0][i].CVCL_CLIENTE,
              RAZON_SOCIAL: data1[0][0][i].CLIE_NOMBRE.replace(/\s+/g, " "),
              SEGMENTO: data2[j].segmento_cliente_acindar,
              DIRECCION: data1[0][0][i].CLIE_DOMICILIO,
              CIUDAD: data1[0][0][i].CLIE_LOCALIDAD,
              PROVINCIA: data1[0][0][i].PCIA_NOMBRE,
              CODIGO_ART: codigoAcindar,
              DESCRIPCION:
                data1[0][0][i].ARTS_NOMBRE !== nombrePTF.toString()
                  ? nombrePTF.toString()
                  : data1[0][0][i].ARTS_NOMBRE,
              UMV: data1[0][0][i].CVRF_UNIMED,
              CANTIDAD: cantidadxfactor,
              CANTIDAD_ING: data1[0][0][i].Cant,
              SUBTOTAL_ITEM_SI: montoSIDecimal,
              MONTO: montoDecimal.toLocaleString("es-AR", {
                maximumFractionDigits: 2,
                useGrouping: false,
              }),
              FECHA_COSTO: data1[0][0][i].Fecha_Costo,
              DESCRIPCION_COND_VTA: data1[0][0][i].Nombre_Cond_Vta,
              DIAS: data1[0][0][i].DIAS_COND_VTA,
              OBSERVACION:
                nro_doc_referencia_a_observaciones.toString().length > 1 &&
                data2[j].observacion.toString().length > 1
                  ? data2[j].observacion +
                    ", Otros DOC REFERENCIA: " +
                    nro_doc_referencia_a_observaciones
                      .toString()
                      .replace(/\./g, "")
                  : nro_doc_referencia_a_observaciones.toString().length > 1
                    ? "Otros DOC REFERENCIA: " +
                      nro_doc_referencia_a_observaciones
                        .toString()
                        .replace(/\./g, "")
                    : data2[j].observacion,
            });
          }
        }
      }
    }
    return results;
  } catch (e) {
    console.error(e);
  }
}

async function getInformesAcindarEntreFechasExportar(getDates) {
  try {
    var data1 = [];
    var data5 = [];
    await Db.InformesAcindarPTFDate(getDates).then((response) =>
      data1.push(response),
    );
    await Db.NCInformesAcindarPTFDate(getDates).then((response) =>
      data5.push(response),
    );

    let getData5 = [];

    data5[0][0].forEach((e) => {
      const {
        CVCL_TIPO_VAR,
        CVCL_SUCURSAL_IMP,
        CVCL_NUMERO_CVCL,
        CVRF_RENGLON_CVRF,
        CVCL_FECHA_EMI,
        ARTS_ARTICULO_EMP,
        ARTS_NOMBRE,
        ...VENT_NCFA
      } = e;
      let d = getData5.find(
        (x) =>
          e.CVCL_NUMERO_CVCL == x.CVCL_NUMERO_CVCL &&
          e.CVRF_RENGLON_CVRF == x.CVRF_RENGLON_CVRF,
      );
      if (d) {
        d.VENT_NCFA.push(VENT_NCFA);
      } else {
        getData5.push({
          CVCL_TIPO_VAR,
          CVCL_SUCURSAL_IMP,
          CVCL_NUMERO_CVCL,
          CVRF_RENGLON_CVRF,
          CVCL_FECHA_EMI,
          ARTS_ARTICULO_EMP,
          ARTS_NOMBRE,
          VENT_NCFA: [VENT_NCFA],
        });
      }
    });

    const [data2, data3, data4, data6] = await Promise.all([
      await Pg.getAcindarClasifClientes2(),
      await Pg.getAcindarComprobantes2(),
      await Pg.getAcindarEquivalCodFactorCant2(),
      await Db.getStocArtsAll(),
    ]);

    var results = [];
    for (var i = 0; i < data1[0][0].length; i++) {
      for (var j = 0; j < data2.length; j++) {
        for (var k = 0; k < data3.length; k++) {
          if (
            data1[0][0][i].CLIE_CLASIF_1.trim() == data2[j].clasif_1_ptf &&
            data1[0][0][i].Tipo_cpbte == data3[k].comprobante_ptf
          ) {
            var nro_doc_referencia_tipo = data3
              .filter(
                (item) =>
                  item.comprobante_ptf ==
                  getData5
                    .filter(
                      (item) =>
                        item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                        item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                        item.CVRF_RENGLON_CVRF ==
                          data1[0][0][i].CVRF_RENGLON_CVRF,
                    )
                    .map((data) => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC),
              )
              .map((data) => data.comprobante_acindar);
            var tipo_doc_referencia = data3
              .filter(
                (item) =>
                  item.comprobante_ptf ==
                  getData5
                    .filter(
                      (item) =>
                        item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                        item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                        item.CVRF_RENGLON_CVRF ==
                          data1[0][0][i].CVRF_RENGLON_CVRF,
                    )
                    .map((data) => data.VENT_NCFA[0].NCFA_TIPO_FC_ANTIC),
              )
              .map((data) => data.tipo_doc_legal);
            var nro_doc_referencia_sucursal = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.VENT_NCFA[0].NCFA_SUCURSAL_FC_ANTIC);
            var nro_doc_referencia_numero = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) =>
                data.VENT_NCFA.map((data) => data.NCFA_NUMERO_FC_ANTIC),
              );
            var nro_doc_referencia_item = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.VENT_NCFA[0].NCFA_RENGLON_FC_ANTIC);
            var fecha_doc_referencia = getData5
              .filter(
                (item) =>
                  item.CVCL_NUMERO_CVCL == data1[0][0][i].Nro_cpbte &&
                  item.CVCL_SUCURSAL_IMP == data1[0][0][i].Sucursal &&
                  item.CVRF_RENGLON_CVRF == data1[0][0][i].CVRF_RENGLON_CVRF,
              )
              .map((data) => data.CVCL_FECHA_EMI);

            var nro_doc_referencia_a_observaciones =
              nro_doc_referencia_numero.toString().length >= 9
                ? nro_doc_referencia_numero.map((data) => {
                    const acc = [];
                    data.forEach((i) =>
                      acc.push({
                        data:
                          nro_doc_referencia_tipo +
                          "-" +
                          (nro_doc_referencia_sucursal.toString().length == 1
                            ? "00" + nro_doc_referencia_sucursal
                            : nro_doc_referencia_sucursal.toString().length == 2
                              ? "0" + nro_doc_referencia_sucursal
                              : nro_doc_referencia_sucursal.toString().length ==
                                  3
                                ? nro_doc_referencia_sucursal
                                : nro_doc_referencia_sucursal.toString()
                                      .length == 0
                                  ? ""
                                  : "") +
                          "-" +
                          (i.toString().length == 1
                            ? "000000" + i
                            : i.toString().length == 2
                              ? "000000" + i
                              : i.toString().length == 3
                                ? "00000" + i
                                : i.toString().length == 4
                                  ? "0000" + i
                                  : i.toString().length == 5
                                    ? "000" + i
                                    : i.toString().length == 6
                                      ? "00" + i
                                      : i.toString().length == 7
                                        ? "0" + i
                                        : i.toString().length == 8
                                          ? i
                                          : i.toString().length == 0
                                            ? ""
                                            : ""),
                      }),
                    );
                    acc.shift();
                    return acc.map((data) => data.data).join(" - ");
                  })
                : "";

            var nro_doc_referencia =
              nro_doc_referencia_tipo +
              "-" +
              (nro_doc_referencia_sucursal.toString().length == 1
                ? "00" + nro_doc_referencia_sucursal
                : nro_doc_referencia_sucursal.toString().length == 2
                  ? "0" + nro_doc_referencia_sucursal
                  : nro_doc_referencia_sucursal.toString().length == 3
                    ? nro_doc_referencia_sucursal
                    : nro_doc_referencia_sucursal.toString().length == 0
                      ? ""
                      : "") +
              "-" +
              (nro_doc_referencia_numero.toString().length == 1
                ? "000000" + nro_doc_referencia_numero
                : nro_doc_referencia_numero.toString().length == 2
                  ? "000000" + nro_doc_referencia_numero
                  : nro_doc_referencia_numero.toString().length == 3
                    ? "00000" + nro_doc_referencia_numero
                    : nro_doc_referencia_numero.toString().length == 4
                      ? "0000" + nro_doc_referencia_numero
                      : nro_doc_referencia_numero.toString().length == 5
                        ? "000" + nro_doc_referencia_numero
                        : nro_doc_referencia_numero.toString().length == 6
                          ? "00" + nro_doc_referencia_numero
                          : nro_doc_referencia_numero.toString().length == 7
                            ? "0" + nro_doc_referencia_numero
                            : nro_doc_referencia_numero.toString().length == 8
                              ? nro_doc_referencia_numero
                              : nro_doc_referencia_numero.toString().length >= 9
                                ? nro_doc_referencia_numero.map((data) =>
                                    data[0].toString().length == 1
                                      ? "000000" + data[0]
                                      : data[0].toString().length == 2
                                        ? "000000" + data[0]
                                        : data[0].toString().length == 3
                                          ? "00000" + data[0]
                                          : data[0].toString().length == 4
                                            ? "0000" + data[0]
                                            : data[0].toString().length == 5
                                              ? "000" + data[0]
                                              : data[0].toString().length == 6
                                                ? "00" + data[0]
                                                : data[0].toString().length == 7
                                                  ? "0" + data[0]
                                                  : data[0].toString().length ==
                                                      8
                                                    ? data
                                                    : "",
                                  )
                                : nro_doc_referencia_numero.toString().length ==
                                    0
                                  ? ""
                                  : "");

            const cantidadxfactor =
              data1[0][0][i].Cant *
              data4
                .filter(
                  (item) => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP,
                )
                .map((data) => data.factor_cant);
            const codigoAcindar = data4
              .filter(
                (item) => item.codigo_ptf == data1[0][0][i].ARTS_ARTICULO_EMP,
              )
              .map((data) => data.codigo_acindar);
            const nombrePTF = data6
              .filter((item) => item.ARTS_ARTICULO_EMP == codigoAcindar)
              .map((data) => data.ARTS_NOMBRE);
            const montoDecimal =
              data1[0][0][i].Subtotal_item_SI_a_infomar_a_Acindar;
            const montoSIDecimal = data1[0][0][i].Subtotal_item_SI;
            results.push({
              DEA: "PRD",
              SUCURSAL: "1",
              NRO_DOC_LEGAL:
                data3[k].comprobante_acindar.replace(/\./g, "") +
                "-" +
                data1[0][0][i].Comprobante.substring(0, 4).replace(/\./g, "") +
                "-" +
                data1[0][0][i].Comprobante.substring(9).replace(/\./g, ""),
              TIPO_DOC_LEGAL: data3[k].tipo_doc_legal.replace(/\./g, ""),
              TIPO_DE_TRANSACCION: data3[k].tipo_de_transaccion.replace(
                /\./g,
                "",
              ),
              ITEM_DOC_LEGAL: data1[0][0][i].CVRF_RENGLON_CVRF,
              FECHA_DOC_LEGAL: data1[0][0][i].CVCL_FECHA_EMI.replace(/\./g, ""),
              NRO_DOC_REFERENCIA:
                nro_doc_referencia == "--"
                  ? ""
                  : nro_doc_referencia.toString().replace(/\./g, ""),
              TIPO_DOC_REF: tipo_doc_referencia.toString().replace(/\./g, ""),
              ITEM_DOC_REF: nro_doc_referencia_item
                .toString()
                .replace(/\./g, ""),
              FECHA_DOC_REF: fecha_doc_referencia.toString().replace(/\./g, ""),
              CUIT:
                data1[0][0][i].CLIE_CUIT == null
                  ? ""
                  : data1[0][0][i].CLIE_CUIT.replace(/\./g, ""),
              NRO_INTERNO_CLIENTE: data1[0][0][i].CVCL_CLIENTE,
              RAZON_SOCIAL: data1[0][0][i].CLIE_NOMBRE.trim().replace(
                /\./g,
                "",
              ),
              SEGMENTO: data2[j].segmento_cliente_acindar.replace(/\./g, ""),
              DIRECCION: data1[0][0][i].CLIE_DOMICILIO.replace(/\./g, ""),
              CIUDAD: !data1[0][0][i].CLIE_LOCALIDAD
                ? ""
                : data1[0][0][i].CLIE_LOCALIDAD.replace(/\./g, ""),
              PROVINCIA: data1[0][0][i].PCIA_NOMBRE.replace(/\./g, ""),
              CODIGO_ART: codigoAcindar.toString().replace(/\./g, ""),
              DESCRIPCION:
                data1[0][0][i].ARTS_NOMBRE !== nombrePTF.toString()
                  ? nombrePTF.toString().replace(/\./g, "")
                  : data1[0][0][i].ARTS_NOMBRE.replace(/\./g, ""),
              UMV: data1[0][0][i].CVRF_UNIMED.replace(/\./g, ""),
              CANTIDAD: cantidadxfactor.toString().replace(/\./g, ","),
              MONTO: montoDecimal.toLocaleString("es-AR", {
                maximumFractionDigits: 2,
                useGrouping: false,
              }),
              FECHA_COSTO: data1[0][0][i].Fecha_Costo,
              DESCRIPCION_COND_VTA: data1[0][0][i].Nombre_Cond_Vta.replace(
                /\./g,
                "",
              ),
              DIAS: data1[0][0][i].DIAS_COND_VTA,
              OBSERVACION:
                nro_doc_referencia_a_observaciones.toString().length > 1 &&
                data2[j].observacion.toString().length > 1
                  ? data2[j].observacion +
                    ", Otros DOC REFERENCIA: " +
                    nro_doc_referencia_a_observaciones
                      .toString()
                      .replace(/\./g, "")
                  : nro_doc_referencia_a_observaciones.toString().length > 1
                    ? "Otros DOC REFERENCIA: " +
                      nro_doc_referencia_a_observaciones
                        .toString()
                        .replace(/\./g, "")
                    : data2[j].observacion,
            });
          }
        }
      }
    }
    return results;
  } catch (e) {
    console.error(e);
  }
}

export default {
  getListadePrecioBUI2,
  getListaConstSeco,
  getFamiliaArts,
  getFamiliaArts2,
  getVN_1,
  getVN_2,
  getLPDistribucion,
  getPlanillaImportarStock,
  getInformesAcindar,
  getInformesAcindarEntreFechas,
  getInformesAcindarEntreFechasExportar,
};
