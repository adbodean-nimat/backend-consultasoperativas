var configpg = require('./dbconfig_pg.js');
const Pool = require('pg').Pool
const pool = new Pool(configpg);


// Tabla Depos_A_No_Considerar
const getDeposANoConsiderar = (request, response) => {
    pool.query('SELECT * FROM depos_a_no_considerar ORDER BY "Cod_Depos" ASC', (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const getDeposANoConsiderarByCod = (request, response) => {
    const id = request.params.id

    pool.query('SELECT * FROM depos_a_no_considerar WHERE "Cod_Depos" = $1', [id], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).json(results.rows)
    })
}

const createDepos = (request, response) => {
    const {Cod, Nombre} = request.body

    pool.query('INSERT INTO depos_a_no_considerar ("Cod_Depos", "Nombre_Deposito") VALUES ($1, $2) RETURNING *', [Cod, Nombre], (error, results) => {
        if (error){
            throw error
        }
        response.status(201).send(`Deposito agregar correctamente`)
    })
}

const updateDepos = (request, response) => {
    const id = request.params.id
    const {Cod, Nombre} = request.body

    pool.query(
        'UPDATE depos_a_no_considerar SET "Cod_Depos" = $1, "Nombre_Deposito" = $2 WHERE "Cod_Depos" = $3',
        [Cod, Nombre, id], (error, results) => {
            if (error){
                throw error
            }
            response.status(200).send(`Modificar deposito: ${id}`)
        }
    )
}

const deleteDepos = (request, response) => {
    const cod = request.params.id

    pool.query('DELETE FROM depos_a_no_considerar WHERE "Cod_Depos" = $1', [cod], (error, results) => {
        if (error){
            throw error
        }
        response.status(200).send(`Eliminar deposito: ${cod}`)
    })
}

module.exports = {
    getDeposANoConsiderar,
    getDeposANoConsiderarByCod,
    createDepos,
    updateDepos,
    deleteDepos,
}