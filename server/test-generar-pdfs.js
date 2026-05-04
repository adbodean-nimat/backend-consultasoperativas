import 'dotenv/config';
import { generarPdfsAvisosDeuda } from './src/services/generarAviso.service.js';

try {
    const resultados = await generarPdfsAvisosDeuda();
    console.table(resultados);
} catch (error) {
    console.error('Error:', error);
}
