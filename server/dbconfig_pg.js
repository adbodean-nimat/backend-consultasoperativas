import dotenv from 'dotenv';
dotenv.config();

const configpg = {
    user: process.env.PSQL_USER,
    password: process.env.PSQL_PASSWORD,
    host: process.env.PSQL_SERVER,
    database: process.env.PSQL_DATABASE,
    port:  parseInt(process.env.PSQL_PORT, 10)
}

export default configpg;