const { now } = require('lodash');
var configpg = require('./dbconfig_pg.js');
const Pool = require('pg').Pool
const pool = new Pool(configpg);

//Tabla
const getTablas = (request, response) => {
    pool.query('SELECT * FROM tablas ORDER BY id ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getTablasById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM tablas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createTablas = (request, response) => {
    const {nombre_tablas, url_tablas, consultas_tablas} = request.body

    pool.query('INSERT INTO tablas (nombre_tablas, url_tablas, consultas_tablas) VALUES ($1, $2, $3) RETURNING *',
    [nombre_tablas, url_tablas, consultas_tablas], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateTablas = (request, response) => {
    const id = parseInt(request.params.id)
    const {nombre_tablas, url_tablas, consultas_tablas} = request.body

    pool.query(
        'UPDATE tablas SET nombre_tablas = $1, url_tablas = $2, consultas_tablas = $3 WHERE id = $4',
        [nombre_tablas, url_tablas, consultas_tablas, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar correctamente`)
        }
    )
}

const deleteTablas = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM tablas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar correctamente`)
    })
}

//Tabla Lista de Precio Breve Uso Interno
const getListadePrecioBUI = (request, response) => {
    pool.query('SELECT * FROM lista_de_precios_breve_uso_interno ORDER BY nro_orden_art ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getListadePrecioBUIById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM lista_de_precios_breve_uso_interno WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createListadePrecioBUI = (request, response) => {
    const {arts_articulo_emp, arts_nombre, grupo_del_art, comentario, nro_orden_art} = request.body

    pool.query('INSERT INTO lista_de_precios_breve_uso_interno (arts_articulo_emp, arts_nombre, grupo_del_art, comentario, nro_orden_art) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [arts_articulo_emp, arts_nombre, grupo_del_art, comentario, nro_orden_art], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateListadePrecioBUI = (request, response) => {
    const id = parseInt(request.params.id)
    const {arts_articulo_emp, arts_nombre, grupo_del_art, comentario, nro_orden_art} = request.body

    pool.query(
        'UPDATE lista_de_precios_breve_uso_interno SET arts_articulo_emp = $1, arts_nombre = $2, grupo_del_art = $3, comentario = $4, nro_orden_art = $5 WHERE id = $6',
        [arts_articulo_emp, arts_nombre, grupo_del_art, comentario, nro_orden_art, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar correctamente`)
        }
    )
}

const deleteListadePrecioBUI = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM lista_de_precios_breve_uso_interno WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar correctamente`)
    })
}

// Tabla Movimiento de contenedores
const getMovContenedores = (request, response) => {
    pool.query('SELECT * FROM movimientos_de_contenedores ORDER BY cod_cant_mov ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getMovContenedoresById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM movimientos_de_contenedores WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createMovContenedores = (request, response) => {
    const {cod_cant_mov, nombre_movimiento, cant_mov_nro} = request.body

    pool.query('INSERT INTO movimientos_de_contenedores (cod_cant_mov, nombre_movimiento, cant_mov_nro) VALUES ($1, $2, $3) RETURNING *',
    [cod_cant_mov, nombre_movimiento, cant_mov_nro], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateMovContenedores = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_cant_mov, nombre_movimiento, cant_mov_nro} = request.body

    pool.query(
        'UPDATE movimientos_de_contenedores SET cod_cant_mov = $1, nombre_movimiento = $2, cant_mov_nro = $3 WHERE id = $4',
        [cod_cant_mov, nombre_movimiento, cant_mov_nro, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar correctamente`)
        }
    )
}

const deleteMovContenedores = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM movimientos_de_contenedores WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar deposito correctamente`)
    })
}

// Tabla Dimensiones_Contenedores
const getDimensionesCont = (request, response) => {
    pool.query('SELECT * FROM dimensiones_contenedores ORDER BY clas4_clas5 ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getDimensionesContById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM dimensiones_contenedores WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createDimensionesCont = (request, response) => {
    const {clas4_clas5, nombre, medidas_ancho, medidas_alto_puerta, medidas_alto_interior, medidas_largo} = request.body

    pool.query('INSERT INTO dimensiones_contenedores (clas4_clas5, nombre, medidas_ancho, medidas_alto_puerta, medidas_alto_interior, medidas_largo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [clas4_clas5, nombre, medidas_ancho, medidas_alto_puerta, medidas_alto_interior, medidas_largo], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateDimensionesCont = (request, response) => {
    const id = parseInt(request.params.id)
    const {clas4_clas5, nombre, medidas_ancho, medidas_alto_puerta, medidas_alto_interior, medidas_largo} = request.body

    pool.query(
        'UPDATE dimensiones_contenedores SET clas4_clas5 = $1, nombre = $2, medidas_ancho = $3, medidas_alto_puerta = $4, medidas_alto_interior = $5, medidas_largo = $6 WHERE id = $7',
        [clas4_clas5, nombre, medidas_ancho, medidas_alto_puerta, medidas_alto_interior, medidas_largo, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar correctamente`)
        }
    )
}

const deleteDimensionesCont = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM dimensiones_contenedores WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar correctamente`)
    })
}


// Tabla NP_a_Considerar
const getNPaConsiderar = (request, response) => {
    pool.query('SELECT * FROM np_a_considerar ORDER BY id ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getNPaConsiderarByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM np_a_considerar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createNP = (request, response) => {
    const {cod_comp, nomb_comp} = request.body

    pool.query('INSERT INTO np_a_considerar (cod_comp, nomb_comp) VALUES ($1, $2) RETURNING *', [cod_comp, nomb_comp], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateNP = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_comp, nomb_comp} = request.body

    pool.query(
        'UPDATE np_a_considerar SET cod_comp = $1, nomb_comp = $2 WHERE id = $3',
        [cod_comp, nomb_comp, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar NP correctamente`)
        }
    )
}

const deleteNP = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM np_a_considerar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar NP correctamente`)
    })
}


// Tabla Depos_A_No_Considerar
const getDeposANoConsiderar = (request, response) => {
    pool.query('SELECT * FROM depos_a_no_considerar ORDER BY cod_depos ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getDeposANoConsiderarByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM depos_a_no_considerar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createDepos = (request, response) => {
    const {cod_depos, nombre_deposito} = request.body

    pool.query(
        'INSERT INTO depos_a_no_considerar (cod_depos, nombre_deposito) VALUES ($1, $2) RETURNING *', 
        [cod_depos, nombre_deposito], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Deposito agregar correctamente`)
    })
}

const updateDepos = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_depos, nombre_deposito} = request.body

    pool.query(
        'UPDATE depos_a_no_considerar SET cod_depos = $1, nombre_deposito = $2 WHERE id = $3',
        [cod_depos, nombre_deposito, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar deposito correctamente`)
        }
    )
}

const deleteDepos = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM depos_a_no_considerar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar deposito correctamente`)
    })
}

// Tabla Const. Seco Armado Config. 1
const getConstSecoArmadoConfig1 = (request, response) => {
    pool.query('SELECT * FROM const_seco_armado_config_1 ORDER BY id ASC', (error, results)=> {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getConstSecoArmadoConfig1ById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM const_seco_armado_config_1 WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createConstSecoArmadoConfig1 = (request, response) => {
    const {codptf, configcs, cant} = request.body

    pool.query(
        'INSERT INTO public.const_seco_armado_config_1 (codptf, configcs, cant) VALUES ($1, $2, $3) RETURNING *', 
        [codptf, configcs, cant], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateConstSecoArmadoConfig1 = (request, response) => {
    const id = parseInt(request.params.id)
    const {codptf, configcs, cant} = request.body

    pool.query(
        'UPDATE const_seco_armado_config_1 SET codptf = $1, configcs = $2, cant = $3 WHERE id = $4',
        [codptf, configcs, cant, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const deleteConstSecoArmadoConfig1 = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.const_seco_armado_config_1 WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Const. Seco Armado Config. 2
const getConstSecoArmadoConfig2 = (request, response) => {
    pool.query('SELECT * FROM public.const_seco_armado_config_2', (error, results)=> {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getConstSecoArmadoConfig2ByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.const_seco_armado_config_2 WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createConstSecoArmadoConfig2 = (request, response) => {
    const {cod_art, nombre_art_ptf, nombre_art_lp, uni_lp_x_cada_uni_ptf, uni, fracciona_uni_ptf, observacion} = request.body

    pool.query(
        'INSERT INTO public.const_seco_armado_config_2 (cod_art, nombre_art_ptf, nombre_art_lp, uni_lp_x_cada_uni_ptf, uni, fracciona_uni_ptf, observacion) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', 
        [cod_art, nombre_art_ptf, nombre_art_lp, uni_lp_x_cada_uni_ptf, uni, fracciona_uni_ptf, observacion], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateConstSecoArmadoConfig2 = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_art, nombre_art_ptf, nombre_art_lp, uni_lp_x_cada_uni_ptf, uni, fracciona_uni_ptf, observacion} = request.body

    pool.query(
        'UPDATE public.const_seco_armado_config_2 SET cod_art = $1, nombre_art_ptf = $2, nombre_art_lp = $3, uni_lp_x_cada_uni_ptf = $4, uni = $5, fracciona_uni_ptf = $6, observacion = $7 WHERE id = $8',
        [cod_art, nombre_art_ptf, nombre_art_lp, uni_lp_x_cada_uni_ptf, uni, fracciona_uni_ptf, observacion, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado`)
        }
    )
}

