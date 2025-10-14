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
    const {nombre_set_art} = request.body

    pool.query(
        'UPDATE public.sets_de_ventas SET nombre_set_art = $1 WHERE id = $2',
        [nombre_set_art, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createSetsVentas = (request, response) => {
    const {nombre_set_art} = request.body

    pool.query(
        'INSERT INTO public.sets_de_ventas (nombre_set_art) VALUES ($1) RETURNING *', 
        [nombre_set_art], (error, results) => {
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
    const {nombre_fami_art, nro_orden_de_la_fami, set_ventas} = request.body

    pool.query(
        'UPDATE public.familias_de_articulos SET id= $1, nombre_fami_art= $2, nro_orden_de_la_fami= $3, set_ventas = $4 WHERE id = $1;',
        [id, nombre_fami_art, nro_orden_de_la_fami, set_ventas], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createFamiliaArt = (request, response) => {
    const {nombre_fami_art, nro_orden_de_la_fami, set_ventas} = request.body

    pool.query(
        'INSERT INTO public.familias_de_articulos (nombre_fami_art, nro_orden_de_la_fami, set_ventas) VALUES ($1, $2, $3)',
        [nombre_fami_art, nro_orden_de_la_fami, set_ventas], (error, results) => {
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
        'UPDATE public.vincular_articulos_a_familia SET cod_art = $1 , cod_familia = $2 , orden_art_familia = $3 WHERE cod = $4',
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

// Tabla Familia Distribución {mejorado}
const getFamiliaDist = (request, response) => {
    pool.query('SELECT * FROM public.familias_distribuciones', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateFamiliaDist = (request, response) => {
    const id = parseInt(request.params.id)
    const {nombre_familia, orden_familia} = request.body

    pool.query(
        'UPDATE public.familias_distribuciones SET "nombre_familia" = $1, "orden_familia" = $2 WHERE id = $3',
        [nombre_familia, orden_familia, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createFamiliaDist = (request, response) => {
    const {nombre_familia, orden_familia} = request.body

    pool.query(
        'INSERT INTO public.familias_distribuciones ("nombre_familia", "orden_familia") VALUES ($1, $2)', 
        [nombre_familia, orden_familia], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteFamiliaDist = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.familias_distribuciones WHERE id = $1', [id], (error, results) => {
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

const getCategoriasWeb2 = async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM public.categorias');
      return rows;
    } catch (err) {
        console.error('Error fetching categorias:', err);
        throw err;
    }
  };

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

const getArticulosWeb2 = async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT * FROM public.articulos');
      return rows;
    } catch (err) {
        console.error('Error fetching articulos:', err);
        throw err;
    }
  };

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

const UpdateActualizacionWebChecked = (boolean) => {
    const id = 1
    const actualizacion_automatica = boolean

    pool.query(
        'UPDATE public.actualizacion_web SET id = $1, actualizacion_automatica = $2 WHERE id = $1;',
        [id, actualizacion_automatica], (error, results) => {
            if (error){
                throw error
            }
            //response.status(200).send(`Modificado correctamente`)
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

// Tabla Comprobantes a Omitir 
const getComprobantesAOmitir = (request, response) => {
    pool.query('SELECT * FROM public.comprobantes_a_omitir ', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateComprobantesAOmitir = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_comprobante, nombre_comprobante} = request.body

    pool.query(
        'UPDATE public.comprobantes_a_omitir SET "cod_comprobante" = $1, "nombre_comprobante" = $2 WHERE id = $3',
        [cod_comprobante, nombre_comprobante, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createComprobantesAOmitir = (request, response) => {
    const {cod_comprobante, nombre_comprobante} = request.body

    pool.query(
        'INSERT INTO public.comprobantes_a_omitir("cod_comprobante", "nombre_comprobante") VALUES ($1, $2)', 
        [cod_comprobante, nombre_comprobante], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteComprobantesAOmitir = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.comprobantes_a_omitir WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Remitos de Ventas
const getRemitosVtas = (request, response) => {
    pool.query('SELECT * FROM public.remitos_de_ventas ', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateRemitosVtas = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_comprobante, nombre_comprobante} = request.body

    pool.query(
        'UPDATE public.remitos_de_ventas SET "cod_comprobante" = $1, "nombre_comprobante" = $2 WHERE id = $3',
        [cod_comprobante, nombre_comprobante, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createRemitosVtas = (request, response) => {
    const {cod_comprobante, nombre_comprobante} = request.body

    pool.query(
        'INSERT INTO public.remitos_de_ventas("cod_comprobante", "nombre_comprobante") VALUES ($1, $2)', 
        [cod_comprobante, nombre_comprobante], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteRemitosVtas = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.remitos_de_ventas WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Tabla Cales Cementos Plasticor
const getCalesCementosPlasticor = (request, response) => {
    pool.query('SELECT * FROM public.cales_cementos_plasticor ', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateCalesCementosPlasticor = (request, response) => {
    const id = parseInt(request.params.id)
    const {cod_articulos, nombre_articulos} = request.body

    pool.query(
        'UPDATE public.cales_cementos_plasticor SET "cod_articulos" = $1, "nombre_articulos" = $2 WHERE id = $3',
        [cod_articulos, nombre_articulos, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createCalesCementosPlasticor = (request, response) => {
    const {cod_articulos, nombre_articulos} = request.body

    pool.query(
        'INSERT INTO public.cales_cementos_plasticor("cod_articulos", "nombre_articulos") VALUES ($1, $2)', 
        [cod_articulos, nombre_articulos], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteCalesCementosPlasticor = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.cales_cementos_plasticor WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Filtro Clientes Cta Cte Plataforma
const getClientesCtaCte = (request, response) => {
    pool.query('SELECT * FROM public.filtro_clientes_plataforma', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateClientesCtaCte = (request, response) => {
    const id = parseInt(request.params.id)
    const {tipo_de_cliente, perfil_crediticio} = request.body

    pool.query(
        'UPDATE public.filtro_clientes_plataforma SET "tipo_de_cliente" = $1::json , "perfil_crediticio" = $2::json WHERE id = $3',
        [tipo_de_cliente, perfil_crediticio, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createClientesCtaCte = (request, response) => {
    const {tipo_de_cliente, perfil_crediticio} = request.body

    pool.query(
        'INSERT INTO public.filtro_clientes_plataforma("tipo_de_cliente", "perfil_crediticio") VALUES ($1, $2)', 
        [tipo_de_cliente, perfil_crediticio], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteClientesCtaCte = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.filtro_clientes_plataforma WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Informes Acindar - Clasif. Clientes
const getAcindarClasifClientes = (request, response) => {
    pool.query('SELECT * FROM public.acindar_clasif_clientes', (error, results)=>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createClasifClientes = (request, response) => {
    const {clasif_1_ptf, segmento_cliente_acindar, descrip_segmento, observacion} = request.body

    pool.query(
        'INSERT INTO public.acindar_clasif_clientes(clasif_1_ptf, segmento_cliente_acindar, descrip_segmento, observacion) VALUES ($1, $2, $3, $4);', 
        [clasif_1_ptf, segmento_cliente_acindar, descrip_segmento, observacion], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateClasifClientes = (request, response) => {
    const id = parseInt(request.params.id)
    const {clasif_1_ptf, segmento_cliente_acindar, descrip_segmento, observacion} = request.body

    pool.query(
        'UPDATE public.acindar_clasif_clientes SET id= $5, clasif_1_ptf= $1, segmento_cliente_acindar= $2, descrip_segmento= $3, observacion= $4 WHERE id = $5',
        [clasif_1_ptf, segmento_cliente_acindar, descrip_segmento, observacion, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const deleteClasifClientes = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.acindar_clasif_clientes WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Informes Acindar - Comprobantes
const getAcindarComprobantes = (request, response) => {
    pool.query('SELECT * FROM public.acindar_comprobantes', (error, results)=>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createAcindarComprobantes = (request, response) => {
    const {comprobante_ptf, tipo_de_transaccion, comprobante_acindar, tipo_doc_legal} = request.body

    pool.query(
        'INSERT INTO public.acindar_comprobantes(comprobante_ptf, tipo_de_transaccion, comprobante_acindar, tipo_doc_legal) VALUES ($1, $2, $3, $4);', 
        [comprobante_ptf, tipo_de_transaccion, comprobante_acindar, tipo_doc_legal], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateAcindarComprobantes = (request, response) => {
    const id = parseInt(request.params.id)
    const {comprobante_ptf, tipo_de_transaccion, comprobante_acindar, tipo_doc_legal} = request.body

    pool.query(
        'UPDATE public.acindar_comprobantes	SET id= $5, comprobante_ptf= $1, tipo_de_transaccion= $2, comprobante_acindar= $3 , tipo_doc_legal= $4 WHERE id= $5',
        [comprobante_ptf, tipo_de_transaccion, comprobante_acindar, tipo_doc_legal, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const deleteAcindarComprobantes = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.acindar_comprobantes WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Informes Acindar - Equival. Cod. y Factor Cant.
const getAcindarEquivalCodFactorCant = (request, response) => {
    pool.query('SELECT * FROM public.acindar_equivalcod_factorcant', (error, results)=>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createAcindarEquivalCodFactorCant = (request, response) => {
    const {codigo_ptf, codigo_acindar, factor_cant} = request.body

    pool.query(
        'INSERT INTO public.acindar_equivalcod_factorcant(codigo_ptf, codigo_acindar, factor_cant) VALUES ($1, $2, $3);', 
        [codigo_ptf, codigo_acindar, factor_cant], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const updateAcindarEquivalCodFactorCant = (request, response) => {
    const id = parseInt(request.params.id)
    const {codigo_ptf, codigo_acindar, factor_cant} = request.body

    pool.query(
        'UPDATE public.acindar_equivalcod_factorcant SET id= $4, codigo_ptf= $1, codigo_acindar= $2, factor_cant= $3 WHERE id= $4',
        [codigo_ptf, codigo_acindar, factor_cant, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const deleteAcindarEquivalCodFactorCant = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.acindar_equivalcod_factorcant WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Filtro Acindar Plataforma
const getFiltroAcindarPTF = (request, response) => {
    pool.query('SELECT * FROM public.acindar_filtro_plataforma', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateFiltroAcindarPTF = (request, response) => {
    const id = parseInt(request.params.id)
    const {clasif6_inc, clasif5_exc} = request.body

    pool.query(
        'UPDATE public.acindar_filtro_plataforma SET "clasif6_inc" = $1::json , "clasif5_exc" = $2::json WHERE id = $3',
        [clasif6_inc, clasif5_exc, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createFiltroAcindarPTF = (request, response) => {
    const {clasif6_inc, clasif5_exc} = request.body

    pool.query(
        'INSERT INTO public.acindar_filtro_plataforma("clasif6_inc", "clasif5_exc") VALUES ($1, $2)', 
        [clasif6_inc, clasif5_exc], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteFiltroAcindarPTF = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.acindar_filtro_plataforma WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

// Arts Claisf. 5 Al consultar
const getArtsClasif5AlConsultar = (request, response) => {
    pool.query('SELECT * FROM public.clasif_arts_5_al_consultar', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateArtsClasif5AlConsultar = (request, response) => {
    const id = parseInt(request.params.id)
    const {arts_clasif_5, descripcion, whatsapp} = request.body

    pool.query(
        'UPDATE public.clasif_arts_5_al_consultar SET arts_clasif_5 = $1::jsonb[] , descripcion = $2, whatsapp = $3 WHERE id = $4',
        [arts_clasif_5, descripcion, whatsapp, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createArtsClasif5AlConsultar = (request, response) => {
    const {arts_clasif_5, descripcion, whatsapp} = request.body

    pool.query(
        'INSERT INTO public.clasif_arts_5_al_consultar(arts_clasif_5, descripcion, whatsapp) VALUES ($1, $2, $3)', 
        [arts_clasif_5, descripcion, whatsapp], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteArtsClasif5AlConsultar = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.clasif_arts_5_al_consultar WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}


// Arts Clasif. 5 Stock Manual - WEB 
const getArtsClasif5StockManual = (request, response) => {
    pool.query('SELECT * FROM public.clasif_arts_5_stock_manual', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const updateArtsClasif5StockManual = (request, response) => {
    const id = parseInt(request.params.id)
    const {arts_clasif_5, stock_manual} = request.body

    pool.query(
        'UPDATE public.clasif_arts_5_stock_manual SET arts_clasif_5 = $1::jsonb[] , stock_manual = $2 WHERE id = $3',
        [arts_clasif_5, stock_manual, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const createArtsClasif5StockManual = (request, response) => {
    const {arts_clasif_5, stock_manual} = request.body

    pool.query(
        'INSERT INTO public.clasif_arts_5_stock_manual(arts_clasif_5, stock_manual) VALUES ($1, $2)', 
        [arts_clasif_5, stock_manual], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const deleteArtsClasif5StockManual = (request, response) => {
    const id = parseInt(request.params.id)

    pool.query('DELETE FROM public.clasif_arts_5_stock_manual WHERE id = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminado correctamente`)
    })
}

const gdc_modosdestockminimo = (request, response) => {
    pool.query('SELECT * FROM public.gdc_modosdestockminimo', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdc_modosdestockminimocreate = (request, response) => {
    const {Cod_modo_stock, Nombre_modo_stock} = request.body

    pool.query(
        'INSERT INTO public.gdc_modosdestockminimo("Cod_modo_stock", "Nombre_modo_stock") VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET "Cod_modo_stock" = $1, "Nombre_modo_stock" = $2;', 
        [Cod_modo_stock, Nombre_modo_stock], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    })
}

const gdc_modosdestockminimoupdate = (request, response) => {
    const id = parseInt(request.params.id)
    const {Cod_modo_stock, Nombre_modo_stock} = request.body

    pool.query(
        'UPDATE public.gdc_modosdestockminimo SET "Cod_modo_stock"= $1, "Nombre_modo_stock"= $2 WHERE id = $3;',
        [Cod_modo_stock, Nombre_modo_stock, id ], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdc_modosdestockminimodelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdc_modosdestockminimo WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}


const gdc_clasif8artquesecompran = (request, response) => {
    pool.query('SELECT * FROM public.gdc_clasif8artquesecompran', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdc_clasif8artquesecompranUpdate = (request, response) => {
    const {id, Cod_clasif8, Nombre_clasif8, Observacion} = request.body

    pool.query(
        'INSERT INTO public.gdc_clasif8artquesecompran(id, "Cod_clasif8", "Nombre_clasif8", "Observacion") VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET "Cod_clasif8" = $2, "Nombre_clasif8" = $3, "Observacion" = $4;',
        [id, Cod_clasif8, Nombre_clasif8, Observacion], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdc_clasif8artquesecompranDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdc_clasif8artquesecompran WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

const gdc_deposanoconsiderarparastock = (request, response) => {
    pool.query('SELECT * FROM public.gdc_deposanoconsiderarparastock', (error, results) =>{ 
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    }   )
}

const gdc_deposanoconsiderarparastockUpdate = (request, response) => {
    const {id, Cod_Depos, Nombre_Depos} = request.body

    pool.query(
        'INSERT INTO public.gdc_deposanoconsiderarparastock(id, "Cod_Depos", "Nombre_Depos") VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET "Cod_Depos" = $2, "Nombre_Depos" = $3;',
        [id, Cod_Depos, Nombre_Depos], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdc_deposanoconsiderarparastockDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdc_deposanoconsiderarparastock WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

const gdc_npstockcompromvtasespecialespendentregaaclientes = (request, response) => {
    pool.query('SELECT * FROM public."gdc_npstockcomprom-vtasespeciales-pendentregaaclientes"', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdc_npstockcompromvtasespecialespendentregaaclientesUpdate = (request, response) => {
    const {id, Cod_NP, Nombre_NP} = request.body

    pool.query('INSERT INTO public."gdc_npstockcomprom-vtasespeciales-pendentregaaclientes"(id, "Cod_NP", "Nombre_NP") VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET "Cod_NP" = $2, "Nombre_NP" = $3;',
        [id, Cod_NP, Nombre_NP], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdc_npstockcompromvtasespecialespendentregaaclientesDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public."gdc_npstockcomprom-vtasespeciales-pendentregaaclientes"	WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

const gdc_chapastiposqueladefinen = (request, response) => {
    pool.query('SELECT * FROM public.gdc_chapastiposqueladefinen', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdc_chapastiposqueladefinenUpdate = (request, response) => {
    const {id, Cod_tipo, Nombre_tipo} = request.body

    pool.query(
        'INSERT INTO public.gdc_chapastiposqueladefinen(id, "Cod_tipo", "Nombre_tipo") VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET "Cod_tipo" = $2, "Nombre_tipo" = $3;',
        [id, Cod_tipo, Nombre_tipo], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdc_chapastiposqueladefinenDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdc_chapastiposqueladefinen	WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

const gdc_remitosdeventas = (request, response) => {
    pool.query('SELECT * FROM public.gdc_remitosdeventas', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdc_remitosdeventasUpdate = (request, response) => {
    const {id, Cod_Comp, Nombre_Comp} = request.body

    pool.query(
        'INSERT INTO public.gdc_remitosdeventas(id, "Cod_Comp", "Nombre_Comp") VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET "Cod_Comp" = $2, "Nombre_Comp" = $3;',
        [id, Cod_Comp, Nombre_Comp], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdc_remitosdeventasDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdc_remitosdeventas WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

// Tabla GDD - Gestion de Distribucion Clientes

const gdd_clientes_distribuciones = (request, response) => {
    pool.query('SELECT * FROM public.gdd_clientes_distribuciones', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdd_clientes_distribucionesCreate = (request, response) => {
    const {cod_cliente, nombre_cliente, perfilcomercial_cliente, domicilio_cliente, zonas_distribucion_cliente, nro_whatsapp_cliente, rubros_ventas, habilitado, localidad_cliente, provincia_cliente, nombre_zonas_distribucion_cliente, contacto} = request.body
    pool.query(
        'INSERT INTO public.gdd_clientes_distribuciones(cod_cliente, nombre_cliente, perfilcomercial_cliente, domicilio_cliente, zonas_distribucion_cliente, nro_whatsapp_cliente, rubros_ventas, habilitado, localidad_cliente, provincia_cliente, nombre_zonas_distribucion_cliente, contacto) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);', 
        [cod_cliente, nombre_cliente, perfilcomercial_cliente, domicilio_cliente, zonas_distribucion_cliente, nro_whatsapp_cliente, rubros_ventas, habilitado, localidad_cliente, provincia_cliente, nombre_zonas_distribucion_cliente, contacto], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    }
    )
}

const gdd_clientes_distribucionesUpdate = (request, response) => {
    const {id, cod_cliente, nombre_cliente, perfilcomercial_cliente, domicilio_cliente, zonas_distribucion_cliente, nro_whatsapp_cliente, rubros_ventas, habilitado, localidad_cliente, provincia_cliente, nombre_zonas_distribucion_cliente, contacto} = request.body
    pool.query(
        'UPDATE public.gdd_clientes_distribuciones SET id= $1, cod_cliente=$2, nombre_cliente=$3, perfilcomercial_cliente=$4, domicilio_cliente=$5, zonas_distribucion_cliente=$6, nro_whatsapp_cliente=$7, rubros_ventas=$8, habilitado=$9, localidad_cliente=$10, provincia_cliente=$11, nombre_zonas_distribucion_cliente=$12, contacto=$13 WHERE id = $1;',
        [id, cod_cliente, nombre_cliente, perfilcomercial_cliente, domicilio_cliente, zonas_distribucion_cliente, nro_whatsapp_cliente, rubros_ventas, habilitado, localidad_cliente, provincia_cliente, nombre_zonas_distribucion_cliente, contacto], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdd_clientes_distribucionesDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdd_clientes_distribuciones WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }   
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

// Tabla GDD - Gestion de Distribucion Parametros

const gdd_parametros_distribuciones = (request, response) => {
    pool.query('SELECT * FROM public.gdd_parametros_distribuciones', (error, results) =>{
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const gdd_parametros_distribucionesCreate = (request, response) => {
    const {id, perfil_comercial_defecto, dto_financiero, cant_dias_desde_cambios_precio, cant_modif_minimo} = request.body
    pool.query(
        'INSERT INTO public.gdd_parametros_distribuciones(id, perfil_comercial_defecto, dto_financiero, cant_dias_desde_cambios_precio, cant_modif_minimo) VALUES ($1, $2, $3, $4, $5);',
        [id, perfil_comercial_defecto, dto_financiero, cant_dias_desde_cambios_precio, cant_modif_minimo], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Agregar correctamente`)
    }
    )
}

const gdd_parametros_distribucionesUpdate = (request, response) => {
    const {id, perfil_comercial_defecto, dto_financiero, cant_dias_desde_cambios_precio, cant_modif_minimo} = request.body
    pool.query(
        'UPDATE public.gdd_parametros_distribuciones SET id= $1, perfil_comercial_defecto=$2, dto_financiero=$3, cant_dias_desde_cambios_precio=$4, cant_modif_minimo=$5 WHERE id = $1;',
        [id, perfil_comercial_defecto, dto_financiero, cant_dias_desde_cambios_precio, cant_modif_minimo], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificado correctamente`)
        }
    )
}

const gdd_parametros_distribucionesDelete = (request, response) => {
    const id = parseInt(request.params.id)
    pool.query(
        'DELETE FROM public.gdd_parametros_distribuciones WHERE id = $1;',
        [id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Eliminado correctamente`)
        }
    )
}

const simulador_tiposdecomprobantes = async () => {
    try {
        const { rows } = await pool.query('SELECT * FROM public.simulador_cobranzas_tipos_de_comprobantes');
        return rows;
    } catch (error) {
        console.error('Error executing query', error);
    }
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
    getFamiliaDist, updateFamiliaDist, createFamiliaDist, deleteFamiliaDist,
    getFamArtDist, getFamArtDistByCod, updateFamArtDist, createFamArtDist, deleteFamArtDist,
    getCartelManual, getCartelManualbyId, updateCartelManual, createCartelManual, deleteCartelManual,
    getDespositoNoAConsiderarParaStockFisico, updateDespositoNoAConsiderarParaStockFisico, createDespositoNoAConsiderarParaStockFisico, deleteDespositoNoAConsiderarParaStockFisico,
    getCategoriasWeb, updateCategoriasWeb,createCategoriasWeb,deleteCategoriasWeb,
    getArticulosWeb, updateArticulosWeb, createArticulosWeb, deleteArticulosWeb,
    getActualizacionWeb, UpdateActualizacionWeb, CreateActualizacionWeb, deleteActualizacionWeb, UpdateActualizacionWebNow, UpdateActualizacionWebCron, UpdateActualizacionWebChecked,
    getComprobantesAOmitir, updateComprobantesAOmitir, createComprobantesAOmitir, deleteComprobantesAOmitir,
    getRemitosVtas, updateRemitosVtas, createRemitosVtas, deleteRemitosVtas,
    getCalesCementosPlasticor, updateCalesCementosPlasticor, createCalesCementosPlasticor, deleteCalesCementosPlasticor,
    getClientesCtaCte, updateClientesCtaCte, createClientesCtaCte, deleteClientesCtaCte, 
    getAcindarClasifClientes, updateClasifClientes, createClasifClientes, deleteClasifClientes,
    getAcindarComprobantes, updateAcindarComprobantes, createAcindarComprobantes, deleteAcindarComprobantes,
    getAcindarEquivalCodFactorCant, updateAcindarEquivalCodFactorCant, createAcindarEquivalCodFactorCant, deleteAcindarEquivalCodFactorCant,
    getFiltroAcindarPTF, updateFiltroAcindarPTF, createFiltroAcindarPTF, deleteFiltroAcindarPTF,
    getArtsClasif5StockManual, updateArtsClasif5StockManual, createArtsClasif5StockManual, deleteArtsClasif5StockManual,
    getArtsClasif5AlConsultar, updateArtsClasif5AlConsultar, createArtsClasif5AlConsultar, deleteArtsClasif5AlConsultar,
    gdc_modosdestockminimo, gdc_modosdestockminimodelete, gdc_modosdestockminimocreate, gdc_modosdestockminimoupdate,
    gdc_clasif8artquesecompran, gdc_clasif8artquesecompranUpdate, gdc_clasif8artquesecompranDelete, 
    gdc_deposanoconsiderarparastock, gdc_deposanoconsiderarparastockUpdate, gdc_deposanoconsiderarparastockDelete,
    gdc_npstockcompromvtasespecialespendentregaaclientes, gdc_npstockcompromvtasespecialespendentregaaclientesUpdate, gdc_npstockcompromvtasespecialespendentregaaclientesDelete,
    gdc_chapastiposqueladefinen, gdc_chapastiposqueladefinenUpdate, gdc_chapastiposqueladefinenDelete,
    gdc_remitosdeventas, gdc_remitosdeventasUpdate, gdc_remitosdeventasDelete,
    getArticulosWeb2, getCategoriasWeb2,
    gdd_clientes_distribuciones, gdd_clientes_distribucionesCreate, gdd_clientes_distribucionesUpdate, gdd_clientes_distribucionesDelete,
    gdd_parametros_distribuciones, gdd_parametros_distribucionesCreate, gdd_parametros_distribucionesUpdate, gdd_parametros_distribucionesDelete,
    simulador_tiposdecomprobantes
}
