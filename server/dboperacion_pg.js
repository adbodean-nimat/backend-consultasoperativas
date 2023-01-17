const { response, request } = require('express');
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
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
            response.status(200).send(`Modificar correctamente: ${id}`)
        }
    )
}

const deleteTablas = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM tablas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar correctamente: ${id}`)
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
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
            response.status(200).send(`Modificar correctamente: ${id}`)
        }
    )
}

const deleteListadePrecioBUI = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM lista_de_precios_breve_uso_interno WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar correctamente: ${id}`)
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
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
            response.status(200).send(`Modificar correctamente: ${id}`)
        }
    )
}

const deleteMovContenedores = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM movimientos_de_contenedores WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar deposito: ${id}`)
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
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
            response.status(200).send(`Modificar correctamente: ${id}`)
        }
    )
}

const deleteDimensionesCont = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM dimensiones_contenedores WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar correctamente: ${id}`)
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
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
            response.status(200).send(`Modificar NP: ${id}`)
        }
    )
}

const deleteNP = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM np_a_considerar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar NP: ${id}`)
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
        response.status(201).send(`Deposito agregar correctamente id: ${results.rows[0].id}`)
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
            response.status(200).send(`Modificar deposito: ${id}`)
        }
    )
}

const deleteDepos = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM depos_a_no_considerar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar deposito: ${id}`)
    })
}

// Tabla Const. Seco Armado Config. 1
const getConstSecoArmadoConfig1 = (request, response) => {
    pool.query('SELECT * FROM public.const_seco_armado_config_1', (error, results)=> {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getConstSecoArmadoConfig1ById = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('SELECT * FROM public.const_seco_armado_config_1 WHERE id = $1', [id], (error, results) => {
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
    })
}

const updateConstSecoArmadoConfig1 = (request, response) => {
    const id = parseInt(request.params.id)
    const {codptf, configcs, cant} = request.body

    pool.query(
        'UPDATE public.const_seco_armado_config_1 SET codptf = $1, configcs = $2, cant = $3 WHERE id = $4',
        [codptf, configcs, cant, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado: ${id}`)
        }
    )
}

const deleteConstSecoArmadoConfig1 = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.const_seco_armado_config_1 WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado: ${id}`)
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
        response.status(200).send(`Eliminado: ${id}`)
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
            response.status(200).send(`Modificado: ${id}`)
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
        response.status(200).send(`Eliminado: ${id}`)
    })
}

// Tabla SETS DE VENTAS
const getSetsVentas = (request, response) => {
    pool.query('SELECT * FROM public.sets_de_ventas ORDER BY id ASC', (error, results) =>{
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
            response.status(200).send(`Modificado: ${id}`)
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
    })
}

const deleteSetsVentas = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.sets_de_ventas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado: ${id}`)
    })
}

// Tabla FAMILIA DE ARTICULOS
const getFamiliaArt = (request, response) => {
    pool.query('SELECT * FROM public.familias_de_articulos ORDER BY id ASC', (error, results) =>{
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
        'UPDATE public.familias_de_articulos SET cod_fami_art = $1, nombre_fami_art = $2, nro_orden_de_la_fami =$3, set_de_la_familia = $4 WHERE id = $5',
        [cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado: ${id}`)
        }
    )
}

const createFamiliaArt = (request, response) => {
    const {cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia} = request.body

    pool.query(
        'INSERT INTO public.familias_de_articulos (cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia) VALUES ($1, $2, $3, $4) RETURNING *', 
        [cod_fami_art, nombre_fami_art, nro_orden_de_la_fami, set_de_la_familia], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].id}`)
    })
}

const deleteFamiliaArt = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.familias_de_articulos WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado: ${id}`)
    })
}

// Tabla Vincular articulos a familia
const getVincularArtFamilia = (request, response) => {
    pool.query('SELECT * FROM public.vincular_articulos_a_familia ORDER BY cod ASC', (error, results) =>{
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
            response.status(200).send(`Modificado`)
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
        response.status(201).send(`Agregar correctamente id: ${results.rows[0].cod}`)
    })
}

const deleteVincularArtFamilia = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.vincular_articulos_a_familia WHERE cod = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado: ${id}`)
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
    getVincularArtFamilia, getVincularArtFamiliaByCod, updateVincularArtFamilia, createVincularArtFamilia, deleteVincularArtFamilia
}