const deleteConstSecoArmadoConfig2 = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.const_seco_armado_config_2 WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Const. Seco Nombres Config.
const getConstSecoNombresConfig = (request, response) => {
    pool.query('SELECT * FROM public.const_seco_nombres_configuraciones ORDER BY id ASC', (error, results)=> {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getConstSecoNombresConfigByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.const_seco_nombres_configuraciones WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateConstSecoNombresConfig = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_conf_cs, nombre_conf_cs} = request.body

    pool.query(
        'UPDATE public.const_seco_nombres_configuraciones SET cod_conf_cs = $1, nombre_conf_cs = $2 WHERE id = $3',
        [cod_conf_cs, nombre_conf_cs, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createConstSecoNombresConfig = (request, response) => {
    const {cod_conf_cs, nombre_conf_cs} = request.body

    pool.query(
        'INSERT INTO public.const_seco_nombres_configuraciones (cod_conf_cs, nombre_conf_cs) VALUES ($1, $2) RETURNING *', 
        [cod_conf_cs, nombre_conf_cs], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteConstSecoNombresConfig = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.const_seco_nombres_configuraciones WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla SETS DE VENTAS
const getSetsVentas = (request, response) => {
    pool.query('SELECT * FROM public.sets_de_ventas', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getSetsVentasByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.sets_de_ventas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateSetsVentas = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_set_art, nombre_set_art} = request.body

    pool.query(
        'UPDATE public.sets_de_ventas SET cod_set_art = $1, nombre_set_art = $2 WHERE id = $3',
        [cod_set_art, nombre_set_art, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createSetsVentas = (request, response) => {
    const {cod_set_art, nombre_set_art} = request.body

    pool.query(
        'INSERT INTO public.sets_de_ventas (cod_set_art, nombre_set_art) VALUES ($1, $2) RETURNING *', 
        [cod_set_art, nombre_set_art], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteSetsVentas = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.sets_de_ventas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla FAMILIA DE ARTICULOS
const getFamiliaArt = (request, response) => {
    pool.query('SELECT * FROM public.familias_de_articulos', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getFamiliaArtById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.familias_de_articulos WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateFamiliaArt = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia} = request.body

    pool.query(
        'UPDATE public.familias_de_articulos SET id= $1, cod_fami_art= $2, nombre_fami_art= $3, nro_orden_de_la_fami= $4, set_de_la_familia= $5 WHERE id = $1;',
        /* 'UPDATE public.familias_de_articulos SET cod_fami_art = $1, nombre_fami_art = $2, nro_orden_de_la_fami =$3, set_de_la_familia = $4 WHERE id = $5', */
        [id, cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createFamiliaArt = (request, response) => {
    const {cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia} = request.body

    pool.query(
        'INSERT INTO public.familias_de_articulos (cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia) VALUES ($1, $2, $3, $4)',
        [cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteFamiliaArt = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.familias_de_articulos WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Vincular articulos a familia
const getVincularArtFamilia = (request, response) => {
    pool.query('SELECT * FROM public.vincular_articulos_a_familia', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getVincularArtFamiliaByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.vincular_articulos_a_familia WHERE cod = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateVincularArtFamilia = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_art, cod_familia, orden_art_familia} = request.body

    pool.query(
        'UPDATE public.vincular_articulos_a_familia SET  cod_art = $1, cod_familia =$2, orden_art_familia = $3 WHERE cod = $4',
        [cod_art, cod_familia, orden_art_familia, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createVincularArtFamilia = (request, response) => {
    const {cod_art, cod_familia, orden_art_familia} = request.body

    pool.query(
        'INSERT INTO public.vincular_articulos_a_familia (cod_art, cod_familia, orden_art_familia) VALUES ($1, $2, $3) RETURNING *', 
        [cod_art, cod_familia, orden_art_familia], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteVincularArtFamilia = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.vincular_articulos_a_familia WHERE cod = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Productos para Distribucion LD
const getProductosDistribucion = (request, response) => {
    pool.query('SELECT * FROM public.productos_para_distribucion', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getProductosDistribucionByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.productos_para_distribucion WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateProductosDistribucion = (request, response) => {
    const id = parseInt(request.params.id)
    const {Codigo_producto, Orden_producto, Cod_Familia_producto} = request.body

    pool.query(
        'UPDATE public.productos_para_distribucion SET id = $4, "Codigo_producto" = $1, "Orden_producto" = $2, "Cod_Familia_producto" = $3 WHERE id = $4',
        [Codigo_producto, Orden_producto, Cod_Familia_producto, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createProductosDistribucion = (request, response) => {
    const {Codigo_producto, Orden_producto, Cod_Familia_producto} = request.body

    pool.query(
        'INSERT INTO public.productos_para_distribucion ("Codigo_producto", "Orden_producto", "Cod_Familia_producto") VALUES ($1, $2, $3)', 
        [Codigo_producto, Orden_producto, Cod_Familia_producto], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteProductosDistribucion = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.productos_para_distribucion WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Rubros Ventas
const getRubrosVtas = (request, response) => {
    pool.query('SELECT * FROM public.rubros_ventas', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getRubrosVtasByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.rubros_ventas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateRubrosVtas = (request, response) => {
    const id = parseInt(request.params.id)
    const {rubros_id, rubros_nombres, orden_rubros} = request.body

    pool.query(
        'UPDATE public.rubros_ventas SET "rubros_id" = $1, "rubros_nombres" = $2, "orden_rubros" = $3 WHERE id = $4',
        [rubros_id, rubros_nombres, orden_rubros, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createRubrosVtas = (request, response) => {
    const {rubros_id, rubros_nombres, orden_rubros} = request.body

    pool.query(
        'INSERT INTO public.rubros_ventas ("rubros_id", "rubros_nombres", "orden_rubros") VALUES ($1, $2, $3)', 
        [rubros_id, rubros_nombres, orden_rubros], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteRubrosVtas = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.rubros_ventas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Familia Articulos Distribución
const getFamArtDist = (request, response) => {
    pool.query('SELECT * FROM public.familias_articulos_distribucion', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getFamArtDistByCod = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.familias_articulos_distribucion WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateFamArtDist = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_familia_art, nombre_familia_art, nro_orden_familia, cod_set_art, nombre_set_art} = request.body

    pool.query(
        'UPDATE public.familias_articulos_distribucion SET "cod_familia_art" = $1, "nombre_familia_art" = $2, "nro_orden_familia" = $3, "cod_set_art" = $4, "nombre_set_art" = $5 WHERE id = $6',
        [cod_familia_art, nombre_familia_art, nro_orden_familia, cod_set_art, nombre_set_art, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createFamArtDist = (request, response) => {
    const {cod_familia_art, nombre_familia_art, nro_orden_familia, cod_set_art, nombre_set_art} = request.body

    pool.query(
        'INSERT INTO public.familias_articulos_distribucion ("cod_familia_art", "nombre_familia_art", "nro_orden_familia", "cod_set_art", "nombre_set_art") VALUES ($1, $2, $3, $4, $5)', 
        [cod_familia_art, nombre_familia_art, nro_orden_familia, cod_set_art, nombre_set_art], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteFamArtDist = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.familias_articulos_distribucion WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Cartel Manual
const getCartelManual = (request, response) => {
    pool.query('SELECT * FROM public.cartel_manual', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getCartelManualbyId = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.cartel_manual WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateCartelManual = (request, response) => {
    const id = parseInt(request.params.id)
    const {titulo, subtitulo, precio, unimed, outlet} = request.body

    pool.query(
        'UPDATE public.cartel_manual SET "titulo" = $1, "subtitulo" = $2, "precio" = $3, "unimed" = $4, "outlet" = $5 WHERE id = $6',
        [titulo, subtitulo, precio, unimed, outlet, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createCartelManual = (request, response) => {
    const {titulo, subtitulo, precio, unimed, outlet} = request.body

    pool.query(
        'INSERT INTO public.cartel_manual ("titulo", "subtitulo", "precio", "unimed", "outlet") VALUES ($1, $2, $3, $4, $5)', 
        [titulo, subtitulo, precio, unimed, outlet], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteCartelManual = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.cartel_manual WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Desposito no a considerar para stock fisico
const getDespositoNoAConsiderarParaStockFisico = (request, response) => {
    pool.query('SELECT * FROM public.depos_a_no_considerar_para_stock_fisico ORDER BY id ASC ', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateDespositoNoAConsiderarParaStockFisico = (request, response) => {
    const id = parseInt(request.params.id)
    const {codigo_deposito, nombre_deposito} = request.body

    pool.query(
        'UPDATE public.depos_a_no_considerar_para_stock_fisico SET "codigo_deposito" = $1, "nombre_deposito" = $2 WHERE id = $3',
        [codigo_deposito, nombre_deposito, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createDespositoNoAConsiderarParaStockFisico = (request, response) => {
    const {codigo_deposito, nombre_deposito} = request.body

    pool.query(
        'INSERT INTO public.depos_a_no_considerar_para_stock_fisico ("codigo_deposito", "nombre_deposito") VALUES ($1, $2)', 
        [codigo_deposito, nombre_deposito], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteDespositoNoAConsiderarParaStockFisico = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.depos_a_no_considerar_para_stock_fisico WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Categorias Web
const getCategoriasWeb = (request, response) => {
    pool.query('SELECT * FROM public.categorias', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateCategoriasWeb = (request, response) => {
    const id = parseInt(request.params.id)
    const {id_categorias, nombre_categorias} = request.body

    pool.query(
        'UPDATE public.categorias SET id = $3,  "id_categorias" = $1, "nombre_categorias" = $2 WHERE id = $3',
        [id_categorias, nombre_categorias, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createCategoriasWeb = (request, response) => {
    const {id_categorias, nombre_categorias} = request.body

    pool.query(
        'INSERT INTO public.categorias ("id_categorias", "nombre_categorias") VALUES ($1, $2)', 
        [id_categorias, nombre_categorias], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteCategoriasWeb = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.categorias WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Articulos Web
const getArticulosWeb = (request, response) => {
    pool.query('SELECT * FROM public.articulos', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateArticulosWeb = (request, response) => {
    const id = parseInt(request.params.id)
    const {publicado, codigo_art, nombre_art, orden_art, marcar_nuevo, mostrar_inicio, outlet, copete, descripcion, bloq_vtas, min_para_web, stock, categorias1, categorias2, categorias3, categorias4} = request.body

    pool.query(
        'UPDATE public.articulos SET id=$17, publicado=$1, codigo_art=$2, nombre_art=$3, orden_art=$4, marcar_nuevo=$5, mostrar_inicio=$6, outlet=$7, copete=$8, descripcion=$9, bloq_vtas=$10, min_para_web=$11, stock=$12, categorias1=$13, categorias2=$14, categorias3=$15, categorias4=$16 WHERE id=$17',
        [publicado, codigo_art, nombre_art, orden_art, marcar_nuevo, mostrar_inicio, outlet, copete, descripcion, bloq_vtas, min_para_web, stock, categorias1, categorias2, categorias3, categorias4, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createArticulosWeb = (request, response) => {
    const {publicado, codigo_art, nombre_art, orden_art, marcar_nuevo, mostrar_inicio, outlet, copete, descripcion, bloq_vtas, min_para_web, stock, categorias1, categorias2, categorias3, categorias4} = request.body

    pool.query(
        'INSERT INTO public.articulos (publicado, codigo_art, nombre_art, orden_art, marcar_nuevo, mostrar_inicio, outlet, copete, descripcion, bloq_vtas, min_para_web, stock, categorias1, categorias2, categorias3, categorias4) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)', 
        [publicado, codigo_art, nombre_art, orden_art, marcar_nuevo, mostrar_inicio, outlet, copete, descripcion, bloq_vtas, min_para_web, stock, categorias1, categorias2, categorias3, categorias4], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteArticulosWeb = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.articulos WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Actualización Web
const getActualizacionWeb = (request, response) => {
    pool.query('SELECT * FROM public.actualizacion_web', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const UpdateActualizacionWebNow = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query(
        'UPDATE public.actualizacion_web SET actualizacion_fecha = now() WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const UpdateActualizacionWebCron = (request, response) => {
    const id = parseInt(request.params.id)
    const {actualizacion_cron_lunesaviernes, actualizacion_cron_sabados} = request.body

    pool.query(
        'UPDATE public.actualizacion_web SET id = $1, actualizacion_cron_lunesaviernes = $2, actualizacion_cron_sabados = $3 WHERE id = $1;',
        [id, actualizacion_cron_lunesaviernes, actualizacion_cron_sabados], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const UpdateActualizacionWebChecked = (request, response) => {
    const id = parseInt(request.params.id)
    const {actualizacion_automatica} = request.body

    pool.query(
        'UPDATE public.actualizacion_web SET id = $1, actualizacion_automatica = $2 WHERE id = $1;',
        [id, actualizacion_automatica], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const UpdateActualizacionWeb = (request, response) => {
    const id = parseInt(request.params.id)
    const {actualizacion_automatica, actualizacion_cron_lunesaviernes, actualizacion_cron_sabados} = request.body

    pool.query(
        'UPDATE public.actualizacion_web SET id = $1, actualizacion_automatica = $2, actualizacion_fecha = now(), actualizacion_cron_lunesaviernes = $3, actualizacion_cron_sabados = $4 WHERE id = $1;',
        [id, actualizacion_automatica, actualizacion_cron_lunesaviernes, actualizacion_cron_sabados], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const CreateActualizacionWeb = (request, response) => {
    const {actualizacion_automatica} = request.body

    pool.query(
        'INSERT INTO public.actualizacion_web(actualizacion_automatica) VALUES ($1);', 
        [actualizacion_automatica], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteActualizacionWeb = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.actualizacion_web WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

module.exports = {
    getDeposANoConsiderar, getDeposANoConsiderarByCod, createDepos, updateDepos, deleteDepos,
    getNPaConsiderar, getNPaConsiderarByCod, createNP, updateNP, deleteNP,
    getDimensionesCont, getDimensionesContById, createDimensionesCont, updateDimensionesCont, deleteDimensionesCont,
    getMovContenedores, getMovContenedoresById, createMovContenedores, updateMovContenedores, deleteMovContenedores,
    getListadePrecioBUI, getListadePrecioBUIById, createListadePrecioBUI, updateListadePrecioBUI, deleteListadePrecioBUI,
    getTablas, getTablasById, createTablas, updateTablas, deleteTablas,
    getConstSecoArmadoConfig1, getConstSecoArmadoConfig1ById, createConstSecoArmadoConfig1, updateConstSecoArmadoConfig1, deleteConstSecoArmadoConfig1,
    getConstSecoArmadoConfig2, getConstSecoArmadoConfig2ByCod, createConstSecoArmadoConfig2, updateConstSecoArmadoConfig2, deleteConstSecoArmadoConfig2,
    getConstSecoNombresConfig, getConstSecoNombresConfigByCod, createConstSecoNombresConfig, updateConstSecoNombresConfig, deleteConstSecoNombresConfig,
    getSetsVentas, getSetsVentasByCod, createSetsVentas, updateSetsVentas, deleteSetsVentas,
    getFamiliaArt, getFamiliaArtById, createFamiliaArt, updateFamiliaArt, deleteFamiliaArt,
    getVincularArtFamilia, getVincularArtFamiliaByCod, updateVincularArtFamilia, createVincularArtFamilia, deleteVincularArtFamilia,
    getProductosDistribucion, getProductosDistribucionByCod, updateProductosDistribucion, createProductosDistribucion, deleteProductosDistribucion,
    getRubrosVtas, getRubrosVtasByCod, updateRubrosVtas, createRubrosVtas, deleteRubrosVtas,
    getFamArtDist, getFamArtDistByCod, updateFamArtDist, createFamArtDist, deleteFamArtDist,
    getCartelManual, getCartelManualbyId, updateCartelManual, createCartelManual, deleteCartelManual,
    getDespositoNoAConsiderarParaStockFisico, updateDespositoNoAConsiderarParaStockFisico, createDespositoNoAConsiderarParaStockFisico, deleteDespositoNoAConsiderarParaStockFisico,
    getCategoriasWeb, updateCategoriasWeb,createCategoriasWeb,deleteCategoriasWeb,
    getArticulosWeb, updateArticulosWeb, createArticulosWeb, deleteArticulosWeb,
    getActualizacionWeb, UpdateActualizacionWeb, CreateActualizacionWeb, deleteActualizacionWeb, UpdateActualizacionWebNow, UpdateActualizacionWebCron, UpdateActualizacionWebChecked
}